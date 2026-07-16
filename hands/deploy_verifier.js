'use strict';

// ===== 部署验证（v1.9.0 从 server.js 提取） =====
// 原位置：server.js line 2779-3271（493 行）
//
// 功能：对部署后的 Web 应用进行端到端验证
//   1. HTML 可达性检查
//   2. 静态资源完整性检查（CSS/JS/图片/字体）
//   3. API 端点可用性检查（含降级硬编码列表）
//   4. 控制台错误监控
//   5. CSS 变量定义完整性检查
//   6. 浏览器全量回归测试（调用 runBrowserFullRegression）
//
// 依赖（通过函数参数注入）：
//   - ensurePage(args): 获取 Playwright 页面
//   - logger: 日志对象（Logger 类实例，仅有 log(level, msg, data) 方法）
//   - runBrowserFullRegression(args): 浏览器全量回归测试函数（v1.8.9 已提取）

async function runDeployVerify(args = {}, ensurePage, logger, runBrowserFullRegression) {
  const targetUrl = (args.targetUrl || args.url || '').replace(/\/+$/, '');
  if (!targetUrl) {
    return {
      name: args.name || 'deploy-verify',
      passed: false,
      checks: [{ name: '参数校验', passed: false, detail: '缺少 targetUrl 或 url 参数' }]
    };
  }

  const startTime = Date.now();
  const checks = [];

  // ---- 获取 Playwright 页面（API 检查和 Console 检查共享同一个会话） ----
  let pwPage = null;
  let pwObtained = false;
  try {
    const pwResult = await ensurePage(args);
    pwPage = pwResult.target;
    pwObtained = true;
  } catch (_) {
    // Playwright 不可用，后续检查降级
  }

  // ---- 辅助函数：判断是否为 API 请求（排除静态资源） ----
  function isApiUrl(url) {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;
      // 排除静态资源扩展名
      if (/\.(css|js|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot|ico|map)(\?|#|$)/i.test(pathname)) return false;
      // 排除 favicon
      if (/\/favicon/i.test(pathname)) return false;
      // 排除 data: 协议
      if (parsed.protocol === 'data:') return false;
      // 包含 /api/ 的视为 API 请求
      if (pathname.includes('/api/')) return true;
      // 常见的静态资源路径前缀
      if (/^\/(static|assets|public|dist|build|images|img|fonts|styles|css|js)\//i.test(pathname)) return false;
      // 其他请求视为动态资源（API-like）
      return true;
    } catch (_) {
      return false;
    }
  }

  // ---- 降级：使用硬编码 API 列表（Playwright 不可用时的备用方案） ----
  async function runHardcodedApiCheck() {
    const hardcodedEndpoints = ['/api/identity/me', '/api/tenants', '/api/reports'];
    const hcResults = [];
    for (const endpoint of hardcodedEndpoints) {
      try {
        const url = `${targetUrl}${endpoint}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        hcResults.push({ endpoint, status: response.status, ok: response.ok });
      } catch (err) {
        hcResults.push({ endpoint, status: 0, ok: false, error: err.message });
      }
    }
    const allOk = hcResults.every(r => r.ok);
    return {
      passed: allOk,
      detail: allOk
        ? `所有 ${hardcodedEndpoints.length} 个端点正常`
        : hcResults.filter(r => !r.ok).map(r => `${r.endpoint} (${r.status || r.error})`).join('; ')
    };
  }

  // 1) API 端点检查 — 动态发现（Playwright 监听）+ 降级硬编码
  let apiCheckPassed = true;
  let apiDetail = '';

  if (pwObtained) {
    try {
      const apiRequests = [];
      const onApiResponse = (resp) => {
        const url = resp.url();
        const status = resp.status();
        if (isApiUrl(url)) {
          apiRequests.push({ url, status });
        }
      };
      pwPage.on('response', onApiResponse);

      // 导航到目标页面，等待网络空闲确保所有异步请求完成
      await pwPage.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await pwPage.waitForTimeout(1000);

      pwPage.removeListener('response', onApiResponse);

      if (apiRequests.length === 0) {
        // 未捕获到 API 请求，降级到硬编码列表
        const fallback = await runHardcodedApiCheck();
        apiCheckPassed = fallback.passed;
        apiDetail = fallback.detail + '（Playwright 未捕获到 API 请求，使用硬编码检查）';
      } else {
        const failedEndpoints = apiRequests.filter(r => r.status >= 400);
        if (failedEndpoints.length > 0) {
          apiCheckPassed = false;
          apiDetail = `发现 ${failedEndpoints.length}/${apiRequests.length} 个失败端点: ` +
            failedEndpoints.map(r => `${r.url} (${r.status})`).join('; ');
        } else {
          apiDetail = `所有 ${apiRequests.length} 个 API 端点正常`;
        }
      }
    } catch (pwErr) {
      // Playwright 导航失败，降级到硬编码列表
      const fallback = await runHardcodedApiCheck();
      apiCheckPassed = fallback.passed;
      apiDetail = fallback.detail + '（Playwright 降级）';
    }
  } else {
    // Playwright 不可用，使用硬编码列表
    const fallback = await runHardcodedApiCheck();
    apiCheckPassed = fallback.passed;
    apiDetail = fallback.detail + '（Playwright 不可用）';
  }
  checks.push({
    name: 'API 端点检查',
    passed: apiCheckPassed,
    detail: apiDetail
  });

  // 2) Console 错误检查 — 使用 Playwright 捕获真实运行时错误
  let consoleCheckPassed = true;
  let consoleDetail = '未发现 Console 错误';

  if (pwObtained) {
    try {
      const collectedErrors = [];

      // 安装 console 消息监听器（在导航前安装）
      const onConsoleMessage = (msg) => {
        const type = msg.type();
        if (type === 'error' || type === 'warning') {
          const text = msg.text();
          // 过滤掉常见的非关键错误（如 favicon 404）
          if (!text.includes('favicon.ico')) {
            collectedErrors.push(`[${type}] ${text}`);
          }
        }
      };

      // 安装未捕获 JS 异常监听器
      const onPageError = (err) => {
        collectedErrors.push(`[pageerror] ${err.message}`);
      };

      // 安装 HTTP 响应监听器（收集 4xx/5xx 响应）
      const onResponse = (resp) => {
        const status = resp.status();
        if (status >= 400) {
          const url = resp.url();
          // 过滤掉常见的非关键错误
          if (!url.includes('favicon.ico')) {
            collectedErrors.push(`[http ${status}] ${url}`);
          }
        }
      };

      pwPage.on('console', onConsoleMessage);
      pwPage.on('pageerror', onPageError);
      pwPage.on('response', onResponse);

      // 重新导航到目标 URL 以捕获完整的运行时错误
      await pwPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // 等待页面稳定
      await pwPage.waitForTimeout(2000);

      // 移除监听器
      pwPage.removeListener('console', onConsoleMessage);
      pwPage.removeListener('pageerror', onPageError);
      pwPage.removeListener('response', onResponse);

      if (collectedErrors.length > 0) {
        consoleCheckPassed = false;
        consoleDetail = `发现 ${collectedErrors.length} 个运行时错误:\n${collectedErrors.join('\n')}`;
      } else {
        consoleDetail = '未发现 Console 错误 (Playwright 实时检测)';
      }
    } catch (pwErr) {
      // 降级方案：Playwright 操作失败时回退到 HTTP fetch 方式
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const htmlResp = await fetch(targetUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (htmlResp.status >= 400) {
          consoleCheckPassed = false;
          consoleDetail = `HTTP 响应错误: ${htmlResp.status} ${htmlResp.statusText}`;
        } else {
          const html = await htmlResp.text();
          // 检查响应体中是否包含服务端错误关键词
          const errorKeywords = /\b(50[0-9]|Internal Server Error|Fatal|Exception|SyntaxError|RuntimeError)\b/i;
          if (errorKeywords.test(html)) {
            consoleCheckPassed = false;
            consoleDetail = '页面中包含服务端错误关键词（降级检测模式）';
          } else {
            consoleDetail = '未发现明显的错误（降级检测模式）';
          }
        }
      } catch (fallbackErr) {
        consoleCheckPassed = false;
        consoleDetail = `页面检查失败: ${fallbackErr.message}`;
      }
    }
  } else {
    // Playwright 不可用，降级到 HTTP fetch 方式
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const htmlResp = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (htmlResp.status >= 400) {
        consoleCheckPassed = false;
        consoleDetail = `HTTP 响应错误: ${htmlResp.status} ${htmlResp.statusText}`;
      } else {
        const html = await htmlResp.text();
        const errorKeywords = /\b(50[0-9]|Internal Server Error|Fatal|Exception|SyntaxError|RuntimeError)\b/i;
        if (errorKeywords.test(html)) {
          consoleCheckPassed = false;
          consoleDetail = '页面中包含服务端错误关键词（降级检测模式）';
        } else {
          consoleDetail = '未发现明显的错误（降级检测模式）';
        }
      }
    } catch (fallbackErr) {
      consoleCheckPassed = false;
      consoleDetail = `页面检查失败: ${fallbackErr.message}`;
    }
  }
  checks.push({
    name: 'Console 错误检查',
    passed: consoleCheckPassed,
    detail: consoleDetail
  });

  // 3) CSS 变量检查 — 获取页面的 CSS 资源并分析
  let cssCheckPassed = true;
  let cssDetail = 'CSS 变量未发现缺失';
  try {
    const cssAnalyzer = require('../scripts/css-var-analyzer');
    const htmlUrl = targetUrl;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const htmlResp = await fetch(htmlUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    const html = await htmlResp.text();

    // 提取 CSS 链接
    const linkRegex = /<link[^>]*href=["']([^"']*\.css[^"']*)["'][^>]*>/gi;
    const cssLinks = [];
    let linkMatch;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      let cssUrl = linkMatch[1];
      if (!cssUrl.startsWith('http')) {
        cssUrl = new URL(cssUrl, targetUrl).href;
      }
      cssLinks.push(cssUrl);
    }

    // 也提取内联 CSS
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let styleMatch;
    let inlineCSS = '';
    while ((styleMatch = styleRegex.exec(html)) !== null) {
      inlineCSS += styleMatch[1] + '\n';
    }

    // 分析内联 CSS
    if (inlineCSS.trim()) {
      const result = cssAnalyzer.analyzeCSS(inlineCSS);
      if (result.summary.missingVariables > 0) {
        cssCheckPassed = false;
        cssDetail = `内联 CSS 中发现 ${result.summary.missingVariables} 个缺失变量: ${result.missingVarOverview.map(v => v.variable).join(', ')}`;
      } else {
        cssDetail = `内联 CSS 变量正常（${result.summary.totalDefinitions} 个定义）`;
      }
    }

    // 尝试获取并分析外部 CSS
    for (const cssUrl of cssLinks) {
      try {
        const cssController = new AbortController();
        const cssTimeoutId = setTimeout(() => cssController.abort(), 5000);
        const cssResp = await fetch(cssUrl, { signal: cssController.signal });
        clearTimeout(cssTimeoutId);
        const cssText = await cssResp.text();
        const cssResult = cssAnalyzer.analyzeCSS(cssText);
        if (cssResult.summary.missingVariables > 0) {
          cssCheckPassed = false;
          cssDetail = `外部 CSS (${cssUrl}) 中发现 ${cssResult.summary.missingVariables} 个缺失变量: ${cssResult.missingVarOverview.map(v => v.variable).join(', ')}`;
          break;
        }
      } catch (_) {
        // 外部 CSS 获取失败不阻断
      }
    }

    if (cssCheckPassed && cssLinks.length === 0 && !inlineCSS.trim()) {
      cssDetail = '未发现 CSS 资源';
    }
  } catch (err) {
    cssCheckPassed = false;
    cssDetail = `CSS 变量检查失败: ${err.message}`;
  }
  checks.push({
    name: 'CSS 变量检查',
    passed: cssCheckPassed,
    detail: cssDetail
  });

  // 4) 静态资源检查
  let resourcesCheckPassed = true;
  let resourcesDetail = '';
  try {
    const htmlUrl = targetUrl;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const htmlResp = await fetch(htmlUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    const html = await htmlResp.text();

    // 提取静态资源 URL
    const resourcePatterns = [
      { regex: /<link[^>]*href=["']([^"']*)["']/gi, type: 'link' },
      { regex: /<script[^>]*src=["']([^"']*)["']/gi, type: 'script' },
      { regex: /<img[^>]*src=["']([^"']*)["']/gi, type: 'image' }
    ];

    const resources = [];
    for (const { regex, type } of resourcePatterns) {
      let m;
      while ((m = regex.exec(html)) !== null) {
        let resUrl = m[1];
        if (resUrl.startsWith('data:') || resUrl.startsWith('#')) continue;
        if (!resUrl.startsWith('http')) {
          try {
            resUrl = new URL(resUrl, targetUrl).href;
          } catch (_) { continue; }
        }
        resources.push({ url: resUrl, type });
      }
    }

    // 去重
    const uniqueResources = [...new Map(resources.map(r => [r.url, r])).values()];

    // 检查资源可达性
    const failedResources = [];
    const batchSize = 5;
    for (let i = 0; i < uniqueResources.length; i += batchSize) {
      const batch = uniqueResources.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(async (res) => {
        try {
          const resController = new AbortController();
          const resTimeoutId = setTimeout(() => resController.abort(), 3000);
          const resResp = await fetch(res.url, { method: 'HEAD', signal: resController.signal });
          clearTimeout(resTimeoutId);
          if (!resResp.ok) {
            return { url: res.url, status: resResp.status };
          }
          return null;
        } catch (_) {
          return { url: res.url, status: 0 };
        }
      }));
      for (const failed of batchResults.filter(Boolean)) {
        failedResources.push(failed);
      }
    }

    if (failedResources.length > 0) {
      resourcesCheckPassed = false;
      resourcesDetail = `${failedResources.length} 个静态资源不可达: ${failedResources.slice(0, 5).map(r => `${r.url} (${r.status})`).join('; ')}`;
    } else {
      resourcesDetail = `所有 ${uniqueResources.length} 个静态资源可达`;
    }
  } catch (err) {
    resourcesCheckPassed = false;
    resourcesDetail = `静态资源检查失败: ${err.message}`;
  }
  checks.push({
    name: '静态资源检查',
    passed: resourcesCheckPassed,
    detail: resourcesDetail
  });

  // 5) 页面错误文本检查 — DOM 文本中搜索错误关键词
  let errorTextCheckPassed = true;
  let errorTextDetail = '页面未发现错误文本';

  if (pwObtained) {
    try {
      const pageText = await pwPage.evaluate(() => document.body.innerText);
      const errorPattern = /加载失败|系统内部错误|Internal Server Error|出错了|服务器繁忙|服务器错误|500\s*Error/i;
      const match = pageText.match(errorPattern);
      if (match) {
        errorTextCheckPassed = false;
        errorTextDetail = `页面中发现错误文本: "${match[0]}"（阻断级问题）`;
      }
    } catch (err) {
      errorTextCheckPassed = false;
      errorTextDetail = `页面错误文本检查失败: ${err.message}`;
    }
  } else {
    // 降级到 HTTP fetch 获取 HTML 文本搜索关键词
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      const text = await resp.text();
      const errorPattern = /加载失败|系统内部错误|Internal Server Error|出错了|服务器繁忙|服务器错误|500\s*Error/i;
      const match = text.match(errorPattern);
      if (match) {
        errorTextCheckPassed = false;
        errorTextDetail = `页面 HTML 中发现错误文本: "${match[0]}"（阻断级问题，降级检测模式）`;
      }
    } catch (err) {
      errorTextCheckPassed = false;
      errorTextDetail = `页面错误文本检查失败: ${err.message}`;
    }
  }
  checks.push({
    name: '页面错误文本检查',
    passed: errorTextCheckPassed,
    detail: errorTextDetail
  });

  // 第 6 项：全功能闭环回归（强制性阻断级）
  // runBrowserFullRegression 内部独立创建可视浏览器，不需要外部传入 pwPage
  checks.push({
    name: '全功能闭环回归',
    blocking: true,
    passed: false,
    detail: '',
    executed: false
  });
  {
    const check6 = checks[checks.length - 1];
    try {
      const regressionResult = await runBrowserFullRegression({
        url: targetUrl,
        maxDepth: 3,
        maxItems: 50
      });

      check6.executed = true;
      check6.detail = JSON.stringify(regressionResult.summary);

      if (regressionResult.passed && regressionResult.executed && regressionResult.summary.clicked > 0) {
        check6.passed = true;
      } else {
        check6.passed = false;
        if (regressionResult.blockingIssues && regressionResult.blockingIssues.length > 0) {
          check6.detail += ' | 阻断原因: ' + regressionResult.blockingIssues.map(i => i.detail).join('; ');
        }
        if (!regressionResult.executed) {
          check6.detail += ' | 工具未执行';
        }
        if (regressionResult.summary.clicked === 0) {
          check6.detail += ' | 无法点击任何功能';
        }
      }
    } catch (err) {
      check6.executed = false;
      check6.detail = `全功能闭环回归执行失败: ${err.message}`;
    }
  }

  // 清理 Playwright 页面
  if (pwObtained && pwPage && !pwPage.isClosed()) {
    try {
      await pwPage.close();
    } catch (_) { logger.log('WARN', 'pwPage.close 失败', _.message); }
  }

  const allPassed = checks.every(c => c.passed);
  return {
    name: args.name || 'deploy-verify',
    targetUrl,
    passed: allPassed,
    duration: Date.now() - startTime,
    checks
  };
}

// ===== 工厂函数：通过闭包绑定依赖 =====
// 与 v1.8.7 (locator_helpers) / v1.8.8 (menu_traverser) / v1.8.9 (full_regression) 一致
function createDeployVerifier({ ensurePage, logger, runBrowserFullRegression }) {
  const boundRunDeployVerify = (args = {}) => runDeployVerify(args, ensurePage, logger, runBrowserFullRegression);
  return { runDeployVerify: boundRunDeployVerify };
}

module.exports = { runDeployVerify, createDeployVerifier };
