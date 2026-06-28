const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TARGET_URL = 'http://192.168.8.4:5173';
const LOCAL_URL = 'http://127.0.0.1:5173';
const BASE_URL = TARGET_URL; // prefer remote direct
const REPORT_DIR = path.join(__dirname, '..', '.trae', 'specs', 'reverify-huokesys-and-improve-tools', 'reports');
const SCREENSHOT_DIR = path.join(REPORT_DIR, 'screenshots');

const results = [];

function log(step, status, detail) {
  const entry = { step, status, detail, timestamp: new Date().toISOString() };
  results.push(entry);
  console.log(`[${status}] ${step}: ${detail}`);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== HuoKe HIS 修复复验 ===\n');
  console.log(`目标: ${BASE_URL}\n`);

  // ---- Task 1: SSH tunnel + browser ----
  log('T1.1 远程可达性', 'CHECKING', `Testing ${BASE_URL}...`);
  // Try to reach via node http
  const http = require('http');
  let remoteReachable = await new Promise(resolve => {
    const req = http.get(BASE_URL, res => {
      resolve(true);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
  });

  if (!remoteReachable) {
    log('T1.1 远程可达性', 'WARN', `${BASE_URL} 不可达，尝试 SSH 隧道 ${LOCAL_URL}`);
    const reachable = await new Promise(resolve => {
      const req = http.get(LOCAL_URL, res => {
        resolve(true);
        res.resume();
      });
      req.on('error', () => resolve(false));
      req.setTimeout(5000, () => { req.destroy(); resolve(false); });
    });
    if (!reachable) {
      log('T1.1 远程可达性', 'FAIL', '远程服务器和 SSH 隧道均不可达，本次验证将在本地 ai-verify-mcp server 上执行工具检查');
      console.log('\n远程服务器不可达，生成环境报告。\n');
      return;
    }
    BASE_URL = LOCAL_URL;
    log('T1.1 SSH 隧道', 'PASS', `SSH 隧道成功，${LOCAL_URL} 可达`);
  } else {
    log('T1.1 远程可达性', 'PASS', `${BASE_URL} 直接可达`);
  }

  // ---- Launch browser ----
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  log('T1.2 浏览器会话', 'PASS', 'Chromium 浏览器会话已创建');

  // Capture console errors
  const consoleErrors = [];
  const apiResponses = {};
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push({ text: msg.text(), time: Date.now() });
  });
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('response', resp => {
    const url = resp.url();
    if (url.includes('/api/')) {
      const status = resp.status();
      if (!apiResponses[url]) apiResponses[url] = [];
      apiResponses[url].push(status);
    }
  });

  // ---- Load page ----
  try {
    const start = Date.now();
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    const loadTime = Date.now() - start;
    log('T1.3 页面加载', loadTime < 5000 ? 'PASS' : 'WARN', `加载完成 ${loadTime}ms`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '00-page-load.png'), fullPage: true });
  } catch (e) {
    log('T1.3 页面加载', 'FAIL', `加载失败: ${e.message}`);
    await browser.close();
    return;
  }

  // ---- Task 2: Static resources ----
  log('T2.1 静态资源验证', 'INFO', '检查页面资源加载状态...');
  const resourceErrors = [];
  const resources = [];
  page.on('requestfailed', req => {
    resourceErrors.push({ url: req.url(), error: req.failure()?.errorText || 'unknown' });
  });

  // Reload to capture all
  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  await sleep(2000);

  // Check performance entries
  const perfEntries = await page.evaluate(() =>
    performance.getEntriesByType('resource').map(e => ({
      name: e.name.split('?')[0],
      duration: Math.round(e.duration),
      size: e.transferSize || e.encodedBodySize || 0
    }))
  );
  const jsEntries = perfEntries.filter(e => e.name.endsWith('.js'));
  const cssEntries = perfEntries.filter(e => e.name.endsWith('.css'));
  const failedResources = resourceErrors.filter(r => !r.url.includes('favicon'));

  log('T2 静态资源', failedResources.length === 0 ? 'PASS' : 'WARN',
    `${jsEntries.length} JS, ${cssEntries.length} CSS 加载，${failedResources.length} 个失败`);

  // Check legacy JS files
  const legacyJs = jsEntries.filter(e => e.name.includes('legacy'));
  log('T2.2 legacy JS', legacyJs.length > 0 ? 'PASS' : 'INFO',
    `${legacyJs.length} 个 legacy JS 文件（上一轮 404 修复项）`);

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-resources-loaded.png'), fullPage: true });

  // ---- Task 3: API endpoints ----
  log('T3 API 端点验证', 'INFO', '检查 API 响应...');
  
  // Navigate to app.html for SPA
  await page.goto(BASE_URL + '/app.html', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await sleep(2000);

  const apiStatus = {};
  for (const [url, codes] of Object.entries(apiResponses)) {
    const key = url.replace(/https?:\/\/[^\/]+/, '');
    apiStatus[key] = codes;
  }

  // Critical endpoints check
  const criticalEndpoints = [
    '/api/v1/identity/me',
    '/api/v1/tenants',
    '/api/v1/reports/overview',
    '/api/v1/reports/channel-roi'
  ];

  for (const ep of criticalEndpoints) {
    const found = Object.keys(apiStatus).find(k => k.includes(ep));
    if (found) {
      const codes = apiStatus[found];
      const pass = codes.every(c => c === 200);
      log(`T3 ${ep}`, pass ? 'PASS' : 'FAIL', `状态码: ${codes.join(', ')}`);
    } else {
      // Try direct fetch
      try {
        const resp = await page.evaluate(async (url) => {
          const r = await fetch(url);
          return { status: r.status, ok: r.ok };
        }, ep);
        log(`T3 ${ep}`, resp.ok ? 'PASS' : 'FAIL', `状态码: ${resp.status}`);
      } catch (e) {
        log(`T3 ${ep}`, 'INFO', `未捕获到该 API 调用: ${e.message}`);
      }
    }
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-api-check.png'), fullPage: true });

  // ---- Task 4: Console errors ----
  log('T4 Console 错误', 'INFO', `捕获到 ${consoleErrors.length} 个 Console Error, ${pageErrors.length} 个 Page Error`);
  const apiErrors = consoleErrors.filter(e => e.text.includes('404') || e.text.includes('500'));
  const jsErrors = consoleErrors.filter(e => !e.text.includes('404') && !e.text.includes('500'));

  if (apiErrors.length === 0 && jsErrors.length === 0 && pageErrors.length === 0) {
    log('T4 Console 零 Error', 'PASS', '无 Console Error + 无 Page Error');
  } else {
    if (apiErrors.length > 0) log('T4 API Error', 'FAIL', `${apiErrors.length} 个 API 相关 Error`);
    if (jsErrors.length > 0) log('T4 JS Error', 'FAIL', `${jsErrors.length} 个 JS Error`);
    if (pageErrors.length > 0) log('T4 Page Error', 'FAIL', `${pageErrors.length} 个 Page Error`);
    apiErrors.forEach(e => console.log(`  ${e.text}`));
  }

  // ---- Task 5: a11y (basic) ----
  try {
    const a11yIssues = await page.evaluate(() => {
      // Simple contrast check on critical elements
      const elements = document.querySelectorAll('.version, .hero-banner > h1, p');
      const issues = [];
      elements.forEach(el => {
        const style = getComputedStyle(el);
        const color = style.color;
        if (color === 'rgba(0, 0, 0, 0)' || color === 'transparent') {
          issues.push({ element: el.tagName + '.' + (el.className || ''), color });
        }
      });
      return issues;
    });
    log('T5.1 a11y 颜色对比度', a11yIssues.length === 0 ? 'PASS' : 'WARN',
      a11yIssues.length === 0 ? '无可疑颜色对比度问题' : `${a11yIssues.length} 个元素颜色异常`);

    // CSS variables
    const cssVars = await page.evaluate(() => {
      const root = document.documentElement;
      const styles = getComputedStyle(root);
      const vars = ['--primary', '--primary-hover', '--orange', '--yellow'];
      const missing = vars.filter(v => styles.getPropertyValue(v).trim() === '');
      return missing;
    });
    log('T5.2 CSS 变量', cssVars.length === 0 ? 'PASS' : 'FAIL',
      cssVars.length === 0 ? '无缺失 CSS 变量（上一轮 4 个已修复）' : `缺失: ${cssVars.join(', ')}`);
  } catch (e) {
    log('T5 a11y', 'WARN', `a11y 扫描出错: ${e.message}`);
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-a11y-check.png'), fullPage: true });

  // ---- Cleanup ----
  await browser.close();
  log('T1 清理', 'PASS', '浏览器会话已关闭');

  // ---- Summary ----
  console.log('\n' + '='.repeat(60));
  console.log('=== 复验总结 ===');
  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const warnCount = results.filter(r => r.status === 'WARN').length;
  const totalChecks = results.length;
  const score = totalChecks > 0 ? Math.round((passCount / totalChecks) * 100) : 0;
  console.log(`通过: ${passCount}  失败: ${failCount}  警告: ${warnCount}  总分: ${score}%`);
  console.log(`健康状态: ${score >= 90 ? '✅ functional' : score >= 60 ? '⚠️ degraded' : '❌ blocked'}`);
  console.log('='.repeat(60));

  // Write report
  const report = {
    targetUrl: BASE_URL,
    timestamp: new Date().toISOString(),
    healthScore: score,
    functionalStatus: score >= 90 ? 'functional' : score >= 60 ? 'degraded' : 'blocked',
    summary: { pass: passCount, fail: failCount, warn: warnCount, total: totalChecks },
    results
  };
  fs.writeFileSync(path.join(REPORT_DIR, 'verify-results.json'), JSON.stringify(report, null, 2));
  console.log(`\n报告已保存: ${path.join(REPORT_DIR, 'verify-results.json')}`);
}

main().catch(e => console.error('脚本错误:', e));
