'use strict';

// Handler: browser
// Extracted from server.js callTool switch statements

const tools = [
  "browser_open",
  "browser_click",
  "browser_click_audit",
  "browser_type",
  "browser_hover",
  "browser_scroll",
  "browser_press_key",
  "browser_snapshot",
  "browser_batch",
  "browser_eval",
  "browser_dom",
  "browser_highlight",
  "browser_select",
  "browser_navigate",
  "browser_wait",
  "browser_assert",
  "browser_flow",
  "browser_instrument",
  "browser_events",
  "browser_events_clear",
  "browser_form_validate",
  "browser_chain",
  "browser_aria_snapshot",
  "browser_aria_click",
  "browser_aria_type",
  "browser_smart_fill",
  "browser_matrix_test"
];

async function handle(name, args, deps) {

  // === Bridge deps into scope via globalThis ===
  const _depsKeys = Object.keys(deps);
  const _depsPrev = {};
  for (const k of _depsKeys) { _depsPrev[k] = globalThis[k]; globalThis[k] = deps[k]; }
  try {
  // ====== browser_open ======
  if (name === 'browser_open') {
const { target, reused, sessionId } = await ensurePage(args);
    const beforeUrl = target.url();
    // 如果已经在目标URL上，跳过导航
    if (args.url && beforeUrl !== args.url) {
      const timeout = args.timeout || 15000;
      await target.goto(args.url, { waitUntil: args.waitUntil || 'domcontentloaded', timeout });
      // 导航到新页面后重置错误检查点，防止旧页面错误污染新页面
      currentCheckpoint = new Date().toISOString();
      lastImageErrorCheckpoint = new Date().toISOString();
      // 异步触发后端主动探测
      probeKnownEndpoints(target).then(results => { backendProbeResults = results; }).catch(() => {});
    }
    lastAction = { type: 'open', url: target.url(), timestamp: new Date().toISOString(), reused };
    
    // 自动提取当前页面的导航链接
    let pageLinks = null;
    try {
      pageLinks = await getPageLinks({ maxLinks: 30 });
    } catch (e) { /* ignore */ }
    
    const action = reused ? '已复用现有浏览器' : '已打开新浏览器';
    let response = `${action}：${target.url()}（session=${sessionId}）`;
    
    // 附加页面导航摘要
    if (pageLinks && pageLinks.total > 0) {
      const navCategories = pageLinks.categories.filter(c => 
        ['导航菜单', '首页', '登录', '注册', '管理', '设置', '用户', '搜索'].includes(c)
      );
      if (navCategories.length > 0) {
        response += `\n\n📋 页面导航摘要（共${pageLinks.total}个链接，其中按钮${pageLinks.linksFromButtons}个）：`;
        response += `\n   分类：${navCategories.join('、')}`;
        response += `\n   如需详细链接列表，请调用 browser_links`;
      } else {
        response += `\n\n📋 页面共有 ${pageLinks.total} 个链接`;
        response += `\n   如需查看，请调用 browser_links`;
      }
    }
    return text(response);
  }

  // ====== browser_click ======
  if (name === 'browser_click') {
const { target } = await ensurePage();
    const urlBefore = target.url();
    await target.click(args.selector, { timeout: 10000 });
    
    // 检测 URL 是否变化
    let urlAfter;
    try { urlAfter = target.url(); } catch (_) { urlAfter = urlBefore; }
    const navigated = urlBefore !== urlAfter;
    
    // 操作后快速错误捕获
    const postErrors = await postActionErrorCheck(target, 'click', args.selector);
    
    const baseResult = {
      action: 'click',
      selector: args.selector,
      success: true,
      navigated,
      urlBefore,
      urlAfter,
      lastAction
    };
    
    if (postErrors.detected) {
      const errorSummary = [];
      let suggestions = [];
      if (postErrors.console.length > 0) {
        errorSummary.push(`${postErrors.console.length} 个console错误`);
        const hasTypeError = postErrors.console.some(e => (e.text||'').includes('TypeError') || (e.text||'').includes('undefined'));
        if (hasTypeError) suggestions.push('怀疑页面JS未加载完成，请尝试等待后重试');
      }
      if (postErrors.page.length > 0) {
        errorSummary.push(`${postErrors.page.length} 个页面错误`);
        suggestions.push('页面抛出异常，请使用 browser_errors_aggregate 查看聚合分析');
      }
      if (postErrors.network.length > 0) {
        errorSummary.push(`${postErrors.network.length} 个网络错误`);
        const has500 = postErrors.network.some(e => e.status >= 500);
        if (has500) suggestions.push('存在500错误，可能是接口故障或权限不足');
        const has404 = postErrors.network.some(e => e.status === 404);
        if (has404) suggestions.push('发现404资源未找到，请检查页面引用是否正确');
      }
      if (suggestions.length === 0) suggestions.push('请使用 browser_errors 查看完整错误详情');
      
      return text(JSON.stringify({
        ...baseResult,
        error_warning: `点击后检测到 ${postErrors.count} 个新错误（${errorSummary.join('、')}）`,
        suggestions,
        errors: {
          count: postErrors.count,
          console: postErrors.console.slice(0, 5),
          page: postErrors.page.slice(0, 3),
          network: postErrors.network.slice(0, 5)
        }
      }, null, 2));
    }
    
    return text(JSON.stringify({
      ...baseResult,
      errors: { count: 0 }
    }, null, 2));
  }

  // ====== browser_click_audit ======
  if (name === 'browser_click_audit') {
const { target } = await ensurePage();
    const label = args.label || args.selector || args.text || 'audit';
    const waitMs = args.waitMs || 1500;
    const autoReturn = args.autoReturn !== false;
    const { PNG } = require('pngjs');
    const pixelmatch = require('pixelmatch').default || require('pixelmatch');
    
    // 如果提供了 text 而不是 selector，用无障碍树定位
    let selector = args.selector;
    if (!selector && args.text) {
      try {
        const found = await target.evaluate((text) => {
          const candidates = document.querySelectorAll('button, a, [role="button"], [tabindex]:not([tabindex="-1"]), input[type="submit"], input[type="button"]');
          for (const el of candidates) {
            if (el.offsetParent === null) continue;
            const elText = (el.textContent || '').trim();
            if (elText === text || elText.includes(text)) {
              if (el.id) return '#' + el.id;
              const cls = Array.from(el.classList).filter(c => !c.startsWith('_')).slice(0, 2).join('.');
              if (cls) return el.tagName.toLowerCase() + '.' + cls;
              return el.tagName.toLowerCase();
            }
          }
          return null;
        }, args.text);
        if (found) selector = found;
      } catch (_) {}
    }
    
    if (!selector) {
      return text(JSON.stringify({ success: false, error: 'No selector or element found for text: ' + (args.text || '') }));
    }
    
    // 1. 点击前截图
    const urlBefore = target.url();
    ensureArtifactsDir();
    const stamp = Date.now();
    const beforePath = path.join(SCREENSHOT_DIR, `click-audit-before-${safeArtifactName(label)}-${stamp}.png`);
    await screenshotWithRedaction(target, beforePath);
    
    // 2. 执行点击
    let clicked = false;
    try {
      await target.click(selector, { timeout: 8000 });
      clicked = true;
    } catch (clickErr) {
      return text(JSON.stringify({
        success: false,
        selector,
        label,
        error: `Click failed: ${clickErr.message}`,
        urlBefore
      }, null, 2));
    }
    
    // 3. 等待稳定
    try {
      await target.waitForLoadState('networkidle', { timeout: Math.min(waitMs + 2000, 8000) });
    } catch (_) {
      await new Promise(r => setTimeout(r, waitMs));
    }
    
    // 4. 点击后截图
    let urlAfter;
    try { urlAfter = target.url(); } catch (_) { urlAfter = urlBefore; }
    const afterPath = path.join(SCREENSHOT_DIR, `click-audit-after-${safeArtifactName(label)}-${stamp}.png`);
    await screenshotWithRedaction(target, afterPath);
    
    // 5. 截图对比（pixelmatch）
    let diffRatio = 0;
    let diffPath = null;
    let visualChanged = false;
    try {
      const beforePng = PNG.sync.read(fs.readFileSync(beforePath));
      const afterPng = PNG.sync.read(fs.readFileSync(afterPath));
      if (beforePng.width === afterPng.width && beforePng.height === afterPng.height) {
        const diff = new PNG({ width: beforePng.width, height: beforePng.height });
        const diffPixels = pixelmatch(beforePng.data, afterPng.data, diff.data, beforePng.width, beforePng.height, { threshold: 0.1 });
        diffRatio = diffPixels / (beforePng.width * beforePng.height);
        visualChanged = diffRatio > 0.05;
        if (visualChanged) {
          diffPath = path.join(SCREENSHOT_DIR, `click-audit-diff-${safeArtifactName(label)}-${stamp}.png`);
          fs.writeFileSync(diffPath, PNG.sync.write(diff));
        }
      } else {
        // 尺寸不同 → 视觉已变化
        visualChanged = true;
        diffRatio = 1;
      }
    } catch (diffErr) {
      // pixelmatch 失败不阻断流程
    }
    
    // 6. 错误捕获
    const postErrors = await postActionErrorCheck(target, 'click_audit', selector);
    const network5xx = networkLogs.filter(e => e.status >= 500 && new Date(e.timestamp || 0).getTime() > new Date(currentCheckpoint).getTime());
    // 响应体静默失败检测（HTTP 2xx/3xx 但 body 含错误）
    const silentFails = detectSilentFailures({})
      .filter(e => new Date(e.timestamp || 0).getTime() > new Date(currentCheckpoint).getTime());
    
    // 7. 导航检测
    const urlNavigated = urlBefore !== urlAfter;
    const spaNavigated = visualChanged && !urlNavigated;
    
    // 8. 自动返回
    let returned = false;
    let returnMethod = 'none';
    if (autoReturn) {
      if (urlNavigated) {
        try {
          await target.goBack({ waitUntil: 'networkidle', timeout: 8000 });
          returned = true;
          returnMethod = 'goBack';
        } catch (_) {
          try { await target.goBack(); returned = true; returnMethod = 'goBack_simple'; } catch (_) {}
        }
      } else if (spaNavigated) {
        try {
          await target.click(selector, { timeout: 5000 });
          await new Promise(r => setTimeout(r, 1000));
          returnMethod = 'toggle_click';
          // 验证状态是否恢复
          const afterReturn = target.url();
          if (afterReturn === urlBefore) returned = true;
        } catch (_) {}
      }
    }
    
    // 9. 组装结果
    const result = {
      success: true,
      selector,
      label,
      navigated: urlNavigated,
      spaNavigated,
      visualChanged,
      diffRatio: parseFloat(diffRatio.toFixed(4)),
      urlBefore,
      urlAfter,
      returned,
      returnMethod,
      errors: {
        count: postErrors.count + network5xx.length + silentFails.length,
        console: postErrors.console.slice(0, 5),
        page: postErrors.page.slice(0, 3),
        network: postErrors.network.slice(0, 5),
        network5xx: network5xx.slice(0, 5).map(e => ({ url: (e.url || '').slice(0, 120), status: e.status })),
        silentFails: silentFails.slice(0, 5).map(e => ({ url: (e.url || '').slice(0, 120), status: e.status, error: e.errorSnippet }))
      },
      screenshots: {
        before: beforePath,
        after: afterPath,
        diff: diffPath
      },
      timestamp: new Date().toISOString()
    };
    
    return text(JSON.stringify(redact(result), null, 2));
  }

  // ====== browser_type ======
  if (name === 'browser_type') {
const { target } = await ensurePage();
    await target.fill(args.selector, args.text || '', { timeout: 10000 });
    await target.evaluate(({ selector, text }) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      if (el.tagName === 'INPUT' && nativeInputValueSetter) {
        nativeInputValueSetter.call(el, text);
      } else if (el.tagName === 'TEXTAREA' && nativeTextareaValueSetter) {
        nativeTextareaValueSetter.call(el, text);
      } else {
        el.value = text;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { selector: args.selector, text: args.text || '' });
    
    // 操作后快速错误捕获
    const postErrors = await postActionErrorCheck(target, 'type', args.selector);
    
    if (postErrors.detected) {
      const errorSummary = [];
      let suggestions = [];
      if (postErrors.console.length > 0) {
        errorSummary.push(`${postErrors.console.length} 个console错误`);
        suggestions.push('输入触发了验证错误，请检查输入内容格式');
      }
      if (postErrors.page.length > 0) {
        errorSummary.push(`${postErrors.page.length} 个页面错误`);
        suggestions.push('输入后页面抛出异常，请检查字段约束');
      }
      if (postErrors.network.length > 0) {
        errorSummary.push(`${postErrors.network.length} 个网络错误`);
        suggestions.push('输入后发送了失败的请求，可能是表单验证触发的');
      }
      if (suggestions.length === 0) suggestions.push('请使用 browser_errors 查看完整错误详情');
      
      return text(JSON.stringify({
        action: 'type',
        selector: args.selector,
        text: isSensitiveKey(args.selector) ? '******' : redactString(args.text || ''),
        success: true,
        error_warning: `输入后检测到 ${postErrors.count} 个新错误（${errorSummary.join('、')}）`,
        suggestions,
        errors: {
          count: postErrors.count,
          console: postErrors.console.slice(0, 5),
          page: postErrors.page.slice(0, 3),
          network: postErrors.network.slice(0, 5)
        },
        lastAction
      }, null, 2));
    }
    
    return text(JSON.stringify({
      action: 'type',
      selector: args.selector,
      text: isSensitiveKey(args.selector) ? '******' : redactString(args.text || ''),
      success: true,
      errors: { count: 0 },
      lastAction
    }, null, 2));
  }

  // ====== browser_hover ======
  if (name === 'browser_hover') {
const { target } = await ensurePage();
    await target.hover(args.selector, { timeout: 10000 });
    lastAction = { type: 'hover', selector: args.selector, timestamp: new Date().toISOString() };
    return text(`已悬浮：${args.selector}`);
  }

  // ====== browser_scroll ======
  if (name === 'browser_scroll') {
const { target } = await ensurePage();
    if (args.selector) {
      const scrollIntoView = args.scrollIntoView !== false;
      if (scrollIntoView) {
        await target.$eval(args.selector, (el, behavior) => {
          el.scrollIntoView({ behavior: behavior || 'auto', block: 'center', inline: 'center' });
        }, args.behavior || 'auto');
      }
    } else {
      await target.evaluate(({ x, y, behavior }) => {
        window.scrollTo({ left: x || 0, top: y || 0, behavior: behavior || 'auto' });
      }, { x: args.x, y: args.y, behavior: args.behavior || 'auto' });
    }
    return text(`已滚动`);
  }

  // ====== browser_press_key ======
  if (name === 'browser_press_key') {
const { target } = await ensurePage();
    if (args.selector) {
      await target.focus(args.selector);
    }
    await target.keyboard.press(args.key);
    
    // 操作后快速错误捕获
    const postErrors = await postActionErrorCheck(target, 'press_key', args.key);
    
    const result = {
      action: 'press_key',
      key: args.key,
      success: true,
      errors: { count: postErrors.count, detected: postErrors.detected }
    };
    
    if (postErrors.detected) {
      result.error_warning = `按键 ${args.key} 后检测到 ${postErrors.count} 个新错误`;
      result.suggestions = [];
      if (postErrors.console.length > 0) result.suggestions.push('按键触发了控制台错误，请检查页面交互逻辑');
      if (postErrors.network.some(e => e.status >= 400)) result.suggestions.push('按键触发了失败的网络请求');
      if (result.suggestions.length === 0) result.suggestions.push('请使用 browser_errors 查看完整错误详情');
    }
    
    return text(JSON.stringify(result, null, 2));
  }

  // ====== browser_snapshot ======
  if (name === 'browser_snapshot') {
const { target } = await ensurePage();
    const snapshot = await target.evaluate(() => {
      // 计算页面状态哈希：基于可见元素数 + 文本指纹
      let visibleCount = 0;
      const allEls = document.querySelectorAll('body *');
      for (const el of allEls) {
        if (visibleCount >= 500) break;
        try { const s = window.getComputedStyle(el); if (s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null) visibleCount++; } catch (_) {}
      }
      const mainText = (document.body.innerText || '').trim();
      const textHash = mainText.length + '_' + mainText.slice(0, 100).replace(/\s+/g, '');
      const stateHash = visibleCount + '_' + textHash.length + '_' + (mainText.length % 1000);
      
      return {
        url: location.href,
        title: document.title,
        visibleText: document.body.innerText.slice(0, 5000),
        // 页面状态哈希（对比前后变化用，非加密哈希）
        stateHash,
        stateDetail: { visibleCount, textLength: mainText.length },
        // 页面基本信息
        pageInfo: {
          url: location.href,
          title: document.title,
          description: (document.querySelector('meta[name="description"]')?.getAttribute('content') || '').slice(0, 200),
          charset: document.characterSet,
          lang: document.documentElement.lang || '',
          readyState: document.readyState,
          referrer: document.referrer || '',
          viewport: { w: window.innerWidth, h: window.innerHeight },
          scrollPos: { x: window.scrollX, y: window.scrollY }
        },
        // 所有输入表单
        inputs: Array.from(document.querySelectorAll('input, textarea, select')).map(el => {
          const type = (el.getAttribute('type') || '').toLowerCase();
          const sensitive = ['password'].includes(type) || /key|token|secret|password/i.test(`${el.id} ${el.name} ${el.placeholder}`);
          return { tag: el.tagName.toLowerCase(), type, id: el.id || '', name: el.getAttribute('name') || '', placeholder: el.getAttribute('placeholder') || '', value: sensitive ? '******' : el.value };
        }),
        // 按钮与链接
        buttons: Array.from(document.querySelectorAll('button, a')).slice(0, 80).map(el => ({ tag: el.tagName.toLowerCase(), id: el.id || '', text: (el.innerText || el.textContent || '').trim().slice(0, 120), href: el.href || '' })),
        // 导航元素
        navElements: (() => {
          const navs = document.querySelectorAll('nav, [role="navigation"], .nav, .sidebar, .menu');
          return Array.from(navs).slice(0, 5).map(n => ({
            tag: n.tagName.toLowerCase(),
            id: n.id || '',
            links: Array.from(n.querySelectorAll('a, button')).slice(0, 20).map(l => (l.innerText || l.textContent || '').trim().slice(0, 60)).filter(Boolean)
          }));
        })(),
        // 图片统计
        imageCount: document.querySelectorAll('img').length,
        // 表格统计
        tableCount: document.querySelectorAll('table').length,
        // 框架信息
        frameworks: (() => {
          const fw = [];
          if (document.querySelector('#app, #__nuxt, #__next, [data-reactroot]')) fw.push('SPA (React/Vue/Nuxt)');
          if (document.querySelector('[class*="ant-"]')) fw.push('Ant Design');
          if (document.querySelector('[class*="el-"]')) fw.push('Element UI');
          if (document.querySelector('[class*="ivu-"]')) fw.push('iView');
          return fw;
        })()
      };
    });
    return text(JSON.stringify(redact(snapshot), null, 2));
  }

  // ====== browser_batch ======
  if (name === 'browser_batch') {
const { target } = await ensurePage();
    const steps = args.steps || [];
    const maxSteps = args.maxSteps || 20;
    if (steps.length > maxSteps) {
      return text(`批量操作受限：最多 ${maxSteps} 个操作，当前 ${steps.length} 个`);
    }
    const results = [];
    for (const step of steps) {
      try {
        switch (step.type) {
          case 'click':
            await target.click(step.selector, { timeout: 10000 });
            results.push({ type: 'click', selector: step.selector, success: true });
            break;
          case 'type':
            await target.fill(step.selector, step.text || '', { timeout: 10000 });
            results.push({ type: 'type', selector: step.selector, success: true });
            break;
          case 'hover':
            await target.hover(step.selector, { timeout: 10000 });
            results.push({ type: 'hover', selector: step.selector, success: true });
            break;
          case 'scroll':
            if (step.selector) {
              await target.$eval(step.selector, el => el.scrollIntoView());
            } else {
              await target.evaluate(({ x, y }) => window.scrollTo(x || 0, y || 0), { x: 0, y: step.distance || 300 });
            }
            results.push({ type: 'scroll', success: true });
            break;
          case 'screenshot':
            ensureArtifactsDir();
            const safeName = (step.name || `batch-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
            const filePath = path.join(SCREENSHOT_DIR, `${safeName}.png`);
            await target.screenshot({ path: filePath });
            results.push({ type: 'screenshot', file: filePath, success: true });
            break;
          case 'wait':
            await target.waitForTimeout(step.ms || 1000);
            results.push({ type: 'wait', ms: step.ms || 1000, success: true });
            break;
          case 'press_key':
            if (step.selector) await target.focus(step.selector);
            await target.keyboard.press(step.key);
            results.push({ type: 'press_key', key: step.key, success: true });
            break;
          case 'select':
            await target.selectOption(step.selector, step.value || step.label || step.index);
            results.push({ type: 'select', selector: step.selector, success: true });
            break;
          default:
            results.push({ type: step.type, success: false, error: `未知操作类型: ${step.type}` });
        }
      } catch (err) {
        results.push({ type: step.type, selector: step.selector, success: false, error: err.message });
      }
    }
    return text(JSON.stringify({ total: steps.length, results }, null, 2));
  }

  // ====== browser_eval ======
  if (name === 'browser_eval') {
const { target } = await ensurePage();
    const expression = args.expression || args.script;
    if (!expression) {
      return text(JSON.stringify({ error: '缺少 expression 参数' }, null, 2));
    }
    // 安全限制：表达式长度限制为 10KB
    const MAX_EXPRESSION_LENGTH = 10240;
    if (expression.length > MAX_EXPRESSION_LENGTH) {
      return text(JSON.stringify({ error: `表达式过长（${expression.length}字节），最大允许 ${MAX_EXPRESSION_LENGTH} 字节` }, null, 2));
    }
    // 审计日志
    console.log('[AUDIT] browser_eval executed:', { expressionLength: expression.length, timestamp: new Date().toISOString() });
    
    const wrapped = expression.trim().startsWith('return') || expression.includes('return ')
      ? `(function(){${expression}})()`
      : expression;
    const result = await target.evaluate(expr => {
      try {
        const value = (0, eval)(expr);
        return typeof value === 'undefined' ? null : value;
      } catch (e) {
        if (e instanceof SyntaxError && /return/.test(e.message)) {
          return (0, eval)(`(function(){${expr}})()`);
        }
        throw e;
      }
    }, wrapped);
    return text(JSON.stringify(redact({ result, expressionLength: expression.length }), null, 2));
  }

  // ====== browser_dom ======
  if (name === 'browser_dom') {
const { target } = await ensurePage();
    const selector = args.selector;
    if (!selector) return text(JSON.stringify({ error: '缺少选择器参数' }, null, 2));

    // 先检查元素总数
    const totalCount = await target.locator(selector).count().catch(() => 0);
    if (totalCount === 0) {
      return text(JSON.stringify({ selector, count: 0, elements: [], error: '未找到匹配元素' }, null, 2));
    }

    // 获取所有匹配元素（最多10个）
    const limit = Math.min(typeof args.limit === 'number' ? args.limit : 10, 10);
    const elements = await target.evaluate(({ sel, max }) => {
      const items = [];
      const nodes = document.querySelectorAll(sel);
      const maxCount = Math.min(nodes.length, max);
      for (let i = 0; i < maxCount; i++) {
        const el = nodes[i];
        const rect = el.getBoundingClientRect();
        const type = (el.getAttribute('type') || '').toLowerCase();
        const sensitive = ['password'].includes(type) || /key|token|secret|password/i.test(`${el.id} ${el.name} ${el.placeholder}`);
        const style = getComputedStyle(el);
        items.push({
          index: i,
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          className: typeof el.className === 'string' ? el.className : '',
          text: (el.innerText || el.textContent || '').trim().slice(0, 500),
          value: 'value' in el ? (sensitive ? '******' : el.value) : undefined,
          visible: !!(rect.width || rect.height),
          disabled: !!el.disabled,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
          style: { display: style.display, visibility: style.visibility, opacity: style.opacity }
        });
      }
      return items;
    }, { sel: selector, max: limit });

    return text(JSON.stringify(redact({ selector, count: totalCount, returned: elements.length, elements }), null, 2));
  }

  // ====== browser_highlight ======
  if (name === 'browser_highlight') {
const { target } = await ensurePage();
    await target.$eval(args.selector, (el, color) => {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.setAttribute('data-mcp-debug-highlight', 'true');
      el.style.outline = `4px solid ${color || 'red'}`;
      el.style.boxShadow = `0 0 0 6px rgba(255,0,0,.25)`;
    }, args.color || 'red');
    return text(`已高亮元素：${args.selector}`);
  }

  // ====== browser_select ======
  if (name === 'browser_select') {
const { target } = await ensurePage();
    const selectValue = args.value || args.label || args.index;
    if (!selectValue) {
      return text(`错误：browser_select 需要提供 value 或 label 或 index 参数，当前参数：${JSON.stringify(args)}`);
    }
    const selectEl = await target.$(args.selector);
    if (!selectEl) {
      return text(`browser_select: 未找到选择器 "${args.selector}" 对应的 select 元素，请确认页面包含该元素`);
    }
    try {
      await target.selectOption(args.selector, selectValue, { timeout: 5000 });
    } catch (e) {
      return text(`browser_select: 操作失败：${e.message}，选择器：${args.selector}，值：${selectValue}`);
    }
    
    // 操作后快速错误捕获
    const postErrors = await postActionErrorCheck(target, 'select', args.selector);
    
    return text(JSON.stringify({
      action: 'select',
      selector: args.selector,
      value: selectValue,
      success: true,
      errors: { count: postErrors.count, detected: postErrors.detected }
    }, null, 2));
  }

  // ====== browser_navigate ======
  if (name === 'browser_navigate') {
const { target } = await ensurePage();
    const action = args.action || 'refresh';
    const waitUntil = args.waitUntil || 'domcontentloaded';
    const timeout = args.timeout || 30000;

    try {
      switch (action) {
        case 'forward':
          await target.goForward({ timeout });
          break;
        case 'back':
          await target.goBack({ timeout });
          break;
        case 'refresh':
        case 'reload':
          await target.reload({ waitUntil, timeout });
          break;
        default:
          return { isError: true, content: [{ type: 'text', text: `不支持的导航操作: ${action}，支持 forward/back/refresh/reload` }] };
      }

      return text(JSON.stringify({
        action,
        success: true,
        currentUrl: target.url(),
        waitUntil
      }, null, 2));
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: `导航失败: ${e.message}` }] };
    }
  }

  // ====== browser_wait ======
  if (name === 'browser_wait') {
const { target } = await ensurePage();
    return text(JSON.stringify(await waitForCondition(target, args), null, 2));
  }

  // ====== browser_assert ======
  if (name === 'browser_assert') {
const { target } = await ensurePage();
    return text(JSON.stringify(await assertPage(target, args), null, 2));
  }

  // ====== browser_flow ======
  if (name === 'browser_flow') {
const { target } = await ensurePage(args);
    return text(JSON.stringify(await runFlow(target, args), null, 2));
  }

  // ====== browser_instrument ======
  if (name === 'browser_instrument') {
const { target } = await ensurePage(args);
    return text(JSON.stringify(await installInstrumentation(target), null, 2));
  }

  // ====== browser_events ======
  if (name === 'browser_events') {
const { target } = await ensurePage(args);
    return text(JSON.stringify(await getBrowserEvents(target, args), null, 2));
  }

  // ====== browser_events_clear ======
  if (name === 'browser_events_clear') {
	const { target } = await ensurePage(args);
    return text(JSON.stringify(await clearBrowserEvents(target), null, 2));
  }

  // ====== browser_form_validate ======
  if (name === 'browser_form_validate') {
    const { target } = await ensurePage();

    // Navigate if URL provided
    if (args.url) {
      await target.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    const formSelector = args.formSelector;
    const validateSubmit = args.validateSubmit !== false;
    const checkRequired = args.checkRequired !== false;
    const checkPattern = args.checkPattern !== false;
    const checkLength = args.checkLength !== false;

    // Analyze form
    const formAnalysis = await target.evaluate((opts) => {
      const { formSelector, checkRequired, checkPattern, checkLength } = opts;

      // Find form
      let form = null;
      if (formSelector) {
        form = document.querySelector(formSelector);
      } else {
        form = document.querySelector('form');
      }

      if (!form) {
        return { formFound: false, fields: [], error: 'No form found' };
      }

      const fields = [];
      const inputs = form.querySelectorAll('input, select, textarea');

      for (const input of inputs) {
        const field = {
          name: input.name || '',
          id: input.id || '',
          type: input.type || 'text',
          tagName: input.tagName.toLowerCase(),
          label: '',
          required: input.required,
          pattern: input.pattern || null,
          minLength: input.minLength || null,
          maxLength: input.maxLength || null,
          min: input.min || null,
          max: input.max || null,
          inputType: input.getAttribute('type') || 'text',
          placeholder: input.placeholder || '',
          defaultValue: input.value || '',
          options: [],
          validationRules: [],
          issues: []
        };

        // Get label
        if (input.id) {
          const label = document.querySelector(`label[for="${input.id}"]`);
          if (label) field.label = label.innerText.trim();
        }
        if (!field.label) {
          const parent = input.closest('label');
          if (parent) field.label = parent.innerText.trim();
        }

        // Get select options
        if (input.tagName === 'SELECT') {
          const options = input.querySelectorAll('option');
          field.options = Array.from(options).map(o => o.value || o.innerText.trim()).filter(Boolean);
        }

        // Get radio/checkbox options
        if (input.type === 'radio' || input.type === 'checkbox') {
          const group = form.querySelectorAll(`input[name="${input.name}"]`);
          field.options = Array.from(group).map(r => r.value || r.id || ' unnamed').filter(Boolean);
        }

        // Build validation rules
        if (checkRequired && field.required) {
          field.validationRules.push('必填');
        }
        if (checkPattern && field.pattern) {
          field.validationRules.push(`格式验证: ${field.pattern}`);
        }
        if (checkLength) {
          if (field.minLength) field.validationRules.push(`最小长度: ${field.minLength}`);
          if (field.maxLength) field.validationRules.push(`最大长度: ${field.maxLength}`);
        }
        if (field.min) field.validationRules.push(`最小值: ${field.min}`);
        if (field.max) field.validationRules.push(`最大值: ${field.max}`);

        // Detect common input types
        if (!input.getAttribute('type') || input.getAttribute('type') === 'text') {
          if (input.className.includes('email') || input.name.includes('email')) {
            field.inputType = 'email';
            field.validationRules.push('预期: 邮箱格式');
          }
          if (input.className.includes('tel') || input.name.includes('phone')) {
            field.inputType = 'tel';
            field.validationRules.push('预期: 电话号码格式');
          }
          if (input.className.includes('url') || input.name.includes('url')) {
            field.inputType = 'url';
            field.validationRules.push('预期: URL 格式');
          }
        }

        // Check for common issues
        if (!field.name && !field.id) {
          field.issues.push('字段没有 name 或 id 属性');
        }
        if (field.required && !field.label && !field.placeholder) {
          field.issues.push('必填字段没有标签或占位符');
        }
        if (field.pattern && !field.label && !field.placeholder) {
          field.issues.push('有格式验证的字段没有标签或占位符');
        }

        fields.push(field);
      }

      return { formFound: true, formSelector: formSelector || 'form', fields };
    }, { formSelector, checkRequired, checkPattern, checkLength });

    if (!formAnalysis.formFound) {
      return text(JSON.stringify({ success: false, url: target.url(), formFound: false, error: formAnalysis.error }, null, 2));
    }

    // Try to submit the form to see validation
    let validationResults = null;
    if (validateSubmit) {
      try {
        // Clear fields first
        for (const field of formAnalysis.fields.filter(f => f.type !== 'submit' && f.type !== 'button' && f.type !== 'hidden')) {
          if (field.type === 'radio' || field.type === 'checkbox') continue;
          try {
            await target.fill(`#${field.id}`, '');
          } catch (e) {
            try {
              await target.fill(`[name="${field.name}"]`, '');
            } catch (e2) {}
          }
        }

        // Try to submit
        await target.click('button[type="submit"]').catch(() => {});
        await new Promise(r => setTimeout(r, 500));

        // Check if validation blocked submission
        const validationMessages = await target.evaluate(() => {
          const messages = [];
          // Check for HTML5 validation messages
          document.querySelectorAll(':invalid').forEach(el => {
            messages.push({
              field: el.name || el.id || el.tagName,
              message: el.validationMessage
            });
          });
          // Check for custom validation
          document.querySelectorAll('.error, .invalid, [class*="error"]').forEach(el => {
            const text = el.innerText.trim();
            if (text) messages.push({ field: el.className, message: text });
          });
          return messages;
        });

        const requiredMissing = formAnalysis.fields.filter(f => f.required && !f.defaultValue).length;
        const patternViolations = validationMessages.filter(m => m.message.includes('pattern')).length;
        const lengthViolations = validationMessages.filter(m => m.message.includes('length')).length;

        validationResults = {
          totalFields: formAnalysis.fields.length,
          requiredFieldsMissing: requiredMissing,
          patternViolations,
          lengthViolations,
          validationMessages: validationMessages.slice(0, 10),
          allPassed: validationMessages.length === 0 && requiredMissing === 0
        };
      } catch (e) {
        validationResults = { error: e.message };
      }
    }

    // Generate recommendations
    const recommendations = [];
    const fieldsWithIssues = formAnalysis.fields.filter(f => f.issues.length > 0);
    if (fieldsWithIssues.length > 0) {
      recommendations.push(`${fieldsWithIssues.length} 个字段存在问题，建议添加 labels 或占位符`);
    }
    const requiredWithoutLabel = formAnalysis.fields.filter(f => f.required && !f.label);
    if (requiredWithoutLabel.length > 0) {
      recommendations.push(`${requiredWithoutLabel.length} 个必填字段缺少标签，建议添加 <label> 元素`);
    }
    if (validationResults && !validationResults.allPassed) {
      recommendations.push('表单提交被验证拦截，请检查必填字段和格式');
    }
    if (recommendations.length === 0) {
      recommendations.push('表单结构良好，验证规则完整');
    }

    return text(JSON.stringify({
      success: true,
      url: target.url(),
      formFound: true,
      formSelector: formAnalysis.formSelector,
      fields: formAnalysis.fields,
      validationResults,
      summary: validationResults
        ? `共 ${validationResults.totalFields} 个字段，${validationResults.requiredFieldsMissing} 个必填字段为空，${validationResults.patternViolations} 个格式违规`
        : `共 ${formAnalysis.fields.length} 个字段，已分析验证规则`,
      recommendations
    }, null, 2));
  }

  // ====== browser_chain ======
  if (name === 'browser_chain') {
const { target } = await ensurePage();
    const actions = args.actions || [];
    const stopOnError = args.stopOnError !== false;
    const includeNetwork = args.includeNetwork !== false;
    const includeConsole = args.includeConsole !== false;

    const actionResults = [];
    let allConsoleErrors = [];
    let allNetworkErrors = [];
    let failedActionIndex = null;
    let errorMessage = null;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const result = {
        index: i,
        type: action.type,
        success: false,
        consoleErrors: [],
        networkErrors: []
      };

      const stepCheckpoint = new Date().toISOString();

      try {
        switch (action.type) {
          case 'click':
            await target.click(action.selector, { timeout: 10000 });
            result.selector = action.selector;
            result.success = true;
            break;
          case 'type':
            await target.fill(action.selector, action.text || '', { timeout: 10000 });
            result.selector = action.selector;
            result.text = action.text || '';
            result.success = true;
            break;
          case 'hover':
            await target.hover(action.selector, { timeout: 10000 });
            result.selector = action.selector;
            result.success = true;
            break;
          case 'scroll':
            if (action.selector) {
              await target.$eval(action.selector, el => el.scrollIntoView());
              result.selector = action.selector;
            } else {
              await target.evaluate(({ x, y }) => window.scrollTo(x || 0, y || 0), { x: 0, y: action.distance || 300 });
              result.distance = action.distance || 300;
            }
            result.success = true;
            break;
          case 'pressKey':
            if (action.selector) await target.focus(action.selector);
            await target.keyboard.press(action.key);
            result.key = action.key;
            result.success = true;
            break;
          case 'select':
            await target.selectOption(action.selector, action.value || action.label || action.index);
            result.selector = action.selector;
            result.value = action.value || action.label || action.index;
            result.success = true;
            break;
          case 'wait':
            await target.waitForTimeout(action.ms || 1000);
            result.ms = action.ms || 1000;
            result.success = true;
            break;
          case 'evaluate':
            const expression = action.expression || '';
            const wrapped = expression.trim().startsWith('return') || expression.includes('return ')
              ? `(function(){${expression}})()`
              : expression;
            const evalResult = await target.evaluate(expr => {
              try {
                const value = (0, eval)(expr);
                return typeof value === 'undefined' ? null : value;
              } catch (e) {
                if (e instanceof SyntaxError && /return/.test(e.message)) {
                  return (0, eval)(`(function(){${expr}})()`);
                }
                throw e;
              }
            }, wrapped);
            result.result = evalResult;
            result.success = true;
            break;
          default:
            result.error = `未知操作类型: ${action.type}`;
            result.success = false;
        }

        if (result.success) {
          await new Promise(r => setTimeout(r, 300)).catch(() => {});

          if (includeConsole) {
            const newConsoleErrors = stateManager.consoleLogs
              .filter(e => new Date(e.timestamp || 0).getTime() > new Date(stepCheckpoint).getTime())
              .map(e => ({ type: e.type || 'error', text: (e.text || '').slice(0, 200) }));
            result.consoleErrors = newConsoleErrors;
            allConsoleErrors = allConsoleErrors.concat(newConsoleErrors);
          }

          if (includeNetwork) {
            const newNetworkErrors = stateManager.networkLogs
              .filter(e => e.status >= 400 && new Date(e.timestamp || 0).getTime() > new Date(stepCheckpoint).getTime())
              .map(e => ({ url: (e.url || '').slice(0, 100), status: e.status }));
            result.networkErrors = newNetworkErrors;
            allNetworkErrors = allNetworkErrors.concat(newNetworkErrors);
          }

          const hasErrors = result.consoleErrors.length > 0 || result.networkErrors.length > 0;
          if (hasErrors && stopOnError) {
            failedActionIndex = i;
            errorMessage = `第 ${i + 1} 步操作后检测到错误：控制台错误 ${result.consoleErrors.length} 个，网络错误 ${result.networkErrors.length} 个`;
            actionResults.push(result);
            break;
          }
        } else {
          if (stopOnError) {
            failedActionIndex = i;
            errorMessage = result.error || `第 ${i + 1} 步操作失败`;
            actionResults.push(result);
            break;
          }
        }
      } catch (err) {
        result.success = false;
        result.error = err.message;
        if (stopOnError) {
          failedActionIndex = i;
          errorMessage = `第 ${i + 1} 步操作异常: ${err.message}`;
          actionResults.push(result);
          break;
        }
      }

      actionResults.push(result);
    }

    const completedActions = actionResults.filter(r => r.success).length;
    const success = failedActionIndex === null;

    return text(JSON.stringify({
      success,
      totalActions: actions.length,
      completedActions,
      failedActionIndex,
      actionResults,
      consoleErrors: allConsoleErrors,
      networkErrors: allNetworkErrors,
      errorMessage
    }, null, 2));
  }

  // ====== browser_aria_snapshot ======
  if (name === 'browser_aria_snapshot') {
    const { target } = await ensurePage(args);
    const maxDepth = args.maxDepth || 10;
    let rootNode;
    if (args.selector) {
      const el = await target.$(args.selector);
      if (!el) {
        return { isError: true, content: [{ type: 'text', text: `元素未找到: ${args.selector}` }] };
      }
      rootNode = await target.accessibility.snapshot({ root: el, interestingOnly: true });
    } else {
      rootNode = await target.accessibility.snapshot({ interestingOnly: true });
    }
    if (!rootNode) {
      return { content: [{ type: 'text', text: JSON.stringify({ role: 'document', name: 'empty', children: [] }, null, 2) }] };
    }
    let refCounter = 0;
    function assignRefs(node, depth) {
      if (!node || depth > maxDepth) return null;
      const ref = 'ref_' + (refCounter++).toString(36);
      node._ref = ref;
      const result = {
        role: node.role || 'unknown',
        name: (node.name || '').slice(0, 200),
        ref,
        bounds: node.bounds ? {
          x: Math.round(node.bounds.x || 0), y: Math.round(node.bounds.y || 0),
          width: Math.round(node.bounds.width || 0), height: Math.round(node.bounds.height || 0)
        } : null,
        focused: !!node.focused,
        enabled: node.disabled !== undefined ? !node.disabled : undefined,
        value: node.value !== undefined ? String(node.value).slice(0, 100) : undefined
      };
      if (node.children && depth < maxDepth) {
        result.children = node.children.map(child => assignRefs(child, depth + 1)).filter(Boolean);
        if (result.children.length === 0) delete result.children;
      }
      return result;
    }
    const tree = assignRefs(rootNode, 0);
    return { content: [{ type: 'text', text: JSON.stringify(tree, null, 2) }] };
  }

  // ====== findNodeByRef ======
  function findNodeByRef(node, ref) {
    if (!node) return null;
    if (node._ref === ref) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNodeByRef(child, ref);
        if (found) return found;
      }
    }
    return null;
  }

  // ====== browser_aria_click ======
  if (name === 'browser_aria_click') {
    const { target } = await ensurePage(args);
    if (!args.ref) return { isError: true, content: [{ type: 'text', text: '缺少必需参数: ref' }] };
    const snapshot = await target.accessibility.snapshot({ interestingOnly: true });
    if (!snapshot) return { isError: true, content: [{ type: 'text', text: '页面无可访问性信息' }] };
    let refCounter = 0;
    (function assign(node, depth) {
      if (!node || depth > 20) return;
      node._ref = 'ref_' + (refCounter++).toString(36);
      if (node.children) node.children.forEach(c => assign(c, depth + 1));
    })(snapshot, 0);
    const node = findNodeByRef(snapshot, args.ref);
    if (!node || !node.bounds) return { isError: true, content: [{ type: 'text', text: `未找到 ref: ${args.ref}` }] };
    const x = Math.round(node.bounds.x + node.bounds.width / 2);
    const y = Math.round(node.bounds.y + node.bounds.height / 2);
    await target.mouse.click(x, y);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, ref: args.ref, x, y }, null, 2) }] };
  }

  // ====== browser_aria_type ======
  if (name === 'browser_aria_type') {
    const { target } = await ensurePage(args);
    if (!args.ref) return { isError: true, content: [{ type: 'text', text: '缺少必需参数: ref' }] };
    if (typeof args.text !== 'string') return { isError: true, content: [{ type: 'text', text: '缺少必需参数: text' }] };
    const snapshot = await target.accessibility.snapshot({ interestingOnly: true });
    if (!snapshot) return { isError: true, content: [{ type: 'text', text: '页面无可访问性信息' }] };
    let refCounter = 0;
    (function assign(node, depth) {
      if (!node || depth > 20) return;
      node._ref = 'ref_' + (refCounter++).toString(36);
      if (node.children) node.children.forEach(c => assign(c, depth + 1));
    })(snapshot, 0);
    const node = findNodeByRef(snapshot, args.ref);
    if (!node || !node.bounds) return { isError: true, content: [{ type: 'text', text: `未找到 ref: ${args.ref}` }] };
    const x = Math.round(node.bounds.x + node.bounds.width / 2);
    const y = Math.round(node.bounds.y + node.bounds.height / 2);
    await target.mouse.click(x, y);
    if (node.value !== undefined) { await target.keyboard.press('Control+A'); await target.keyboard.press('Delete'); }
    await target.keyboard.type(args.text);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, ref: args.ref, text: args.text }, null, 2) }] };
  }

  // ====== browser_smart_fill ======
  if (name === 'browser_smart_fill') {
    const { target } = await ensurePage(args);
    const dataGen = require('./hands/data_generator');
    const fieldType = args.fieldType || 'text';
    if (!dataGen.isSupported(fieldType)) {
      return { isError: true, content: [{ type: 'text', text: `不支持的字段类型: ${fieldType}。支持: ${dataGen.getSupportedTypes().join(', ')}` }] };
    }
    const generatedValue = dataGen.generate(fieldType, args.options || {});
    const el = await target.$(args.selector);
    if (!el) {
      return { isError: true, content: [{ type: 'text', text: `元素未找到: ${args.selector}` }] };
    }
    await el.click();
    await el.fill('');
    await el.fill(generatedValue);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, selector: args.selector, fieldType, value: generatedValue }, null, 2) }] };
  }

  // ====== browser_matrix_test ======
  if (name === 'browser_matrix_test') {
    const { chromium, firefox, webkit } = require('playwright');
    const engines = { chromium, firefox, webkit };
    const browserTypes = Array.isArray(args.browsers) && args.browsers.length > 0 ? args.browsers : ['chromium', 'firefox'];
    const steps = Array.isArray(args.steps) ? args.steps : [];
    const headless = args.headless !== false;
    const timeout = args.timeout || 15000;

    if (steps.length === 0) {
      return { isError: true, content: [{ type: 'text', text: '缺少必需参数: steps' }] };
    }

    const results = {};

    for (const browserType of browserTypes) {
      const engine = engines[browserType];
      if (!engine) {
        results[browserType] = { status: 'error', error: `不支持的浏览器类型: ${browserType}` };
        continue;
      }

      // 为每个浏览器创建独立实例
      let browser, page;
      try {
        browser = await engine.launch({ headless });
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        page = await context.newPage();
      } catch (e) {
        results[browserType] = { status: 'error', error: `浏览器启动失败: ${e.message}` };
        continue;
      }

      const stepResults = [];
      let browserStatus = 'passed';

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepResult = { action: step.action, index: i };

        try {
          switch (step.action) {
            case 'navigate': {
              if (!step.url) stepResult.error = 'navigate 需要 url';
              else await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout });
              break;
            }
            case 'click': {
              if (!step.target) stepResult.error = 'click 需要 target';
              else await page.click(step.target, { timeout });
              break;
            }
            case 'type': {
              if (!step.target) stepResult.error = 'type 需要 target';
              else await page.fill(step.target, step.value || '', { timeout });
              break;
            }
            case 'screenshot': {
              const name = step.name || `step-${i}`;
              const screenshot = await page.screenshot({ encoding: 'base64', fullPage: true });
              stepResult.screenshot = `data:image/png;base64,${screenshot}`;
              break;
            }
            case 'evaluate': {
              if (!step.value) stepResult.error = 'evaluate 需要 value';
              else stepResult.result = await page.evaluate(step.value);
              break;
            }
            default:
              stepResult.error = `不支持的操作: ${step.action}`;
          }
        } catch (e) {
          stepResult.error = e.message;
          browserStatus = 'failed';
        }

        stepResult.status = stepResult.error ? 'error' : 'ok';
        stepResults.push(stepResult);
      }

      // 关闭浏览器
      try {
        await browser.close();
      } catch (e) { /* 忽略 */ }

      results[browserType] = {
        status: browserStatus,
        steps: stepResults
      };
    }

    const summary = { total: browserTypes.length, passed: 0, failed: 0 };
    for (const bt of browserTypes) {
      if (results[bt] && results[bt].status === 'passed') summary.passed++;
      else summary.failed++;
    }

    return { content: [{ type: 'text', text: JSON.stringify({ results, summary }, null, 2) }] };
  }

  return { isError: true, content: [{ type: 'text', text: `未知工具（browser）: ${name}` }] };
  } finally {
    for (const k of _depsKeys) { deps[k] = globalThis[k]; }
    for (const k of _depsKeys) { if (k in _depsPrev) globalThis[k] = _depsPrev[k]; else delete globalThis[k]; }
  }

}

module.exports = { tools, handle };
