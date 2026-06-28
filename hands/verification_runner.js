'use strict';

const path = require('path');
const { PlaywrightAdapter } = require('../engines/playwright_adapter');
const { redact } = require('../core/redaction');

async function validationQuickRun(args = {}) {
  const startTime = Date.now();
  const timeout = args.timeout || 30000;
  const url = args.url;
  if (!url) throw new Error('url 参数必填');

  const allChecks = ['load_time', 'no_js_errors', 'no_5xx', 'no_404', 'not_blank', 'has_title', 'has_content'];
  const requestedChecks = Array.isArray(args.checks) && args.checks.length > 0 ? args.checks : allChecks;
  const checksToRun = requestedChecks.filter(c => allChecks.includes(c));

  const adapter = new PlaywrightAdapter({ headless: args.headless !== false });
  const checks = [];
  let loadTime = 0;
  let screenshotPath = '';

  try {
    const navStart = Date.now();
    await adapter.open({ url, timeout, waitUntil: 'domcontentloaded' });
    loadTime = Date.now() - navStart;

    if (checksToRun.includes('load_time')) {
      checks.push({ name: 'load_time', passed: true, detail: `页面加载成功，耗时 ${loadTime}ms` });
    }
  } catch (error) {
    loadTime = Date.now() - startTime;
    if (checksToRun.includes('load_time')) {
      checks.push({ name: 'load_time', passed: false, detail: `页面加载失败: ${error.message}` });
    }
    try {
      const shot = await adapter.screenshot({ name: 'quick-run-error' });
      screenshotPath = shot.artifactPath || '';
    } catch (e) {
      // ignore
    }
    const duration = Date.now() - startTime;
    const remaining = checksToRun.filter(c => !checks.find(ch => ch.name === c)).map(name => ({
      name,
      passed: false,
      detail: '页面加载失败，无法执行后续检查'
    }));
    const result = redact({
      pass: false,
      mode: 'quick',
      url,
      loadTime,
      totalChecks: checksToRun.length,
      passedChecks: 0,
      failedChecks: checksToRun.length,
      checks: checks.concat(remaining),
      errors: getErrorsFromAdapter(adapter),
      screenshot: screenshotPath,
      duration,
      summary: `页面加载失败: ${error.message}`,
      topErrors: [{ message: error.message, source: 'load' }],
      artifacts: screenshotPath ? [screenshotPath] : [],
      timestamp: new Date().toISOString()
    });
    await adapter.close().catch(() => {});
    return result;
  }

  if (checksToRun.includes('no_js_errors')) {
    const consoleErrors = adapter.consoleLogs.filter(e => e.type === 'error');
    const hasJsErrors = consoleErrors.length > 0 || adapter.pageErrors.length > 0;
    checks.push({
      name: 'no_js_errors',
      passed: !hasJsErrors,
      detail: hasJsErrors
        ? `检测到 ${consoleErrors.length} 个 console.error 和 ${adapter.pageErrors.length} 个 pageerror`
        : '无 JS 错误'
    });
  }

  if (checksToRun.includes('no_5xx')) {
    const serverErrors = adapter.networkLogs.filter(e => e.status >= 500 && e.status < 600);
    checks.push({
      name: 'no_5xx',
      passed: serverErrors.length === 0,
      detail: serverErrors.length === 0
        ? '无 5xx 服务器错误'
        : `检测到 ${serverErrors.length} 个 5xx 错误: ${serverErrors.slice(0, 3).map(e => `${e.status} ${e.url}`).join('; ')}`
    });
  }

  if (checksToRun.includes('no_404')) {
    const notFoundErrors = adapter.networkLogs.filter(e => e.status === 404);
    checks.push({
      name: 'no_404',
      passed: notFoundErrors.length === 0,
      detail: notFoundErrors.length === 0
        ? '无 404 错误'
        : `检测到 ${notFoundErrors.length} 个 404 错误: ${notFoundErrors.slice(0, 3).map(e => e.url).join('; ')}`
    });
  }

  let domInfo = { bodyTextLength: 0, imgCount: 0, linkCount: 0, buttonCount: 0, title: '' };
  try {
    const evalResult = await adapter.eval({
      expression: `(() => { const bodyText = document.body?.innerText || ''; const imgCount = document.querySelectorAll('img').length; const linkCount = document.querySelectorAll('a[href]').length; const buttonCount = document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]').length; const title = document.title || ''; return { bodyTextLength: bodyText.length, imgCount, linkCount, buttonCount, title }; })()`
    });
    if (evalResult.result) {
      domInfo = evalResult.result;
    }
  } catch (e) {
    // ignore
  }

  if (checksToRun.includes('not_blank')) {
    const hasContent = domInfo.bodyTextLength > 50 && (domInfo.imgCount > 0 || domInfo.linkCount > 0 || domInfo.buttonCount > 0);
    checks.push({
      name: 'not_blank',
      passed: hasContent,
      detail: hasContent
        ? `页面有实际内容（文本长度: ${domInfo.bodyTextLength}，图片: ${domInfo.imgCount}，链接: ${domInfo.linkCount}，按钮: ${domInfo.buttonCount}）`
        : `页面疑似白屏（文本长度: ${domInfo.bodyTextLength}，图片: ${domInfo.imgCount}，链接: ${domInfo.linkCount}，按钮: ${domInfo.buttonCount}）`
    });
  }

  if (checksToRun.includes('has_title')) {
    const hasTitle = domInfo.title && domInfo.title.trim().length > 0;
    checks.push({
      name: 'has_title',
      passed: hasTitle,
      detail: hasTitle ? `页面标题: ${domInfo.title}` : '页面无标题或标题为空'
    });
  }

  if (checksToRun.includes('has_content')) {
    const hasMainContent = domInfo.imgCount > 0 || domInfo.linkCount >= 3 || domInfo.buttonCount > 0;
    checks.push({
      name: 'has_content',
      passed: hasMainContent,
      detail: hasMainContent
        ? `页面有主要内容元素（图片: ${domInfo.imgCount}，链接: ${domInfo.linkCount}，按钮: ${domInfo.buttonCount}）`
        : `页面缺少主要内容元素（图片: ${domInfo.imgCount}，链接: ${domInfo.linkCount}，按钮: ${domInfo.buttonCount}）`
    });
  }

  try {
    const shot = await adapter.screenshot({ name: 'quick-run' });
    screenshotPath = shot.artifactPath || '';
  } catch (e) {
    // ignore
  }

  const passedChecks = checks.filter(c => c.passed).length;
  const failedChecks = checks.filter(c => !c.passed).length;
  const pass = failedChecks === 0;
  const duration = Date.now() - startTime;

  const errors = getErrorsFromAdapter(adapter);
  const topErrors = errors.slice(0, 5).map(e => ({ message: e.text || e.detail, source: e.source }));

  const result = redact({
    pass,
    mode: 'quick',
    url,
    loadTime,
    totalChecks: checks.length,
    passedChecks,
    failedChecks,
    checks,
    errors,
    screenshot: screenshotPath,
    duration,
    summary: pass
      ? `所有 ${checks.length} 项检查通过，加载耗时 ${loadTime}ms`
      : `${failedChecks} 项检查失败，加载耗时 ${loadTime}ms`,
    topErrors,
    artifacts: screenshotPath ? [screenshotPath] : [],
    timestamp: new Date().toISOString()
  });

  await adapter.close().catch(() => {});
  return result;
}

function getErrorsFromAdapter(adapter) {
  const errors = [];
  (adapter.consoleLogs || []).filter(e => e.type === 'error').forEach(e => {
    errors.push({ source: 'console', type: 'error', text: e.text, timestamp: e.timestamp });
  });
  (adapter.pageErrors || []).forEach(e => {
    errors.push({ source: 'pageerror', type: 'error', text: e.text, timestamp: e.timestamp });
  });
  (adapter.networkLogs || []).filter(e => e.status >= 400 || e.failed).forEach(e => {
    errors.push({ source: 'network', status: e.status, url: e.url, method: e.method, failed: e.failed, text: e.errorText, timestamp: e.timestamp });
  });
  return errors;
}

module.exports = {
  validationQuickRun
};
