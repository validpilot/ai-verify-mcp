'use strict';

// Handler: validation
// Extracted from server.js callCall switch statements

const fs = require('fs');
const path = require('path');
const { mcpError, mcpParamMissing } = require('../core/mcp-error');

const tools = [
  "validation_start",
  "validation_check",
  "validation_run",
  "validation_element",
  "validation_flow",
  "validation_chain",
  "validation_report",
  "validation_report_export",
  "validation_quick_run",
  "browser_smoke_test",
  "browser_counterfactual_analyze",
  "validation_matrix",
  "validation_decision",
  "validation_compliance",
  "validation_data_integrity",
  "validation_permission",
  "state_diff_assert",
"chain_spec",
  "chain_spec_run",
  "chain_list_templates",
  "trace_correlation_check",
  "chain_score_report",
  "contract",
  "contract_guard",
  "contract_baseline"
];

const stateDiffSnapshots = new Map();

function normalizeStateValue(value) {
  if (typeof value === 'string') return value.trim();
  return value;
}

function readJsonPath(obj, jsonPath) {
  if (!jsonPath) return obj;
  const parts = String(jsonPath).replace(/^\$\.?/, '').replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function toComparableNumber(value) {
  if (typeof value === 'number') return value;
  const textValue = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  const matched = String(textValue).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return matched ? Number(matched[0]) : NaN;
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateApiStepResult(apiResult, step) {
  const checks = [];
  const expectedStatus = step.expectedStatus ?? step.status;
  if (expectedStatus !== undefined) {
    checks.push({
      name: 'status',
      passed: Number(apiResult.status) === Number(expectedStatus),
      expected: Number(expectedStatus),
      actual: apiResult.status
    });
  }
  if (Array.isArray(step.expectations)) {
    for (const expectation of step.expectations) {
      const actual = readJsonPath(apiResult.data, expectation.path || expectation.jsonPath || expectation.name);
      const op = expectation.operator || 'equals';
      let passed = false;
      if (op === 'exists') passed = actual !== undefined && actual !== null && actual !== '';
      else if (op === 'equals') passed = sameValue(actual, expectation.value);
      else if (op === 'notEquals') passed = !sameValue(actual, expectation.value);
      else if (op === 'contains') passed = String(actual ?? '').includes(String(expectation.value ?? ''));
      else if (op === 'min') passed = toComparableNumber(actual) >= Number(expectation.value);
      else if (op === 'max') passed = toComparableNumber(actual) <= Number(expectation.value);
      checks.push({ name: expectation.name || expectation.path || expectation.jsonPath, operator: op, passed, expected: expectation.value, actual });
    }
  }
  return { passed: checks.every(check => check.passed), checks };
}

async function collectStateSource(target, source) {
  const type = source.type || 'selectorText';
  const name = source.name || source.selector || source.url || source.key || type;
  try {
    if (type === 'selectorText') {
      const textValue = await target.locator(source.selector).first().innerText({ timeout: source.timeout || 5000 });
      return { name, type, value: normalizeStateValue(textValue) };
    }
    if (type === 'selectorNumber') {
      const textValue = await target.locator(source.selector).first().innerText({ timeout: source.timeout || 5000 });
      return { name, type, value: toComparableNumber(textValue), raw: normalizeStateValue(textValue) };
    }
    if (type === 'bodyText') {
      const textValue = await target.locator('body').innerText({ timeout: source.timeout || 5000 }).catch(() => '');
      return { name, type, value: normalizeStateValue(textValue) };
    }
    if (type === 'localStorage') {
      const value = await target.evaluate(key => window.localStorage.getItem(key), source.key);
      return { name, type, value };
    }
    if (type === 'eval') {
      const value = await target.evaluate(expression => {
        const fn = new Function(`return (${expression})`);
        return fn();
      }, source.expression);
      return { name, type, value: normalizeStateValue(value) };
    }
    if (type === 'apiJson') {
      const result = await target.evaluate(async sourceConfig => {
        const requestUrl = sourceConfig.url || new URL(sourceConfig.path || '/', location.origin).toString();
        const headers = Object.assign({ 'content-type': 'application/json' }, sourceConfig.headers || {});
        const options = { method: sourceConfig.method || 'GET', headers, credentials: 'include' };
        if (sourceConfig.body != null) options.body = typeof sourceConfig.body === 'string' ? sourceConfig.body : JSON.stringify(sourceConfig.body);
        const response = await fetch(requestUrl, options);
        const text = await response.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
        return { status: response.status, ok: response.ok, data };
      }, source);
      return {
        name,
        type,
        status: result.status,
        ok: result.ok,
        value: normalizeStateValue(readJsonPath(result.data, source.jsonPath)),
        raw: result.data
      };
    }
    if (type === 'file' || type === 'runtimeData') {
      const projectRoot = path.resolve(__dirname, '..');
      const allowedRoots = [
        path.join(projectRoot),
        path.resolve(projectRoot, '..', 'commercial')
      ];
      let filePath;
      if (type === 'runtimeData') {
        const basePath = source.basePath || path.resolve(projectRoot, '..', 'commercial', 'poc', 'data');
        const dataset = source.dataset || source.name;
        const fileName = dataset.endsWith('.json') ? dataset : `${dataset}.json`;
        filePath = path.join(basePath, fileName);
      } else {
        filePath = source.path || source.filePath;
      }
      if (!filePath) return { name, type, error: '缺少 path/filePath 参数' };
      const resolved = path.resolve(filePath);
      const isAllowed = allowedRoots.some(root => resolved.startsWith(root));
      if (!isAllowed) return { name, type, error: `文件路径超出允许范围：${resolved}` };
      if (!fs.existsSync(resolved)) return { name, type, error: `文件不存在：${resolved}` };
      const rawText = fs.readFileSync(resolved, 'utf8');
      let data;
      try { data = JSON.parse(rawText); } catch (_) {
        const match = rawText.match(/module\.exports\s*=\s*([\s\S]+)/);
        if (match) {
          try { data = eval(`(${match[1].replace(/;\s*$/, '')})`); } catch (__) {
            return { name, type, error: '无法解析文件内容为 JSON 或 CommonJS' };
          }
        } else {
          return { name, type, error: '文件内容不是合法 JSON' };
        }
      }
      return {
        name,
        type,
        filePath: resolved,
        value: normalizeStateValue(readJsonPath(data, source.jsonPath)),
        raw: data
      };
    }
    return { name, type, error: `不支持的状态源类型：${type}` };
  } catch (error) {
    return { name, type, error: error.message };
  }
}

async function captureStateSnapshot(target, args = {}) {
  const sources = Array.isArray(args.sources) ? args.sources : [];
  const values = {};
  for (const source of sources) {
    const item = await collectStateSource(target, source);
    values[item.name] = item;
  }
  const snapshot = {
    snapshotId: args.snapshotId || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    label: args.label || 'state-snapshot',
    timestamp: new Date().toISOString(),
    url: target.url(),
    values
  };
  stateDiffSnapshots.set(snapshot.snapshotId, snapshot);
  if (stateDiffSnapshots.size > 30) {
    const firstKey = stateDiffSnapshots.keys().next().value;
    stateDiffSnapshots.delete(firstKey);
  }
  return snapshot;
}

function compareStateSnapshots(before, after, expectations = []) {
  const diffs = Object.keys(Object.assign({}, before?.values || {}, after?.values || {})).map(name => {
    const beforeItem = before?.values?.[name];
    const afterItem = after?.values?.[name];
    return {
      name,
      before: beforeItem?.value,
      after: afterItem?.value,
      changed: !sameValue(beforeItem?.value, afterItem?.value),
      beforeError: beforeItem?.error,
      afterError: afterItem?.error
    };
  });

  const checks = expectations.map(expectation => {
    const name = expectation.name;
    const op = expectation.operator || 'changed';
    const beforeValue = before?.values?.[name]?.value;
    const afterValue = after?.values?.[name]?.value;
    let passed = false;
    let actual = afterValue;
    if (op === 'exists') passed = afterValue !== undefined && afterValue !== null && afterValue !== '';
    else if (op === 'equals') passed = sameValue(afterValue, expectation.value !== undefined ? expectation.value : beforeValue);
    else if (op === 'notEquals') passed = !sameValue(afterValue, expectation.value !== undefined ? expectation.value : beforeValue);
    else if (op === 'changed') passed = !sameValue(beforeValue, afterValue);
    else if (op === 'unchanged') passed = sameValue(beforeValue, afterValue);
    else if (op === 'contains') passed = String(afterValue ?? '').includes(String(expectation.value ?? ''));
    else if (op === 'increased') passed = toComparableNumber(afterValue) > toComparableNumber(beforeValue);
    else if (op === 'decreased') passed = toComparableNumber(afterValue) < toComparableNumber(beforeValue);
    else if (op === 'delta') {
      const delta = toComparableNumber(afterValue) - toComparableNumber(beforeValue);
      actual = delta;
      const tolerance = Number(expectation.tolerance || 0);
      passed = Math.abs(delta - Number(expectation.by || 0)) <= tolerance;
    }
    return { name, operator: op, passed, expected: expectation.value ?? expectation.by, actual, before: beforeValue, after: afterValue };
  });

  return {
    passed: checks.every(check => check.passed) && diffs.every(diff => !diff.beforeError && !diff.afterError),
    checks,
    diffs,
    summary: {
      changed: diffs.filter(diff => diff.changed).length,
      unchanged: diffs.filter(diff => !diff.changed).length,
      failedChecks: checks.filter(check => !check.passed).length,
      sourceErrors: diffs.filter(diff => diff.beforeError || diff.afterError).length
    }
  };
}

async function runStateDiffAssert(target, args = {}) {
  const { captureStepEvidence, redact } = _deps || {};
  const action = args.action || 'capture';
  if (args.targetUrl) {
    await target.goto(args.targetUrl, { waitUntil: 'domcontentloaded', timeout: args.timeout || 30000 });
    try { await target.waitForLoadState('networkidle', { timeout: 8000 }); } catch (_) { /* optional, ignore errors */ }
  }

  if (action === 'capture') {
    const snapshot = await captureStateSnapshot(target, args);
    const evidence = args.evidence === false ? null : await captureStepEvidence(target, args.label || 'state-capture', { screenshot: args.screenshot, snapshot: args.snapshot });
    return redact({ action, passed: true, snapshot, evidence });
  }

  const before = args.before || stateDiffSnapshots.get(args.compareTo || args.beforeSnapshotId);
  if (!before) throw new Error('state_diff_assert compare 需要 before、compareTo 或 beforeSnapshotId');
  const after = args.after || await captureStateSnapshot(target, { ...args, label: args.afterLabel || `${args.label || 'state'}-after` });
  const comparison = compareStateSnapshots(before, after, Array.isArray(args.expectations) ? args.expectations : []);
  const evidence = args.evidence === false ? null : await captureStepEvidence(target, args.label || 'state-diff', { screenshot: args.screenshot, snapshot: args.snapshot });
  return redact({ action, passed: comparison.passed, beforeSnapshotId: before.snapshotId, afterSnapshotId: after.snapshotId, comparison, before, after, evidence });
}

// Module-level reference to deps for use in module-level functions
let _deps = null;

async function handle(name, args, deps) {
  _deps = deps;

  // === Destructure deps into local scope (replacing globalThis bridge) ===
  let { page, browser, browserSessionId, consoleLogs, networkLogs, pageErrors, currentCheckpoint, eventCheckpoint, lastAction, sessions, activeSessionName, sessionCounter, traceLogs, traceActive, currentTraceName, backendProbeResults, instrumentationEnabled, imageErrors, lastImageErrorCheckpoint, validationResults, lastQualityChecks, lastValidationRun, requestStartTimes, stateManager } = deps;
  const { MAX_SESSIONS, SCREENSHOT_DIR, HAR_DIR, VISUAL_DIR, VISUAL_BASELINE_DIR, VISUAL_ACTUAL_DIR, VISUAL_DIFF_DIR, VALIDATIONS_DIR, REPORT_DIR, LOG_FILE, PROJECT_ROOT, TOOLS_DIR, logger, ensurePage, text, log, resetRuntimeLogs, getPageLinks, postActionErrorCheck, probeKnownEndpoints, getUnifiedErrors, closeBrowserSession, listBrowserSessions, filterNetwork, filterNetworkDetails, getStorageSnapshot, buildDebugReport, captureStepEvidence, waitForCondition, assertPage, runFlow, installInstrumentation, getBrowserEvents, clearBrowserEvents, startTrace, stopTrace, getArtifacts, clearArtifacts, ensureArtifactsDir, getBackendProbeEndpoints, isCloudApiProbeTarget, screenshotWithRedaction, safeArtifactName, analyzeScreenshotForErrors, exportHar, runFullAudit, visualBaseline, visualCompare, visualReport, runA11yCheck, runPerformanceCheck, runLighthouseAudit, findElement, findPage, suggestLocator, validateLocator, mcpHealthCheck, projectAudit, mcpSelfTest, runValidationCheck, runValidationPlan, runValidationElement, runValidationFlow, buildValidationReport, exportValidationReport, runValidationQuickRun, runDeployVerify, investigateDebug, runBrowserFullRegression, traverseMenu, fetchBackendLogs, buildTraceChain, detectSilentFailures, redact, redactString, isSensitiveKey, trimTraceLogs, genSpanId, genTraceId, browserOperator, evidenceCollector, deepInteractor, errorAggregator, path, fs, execSync, callTool } = deps;
  try {
  // ====== validation_start ======
  if (name === 'validation_start') {
resetRuntimeLogs();
    const scenarios = Array.isArray(args.testScenarios) ? args.testScenarios : [];
    validationResults = scenarios.map((scenario, index) => ({ id: index + 1, scenario, status: 'pending' }));
    return text(`验证已启动，目标: ${args.targetUrl || '未指定'}，场景数: ${scenarios.length}，checkpoint: ${currentCheckpoint}`);
  }

  // ====== validation_check ======
  // v1.9.5 起合并 validation_quick_run（mode=quick）
  if (name === 'validation_check') {
    const mode = args.mode || 'basic';

    // check_type=deploy_verify 仍走原部署验证逻辑（与 mode 正交）
    if (args.check_type === 'deploy_verify') {
      return text(JSON.stringify(await runDeployVerify(args), null, 2));
    }

    // mode=quick：等价于已废弃的 validation_quick_run
    if (mode === 'quick') {
      const { target } = await ensurePage(args);
      if (!args.url) return mcpParamMissing('url', name);
      return text(JSON.stringify({
        mode: 'quick',
        ...(await runValidationQuickRun(target, args))
      }, null, 2));
    }

    // mode=basic（默认）：原有完整浏览器健康检查逻辑
    const { target } = await ensurePage(args);
    return text(JSON.stringify({
      mode: 'basic',
      ...(await runValidationCheck(target, args))
    }, null, 2));
  }

  // ====== validation_run ======
  if (name === 'validation_run') {
    const { target } = await ensurePage(args);
    return text(JSON.stringify(await runValidationPlan(target, args), null, 2));
  }

  // ====== browser_smoke_test ======
  if (name === 'browser_smoke_test') {
    const { target } = await ensurePage(args);
    const startTime = Date.now();
    
    if (args.url) {
      await target.goto(args.url, { waitUntil: 'networkidle', timeout: 30000 });
    }
    
    const results = {};
    const allPassed = [];
    
    results.pageLoad = await target.evaluate(() => {
      const performance = window.performance || { timing: {} };
      const timing = performance.timing || {};
      const loadTime = timing.loadEventEnd - timing.navigationStart;
      return {
        url: window.location.href,
        title: document.title,
        loadTime,
        loadTimeLabel: loadTime < 3000 ? 'fast' : loadTime < 8000 ? 'normal' : 'slow',
        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
        firstContentfulPaint: performance.getEntriesByType ? performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint')?.startTime || null : null
      };
    }).catch(e => ({ error: e.message }));
    allPassed.push(results.pageLoad.error ? false : results.pageLoad.loadTime < 15000);
    
    results.jsErrors = await target.evaluate(() => {
      const errors = window.__mcp_errors || [];
      return {
        count: errors.length,
        errors: errors.slice(0, 5).map(e => ({ message: e.message?.slice(0, 100), type: e.type }))
      };
    }).catch(e => ({ error: e.message, count: -1 }));
    allPassed.push(results.jsErrors.error ? false : results.jsErrors.count === 0);
    
    results.httpErrors = await target.evaluate(() => {
      const requests = window.__mcp_network || [];
      const errors = requests.filter(r => r.status >= 400);
      return {
        count: errors.length,
        errors: errors.slice(0, 5).map(r => ({ url: r.url?.slice(0, 80), status: r.status }))
      };
    }).catch(e => ({ error: e.message, count: -1 }));
    allPassed.push(results.httpErrors.error ? false : results.httpErrors.count === 0);
    
    results.elements = await target.evaluate(() => {
      const stats = {
        links: document.querySelectorAll('a').length,
        buttons: document.querySelectorAll('button').length,
        forms: document.querySelectorAll('form').length,
        inputs: document.querySelectorAll('input').length,
        images: document.querySelectorAll('img').length,
        scripts: document.querySelectorAll('script').length,
        stylesheets: document.querySelectorAll('link[rel="stylesheet"]').length
      };
      return stats;
    }).catch(e => ({ error: e.message }));
    
    results.accessibility = await target.evaluate(() => {
      const issues = [];
      const labels = document.querySelectorAll('label');
      labels.forEach(label => {
        if (!label.getAttribute('for')) issues.push('label missing "for" attribute');
      });
      const images = document.querySelectorAll('img');
      images.forEach(img => {
        if (!img.getAttribute('alt')) issues.push('image missing "alt" attribute');
      });
      return {
        checked: ['labels', 'images'],
        issuesFound: issues.length,
        issues: issues.slice(0, 10)
      };
    }).catch(e => ({ error: e.message }));
    allPassed.push(results.accessibility.error ? false : results.accessibility.issuesFound < 5);
    
    results.consoleWarnings = await target.evaluate(() => {
      const warnings = window.__mcp_warnings || [];
      return {
        count: warnings.length,
        warnings: warnings.slice(0, 5).map(w => w.message?.slice(0, 100))
      };
    }).catch(e => ({ error: e.message, count: -1 }));
    allPassed.push(results.consoleWarnings.error ? false : results.consoleWarnings.count < 10);
    
    results.overlay = await target.evaluate(() => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const viewportArea = viewportWidth * viewportHeight;
      const overlays = [];
      
      document.querySelectorAll('body *').forEach(el => {
        const style = window.getComputedStyle(el);
        if (!style || style.display === 'none' || style.visibility === 'hidden') return;
        
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return;
        
        const zIndex = parseInt(style.zIndex) || 0;
        const position = style.position;
        const opacity = parseFloat(style.opacity) || 1;
        
        const viewportOverlapWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
        const viewportOverlapHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
        const overlapArea = viewportOverlapWidth * viewportOverlapHeight;
        const coveragePercent = Math.round((overlapArea / viewportArea) * 100);
        
        let isOverlay = false;
        let overlayType = 'unknown';
        
        if (zIndex >= 1000) { isOverlay = true; overlayType = 'high-zindex'; }
        if (position === 'fixed' && coveragePercent >= 10) { isOverlay = true; overlayType = 'fixed-overlay'; }
        if (position === 'absolute' && zIndex > 0 && coveragePercent >= 20) { isOverlay = true; overlayType = 'absolute-overlay'; }
        if (opacity < 1 && opacity > 0.3 && coveragePercent >= 30) { isOverlay = true; overlayType = 'semi-transparent-mask'; }
        
        const className = typeof el.className === 'string' ? el.className : '';
        const classLower = className.toLowerCase();
        if (classLower.includes('cookie') || classLower.includes('banner') || 
            classLower.includes('consent') || classLower.includes('modal') ||
            classLower.includes('popup') || classLower.includes('dialog')) {
          isOverlay = true;
          overlayType = 'detected-by-class';
        }
        
        if ((el.tagName === 'DIV' || el.tagName === 'SPAN') && 
            rect.width >= viewportWidth * 0.8 && 
            rect.height >= viewportHeight * 0.5) {
          isOverlay = true;
          overlayType = 'fullscreen-overlay';
        }
        
        if (isOverlay) {
          overlays.push({
            tagName: el.tagName.toLowerCase(),
            className: className.slice(0, 100),
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
            zIndex,
            position,
            opacity: Math.round(opacity * 100) / 100,
            coveragePercent,
            overlayType,
            text: el.innerText.slice(0, 100).trim()
          });
        }
      });
      
      overlays.sort((a, b) => b.coveragePercent - a.coveragePercent);
      const totalCoverage = overlays.reduce((sum, o) => sum + o.coveragePercent, 0);
      const hasBlockingOverlay = overlays.some(o => o.coveragePercent >= 50 || o.overlayType === 'fullscreen-overlay');
      
      return {
        count: overlays.length,
        hasBlockingOverlay,
        totalCoveragePercent: Math.min(totalCoverage, 100),
        overlays: overlays.slice(0, 5)
      };
    }).catch(e => ({ error: e.message, count: 0, hasBlockingOverlay: false }));
    allPassed.push(results.overlay.error ? false : !results.overlay.hasBlockingOverlay);
    
    const totalTime = Date.now() - startTime;
    const passed = allPassed.every(Boolean);
    
    const resultData = {
      status: passed ? 'success' : 'warning',
      passed,
      totalTime,
      summary: {
        pageLoad: results.pageLoad.loadTimeLabel || 'unknown',
        jsErrors: results.jsErrors.count || 0,
        httpErrors: results.httpErrors.count || 0,
        accessibilityIssues: results.accessibility.issuesFound || 0,
        consoleWarnings: results.consoleWarnings.count || 0,
        overlayCount: results.overlay.count || 0,
        hasBlockingOverlay: results.overlay.hasBlockingOverlay || false,
        elementCount: results.elements.links + results.elements.buttons + results.elements.forms
      },
      details: results,
      nextSteps: passed ? [
        '调用 browser_screenshot 截图留存证据',
        '调用 browser_a11y_check 深入检查无障碍',
        '调用 validation_run 运行完整验证流程',
        '调用 evidence_pack 打包所有证据'
      ] : [
        '调用 browser_counterfactual_analyze 进行反事实根因分析',
        '调用 browser_errors 查看详细 JS 错误',
        '调用 browser_network 查看网络请求详情',
        '调用 browser_diagnose 分析页面问题'
      ],
      suggestions: [
        { type: passed ? 'next' : 'fix', tool: 'browser_screenshot', reason: passed ? '留存基准证据' : '查看页面实际状态' },
        { type: passed ? 'next' : 'fix', tool: 'browser_errors', reason: passed ? '检查是否有潜在错误' : '查看详细错误信息' },
        { type: results.overlay?.hasBlockingOverlay ? 'fix' : 'next', tool: 'browser_overlay_dismiss', reason: results.overlay?.hasBlockingOverlay ? '关闭遮挡物' : '继续验证流程' },
        { type: 'next', tool: 'validation_run', reason: '运行完整的验证流程' }
      ],
      paidUpgradeHint: '需要更深入的性能分析、自动化回归测试、团队协作？升级到 Pro/Team 版本获取完整验证能力。'
    };
    
    let response = `🚀 冒烟测试完成（${totalTime}ms）\n\n`;
    response += `📊 结果：${passed ? '✅ 全部通过' : '⚠️ 部分警告'}\n\n`;
    response += `📋 检查项汇总：\n`;
    response += `   🖥️ 页面加载：${results.pageLoad.loadTime}ms（${results.pageLoad.loadTimeLabel}）${allPassed[0] ? '✅' : '❌'}\n`;
    response += `   📜 JS 错误：${results.jsErrors.count || 0} 个 ${allPassed[1] ? '✅' : '❌'}\n`;
    response += `   🌐 HTTP 错误：${results.httpErrors.count || 0} 个 ${allPassed[2] ? '✅' : '❌'}\n`;
    response += `   ♿ 无障碍问题：${results.accessibility.issuesFound || 0} 个 ${allPassed[3] ? '✅' : '⚠️'}\n`;
    response += `   ⚠️ 控制台警告：${results.consoleWarnings.count || 0} 个 ${allPassed[4] ? '✅' : '⚠️'}\n`;
    response += `   🔲 遮挡物检测：${results.overlay?.count || 0} 个（${results.overlay?.hasBlockingOverlay ? '❌ 有遮挡' : '✅ 无遮挡'}）${allPassed[5] ? '✅' : '❌'}\n\n`;
    
    response += `📄 页面信息：\n`;
    response += `   标题：${results.pageLoad.title || 'N/A'}\n`;
    response += `   URL：${results.pageLoad.url || 'N/A'}\n`;
    response += `   链接：${results.elements.links || 0} | 按钮：${results.elements.buttons || 0} | 表单：${results.elements.forms || 0}\n\n`;
    
    if (!passed) {
      if (results.jsErrors.count > 0) {
        response += `🔍 JS 错误详情：\n`;
        results.jsErrors.errors.forEach((e, i) => {
          response += `   ${i + 1}. ${e.message}\n`;
        });
      }
      if (results.overlay?.hasBlockingOverlay) {
        response += `\n⚠️ 遮挡物详情：\n`;
        results.overlay.overlays.forEach((o, i) => {
          response += `   ${i + 1}. [${o.overlayType}] ${o.tagName}.${o.className.split(' ')[0]} | 覆盖率: ${o.coveragePercent}%\n`;
        });
      }
    }
    
    response += `🚀 下一步建议：\n`;
    if (results.overlay?.hasBlockingOverlay) {
      response += `   1. browser_overlay_dismiss → 自动关闭遮挡物\n`;
      response += `   2. browser_click → 手动点击关闭按钮\n`;
      response += `   3. browser_screenshot → 查看页面状态\n`;
    } else if (passed) {
      response += `   1. browser_screenshot → 截图留存证据\n`;
      response += `   2. browser_a11y_check → 深入无障碍检查\n`;
      response += `   3. validation_run → 完整验证流程\n`;
    } else {
      response += `   1. browser_counterfactual_analyze → 反事实根因分析\n`;
      response += `   2. browser_errors → 查看详细错误\n`;
      response += `   3. browser_diagnose → 分析问题根因\n`;
    }
    
    if (args.format === 'html') {
      const { buildSmokeTestHtml } = require('../core/report-html');
      return text(buildSmokeTestHtml({
        items: results.smokeItems || allPassed.map((passed, i) => ({
          name: ['页面加载', 'JS 错误', 'HTTP 错误', '无障碍检查', '控制台警告', '遮挡物检测'][i],
          check: ['页面加载', 'JS 错误', 'HTTP 错误', '无障碍检查', '控制台警告', '遮挡物检测'][i],
          passed
        })),
        passed,
        url: target.url(),
        timestamp: new Date().toISOString()
      }));
    }
    return text(JSON.stringify(resultData, null, 2));
  }

  // ====== browser_counterfactual_analyze ======
  // 反事实根因分析：分析"如果消除因素 X，测试是否还会失败"
  if (name === 'browser_counterfactual_analyze') {
    const { target } = await ensurePage(args);
    const failureContext = args.failureContext || null;
    
    const pageState = await target.evaluate(() => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const viewportArea = viewportWidth * viewportHeight;
      
      const jsErrors = (window.__mcp_errors || []).slice(0, 10);
      const httpErrors = (window.__mcp_network || []).filter(r => r.status >= 400).slice(0, 10);
      const consoleWarnings = (window.__mcp_warnings || []).slice(0, 10);
      
      const overlays = [];
      document.querySelectorAll('body *').forEach(el => {
        const style = window.getComputedStyle(el);
        if (!style || style.display === 'none' || style.visibility === 'hidden') return;
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return;
        
        const zIndex = parseInt(style.zIndex) || 0;
        const position = style.position;
        const opacity = parseFloat(style.opacity) || 1;
        const className = typeof el.className === 'string' ? el.className : '';
        const classLower = className.toLowerCase();
        
        const overlapW = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
        const overlapH = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
        const coverage = Math.round((overlapW * overlapH / viewportArea) * 100);
        
        let isOverlay = false;
        let type = 'unknown';
        if (zIndex >= 1000) { isOverlay = true; type = 'high-zindex'; }
        if (position === 'fixed' && coverage >= 10) { isOverlay = true; type = 'fixed-overlay'; }
        if (position === 'absolute' && zIndex > 0 && coverage >= 20) { isOverlay = true; type = 'absolute-overlay'; }
        if (opacity < 1 && opacity > 0.3 && coverage >= 30) { isOverlay = true; type = 'semi-transparent-mask'; }
        if (classLower.includes('cookie') || classLower.includes('banner') || classLower.includes('modal') ||
            classLower.includes('popup') || classLower.includes('dialog') || classLower.includes('overlay')) {
          isOverlay = true; type = 'detected-by-class';
        }
        if ((el.tagName === 'DIV' || el.tagName === 'SPAN') && 
            rect.width >= viewportWidth * 0.8 && rect.height >= viewportHeight * 0.5) {
          isOverlay = true; type = 'fullscreen-overlay';
        }
        
        if (isOverlay) {
          overlays.push({ type, coverage, tagName: el.tagName.toLowerCase(), className: className.slice(0, 50) });
        }
      });
      
      const loadingState = document.readyState;
      const perf = window.performance?.timing || {};
      const loadTime = perf.loadEventEnd && perf.navigationStart ? perf.loadEventEnd - perf.navigationStart : 0;
      
      const interactiveElements = document.querySelectorAll('button, a, input, select, textarea').length;
      const visibleButtons = document.querySelectorAll('button:not([disabled]):not([style*="display: none"])').length;
      
      return {
        url: window.location.href,
        title: document.title,
        loadingState,
        loadTime,
        jsErrors,
        httpErrors,
        consoleWarnings,
        overlays: overlays.sort((a, b) => b.coverage - a.coverage).slice(0, 5),
        hasBlockingOverlay: overlays.some(o => o.coverage >= 50 || o.type === 'fullscreen-overlay'),
        interactiveElements,
        visibleButtons,
        viewport: { width: viewportWidth, height: viewportHeight }
      };
    }).catch(e => ({ error: e.message }));
    
    if (pageState.error) {
      return mcpError(`页面状态收集失败: ${pageState.error}`, { error: 'PAGE_EVALUATE_FAILED', toolName: 'browser_counterfactual_analyze' });
    }
    
    const hypotheses = [];
    
    // 假设1：遮挡物导致测试失败
    if (pageState.hasBlockingOverlay) {
      const maxCoverage = Math.max(...pageState.overlays.map(o => o.coverage));
      const confidence = Math.min(0.9, 0.4 + maxCoverage / 200);
      hypotheses.push({
        id: 'overlay-blocking',
        factor: '页面遮挡物',
        description: `检测到 ${pageState.overlays.length} 个遮挡元素，最大覆盖率 ${maxCoverage}%`,
        counterfactual: '如果调用 browser_overlay_dismiss 关闭遮挡物，被遮挡的元素将变得可交互',
        wouldStillFail: maxCoverage < 80 ? 'maybe' : 'unlikely',
        confidence,
        evidence: pageState.overlays.map(o => ({ type: o.type, coverage: o.coverage, element: `${o.tagName}.${o.className.split(' ')[0]}` })),
        verifyTool: 'browser_overlay_dismiss',
        verifyAction: '调用 browser_overlay_dismiss 后重新运行测试',
        impact: 'high'
      });
    }
    
    // 假设2：JS 错误导致测试失败
    if (pageState.jsErrors.length > 0) {
      const errorCount = pageState.jsErrors.length;
      const confidence = Math.min(0.85, 0.3 + errorCount * 0.15);
      hypotheses.push({
        id: 'js-errors',
        factor: 'JavaScript 错误',
        description: `检测到 ${errorCount} 个 JS 错误，可能导致页面功能异常`,
        counterfactual: '如果修复这些 JS 错误，页面功能可能恢复正常',
        wouldStillFail: errorCount > 5 ? 'unlikely' : 'maybe',
        confidence,
        evidence: pageState.jsErrors.map(e => ({ message: (e.message || '').slice(0, 80), type: e.type })),
        verifyTool: 'browser_errors',
        verifyAction: '调用 browser_errors 查看详细错误堆栈',
        impact: errorCount > 3 ? 'high' : 'medium'
      });
    }
    
    // 假设3：HTTP 错误导致测试失败
    if (pageState.httpErrors.length > 0) {
      const errorCount = pageState.httpErrors.length;
      const has5xx = pageState.httpErrors.some(e => e.status >= 500);
      const confidence = Math.min(0.8, 0.3 + errorCount * 0.1);
      hypotheses.push({
        id: 'http-errors',
        factor: 'HTTP 请求错误',
        description: `检测到 ${errorCount} 个 HTTP 错误请求${has5xx ? '（包含服务器错误）' : ''}`,
        counterfactual: '如果这些请求成功，依赖的后端数据/功能将正常可用',
        wouldStillFail: has5xx ? 'unlikely' : 'maybe',
        confidence,
        evidence: pageState.httpErrors.map(e => ({ url: (e.url || '').slice(0, 80), status: e.status })),
        verifyTool: 'browser_network',
        verifyAction: '调用 browser_network 查看网络请求详情',
        impact: has5xx ? 'high' : 'medium'
      });
    }
    
    // 假设4：页面未完全加载
    if (pageState.loadingState !== 'complete' || pageState.loadTime > 8000) {
      const confidence = pageState.loadingState !== 'complete' ? 0.75 : 0.5;
      hypotheses.push({
        id: 'page-not-loaded',
        factor: '页面加载不完整',
        description: `页面状态: ${pageState.loadingState}，加载时间: ${pageState.loadTime}ms`,
        counterfactual: '如果等待页面完全加载（networkidle），元素可能变得可交互',
        wouldStillFail: 'maybe',
        confidence,
        evidence: [{ loadingState: pageState.loadingState, loadTime: pageState.loadTime }],
        verifyTool: 'browser_wait',
        verifyAction: '调用 browser_wait 等待 networkidle 后重新测试',
        impact: 'medium'
      });
    }
    
    // 假设5：元素未渲染（无交互元素）
    if (pageState.interactiveElements === 0) {
      hypotheses.push({
        id: 'no-interactive-elements',
        factor: '页面无交互元素',
        description: '页面未检测到任何按钮、链接、输入框等交互元素',
        counterfactual: '如果页面是 SPA，可能需要等待动态渲染或导航到正确路由',
        wouldStillFail: 'likely',
        confidence: 0.7,
        evidence: [{ interactiveElements: 0 }],
        verifyTool: 'browser_wait',
        verifyAction: '调用 browser_wait 等待动态渲染，或检查 URL 是否正确',
        impact: 'high'
      });
    }
    
    // 假设6：控制台警告过多（潜在问题）
    if (pageState.consoleWarnings.length >= 10) {
      hypotheses.push({
        id: 'excessive-warnings',
        factor: '控制台警告过多',
        description: `检测到 ${pageState.consoleWarnings.length} 个控制台警告，可能是潜在问题的信号`,
        counterfactual: '警告本身不直接导致测试失败，但可能暗示有废弃 API 或即将失败的功能',
        wouldStillFail: 'likely',
        confidence: 0.4,
        evidence: pageState.consoleWarnings.slice(0, 3).map(w => ({ message: (w.message || '').slice(0, 80) })),
        verifyTool: 'browser_console',
        verifyAction: '调用 browser_console 查看完整控制台输出',
        impact: 'low'
      });
    }
    
    // 如果用户提供了失败上下文，匹配相关假设
    if (failureContext) {
      const ctx = failureContext.toLowerCase();
      hypotheses.forEach(h => {
        if (h.id === 'overlay-blocking' && (ctx.includes('遮挡') || ctx.includes('overlay') || ctx.includes('block') || ctx.includes('不可见') || ctx.includes('not visible'))) {
          h.confidence = Math.min(0.95, h.confidence + 0.2);
          h.contextMatch = true;
        }
        if (h.id === 'js-errors' && (ctx.includes('js') || ctx.includes('javascript') || ctx.includes('脚本') || ctx.includes('error'))) {
          h.confidence = Math.min(0.95, h.confidence + 0.2);
          h.contextMatch = true;
        }
        if (h.id === 'http-errors' && (ctx.includes('http') || ctx.includes('网络') || ctx.includes('network') || ctx.includes('请求'))) {
          h.confidence = Math.min(0.95, h.confidence + 0.2);
          h.contextMatch = true;
        }
        if (h.id === 'page-not-loaded' && (ctx.includes('加载') || ctx.includes('load') || ctx.includes('timeout') || ctx.includes('超时'))) {
          h.confidence = Math.min(0.95, h.confidence + 0.2);
          h.contextMatch = true;
        }
      });
    }
    
    // 按置信度排序
    hypotheses.sort((a, b) => b.confidence - a.confidence);
    
    const topHypothesis = hypotheses[0];
    const hasHighConfidenceRootCause = topHypothesis && topHypothesis.confidence >= 0.7;
    
    const resultData = {
      status: hypotheses.length > 0 ? 'success' : 'warning',
      failureContext: failureContext || '未提供失败上下文（基于页面状态自动推断）',
      pageState: {
        url: pageState.url,
        title: pageState.title,
        loadingState: pageState.loadingState,
        loadTime: pageState.loadTime,
        jsErrorCount: pageState.jsErrors.length,
        httpErrorCount: pageState.httpErrors.length,
        overlayCount: pageState.overlays.length,
        hasBlockingOverlay: pageState.hasBlockingOverlay,
        interactiveElements: pageState.interactiveElements
      },
      hypotheses: hypotheses.map(h => ({
        factor: h.factor,
        description: h.description,
        counterfactual: h.counterfactual,
        wouldStillFail: h.wouldStillFail,
        confidence: Math.round(h.confidence * 100) / 100,
        contextMatch: h.contextMatch || false,
        impact: h.impact,
        evidence: h.evidence,
        verifyTool: h.verifyTool,
        verifyAction: h.verifyAction
      })),
      rootCause: topHypothesis ? {
        factor: topHypothesis.factor,
        confidence: Math.round(topHypothesis.confidence * 100) / 100,
        verifyTool: topHypothesis.verifyTool,
        verifyAction: topHypothesis.verifyAction
      } : null,
      hasHighConfidenceRootCause,
      nextSteps: hasHighConfidenceRootCause ? [
        `调用 ${topHypothesis.verifyTool} 验证根因假设`,
        `根据验证结果修复问题`,
        '修复后重新运行失败的测试',
        '调用 evidence_pack 打包问题定位证据'
      ] : hypotheses.length > 0 ? [
        '调用 browser_diagnose 进行深度诊断',
        '调用 browser_screenshot 查看页面实际状态',
        '调用 browser_errors 查看所有错误',
        '调用 evidence_pack 打包诊断证据'
      ] : [
        '页面状态正常，失败可能是测试本身的问题',
        '检查测试断言是否正确',
        '调用 browser_assert 验证预期元素',
        '调用 evidence_pack 打包证据'
      ],
      suggestions: hypotheses.slice(0, 3).map(h => ({
        type: 'verify',
        tool: h.verifyTool,
        reason: `验证根因假设: ${h.factor}（置信度 ${Math.round(h.confidence * 100)}%）`
      })),
      paidUpgradeHint: '需要 AI 深度根因分析、自动修复建议、历史趋势对比？升级到 Pro 版本获取完整反事实推理引擎能力。'
    };
    
    let response = `🔍 反事实根因分析\n\n`;
    response += `📊 页面状态：${pageState.url}\n`;
    response += `   加载: ${pageState.loadingState} (${pageState.loadTime}ms) | JS错误: ${pageState.jsErrors.length} | HTTP错误: ${pageState.httpErrors.length} | 遮挡物: ${pageState.overlays.length}\n\n`;
    
    if (hypotheses.length === 0) {
      response += `✅ 未检测到明显根因\n`;
      response += `   页面状态正常，失败可能是测试本身的问题\n\n`;
    } else {
      response += `🧠 根因假设（按置信度排序）：\n\n`;
      hypotheses.forEach((h, i) => {
        const confidenceEmoji = h.confidence >= 0.7 ? '🔴' : h.confidence >= 0.5 ? '🟡' : '🟢';
        response += `${i + 1}. ${confidenceEmoji} ${h.factor}（置信度 ${Math.round(h.confidence * 100)}%）${h.contextMatch ? ' ⭐匹配失败上下文' : ''}\n`;
        response += `   ${h.description}\n`;
        response += `   反事实: ${h.counterfactual}\n`;
        response += `   若消除该因素，测试${h.wouldStillFail === 'unlikely' ? '✅ 大概率通过' : h.wouldStillFail === 'maybe' ? '⚠️ 可能通过' : '❌ 仍可能失败'}\n`;
        response += `   验证: 调用 ${h.verifyTool} → ${h.verifyAction}\n\n`;
      });
      
      if (topHypothesis) {
        response += `🎯 最可能根因：${topHypothesis.factor}\n`;
        response += `   置信度: ${Math.round(topHypothesis.confidence * 100)}%\n`;
        response += `   建议先调用 ${topHypothesis.verifyTool} 验证\n\n`;
      }
    }
    
    response += `🚀 下一步建议：\n`;
    if (hasHighConfidenceRootCause) {
      response += `   1. ${topHypothesis.verifyTool} → 验证根因假设\n`;
      response += `   2. 根据验证结果修复问题\n`;
      response += `   3. 重新运行失败的测试\n`;
    } else if (hypotheses.length > 0) {
      response += `   1. browser_diagnose → 深度诊断\n`;
      response += `   2. browser_screenshot → 查看页面状态\n`;
      response += `   3. browser_errors → 查看所有错误\n`;
    } else {
      response += `   1. 检查测试断言是否正确\n`;
      response += `   2. browser_assert → 验证预期元素\n`;
      response += `   3. evidence_pack → 打包证据\n`;
    }
    
    if (args.format === 'html' && args.format !== 'json') {
      const { buildCounterfactualHtml } = require('../core/report-html');
      return text(buildCounterfactualHtml({
        hypotheses: resultData.hypotheses,
        pageState: resultData.pageState,
        failureContext: resultData.failureContext,
        url: resultData.pageState?.url || pageState.url,
        timestamp: new Date().toISOString()
      }));
    }
    return text(JSON.stringify(resultData, null, 2));
  }

  // ====== validation_suite_run ======
  if (name === 'validation_suite_run') {
  return text('该工具为付费版本功能，请升级到团队版或企业版以使用批量套件运行能力。\n\n了解更多: https://validpilot.com/pricing');
  }

  // ====== validation_element ======
  if (name === 'validation_element') {
const { target } = await ensurePage(args);
    if (!args.selector) return mcpParamMissing('selector', name);
    return text(JSON.stringify(await runValidationElement(target, args), null, 2));
  }

  // ====== validation_flow ======
  // v1.9.5 起合并 validation_chain（mode=chain）
  if (name === 'validation_flow') {
const { target } = await ensurePage(args);
    const mode = args.mode || 'flow';
    if (mode === 'chain') {
      // chain 模式：等价于已废弃的 validation_chain（失败即停止）
      const chainArgs = { ...args };
      if (args.stopOnError !== false) {
        chainArgs.continueOnFailure = false;
      }
      const result = await runValidationChain(target, chainArgs);
      const results = result.results || [];
      const failedStepIndex = results.findIndex((r) => r.ok === false);
      return text(JSON.stringify({
        success: result.passed !== false,
        mode: 'chain',
        totalActions: results.length,
        completedActions: results.filter((r) => r.ok !== false).length,
        failedActionIndex: failedStepIndex >= 0 ? failedStepIndex : null,
        actionResults: results,
        errorMessage: failedStepIndex >= 0 ? `第 ${failedStepIndex + 1} 步验证失败` : null,
        errors: result.errors
      }, null, 2));
    }
    return text(JSON.stringify(await runValidationFlow(target, args), null, 2));
  }

  // ====== validation_chain ======
  if (name === 'validation_chain') {
const { target } = await ensurePage(args);
    return text(JSON.stringify(await runValidationChain(target, args), null, 2));
  }

  // ====== validation_compliance ======
  if (name === 'validation_compliance') {
    return text(JSON.stringify(runValidationCompliance(args), null, 2));
  }

  // ====== validation_data_integrity ======
  if (name === 'validation_data_integrity') {
    const { target } = await ensurePage(args);
    const { action, entity, createPayload, updatePayload, identifierField = 'id', entityId, apiBaseUrl } = args;

    if (!action || !entity) {
      return mcpParamMissing('action 和 entity', name);
    }

    let result = { ok: true, action, entity, checks: [], passed: 0, failed: 0 };

    try {
      const baseUrl = apiBaseUrl || await target.evaluate(() => window.location.origin);
      const apiPath = `/api/${entity}`;

      if (action === 'check_create_read') {
        if (!createPayload) {
          return mcpParamMissing('createPayload', name);
        }
        const createRes = await target.evaluate(async ({ apiPath, payload, identifierField }) => {
          const res = await fetch(apiPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          return { ok: res.ok, status: res.status, data, id: data?.[identifierField] || data?.data?.[identifierField] };
        }, { apiPath, payload: createPayload, identifierField });

        result.checks.push({
          step: 'create',
          ok: createRes.ok,
          status: createRes.status,
          id: createRes.id,
        });
        if (createRes.ok) result.passed++; else result.failed++;

        if (createRes.id) {
          const readRes = await target.evaluate(async ({ apiPath, id }) => {
            const res = await fetch(`${apiPath}/${id}`);
            return { ok: res.ok, status: res.status, data: await res.json() };
          }, { apiPath, id: createRes.id });

          result.checks.push({ step: 'read', ok: readRes.ok, status: readRes.status });
          if (readRes.ok) result.passed++; else result.failed++;

          const readData = readRes.data?.data || readRes.data;
          const mismatched = [];
          for (const [key, val] of Object.entries(createPayload)) {
            if (readData && readData[key] !== undefined && readData[key] !== val) {
              mismatched.push({ field: key, created: val, read: readData[key] });
            }
          }
          result.dataConsistency = mismatched.length === 0;
          result.mismatchedFields = mismatched;
          if (mismatched.length === 0) result.passed++; else result.failed++;
        }
      }

      if (action === 'check_update_read') {
        if (!updatePayload || !entityId) {
          return mcpParamMissing('updatePayload 和 entityId', name);
        }
        const updateRes = await target.evaluate(async ({ apiPath, id, payload }) => {
          const res = await fetch(`${apiPath}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          return { ok: res.ok, status: res.status, data: await res.json() };
        }, { apiPath, id: entityId, payload: updatePayload });

        result.checks.push({ step: 'update', ok: updateRes.ok, status: updateRes.status });
        if (updateRes.ok) result.passed++; else result.failed++;

        const readRes = await target.evaluate(async ({ apiPath, id }) => {
          const res = await fetch(`${apiPath}/${id}`);
          return { ok: res.ok, status: res.status, data: await res.json() };
        }, { apiPath, id: entityId });

        result.checks.push({ step: 'read_after_update', ok: readRes.ok, status: readRes.status });
        if (readRes.ok) result.passed++; else result.failed++;
      }

      if (action === 'check_delete_read') {
        if (!entityId) {
          return mcpParamMissing('entityId', name);
        }
        const deleteRes = await target.evaluate(async ({ apiPath, id }) => {
          const res = await fetch(`${apiPath}/${id}`, { method: 'DELETE' });
          return { ok: res.ok, status: res.status };
        }, { apiPath, id: entityId });

        result.checks.push({ step: 'delete', ok: deleteRes.ok, status: deleteRes.status });
        if (deleteRes.ok) result.passed++; else result.failed++;

        const readRes = await target.evaluate(async ({ apiPath, id }) => {
          const res = await fetch(`${apiPath}/${id}`);
          return { ok: res.ok, status: res.status };
        }, { apiPath, id: entityId });

        const properlyDeleted = readRes.status === 404 || readRes.status === 200;
        result.checks.push({ step: 'verify_deletion', ok: properlyDeleted, status: readRes.status });
        if (properlyDeleted) result.passed++; else result.failed++;
      }
    } catch (err) {
      result.ok = false;
      result.error = err.message;
    }

    result.status = result.failed === 0 ? 'success' : 'failed';
    result.nextSteps = [
      result.failed > 0 ? '检查 API 接口实现是否正确' : '继续验证其他实体',
      '使用 validation_flow 进行完整流程验证',
    ];
    result.suggestions = [
      { type: 'next', tool: 'validation_flow', reason: '进行完整流程验证' },
    ];

    return text(JSON.stringify(result, null, 2));
  }

  // ====== validation_permission ======
  if (name === 'validation_permission') {
    const { target } = await ensurePage(args);
    const { action, entity, entityId, otherEntityId, adminApiPaths, roleSelector, targetRole, expectedMenuItems, unexpectedMenuItems } = args;

    if (!action) {
      return mcpParamMissing('action', name);
    }

    let result = { ok: true, action, checks: [], passed: 0, failed: 0, vulnerabilities: [] };

    try {
      if (action === 'horizontal_privilege') {
        if (!entity || !otherEntityId) {
          return mcpParamMissing('entity 和 otherEntityId', name);
        }
        const apiPath = `/api/${entity}/${otherEntityId}`;
        const res = await target.evaluate(async (apiPath) => {
          const r = await fetch(apiPath);
          return { ok: r.ok, status: r.status };
        }, apiPath);

        const isVulnerable = res.ok && res.status < 400;
        result.checks.push({
          test: 'horizontal_privilege',
          apiPath,
          status: res.status,
          vulnerable: isVulnerable,
        });
        if (isVulnerable) {
          result.vulnerabilities.push({ type: 'horizontal_privilege', severity: 'blocking', description: `可越权访问其他用户的 ${entity} 数据 (ID: ${otherEntityId})` });
          result.failed++;
        } else {
          result.passed++;
        }
      }

      if (action === 'vertical_privilege') {
        if (!adminApiPaths || !Array.isArray(adminApiPaths)) {
          return mcpParamMissing('adminApiPaths', name);
        }
        for (const apiPath of adminApiPaths) {
          const res = await target.evaluate(async (apiPath) => {
            const r = await fetch(apiPath);
            return { ok: r.ok, status: r.status };
          }, apiPath);

          const isVulnerable = res.ok && res.status < 400;
          result.checks.push({ test: 'vertical_privilege', apiPath, status: res.status, vulnerable: isVulnerable });
          if (isVulnerable) {
            result.vulnerabilities.push({ type: 'vertical_privilege', severity: 'blocking', description: `普通用户可访问管理端 API: ${apiPath}` });
            result.failed++;
          } else {
            result.passed++;
          }
        }
      }

      if (action === 'role_menu') {
        if (!targetRole) {
          return mcpParamMissing('targetRole', name);
        }
        if (roleSelector) {
          await target.click(roleSelector);
          await target.waitForTimeout(500);
        }

        const pageText = await target.evaluate(() => document.body.innerText);

        if (expectedMenuItems && expectedMenuItems.length > 0) {
          const missing = expectedMenuItems.filter(item => !pageText.includes(item));
          result.checks.push({ test: 'expected_menus', items: expectedMenuItems, missing });
          if (missing.length === 0) result.passed++; else result.failed++;
        }

        if (unexpectedMenuItems && unexpectedMenuItems.length > 0) {
          const found = unexpectedMenuItems.filter(item => pageText.includes(item));
          result.checks.push({ test: 'unexpected_menus', items: unexpectedMenuItems, found });
          if (found.length === 0) result.passed++;
          else {
            result.vulnerabilities.push({ type: 'role_menu_leak', severity: 'major', description: `角色 ${targetRole} 看到了不应看到的菜单项: ${found.join(', ')}` });
            result.failed++;
          }
        }
      }
    } catch (err) {
      result.ok = false;
      result.error = err.message;
    }

    result.status = result.failed === 0 ? 'success' : 'failed';
    result.nextSteps = [
      result.vulnerabilities.length > 0 ? '修复越权漏洞后重新验证' : '权限验证通过',
      '使用 validation_flow 进行完整业务流程验证',
    ];
    result.suggestions = [
      { type: 'next', tool: 'validation_flow', reason: '进行完整业务流程验证' },
    ];

    return text(JSON.stringify(result, null, 2));
  }

  // ====== state_diff_assert ======
  if (name === 'state_diff_assert') {
    const { target } = await ensurePage(args);
    return text(JSON.stringify(await runStateDiffAssert(target, args), null, 2));
  }

  // ====== chain_spec ======
  // v1.9.5 起合并 chain_list_templates / chain_spec_run / chain_score_report
  if (name === 'chain_spec') {
    const mode = args.mode || 'list';
    if (mode === 'list') return handle('chain_list_templates', args, deps);
    if (mode === 'run') return handle('chain_spec_run', args, deps);
    if (mode === 'score') return handle('chain_score_report', args, deps);
    return mcpParamMissing('mode', name, '可选 list / run / score');
  }

  // ====== chain_spec_run ======
  if (name === 'chain_spec_run') {
    const { target } = await ensurePage(args);
    return text(JSON.stringify(await runChainSpecRun(target, args), null, 2));
  }

  // ====== trace_correlation_check ======
  if (name === 'trace_correlation_check') {
    return text(JSON.stringify(await runTraceCorrelationCheck(args), null, 2));
  }

  // ====== chain_list_templates ======
  if (name === 'chain_list_templates') {
    return text(JSON.stringify({
      tool: 'chain_list_templates',
      templates: Object.entries(BUILTIN_TEMPLATES).map(([key, tpl]) => ({
        name: key,
        description: tpl.description,
        stepCount: (tpl.steps || []).length,
        hasStateSources: Array.isArray(tpl.stateSources) && tpl.stateSources.length > 0,
        targetUrl: tpl.targetUrl || null
      }))
    }, null, 2));
  }

  // ====== chain_score_report ======
  if (name === 'chain_score_report') {
    return text(JSON.stringify(runChainScoreReport(args), null, 2));
  }

  // ====== contract ======
  // v1.9.5 起合并 contract_baseline/contract_guard
  if (name === 'contract') {
    const mode = args.mode || 'guard';
    if (mode === 'baseline') {
      return handle('contract_baseline', args, deps);
    }
    if (mode === 'guard') {
      return handle('contract_guard', args, deps);
    }
    return mcpParamMissing('mode', name);
  }

  // ====== contract_guard ======
  if (name === 'contract_guard') {
    return text(JSON.stringify(await runContractGuard(args), null, 2));
  }

  // ====== contract_baseline ======
  if (name === 'contract_baseline') {
    return text(JSON.stringify(runContractBaseline(args), null, 2));
  }

  // ====== validation_report ======
  // v1.9.5 起合并 validation_report_export（mode=export）
  if (name === 'validation_report') {
    const mode = args.mode || 'view';

    // mode=export：等价于已废弃的 validation_report_export
    if (mode === 'export') {
      return text(JSON.stringify({
        mode: 'export',
        ...exportValidationReport(args)
      }, null, 2));
    }

    // mode=view（默认）：原有 Markdown/JSON 报告生成逻辑
    const report = buildValidationReport(args);
    const output = typeof report === 'string'
      ? report
      : JSON.stringify({ mode: 'view', ...report }, null, 2);
    return text(output);
  }

  // ====== validation_report_export ======
  if (name === 'validation_report_export') {
  return text(JSON.stringify(exportValidationReport(args), null, 2));
  }

  // ====== validation_quick_run ======
  if (name === 'validation_quick_run') {
const { target } = await ensurePage(args);
    if (!args.url) return mcpParamMissing('url', name);
    return text(JSON.stringify(await runValidationQuickRun(target, args), null, 2));
  }

  // ====== validation_matrix ======
  if (name === 'validation_matrix') {
    const { target } = await ensurePage(args);
    if (!args.url) return mcpParamMissing('url', name);
    const url = args.url;
    const dimensions = args.dimensions || ['functional', 'visual', 'performance', 'a11y'];
    const performanceThreshold = args.performanceThreshold || 2500;
    const a11yStandard = args.a11yStandard || 'wcag-aa';
    const outputFormat = args.outputFormat || 'json';

    // Navigate to target URL
    await target.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));

    const timestamp = new Date().toISOString();
    const results = {
      success: true,
      name: args.name || 'Multi-dimensional Validation Matrix',
      url: target.url(),
      dimensions: {},
      overallScore: 0,
      grade: 'F',
      recommendations: [],
      artifacts: [],
      timestamp
    };

    // 1. Functional dimension
    if (dimensions.includes('functional')) {
      const functionalResult = await target.evaluate(() => {
        const checks = [];
        // Basic functional checks
        const hasTitle = document.title && document.title.length > 0;
        const hasMainContent = document.querySelector('main') || document.querySelector('[role="main"]') || document.body.innerText.length > 100;
        const hasLinks = document.querySelectorAll('a[href]').length > 0;
        const hasForms = document.querySelectorAll('form').length > 0;
        const hasButtons = document.querySelectorAll('button, input[type="submit"], [role="button"]').length > 0;
        const hasImages = document.querySelectorAll('img').length > 0;

        checks.push({ name: 'title', passed: hasTitle, weight: 10 });
        checks.push({ name: 'mainContent', passed: hasMainContent, weight: 30 });
        checks.push({ name: 'navigation', passed: hasLinks, weight: 20 });
        checks.push({ name: 'forms', passed: hasForms || !hasForms, weight: 10 }); // Forms are optional
        checks.push({ name: 'buttons', passed: hasButtons, weight: 15 });
        checks.push({ name: 'images', passed: hasImages || !hasImages, weight: 15 }); // Images are optional

        const passedCount = checks.filter(c => c.passed).length;
        const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
        const earnedWeight = checks.filter(c => c.passed).reduce((sum, c) => sum + c.weight, 0);
        const score = Math.round((earnedWeight / totalWeight) * 100);

        return { checks, passedCount, totalCount: checks.length, score };
      });

      results.dimensions.functional = {
        score: functionalResult.score,
        passed: functionalResult.passedCount,
        failed: functionalResult.totalCount - functionalResult.passedCount,
        checks: functionalResult.checks
      };

      if (functionalResult.score < 50) {
        results.recommendations.push('功能性检查：页面缺少核心元素（标题、导航或主要内容区域）');
      }
    }

    // 2. Visual dimension
    if (dimensions.includes('visual')) {
      try {
        // Take screenshot for visual check
        const screenshot = await target.screenshot({ type: 'png', fullPage: false });
        const artifactPath = `validation_matrix_visual_${Date.now()}.png`;

        // Basic visual checks
        const visualResult = await target.evaluate(() => {
          const checks = [];
          const styles = getComputedStyle(document.body);

          // Check readable font size
          const fontSize = parseFloat(styles.fontSize);
          checks.push({ name: 'fontSize', passed: fontSize >= 12, value: fontSize, weight: 20 });

          // Check contrast (basic)
          const bgColor = styles.backgroundColor;
          const textColor = styles.color;
          checks.push({ name: 'hasColors', passed: bgColor !== textColor, weight: 15 });

          // Check layout consistency
          const hasConsistentLayout = document.querySelectorAll('[class*="container"], [class*="wrapper"], [class*="main"]').length > 0;
          checks.push({ name: 'layoutStructure', passed: hasConsistentLayout, weight: 25 });

          // Check responsive
          const viewportWidth = window.innerWidth;
          checks.push({ name: 'viewportWidth', passed: viewportWidth > 0, value: viewportWidth, weight: 10 });

          // Check visible content
          const visibleElements = document.querySelectorAll(':not([hidden])').length;
          checks.push({ name: 'visibleContent', passed: visibleElements > 10, value: visibleElements, weight: 30 });

          const passedCount = checks.filter(c => c.passed).length;
          const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
          const earnedWeight = checks.filter(c => c.passed).reduce((sum, c) => sum + c.weight, 0);
          const score = Math.round((earnedWeight / totalWeight) * 100);

          return { checks, passedCount, totalCount: checks.length, score, viewport: { width: window.innerWidth, height: window.innerHeight } };
        });

        results.dimensions.visual = {
          score: visualResult.score,
          passed: visualResult.passedCount,
          failed: visualResult.totalCount - visualResult.passedCount,
          checks: visualResult.checks,
          viewport: visualResult.viewport,
          screenshotArtifact: artifactPath
        };

        results.artifacts.push(artifactPath);

        if (visualResult.score < 70) {
          results.recommendations.push('视觉检查：字体大小或布局结构可能存在问题');
        }
      } catch (e) {
        results.dimensions.visual = { score: 0, error: e.message };
        results.recommendations.push('视觉检查失败：无法完成截图或样式检查');
      }
    }

    // 3. Performance dimension
    if (dimensions.includes('performance')) {
      const perfResult = await target.evaluate((threshold) => {
        const perf = window.performance;
        const timing = perf.timing;
        const navigation = perf.getEntriesByType('navigation')[0] || {};

        // Calculate metrics
        const fcp = perf.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint')?.startTime || 0;
        const lcpEntries = perf.getEntriesByType('largest-contentful-paint');
        const lcp = lcpEntries.length > 0 ? lcpEntries[lcpEntries.length - 1].startTime : 0;
        const cls = perf.getEntriesByType('layout-shift').reduce((sum, e) => sum + e.value, 0);

        const domContentLoaded = navigation.domContentLoadedEventEnd - navigation.fetchStart || timing.domContentLoadedEventEnd - timing.navigationStart;
        const loadTime = navigation.loadEventEnd - navigation.fetchStart || timing.loadEventEnd - timing.navigationStart;

        // Score calculation
        const checks = [];
        checks.push({ name: 'FCP', passed: fcp < 1800, value: Math.round(fcp), threshold: 1800, weight: 20 });
        checks.push({ name: 'LCP', passed: lcp < threshold, value: Math.round(lcp), threshold, weight: 30 });
        checks.push({ name: 'CLS', passed: cls < 0.1, value: Math.round(cls * 1000) / 1000, threshold: 0.1, weight: 20 });
        checks.push({ name: 'DCL', passed: domContentLoaded < 2000, value: Math.round(domContentLoaded), threshold: 2000, weight: 15 });
        checks.push({ name: 'Load', passed: loadTime < 3000, value: Math.round(loadTime), threshold: 3000, weight: 15 });

        const passedCount = checks.filter(c => c.passed).length;
        const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
        const earnedWeight = checks.filter(c => c.passed).reduce((sum, c) => sum + c.weight, 0);
        const score = Math.round((earnedWeight / totalWeight) * 100);

        return { checks, passedCount, totalCount: checks.length, score, metrics: { fcp, lcp, cls, domContentLoaded, loadTime } };
      }, performanceThreshold);

      results.dimensions.performance = {
        score: perfResult.score,
        passed: perfResult.passedCount,
        failed: perfResult.totalCount - perfResult.passedCount,
        checks: perfResult.checks,
        metrics: perfResult.metrics
      };

      if (perfResult.score < 70) {
        results.recommendations.push(`性能检查：LCP 或其他指标超过阈值，建议优化资源加载`);
      }
    }

    // 4. A11y dimension
    if (dimensions.includes('a11y')) {
      const a11yResult = await target.evaluate(() => {
        const checks = [];

        // Check alt text on images
        const imagesWithoutAlt = document.querySelectorAll('img:not([alt])').length;
        checks.push({ name: 'imageAlt', passed: imagesWithoutAlt === 0, failed: imagesWithoutAlt, weight: 20 });

        // Check form labels
        const inputsWithoutLabel = document.querySelectorAll('input:not([type="hidden"]):not([id]), input:not([type="hidden"])[id]:not([aria-label])').length;
        const inputsWithLabel = Array.from(document.querySelectorAll('input[id]')).filter(i => document.querySelector(`label[for="${i.id}"]`)).length;
        checks.push({ name: 'formLabels', passed: inputsWithoutLabel < 5, failed: inputsWithoutLabel, weight: 25 });

        // Check heading structure
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const hasH1 = document.querySelectorAll('h1').length === 1;
        checks.push({ name: 'headingStructure', passed: hasH1, value: headings.length, weight: 15 });

        // Check aria roles
        const ariaElements = document.querySelectorAll('[role]');
        checks.push({ name: 'ariaUsage', passed: ariaElements.length > 0 || true, value: ariaElements.length, weight: 10 });

        // Check focus indicators (basic)
        const focusableElements = document.querySelectorAll('a, button, input, select, textarea, [tabindex]');
        checks.push({ name: 'focusableElements', passed: focusableElements.length > 0, value: focusableElements.length, weight: 15 });

        // Check lang attribute
        const hasLang = document.documentElement.hasAttribute('lang');
        checks.push({ name: 'langAttribute', passed: hasLang, weight: 15 });

        const passedCount = checks.filter(c => c.passed).length;
        const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
        const earnedWeight = checks.filter(c => c.passed).reduce((sum, c) => sum + c.weight, 0);
        const score = Math.round((earnedWeight / totalWeight) * 100);

        return { checks, passedCount, totalCount: checks.length, score };
      });

      results.dimensions.a11y = {
        score: a11yResult.score,
        passed: a11yResult.passedCount,
        failed: a11yResult.totalCount - a11yResult.passedCount,
        checks: a11yResult.checks
      };

      if (a11yResult.score < 70) {
        results.recommendations.push('无障碍检查：图片缺少 alt 属性或表单缺少 label');
      }
    }

    // Calculate overall score and grade
    const dimensionScores = Object.values(results.dimensions).map(d => d.score || 0);
    const activeDimensions = dimensionScores.length;
    if (activeDimensions > 0) {
      results.overallScore = Math.round(dimensionScores.reduce((sum, s) => sum + s, 0) / activeDimensions);

      // Assign grade
      if (results.overallScore >= 95) results.grade = 'A';
      else if (results.overallScore >= 85) results.grade = 'B';
      else if (results.overallScore >= 70) results.grade = 'C';
      else if (results.overallScore >= 50) results.grade = 'D';
      else results.grade = 'F';
    }

    // Success determination
    results.success = results.overallScore >= 70;

    // Add general recommendations if needed
    if (results.recommendations.length === 0 && results.success) {
      results.recommendations.push('验证通过：页面在所有维度表现良好');
    }

    // Role × Feature matrix if provided
    if (args.roles && args.features) {
      results.roleMatrix = [];
      for (const role of args.roles) {
        const roleResult = { role: role.name || 'default', features: [] };
        for (const feature of args.features) {
          // Basic feature availability check (placeholder for full implementation)
          roleResult.features.push({
            name: feature.name,
            expected: feature.expected || 'allowed',
            status: 'pending' // Full implementation requires session management
          });
        }
        results.roleMatrix.push(roleResult);
      }
      results.recommendations.push('角色×功能矩阵：需要完整的会话管理才能完整验证，当前为结构预览');
    }

    // Output format
    if (outputFormat === 'markdown') {
      const md = `# Validation Matrix Report\n\n**URL:** ${results.url}\n**Overall Score:** ${results.overallScore}/100 (${results.grade})\n**Timestamp:** ${results.timestamp}\n\n## Dimensions\n\n| Dimension | Score | Passed | Failed |\n|-----------|-------|--------|--------|\n${Object.entries(results.dimensions).map(([k, v]) => `| ${k} | ${v.score} | ${v.passed} | ${v.failed} |`).join('\n')}\n\n## Recommendations\n\n${results.recommendations.map(r => `- ${r}`).join('\n')}\n`;
      return text(md);
    }

    return text(JSON.stringify(results, null, 2));
  }

  // ====== validation_decision ======
  if (name === 'validation_decision') {
  return text('validation_decision: 决策建议。该能力在闭源端完整实现，开源版本仅作为占位');
  }

  return mcpError(`未知工具（validation）: ${name}`, { error: 'UNKNOWN_TOOL', toolName: name });
  } finally {
    Object.assign(deps, { page, browser, browserSessionId, consoleLogs, networkLogs, pageErrors, currentCheckpoint, eventCheckpoint, lastAction, sessions, activeSessionName, sessionCounter, traceLogs, traceActive, currentTraceName, backendProbeResults, instrumentationEnabled, imageErrors, lastImageErrorCheckpoint, validationResults, lastQualityChecks, lastValidationRun, requestStartTimes, stateManager });
  }

}

function filterBySince(items, since) {
  if (!since) return items;
  const sinceTime = new Date(since).getTime();
  return items.filter(item => {
    const t = item.timestamp ? new Date(item.timestamp).getTime() : 0;
    return t >= sinceTime;
  });
}

function stripNetworkDetails(item) {
  const r = Object.assign({}, item);
  delete r.requestBody;
  delete r.responseBody;
  delete r.requestHeaders;
  delete r.responseHeaders;
  return r;
}

async function runValidationFlow(target, args = {}) {
  const { filterNetwork, networkLogs, captureStepEvidence, redact, consoleLogs, pageErrors } = _deps || {};
  const continueOnFailure = args.continueOnFailure === true;
  const failFast = args.failFast === true;
  const timeout = Number(args.timeout) || 30000;
  const steps = Array.isArray(args.steps) ? args.steps : [];

  const startTime = Date.now();
  const stepResults = [];
  const failures = [];

  const ac = new AbortController();
  const timeoutTimer = setTimeout(() => {
    ac.abort(new Error(`validation_flow 整体超时（${timeout}ms）`));
  }, timeout);

  try {
    for (let index = 0; index < steps.length; index += 1) {
      if (ac.signal.aborted) throw ac.signal.reason;

      const step = steps[index];
      const action = step.action || step.type;
      const stepName = step.name || `${index + 1}-${action || 'step'}`;
      const stepStart = Date.now();
      const stepCheckpoint = new Date().toISOString();

      const stepResult = {
        stepIndex: index,
        stepName,
        action,
        passed: false,
        duration: 0,
        error: null,
        consoleErrors: [],
        networkErrors: [],
        networkRequests: [],
        pageErrors: []
      };

      try {
        switch (action) {
          case 'navigate':
          case 'goto': {
            const url = step.url || step.value;
            if (!url) throw new Error('navigate 步骤需要 url 参数');
            const navTimeout = step.timeout || 15000;
            await target.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
            break;
          }
          case 'click':
            if (!step.selector) throw new Error('click 步骤需要 selector 参数');
            const clickTimeout = step.timeout || 10000;
            await target.click(step.selector, { timeout: clickTimeout });
            break;
          case 'type': {
            if (!step.selector) throw new Error('type 步骤需要 selector 参数');
            const text = step.value || '';
            const typeTimeout = step.timeout || 10000;
            await target.fill(step.selector, text, { timeout: typeTimeout });
            await target.evaluate(({ selector, text }) => {
              const el = document.querySelector(selector);
              if (!el) return;
              try {
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
              } catch (e) { /* ignore */ }
            }, { selector: step.selector, text });
            break;
          }
          case 'wait': {
            const waitMs = Number(step.value) || 1000;
            await target.waitForTimeout(waitMs);
            break;
          }
          case 'eval': {
            if (!step.expression) throw new Error('eval 步骤需要 expression 参数');
            const evalResult = await target.evaluate(step.expression);
            stepResult.evalResult = evalResult;
            break;
          }
          case 'screenshot': {
            const screenshotName = step.name || `step-${index}`;
            ensureArtifactsDir();
            const safeName = `${Date.now()}-${screenshotName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
            const screenshotPath = path.join(SCREENSHOT_DIR, `${safeName}.png`);
            await screenshotWithRedaction(target, screenshotPath, {});
            stepResult.screenshot = screenshotPath;
            break;
          }
          default:
            throw new Error(`不支持的操作类型：${action}`);
        }

        await new Promise(r => setTimeout(r, 300));

        const stepConsoleErrors = filterBySince(consoleLogs, stepCheckpoint)
          .filter(item => item.type === 'error');
        const stepPageErrors = filterBySince(pageErrors, stepCheckpoint);
        const stepNetworkRequests = filterNetwork(networkLogs, { since: stepCheckpoint });
        const stepNetworkErrors = stepNetworkRequests.filter(item => item.failed || item.status >= 400);

        stepResult.consoleErrors = stepConsoleErrors.map(e => redact(e));
        stepResult.pageErrors = stepPageErrors.map(e => redact(e));
        stepResult.networkErrors = stepNetworkErrors.map(e => redact(stripNetworkDetails(e)));
        stepResult.networkRequests = stepNetworkRequests.map(e => redact(stripNetworkDetails(e)));

        let validationPassed = true;
        const validationErrors = [];

        if (step.validate) {
          if (step.validate.network && Array.isArray(step.validate.network)) {
            for (const netCheck of step.validate.network) {
              const matched = stepNetworkRequests.filter(req => {
                if (netCheck.urlContains && (!req.url || !req.url.includes(netCheck.urlContains))) return false;
                if (netCheck.urlPattern && req.url) {
                  try {
                    const re = new RegExp(netCheck.urlPattern);
                    if (!re.test(req.url)) return false;
                  } catch (e) { /* invalid regex, skip */ }
                }
                if (netCheck.method && req.method !== netCheck.method) return false;
                return true;
              });

              if (matched.length === 0) {
                validationPassed = false;
                validationErrors.push(`网络验证失败: 未找到匹配的请求 (${netCheck.urlContains || netCheck.urlPattern || netCheck.method || 'any'})`);
              } else if (typeof netCheck.statusCode === 'number') {
                const statusMatch = matched.filter(req => req.status === netCheck.statusCode);
                if (statusMatch.length === 0) {
                  validationPassed = false;
                  validationErrors.push(`网络验证失败: 期望状态码 ${netCheck.statusCode}，实际匹配请求的状态码为 ${matched.map(m => m.status).join(', ')}`);
                }
              } else if (typeof netCheck.minStatusCode === 'number') {
                const statusMatch = matched.filter(req => Number(req.status || 0) >= netCheck.minStatusCode);
                if (statusMatch.length === 0 && netCheck.expectFailure !== true) {
                  validationPassed = false;
                  validationErrors.push(`网络验证失败: 期望至少有一个请求状态码 >= ${netCheck.minStatusCode}`);
                }
              }
            }
          }

          if (step.validate.element && Array.isArray(step.validate.element)) {
            for (const elemCheck of step.validate.element) {
              if (!elemCheck.selector) continue;

              const elemResult = await target.evaluate((check) => {
                const el = document.querySelector(check.selector);
                const result = { exists: !!el };

                if (!el) return result;

                if (check.visible !== undefined) {
                  const style = window.getComputedStyle(el);
                  result.visible = style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
                }
                if (check.textContains !== undefined) {
                  result.textContains = el.innerText.includes(check.textContains);
                  result.actualText = el.innerText;
                }
                if (check.textEquals !== undefined) {
                  result.textEquals = el.innerText === check.textEquals;
                  result.actualText = el.innerText;
                }
                if (check.attribute) {
                  result.attributeValue = el.getAttribute(check.attribute.name);
                  if (check.attribute.value !== undefined) {
                    result.attributeMatches = result.attributeValue === check.attribute.value;
                  }
                }
                if (check.count !== undefined) {
                  const all = document.querySelectorAll(check.selector);
                  result.count = all.length;
                  result.countMatches = all.length === check.count;
                }

                return result;
              }, elemCheck);

              let checkPassed = elemResult.exists;

              if (elemCheck.visible !== undefined && elemResult.visible !== undefined) {
                checkPassed = checkPassed && elemResult.visible === elemCheck.visible;
              }
              if (elemCheck.textContains !== undefined) {
                checkPassed = checkPassed && elemResult.textContains === true;
              }
              if (elemCheck.textEquals !== undefined) {
                checkPassed = checkPassed && elemResult.textEquals === true;
              }
              if (elemCheck.attribute && elemCheck.attribute.value !== undefined) {
                checkPassed = checkPassed && elemResult.attributeMatches === true;
              }
              if (elemCheck.count !== undefined) {
                checkPassed = checkPassed && elemResult.countMatches === true;
              }

              if (!checkPassed) {
                validationPassed = false;
                const detail = [];
                if (elemResult.exists === false) detail.push('元素不存在');
                if (elemCheck.visible !== undefined && elemResult.visible !== undefined) detail.push(`可见性: 期望${elemCheck.visible}, 实际${elemResult.visible}`);
                if (elemCheck.textContains !== undefined) detail.push(`文本包含: 期望包含"${elemCheck.textContains}", 实际"${(elemResult.actualText || '').slice(0, 100)}"`);
                if (elemCheck.textEquals !== undefined) detail.push(`文本相等: 期望"${elemCheck.textEquals}", 实际"${(elemResult.actualText || '').slice(0, 100)}"`);
                if (elemCheck.attribute && elemCheck.attribute.value !== undefined) detail.push(`属性${elemCheck.attribute.name}: 期望"${elemCheck.attribute.value}", 实际"${elemResult.attributeValue || ''}"`);
                if (elemCheck.count !== undefined) detail.push(`数量: 期望${elemCheck.count}, 实际${elemResult.count || 0}`);
                validationErrors.push(`元素验证失败 (${elemCheck.selector}): ${detail.join(', ')}`);
              }

              if (!stepResult.elementValidations) stepResult.elementValidations = [];
              stepResult.elementValidations.push({
                selector: elemCheck.selector,
                passed: checkPassed,
                details: elemResult
              });
            }
          }

          stepResult.validationErrors = validationErrors;
        }

        const hasRuntimeErrors = stepConsoleErrors.length > 0 || stepPageErrors.length > 0 || stepNetworkErrors.length > 0;

        if (hasRuntimeErrors) {
          const errorMsg = `步骤 ${stepName} 执行后检测到错误: ${stepConsoleErrors.length} 个控制台错误, ${stepPageErrors.length} 个页面错误, ${stepNetworkErrors.length} 个网络错误`;
          if (!stepResult.error) {
            stepResult.error = errorMsg;
          } else {
            stepResult.error += '; ' + errorMsg;
          }
          failures.push({
            stepIndex: index,
            stepName,
            action,
            error: stepResult.error,
            consoleErrors: stepResult.consoleErrors,
            pageErrors: stepResult.pageErrors,
            networkErrors: stepResult.networkErrors
          });

          if (failFast) {
            const evidence = await captureStepEvidence(target, `${stepName}-failed`, { screenshot: true, snapshot: true }).catch(() => null);
            stepResult.evidence = evidence;
            stepResult.passed = false;
            stepResult.duration = Date.now() - stepStart;
            stepResults.push(redact(stepResult));
            break;
          }
        }

        if (!validationPassed) {
          stepResult.passed = false;
          failures.push({
            stepIndex: index,
            stepName,
            action,
            error: validationErrors.join('; '),
            validationErrors
          });
          if (failFast) {
            const evidence = await captureStepEvidence(target, `${stepName}-failed`, { screenshot: true, snapshot: true }).catch(() => null);
            stepResult.evidence = evidence;
            stepResult.duration = Date.now() - stepStart;
            stepResults.push(redact(stepResult));
            break;
          }
        } else if (!hasRuntimeErrors) {
          stepResult.passed = true;
        }
      } catch (error) {
        stepResult.error = error.message;
        const evidence = await captureStepEvidence(target, `${stepName}-failed`, { screenshot: true, snapshot: true }).catch(() => null);
        stepResult.evidence = evidence;
        failures.push({
          stepIndex: index,
          stepName,
          action,
          error: error.message,
          evidence
        });
      }

      stepResult.duration = Date.now() - stepStart;
      stepResults.push(redact(stepResult));

      if (!stepResult.passed && !continueOnFailure && !failFast) break;
    }
  } finally {
    clearTimeout(timeoutTimer);
  }

  const totalSteps = steps.length;
  const passedSteps = stepResults.filter(r => r.passed).length;
  const failedSteps = stepResults.filter(r => !r.passed).length;
  const totalDuration = Date.now() - startTime;

  return redact({
    totalSteps,
    passedSteps,
    failedSteps,
    totalDuration,
    steps: stepResults,
    failures,
    url: target.url()
  });
}

async function runValidationChain(target, args = {}) {
  const { filterNetwork, networkLogs, captureStepEvidence, redact, consoleLogs, pageErrors } = _deps || {};
  const failOnError = args.failOnError !== false;
  const captureScreenshots = args.captureScreenshots === true;
  const requiredSteps = args.requiredSteps !== false;
  const networkFilter = args.networkFilter || {};
  const timeout = Number(args.timeout) || 60000;
  const steps = Array.isArray(args.steps) ? args.steps : [];

  if (requiredSteps) {
    const requiredTypes = ['navigate', 'click', 'type', 'wait', 'validate'];
    const presentTypes = new Set(steps.map(s => s.type || s.action));
    const missingTypes = requiredTypes.filter(t => !presentTypes.has(t));

    if (missingTypes.length > 0) {
      return {
        passed: false,
        totalSteps: steps.length,
        completedSteps: 0,
        failedStep: null,
        stepResults: [],
        errors: [{
          errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
          errorType: '跳过步骤',
          message: `缺少必需的步骤类型：${missingTypes.join(', ')}。在 requiredSteps 模式下，必须包含完整的5步链路验证（navigate/click/type/wait/validate）。`,
          requiredActions: [
            `补充缺失的步骤类型：${missingTypes.join(', ')}`,
            ...missingTypes.map(type => {
              const examples = {
                'navigate': `添加导航步骤：{ type: 'navigate', name: '打开页面', url: 'http://目标URL' }`,
                'click': `添加点击步骤：{ type: 'click', name: '点击按钮', selector: '#button-selector' }`,
                'type': `添加输入步骤：{ type: 'type', name: '输入内容', selector: '#input-selector', value: '输入文本' }`,
                'wait': `添加等待步骤：{ type: 'wait', name: '等待响应', value: '2000' }`,
                'validate': `添加验证步骤：{ type: 'validate', name: '验证结果', selector: '.success-indicator' }`
              };
              return examples[type] || `添加步骤类型 '${type}' 的具体示例`;
            }),
            '确保包含完整的 navigate→click→type→wait→validate 链路'
          ]
        }],
        networkRequests: [],
        duration: 0,
        isEnforcementViolation: true
      };
    }

    if (steps.length < 5) {
      return {
        passed: false,
        totalSteps: steps.length,
        completedSteps: 0,
        failedStep: null,
        stepResults: [],
        errors: [{
          errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
          errorType: '跳过步骤',
          message: `步骤数量不足：当前 ${steps.length} 步，必需至少 5 步。在 requiredSteps 模式下，必须包含完整的5步链路验证。`,
          requiredActions: [
            '当前仅提供了 ' + steps.length + ' 步，需至少5步',
            '建议的5步链路示例：',
            '{ type: "navigate", name: "打开页面", url: "http://目标URL" }',
            '{ type: "click", name: "点击操作入口", selector: ".target-button" }',
            '{ type: "type", name: "输入数据", selector: ".input-field", value: "测试数据" }',
            '{ type: "wait", name: "等待响应", value: "2000" }',
            '{ type: "validate", name: "验证结果", selector: ".success-indicator" }',
            '缺少的步骤类型：' + ['navigate', 'click', 'type', 'wait', 'validate'].filter(t => {
              const presentTypes = new Set(steps.map(s => s.type || s.action));
              return !presentTypes.has(t);
            }).join(', ')
          ]
        }],
        networkRequests: [],
        duration: 0,
        isEnforcementViolation: true
      };
    }
  }

  const startTime = Date.now();
  const stepResults = [];
  const allErrors = [];
  let completedSteps = 0;
  let failedStep = null;

  const chainStartCheckpoint = new Date().toISOString();

  const ac = new AbortController();
  const timeoutTimer = setTimeout(() => {
    ac.abort(new Error(`validation_chain 整体超时（${timeout}ms）`));
  }, timeout);

  try {
    for (let index = 0; index < steps.length; index += 1) {
      if (ac.signal.aborted) throw ac.signal.reason;

      const step = steps[index];
      const stepType = step.type || step.action;
      const stepName = step.name || `${index + 1}-${stepType || 'step'}`;
      const stepStart = Date.now();
      const stepCheckpoint = new Date().toISOString();

      const stepResult = {
        stepIndex: index,
        stepName,
        type: stepType,
        passed: false,
        duration: 0,
        error: null,
        consoleErrors: [],
        networkErrors: [],
        networkRequests: [],
        screenshot: null
      };

      try {
        switch (stepType) {
          case 'navigate':
          case 'goto': {
            const url = step.url || step.value;
            if (!url) throw new Error('navigate 步骤需要 url 参数');
            const navTimeout = step.timeout || 15000;
            await target.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
            break;
          }
          case 'click': {
            if (!step.selector) throw new Error('click 步骤需要 selector 参数');
            const clickTimeout = step.timeout || 10000;
            await target.click(step.selector, { timeout: clickTimeout });
            break;
          }
          case 'type': {
            if (!step.selector) throw new Error('type 步骤需要 selector 参数');
            const text = step.value || '';
            const typeTimeout = step.timeout || 10000;
            await target.fill(step.selector, text, { timeout: typeTimeout });
            await target.evaluate(({ selector, text }) => {
              const el = document.querySelector(selector);
              if (!el) return;
              try {
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
              } catch (e) { /* ignore */ }
            }, { selector: step.selector, text });
            break;
          }
          case 'wait': {
            const waitMs = Number(step.value) || 1000;
            await target.waitForTimeout(waitMs);
            break;
          }
          case 'validate': {
            if (step.expression) {
              const evalResult = await target.evaluate(step.expression);
              if (evalResult !== true && evalResult !== false) {
                throw new Error(`validate 步骤表达式应返回 boolean，实际返回: ${typeof evalResult}`);
              }
              if (!evalResult) {
                throw new Error(`验证失败: 表达式返回 false`);
              }
              stepResult.validateResult = evalResult;
            } else if (step.selector) {
              const exists = await target.evaluate((selector) => {
                return !!document.querySelector(selector);
              }, step.selector);
              if (!exists) {
                throw new Error(`验证失败: 选择器 "${step.selector}" 未找到元素`);
              }
              stepResult.validateResult = exists;
            } else if (step.expected !== undefined) {
              const actual = await target.evaluate(() => document.title);
              if (actual !== step.expected) {
                throw new Error(`验证失败: 预期 "${step.expected}"，实际 "${actual}"`);
              }
              stepResult.validateResult = true;
            } else {
              throw new Error('validate 步骤需要 expression、selector 或 expected 参数');
            }
            break;
          }
          default:
            throw new Error(`不支持的操作类型：${stepType}`);
        }

        await new Promise(r => setTimeout(r, 300));

        const stepConsoleErrors = filterBySince(consoleLogs, stepCheckpoint)
          .filter(item => item.type === 'error');
        const stepPageErrors = filterBySince(pageErrors, stepCheckpoint);
        const netFilterArgs = Object.assign({}, networkFilter, { since: stepCheckpoint });
        const stepNetworkRequests = filterNetwork(networkLogs, netFilterArgs);
        const stepNetworkErrors = stepNetworkRequests.filter(item => item.failed || item.status >= 400);

        stepResult.consoleErrors = stepConsoleErrors.map(e => redact(e));
        stepResult.pageErrors = stepPageErrors.map(e => redact(e));
        stepResult.networkErrors = stepNetworkErrors.map(e => redact(stripNetworkDetails(e)));
        stepResult.networkRequests = stepNetworkRequests.map(e => redact(stripNetworkDetails(e)));

        const hasStepErrors = stepConsoleErrors.length > 0 || stepPageErrors.length > 0 || stepNetworkErrors.length > 0;

        if (hasStepErrors) {
          const errorMsg = `步骤 ${stepName} 执行后检测到错误: ${stepConsoleErrors.length} 个控制台错误, ${stepPageErrors.length} 个页面错误, ${stepNetworkErrors.length} 个网络错误`;
          stepResult.error = errorMsg;
          allErrors.push({
            stepIndex: index,
            stepName,
            type: stepType,
            error: errorMsg,
            consoleErrors: stepResult.consoleErrors,
            pageErrors: stepResult.pageErrors,
            networkErrors: stepResult.networkErrors
          });

          if (failOnError) {
            failedStep = index;
            const evidence = await captureStepEvidence(target, `${stepName}-failed`, { screenshot: true, snapshot: true }).catch(() => null);
            stepResult.evidence = evidence;
            stepResult.passed = false;
            stepResult.duration = Date.now() - stepStart;
            stepResults.push(stepResult);
            break;
          }
        } else {
          stepResult.passed = true;
          completedSteps += 1;
        }

        if (captureScreenshots && stepResult.passed) {
          try {
            ensureArtifactsDir();
            const safeName = `${Date.now()}-${stepName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
            const screenshotPath = path.join(SCREENSHOT_DIR, `${safeName}.png`);
            await screenshotWithRedaction(target, screenshotPath, {});
            stepResult.screenshot = screenshotPath;
          } catch (e) {
            /* screenshot failure is not critical */
          }
        }
      } catch (error) {
        stepResult.error = error.message;
        allErrors.push({
          stepIndex: index,
          stepName,
          type: stepType,
          error: error.message
        });
        failedStep = index;
        const evidence = await captureStepEvidence(target, `${stepName}-failed`, { screenshot: true, snapshot: true }).catch(() => null);
        stepResult.evidence = evidence;
      }

      stepResult.duration = Date.now() - stepStart;
      stepResults.push(stepResult);

      if (!stepResult.passed && failOnError) break;
    }
  } finally {
    clearTimeout(timeoutTimer);
  }

  const totalSteps = steps.length;
  const totalDuration = Date.now() - startTime;
  const passed = failedStep === null && completedSteps === totalSteps;

  const chainNetFilterArgs = Object.assign({}, networkFilter, { since: chainStartCheckpoint });
  const allNetworkRequests = filterNetwork(networkLogs, chainNetFilterArgs)
    .map(e => redact(stripNetworkDetails(e)));

  return redact({
    passed,
    totalSteps,
    completedSteps,
    failedStep,
    stepResults,
    errors: allErrors,
    networkRequests: allNetworkRequests,
    duration: totalDuration,
    url: target.url()
  });
}

async function runChainSpecStep(target, step, index) {
  const { filterNetwork, networkLogs } = _deps || {};
  const action = step.action || step.type;
  const stepName = step.name || `${index + 1}-${action || 'step'}`;
  const timeout = step.timeout || 10000;
  const result = { stepIndex: index, stepName, action, passed: false, duration: 0 };
  const startedAt = Date.now();

  if (!action) throw new Error(`步骤 ${stepName} 缺少 type/action`);

  switch (action) {
    case 'navigate':
    case 'goto': {
      const url = step.url || step.value;
      if (!url) throw new Error('navigate 步骤需要 url 参数');
      await target.goto(url, { waitUntil: 'domcontentloaded', timeout });
      if (step.waitForLoadState !== false) {
        try { await target.waitForLoadState(step.loadState || 'networkidle', { timeout: Math.min(timeout, 8000) }); } catch (_) { /* optional, ignore errors */ }
      }
      break;
    }
    case 'reload':
    case 'refresh': {
      await target.reload({ waitUntil: 'domcontentloaded', timeout });
      if (step.waitForLoadState !== false) {
        try { await target.waitForLoadState(step.loadState || 'networkidle', { timeout: Math.min(timeout, 8000) }); } catch (_) { /* optional, ignore errors */ }
      }
      break;
    }
    case 'click': {
      if (!step.selector) throw new Error('click 步骤需要 selector 参数');
      await target.locator(step.selector).first().click({ timeout });
      break;
    }
    case 'type':
    case 'fill': {
      if (!step.selector) throw new Error('type 步骤需要 selector 参数');
      const value = step.value || '';
      await target.locator(step.selector).first().fill(value, { timeout });
      await target.evaluate(({ selector, value }) => {
        const el = document.querySelector(selector);
        if (!el) return;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, { selector: step.selector, value });
      break;
    }
    case 'press': {
      if (!step.selector || !step.key) throw new Error('press 步骤需要 selector 和 key 参数');
      await target.locator(step.selector).first().press(step.key, { timeout });
      break;
    }
    case 'wait': {
      if (step.selector) await target.locator(step.selector).first().waitFor({ timeout, state: step.state || 'visible' });
      else await target.waitForTimeout(Number(step.value || step.ms || 1000));
      break;
    }
    case 'eval': {
      if (!step.expression) throw new Error('eval 步骤需要 expression 参数');
      result.value = await target.evaluate(expression => {
        const fn = new Function(`return (${expression})`);
        return fn();
      }, step.expression);
      break;
    }
    case 'apiRequest':
    case 'api': {
      const requestUrl = step.url || step.path;
      if (!requestUrl) throw new Error('apiRequest 步骤需要 url 或 path 参数');
      const apiResult = await target.evaluate(async stepConfig => {
        const requestUrl = stepConfig.url || new URL(stepConfig.path || '/', location.origin).toString();
        const authRaw = (() => {
          try { return localStorage.getItem('validpilot-auth'); } catch (_) { return null; }
        })();
        let token = null;
        try { token = authRaw ? JSON.parse(authRaw)?.state?.accessToken : null; } catch (_) { /* optional, ignore errors */ }
        const headers = Object.assign({ 'content-type': 'application/json' }, stepConfig.headers || {});
        if (token && !headers.Authorization && !headers.authorization) headers.Authorization = `Bearer ${token}`;
        const options = { method: stepConfig.method || 'GET', headers, credentials: 'include' };
        if (stepConfig.body != null) options.body = typeof stepConfig.body === 'string' ? stepConfig.body : JSON.stringify(stepConfig.body);
        const response = await fetch(requestUrl, options);
        const text = await response.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
        return { status: response.status, ok: response.ok, url: response.url, data };
      }, step);
      result.api = apiResult;
      result.validation = validateApiStepResult(apiResult, step);
      if (!result.validation.passed) throw new Error('API 步骤断言失败');
      break;
    }
    case 'assert':
    case 'validate': {
      if (step.selector) {
        const locator = target.locator(step.selector).first();
        if (step.visible !== false) await locator.waitFor({ timeout, state: step.state || 'visible' });
        if (step.textContains !== undefined) {
          const textValue = await locator.innerText({ timeout });
          result.actual = textValue;
          if (!String(textValue).includes(String(step.textContains))) throw new Error(`断言失败：${step.selector} 文本不包含 ${step.textContains}`);
        }
      } else if (step.expression) {
        const value = await target.evaluate(expression => {
          const fn = new Function(`return (${expression})`);
          return fn();
        }, step.expression);
        result.actual = value;
        if (value !== true) throw new Error(`断言失败：表达式返回 ${JSON.stringify(value)}`);
      } else if (step.bodyContains !== undefined) {
        const bodyText = await target.locator('body').innerText({ timeout }).catch(() => '');
        result.actual = bodyText.slice(0, 500);
        if (!bodyText.includes(String(step.bodyContains))) throw new Error(`断言失败：页面文本不包含 ${step.bodyContains}`);
      } else {
        throw new Error('assert/validate 步骤需要 selector、expression 或 bodyContains 参数');
      }
      break;
    }
    case 'stateCapture':
    case 'captureState': {
      result.snapshot = await captureStateSnapshot(target, {
        label: step.label || stepName,
        snapshotId: step.snapshotId,
        sources: step.sources || []
      });
      break;
    }
    case 'stateCompare':
    case 'compareState': {
      result.stateDiff = await runStateDiffAssert(target, {
        action: 'compare',
        label: step.label || stepName,
        compareTo: step.compareTo || step.beforeSnapshotId,
        before: step.before,
        sources: step.sources || [],
        expectations: step.expectations || [],
        evidence: false,
        screenshot: false,
        snapshot: false
      });
      if (!result.stateDiff.passed) throw new Error('状态对比断言失败');
      break;
    }
    default:
      throw new Error(`不支持的链路步骤类型：${action}`);
  }

  if (step.waitAfter) await target.waitForTimeout(Number(step.waitAfter));
  result.duration = Date.now() - startedAt;
  result.passed = true;
  return result;
}

const BUILTIN_TEMPLATES = {
  'marketplace-purchase': {
    description: 'Marketplace 商品购买完整功能链路验证',
    targetUrl: '/dashboard/marketplace',
    stateSources: [
      { name: 'balance', type: 'eval', expression: "JSON.parse(localStorage.getItem('validpilot-auth')||'{}')?.state?.creditsBalance || 0" },
      { name: 'hasOwned', type: 'eval', expression: "document.body.innerText.includes('已拥有')" }
    ],
    steps: [
      { type: 'assert', name: 'marketplace-loaded', expression: "document.body.innerText.includes('Marketplace')" },
      { type: 'apiRequest', name: 'purchases-before', path: '/api/marketplace/purchases?page=1&limit=100', method: 'GET', expectedStatus: 200 },
      { type: 'eval', name: 'click-purchase', expression: "(() => { const buttons = document.querySelectorAll('button'); for (const btn of buttons) { if ((btn.textContent || '').trim() === '购买') { btn.click(); return 'clicked'; } } return 'no-purchase-button'; })()" },
      { type: 'wait', name: 'wait-purchase-complete', ms: 3000 },
      { type: 'assert', name: 'purchase-success', expression: "document.body.innerText.includes('购买成功') || document.body.innerText.includes('已拥有')" },
      { type: 'apiRequest', name: 'purchases-after', path: '/api/marketplace/purchases?page=1&limit=100', method: 'GET', expectedStatus: 200, expectations: [{ name: 'purchases', path: 'items', operator: 'exists' }] },
      { type: 'reload', name: 'reload-marketplace' },
      { type: 'wait', name: 'wait-after-reload', ms: 2000 },
      { type: 'assert', name: 'owned-persists', expression: "document.body.innerText.includes('已拥有')" }
    ],
    expectations: [
      { name: 'balance', operator: 'decreased' },
      { name: 'hasOwned', operator: 'equals', value: true }
    ]
  },
  'login-basic': {
    description: '登录页基础可用性验证',
    targetUrl: '/login',
    steps: [
      { type: 'assert', name: 'login-form-visible', expression: "document.querySelector('form') !== null" },
      { type: 'assert', name: 'email-input-exists', expression: "document.querySelector('input[type=\"email\"]') !== null" },
      { type: 'assert', name: 'password-input-exists', expression: "document.querySelector('input[type=\"password\"]') !== null" },
      { type: 'assert', name: 'submit-button-exists', expression: "document.querySelector('button[type=\"submit\"]') !== null" }
    ]
  },
  'credits-balance': {
    description: '点数中心余额与交易记录验证',
    targetUrl: '/dashboard/credits',
    stateSources: [
      { name: 'balance', type: 'eval', expression: "JSON.parse(localStorage.getItem('validpilot-auth')||'{}')?.state?.creditsBalance || 0" }
    ],
    steps: [
      { type: 'assert', name: 'credits-page-loaded', expression: "document.body.innerText.includes('点数') || document.body.innerText.includes('Credits')" },
      { type: 'apiRequest', name: 'balance-api', path: '/api/credits/balance', method: 'GET', expectedStatus: 200, expectations: [{ name: 'balanceExists', path: 'balance', operator: 'exists' }] }
    ],
    expectations: [
      { name: 'balance', operator: 'exists' }
    ]
  },
  'shopping-cart': {
    description: '购物车添加/查看/删除完整流程验证',
    targetUrl: '/dashboard/marketplace',
    stateSources: [
      { name: 'cartCount', type: 'eval', expression: "parseInt(localStorage.getItem('cart-count')||'0')" }
    ],
    steps: [
      { type: 'assert', name: 'marketplace-loaded', expression: "document.body.innerText.includes('Marketplace')" },
      { type: 'eval', name: 'click-add-to-cart', expression: "(() => { const buttons = document.querySelectorAll('button'); for (const btn of buttons) { if ((btn.textContent || '').includes('加入购物车') || (btn.textContent || '').includes('Add to Cart')) { btn.click(); return 'added'; } } return 'no-cart-button'; })()" },
      { type: 'wait', name: 'wait-cart-update', ms: 1500 },
      { type: 'navigate', name: 'goto-cart', url: '/dashboard/cart' },
      { type: 'wait', name: 'wait-cart-page', ms: 2000 },
      { type: 'assert', name: 'cart-page-loaded', expression: "document.body.innerText.includes('购物车') || document.body.innerText.includes('Cart')" },
      { type: 'assert', name: 'cart-has-items', expression: "document.querySelectorAll('.cart-item, [data-testid=\"cart-item\"]').length > 0" },
      { type: 'apiRequest', name: 'cart-api', path: '/api/cart/items', method: 'GET', expectedStatus: 200, expectations: [{ name: 'itemsExists', path: 'items', operator: 'exists' }] },
      { type: 'eval', name: 'click-remove', expression: "(() => { const btn = document.querySelector('.remove-item, [data-testid=\"remove-item\"]'); if (btn) { btn.click(); return 'removed'; } return 'no-remove-button'; })()" },
      { type: 'wait', name: 'wait-remove-complete', ms: 1500 },
      { type: 'reload', name: 'reload-cart' },
      { type: 'wait', name: 'wait-after-reload', ms: 1500 },
      { type: 'assert', name: 'cart-updated', expression: "true" }
    ],
    expectations: [
      { name: 'cartCount', operator: 'exists' }
    ]
  },
  'register-flow': {
    description: '用户注册完整流程验证（含表单校验）',
    targetUrl: '/register',
    steps: [
      { type: 'assert', name: 'register-form-visible', expression: "document.querySelector('form') !== null" },
      { type: 'assert', name: 'username-input-exists', expression: "document.querySelector('input[name=\"username\"], input[type=\"text\"]') !== null" },
      { type: 'assert', name: 'email-input-exists', expression: "document.querySelector('input[type=\"email\"]') !== null" },
      { type: 'assert', name: 'password-input-exists', expression: "document.querySelector('input[type=\"password\"]') !== null" },
      { type: 'assert', name: 'submit-button-exists', expression: "document.querySelector('button[type=\"submit\"]') !== null" },
      { type: 'fill', name: 'fill-username', selector: 'input[name=\"username\"], input[type=\"text\"]', value: 'testuser_e2e' },
      { type: 'fill', name: 'fill-email', selector: 'input[type=\"email\"]', value: 'testuser_e2e@test.com' },
      { type: 'fill', name: 'fill-password', selector: 'input[type=\"password\"]', value: 'Test@12345' },
      { type: 'click', name: 'submit-register', selector: 'button[type=\"submit\"]' },
      { type: 'wait', name: 'wait-register-response', ms: 3000 },
      { type: 'assert', name: 'register-success', expression: "document.body.innerText.includes('注册成功') || document.body.innerText.includes('Register') && document.body.innerText.includes('success') || !document.querySelector('form')" }
    ]
  },
  'checkout-payment': {
    description: '结账支付流程验证（订单创建 + 支付确认）',
    targetUrl: '/dashboard/cart',
    stateSources: [
      { name: 'orderCount', type: 'eval', expression: "parseInt(localStorage.getItem('order-count')||'0')" }
    ],
    steps: [
      { type: 'assert', name: 'cart-loaded', expression: "document.body.innerText.includes('购物车') || document.body.innerText.includes('Cart')" },
      { type: 'assert', name: 'cart-has-items', expression: "document.querySelectorAll('.cart-item, [data-testid=\"cart-item\"]').length > 0" },
      { type: 'eval', name: 'click-checkout', expression: "(() => { const buttons = document.querySelectorAll('button'); for (const btn of buttons) { if ((btn.textContent || '').includes('结账') || (btn.textContent || '').includes('Checkout')) { btn.click(); return 'clicked'; } } return 'no-checkout-button'; })()" },
      { type: 'wait', name: 'wait-checkout-page', ms: 2000 },
      { type: 'assert', name: 'checkout-page-loaded', expression: "document.body.innerText.includes('支付') || document.body.innerText.includes('Payment') || document.body.innerText.includes('结账')" },
      { type: 'apiRequest', name: 'create-order', path: '/api/orders', method: 'POST', body: { source: 'cart' }, expectedStatus: [200, 201] },
      { type: 'eval', name: 'click-confirm-pay', expression: "(() => { const buttons = document.querySelectorAll('button'); for (const btn of buttons) { if ((btn.textContent || '').includes('确认支付') || (btn.textContent || '').includes('Confirm')) { btn.click(); return 'clicked'; } } return 'no-confirm-button'; })()" },
      { type: 'wait', name: 'wait-payment-complete', ms: 3000 },
      { type: 'assert', name: 'payment-success', expression: "document.body.innerText.includes('支付成功') || document.body.innerText.includes('success') || document.body.innerText.includes('订单已生成')" },
      { type: 'apiRequest', name: 'orders-list', path: '/api/orders?page=1&limit=10', method: 'GET', expectedStatus: 200, expectations: [{ name: 'ordersExists', path: 'items', operator: 'exists' }] }
    ],
    expectations: [
      { name: 'orderCount', operator: 'exists' }
    ]
  }
};

function loadChainTemplate(templateName, args = {}) {
  if (!templateName) return null;
  const template = BUILTIN_TEMPLATES[templateName];
  if (!template) return null;
  const merged = Object.assign({}, template, args);
  if (args.overrides && typeof args.overrides === 'object') {
    for (const [key, value] of Object.entries(args.overrides)) {
      merged[key] = value;
    }
  }
  return merged;
}

async function runChainSpecRun(target, args = {}) {
  const { filterNetwork, networkLogs, getUnifiedErrors, captureStepEvidence, redact, consoleLogs, pageErrors, resetRuntimeLogs } = _deps || {};
  let resolvedArgs = args;
  if (args.template) {
    const template = loadChainTemplate(args.template, args);
    if (template) resolvedArgs = template;
  }

  const runId = resolvedArgs.runId || resolvedArgs.name || `chain-${Date.now()}`;
  const steps = Array.isArray(resolvedArgs.steps) ? resolvedArgs.steps : [];
  const stateSources = Array.isArray(resolvedArgs.stateSources) ? resolvedArgs.stateSources : [];
  const expectations = Array.isArray(resolvedArgs.expectations) ? resolvedArgs.expectations : [];
  const failFast = resolvedArgs.failFast !== false;
  const captureEvidence = resolvedArgs.evidence === true;
  const startTime = Date.now();
  const startedAt = new Date().toISOString();
  const stepResults = [];
  const failures = [];
  let before = resolvedArgs.before || null;
  let after = null;
  const targetUrl = resolvedArgs.targetUrl;

  resetRuntimeLogs();

  if (targetUrl) {
    await target.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: resolvedArgs.timeout || 30000 });
    try { await target.waitForLoadState('networkidle', { timeout: 8000 }); } catch (_) { /* optional, ignore errors */ }
  }

  if (stateSources.length > 0 && resolvedArgs.captureBefore !== false) {
    before = await captureStateSnapshot(target, {
      label: `${runId}-before`,
      snapshotId: resolvedArgs.beforeSnapshotId || `${runId}-before`,
      sources: stateSources
    });
  }

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const stepCheckpoint = new Date().toISOString();
    let stepResult;
    try {
      stepResult = await runChainSpecStep(target, step, index);
      await target.waitForTimeout(Number(step.settleMs || resolvedArgs.settleMs || 300));
    } catch (error) {
      stepResult = {
        stepIndex: index,
        stepName: step.name || `${index + 1}-${step.type || step.action || 'step'}`,
        action: step.type || step.action,
        passed: false,
        duration: 0,
        error: error.message
      };
    }

    const stepConsoleErrors = filterBySince(consoleLogs, stepCheckpoint).filter(item => item.type === 'error');
    const stepPageErrors = filterBySince(pageErrors, stepCheckpoint);
    const stepNetworkRequests = filterNetwork(networkLogs, Object.assign({}, resolvedArgs.networkFilter || {}, { since: stepCheckpoint }));
    const stepNetworkErrors = stepNetworkRequests.filter(item => item.failed || item.status >= 400);

    stepResult.consoleErrors = stepConsoleErrors.map(e => redact(e));
    stepResult.pageErrors = stepPageErrors.map(e => redact(e));
    stepResult.networkErrors = stepNetworkErrors.map(e => redact(stripNetworkDetails(e)));
    stepResult.networkRequests = stepNetworkRequests.map(e => redact(stripNetworkDetails(e)));

    if (stepResult.passed && (stepConsoleErrors.length > 0 || stepPageErrors.length > 0 || stepNetworkErrors.length > 0) && resolvedArgs.failOnRuntimeError !== false) {
      stepResult.passed = false;
      stepResult.error = `步骤执行后发现运行时错误：console=${stepConsoleErrors.length}, pageError=${stepPageErrors.length}, network=${stepNetworkErrors.length}`;
    }

    if (!stepResult.passed) {
      if (resolvedArgs.evidenceOnFail !== false) {
        stepResult.evidence = await captureStepEvidence(target, `${runId}-${stepResult.stepName}-failed`, { screenshot: true, snapshot: true }).catch(error => ({ error: error.message }));
      }
      failures.push({
        stepIndex: stepResult.stepIndex,
        stepName: stepResult.stepName,
        action: stepResult.action,
        error: stepResult.error,
        consoleErrors: stepResult.consoleErrors,
        pageErrors: stepResult.pageErrors,
        networkErrors: stepResult.networkErrors
      });
      stepResults.push(redact(stepResult));
      if (failFast) break;
      continue;
    }

    if (captureEvidence || step.evidence === true) {
      stepResult.evidence = await captureStepEvidence(target, `${runId}-${stepResult.stepName}`, {
        screenshot: resolvedArgs.screenshot !== false,
        snapshot: resolvedArgs.snapshot !== false
      }).catch(error => ({ error: error.message }));
    }

    stepResults.push(redact(stepResult));
  }

  let stateDiff = null;
  if (stateSources.length > 0 && before) {
    after = await captureStateSnapshot(target, {
      label: `${runId}-after`,
      snapshotId: resolvedArgs.afterSnapshotId || `${runId}-after`,
      sources: stateSources
    });
    stateDiff = compareStateSnapshots(before, after, expectations);
    if (!stateDiff.passed) {
      failures.push({
        stepIndex: null,
        stepName: 'state_diff',
        action: 'stateCompare',
        error: '链路最终状态断言失败',
        stateDiff
      });
    }
  }

  const chainNetworkRequests = filterNetwork(networkLogs, Object.assign({}, resolvedArgs.networkFilter || {}, { since: startedAt }))
    .map(e => redact(stripNetworkDetails(e)));
  const runtimeErrors = getUnifiedErrors({ currentOnly: true, includeWarnings: resolvedArgs.includeWarnings === true });
  const finalEvidence = resolvedArgs.finalEvidence === true
    ? await captureStepEvidence(target, `${runId}-final`, { screenshot: resolvedArgs.screenshot !== false, snapshot: resolvedArgs.snapshot !== false }).catch(error => ({ error: error.message }))
    : null;

  return redact({
    tool: 'chain_spec_run',
    runId,
    passed: failures.length === 0,
    totalSteps: steps.length,
    passedSteps: stepResults.filter(step => step.passed).length,
    failedSteps: stepResults.filter(step => !step.passed).length,
    duration: Date.now() - startTime,
    url: target.url(),
    before,
    after,
    stateDiff,
    steps: stepResults,
    failures,
    runtimeErrors,
    networkRequests: chainNetworkRequests,
    evidence: finalEvidence
  });
}

async function runTraceCorrelationCheck(args = {}, ctx = null) {
  const { currentCheckpoint, filterNetwork, networkLogs, fetchBackendLogs, findTraceId } = ctx || _deps || {};
  const since = args.since || currentCheckpoint;
  const urlContains = args.urlContains;
  const backendLogPath = args.backendLogPath;
  const useSshBackend = args.useSshBackend === true;

  const filteredNetwork = filterNetwork(networkLogs, { since, urlContains });

  const tracedRequests = [];
  const untracedRequests = [];
  const traceIdMap = new Map();

  for (const entry of filteredNetwork) {
    let traceId = entry.traceId;
    if (!traceId && typeof findTraceId === 'function') {
      traceId = findTraceId(entry.requestHeaders)?.traceId || findTraceId(entry.responseHeaders)?.traceId;
    }
    const reqSummary = { url: entry.url, status: entry.status, method: entry.method, timestamp: entry.timestamp };
    if (traceId) {
      tracedRequests.push(Object.assign({ traceId }, reqSummary));
      if (!traceIdMap.has(traceId)) traceIdMap.set(traceId, []);
      traceIdMap.get(traceId).push(entry.url);
    } else {
      untracedRequests.push(reqSummary);
    }
  }

  let backendMatches = [];
  let backendChecked = false;

  if (backendLogPath) {
    backendChecked = true;
    const resolved = path.resolve(backendLogPath);
    if (fs.existsSync(resolved)) {
      const backendLogContent = fs.readFileSync(resolved, 'utf8');
      for (const [traceId, urls] of traceIdMap) {
        backendMatches.push({ traceId, found: backendLogContent.includes(traceId), requestCount: urls.length });
      }
    } else {
      backendMatches.push({ error: `后端日志文件不存在：${resolved}` });
    }
  } else if (useSshBackend && typeof fetchBackendLogs === 'function') {
    backendChecked = true;
    for (const [traceId, urls] of traceIdMap) {
      try {
        const result = await fetchBackendLogs({ traceId, lines: 5 });
        const found = result.logs && result.logs.length > 0;
        backendMatches.push({ traceId, found, requestCount: urls.length, services: result.logs?.map(l => l.service) || [] });
      } catch (e) {
        backendMatches.push({ traceId, found: false, requestCount: urls.length, error: e.message });
      }
    }
  }

  const totalRequests = tracedRequests.length + untracedRequests.length;
  const traceCoverage = totalRequests > 0 ? tracedRequests.length / totalRequests : 0;
  const backendMatched = backendMatches.filter(m => m.found).length;
  const backendCorrelation = backendMatches.length > 0 ? backendMatched / backendMatches.length : null;

  return {
    tool: 'trace_correlation_check',
    since,
    totalRequests,
    tracedRequests: tracedRequests.length,
    untracedRequests: untracedRequests.length,
    uniqueTraceIds: traceIdMap.size,
    traceCoverage: Math.round(traceCoverage * 100) + '%',
    backendChecked,
    backendMatched,
    backendCorrelation: backendCorrelation !== null ? Math.round(backendCorrelation * 100) + '%' : null,
    traceIds: Array.from(traceIdMap.entries()).map(([traceId, urls]) => ({
      traceId,
      requestCount: urls.length,
      sampleUrls: urls.slice(0, 3),
      backendMatched: backendMatches.find(m => m.traceId === traceId)?.found ?? null
    })),
    untracedSample: untracedRequests.slice(0, 10),
    score: {
      traceCoverage: Math.round(traceCoverage * 100),
      backendCorrelation: backendCorrelation !== null ? Math.round(backendCorrelation * 100) : 0,
      overall: backendCorrelation !== null
        ? Math.round((traceCoverage * 50 + backendCorrelation * 50))
        : Math.round(traceCoverage * 100)
    }
  };
}

function runChainScoreReport(args = {}) {
  const chainResult = args.chainResult || args.result || args;

  const totalSteps = chainResult.totalSteps || 0;
  const passedSteps = chainResult.passedSteps || 0;
  const failedSteps = chainResult.failedSteps || 0;
  const steps = Array.isArray(chainResult.steps) ? chainResult.steps : [];
  const failures = Array.isArray(chainResult.failures) ? chainResult.failures : [];
  const runtimeErrors = chainResult.runtimeErrors || {};
  const stateDiff = chainResult.stateDiff || {};
  const networkRequests = Array.isArray(chainResult.networkRequests) ? chainResult.networkRequests : [];

  const functionalScore = totalSteps > 0 ? Math.round((passedSteps / totalSteps) * 100) : 0;

  const apiSteps = steps.filter(s => s.action === 'apiRequest' || s.action === 'api');
  const apiSuccess = apiSteps.filter(s => s.passed).length;
  const networkSuccess = networkRequests.filter(r => r.status && r.status < 400).length;
  const networkTotal = networkRequests.length;
  const technicalScore = networkTotal > 0
    ? Math.round((networkSuccess / networkTotal) * 100)
    : (apiSteps.length > 0 ? Math.round((apiSuccess / apiSteps.length) * 100) : 100);

  const stateChecks = stateDiff.checks || [];
  const statePassed = stateChecks.filter(c => c.passed).length;
  const consistencyScore = stateChecks.length > 0 ? Math.round((statePassed / stateChecks.length) * 100) : 100;

  const contractChecks = [];
  for (const step of apiSteps) {
    if (step.validation && Array.isArray(step.validation.checks)) {
      contractChecks.push(...step.validation.checks);
    }
  }
  const contractPassed = contractChecks.filter(c => c.passed).length;
  const contractScore = contractChecks.length > 0 ? Math.round((contractPassed / contractChecks.length) * 100) : 100;

  const errorSummary = runtimeErrors.summary || {};
  const observabilityScore = Math.max(0, 100
    - (errorSummary.severity?.critical || 0) * 25
    - (errorSummary.severity?.high || 0) * 10
    - (errorSummary.severity?.medium || 0) * 5
  );

  const overall = Math.round(
    functionalScore * 0.30 +
    technicalScore * 0.25 +
    consistencyScore * 0.20 +
    contractScore * 0.15 +
    observabilityScore * 0.10
  );

  return {
    tool: 'chain_score_report',
    runId: chainResult.runId || args.runId || null,
    scores: {
      functional: { score: functionalScore, passedSteps, totalSteps, failedSteps },
      technical: { score: technicalScore, networkSuccess, networkTotal, apiSteps: apiSteps.length, apiSuccess },
      consistency: { score: consistencyScore, stateChecks: stateChecks.length, statePassed },
      contract: { score: contractScore, contractChecks: contractChecks.length, contractPassed },
      observability: { score: observabilityScore, totalErrors: errorSummary.total || 0, severity: errorSummary.severity || {} }
    },
    overall,
    grade: overall >= 90 ? 'A' : overall >= 80 ? 'B' : overall >= 70 ? 'C' : overall >= 60 ? 'D' : 'F',
    summary: {
      passed: failures.length === 0,
      totalSteps,
      passedSteps,
      failedSteps,
      duration: chainResult.duration || 0,
      url: chainResult.url || null
    }
  };
}

function inferType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function extractSchema(value, depth = 0, maxDepth = 4) {
  const type = inferType(value);
  const schema = { type };

  if (type === 'object' && value !== null && depth < maxDepth) {
    schema.properties = {};
    schema.required = [];
    for (const [key, val] of Object.entries(value)) {
      schema.properties[key] = extractSchema(val, depth + 1, maxDepth);
      if (val !== null && val !== undefined) schema.required.push(key);
    }
  } else if (type === 'array' && depth < maxDepth && value.length > 0) {
    schema.items = extractSchema(value[0], depth + 1, maxDepth);
    schema.minItems = value.length;
  }

  return schema;
}

async function discoverEndpoints(target, urlContains) {
  const { currentCheckpoint, filterNetwork, networkLogs } = _deps || {};
  const endpoints = [];
  const seenPaths = new Set();
  const since = currentCheckpoint;
  const networkEntries = filterNetwork(networkLogs, { since, urlContains });
  for (const entry of networkEntries) {
    if (!entry.url || !entry.status || entry.status >= 500) continue;
    try {
      const urlObj = new URL(entry.url);
      const pathname = urlObj.pathname;
      if (!pathname.startsWith('/api/') && !pathname.startsWith('/v1/') && !pathname.startsWith('/v2/')) continue;
      const pathKey = `${entry.method || 'GET'}:${pathname}`;
      if (seenPaths.has(pathKey)) continue;
      seenPaths.add(pathKey);
      endpoints.push({ path: pathname, method: entry.method || 'GET' });
    } catch (_) { /* optional, ignore errors */ }
  }
  return endpoints;
}

async function runContractGuard(args = {}) {
  const { ensurePage, currentCheckpoint, filterNetwork, networkLogs } = _deps || {};
  const { target } = args.target ? { target: args.target } : await ensurePage(args);
  let endpoints = Array.isArray(args.endpoints) ? args.endpoints : [];
  const fromNetwork = args.fromNetwork !== false;
  const urlContains = args.urlContains;
  const autoDiscover = args.autoDiscover === true;

  const contracts = [];

  if (autoDiscover && endpoints.length === 0) {
    const discoveredEndpoints = await discoverEndpoints(target, urlContains);
    endpoints = discoveredEndpoints;
  }

  if (endpoints.length > 0) {
    for (const endpoint of endpoints) {
      try {
        const apiResult = await target.evaluate(async ep => {
          const requestUrl = ep.url || new URL(ep.path || '/', location.origin).toString();
          const authRaw = (() => { try { return localStorage.getItem('validpilot-auth'); } catch (_) { return null; } })();
          let token = null;
          try { token = authRaw ? JSON.parse(authRaw)?.state?.accessToken : null; } catch (_) { /* optional, ignore errors */ }
          const headers = Object.assign({ 'content-type': 'application/json' }, ep.headers || {});
          if (token && !headers.Authorization && !headers.authorization) headers.Authorization = 'Bearer ' + token;
          const options = { method: ep.method || 'GET', headers, credentials: 'include' };
          if (ep.body != null) options.body = typeof ep.body === 'string' ? ep.body : JSON.stringify(ep.body);
          const response = await fetch(requestUrl, options);
          const text = await response.text();
          let data = null;
          try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
          return { status: response.status, ok: response.ok, url: response.url, data, contentType: response.headers.get('content-type') };
        }, endpoint);

        const schema = apiResult.data && typeof apiResult.data === 'object' ? extractSchema(apiResult.data) : null;
        contracts.push({
          endpoint: endpoint.path || endpoint.url || apiResult.url,
          method: endpoint.method || 'GET',
          status: apiResult.status,
          contentType: apiResult.contentType,
          schema,
          sampleSize: Array.isArray(apiResult.data?.items) ? apiResult.data.items.length : undefined,
          generatedAt: new Date().toISOString(),
          source: 'direct-fetch'
        });
      } catch (error) {
        contracts.push({ endpoint: endpoint.path || endpoint.url, error: error.message, source: 'direct-fetch' });
      }
    }
  }

  if (fromNetwork) {
    const since = args.since || currentCheckpoint;
    const networkEntries = filterNetwork(networkLogs, { since, urlContains })
      .filter(item => item.status && item.status < 500 && !item.failed);

    const seenEndpoints = new Set();
    for (const entry of networkEntries) {
      const urlObj = new URL(entry.url);
      const pathKey = `${entry.method || 'GET'}:${urlObj.pathname}`;
      if (seenEndpoints.has(pathKey)) continue;
      seenEndpoints.add(pathKey);

      const responseBody = entry.responseBody;
      if (!responseBody || typeof responseBody !== 'string' || !responseBody.trim().startsWith('{')) continue;

      try {
        const data = JSON.parse(responseBody);
        const schema = extractSchema(data);
        contracts.push({
          endpoint: urlObj.pathname,
          method: entry.method || 'GET',
          status: entry.status,
          schema,
          sampleSize: Array.isArray(data?.items) ? data.items.length : undefined,
          generatedAt: new Date().toISOString(),
          source: 'network-capture'
        });
      } catch (_) { /* optional, ignore errors */ }
    }
  }

  const validContracts = contracts.filter(c => c.schema);
  const errors = contracts.filter(c => c.error);

  let driftResults = null;
  if (args.compareBaseline === true || args.baseline === true) {
    driftResults = compareContractsWithBaseline(validContracts, args.baselineName || 'default');
  }
  if (args.saveBaseline === true) {
    saveContractBaseline(validContracts, args.baselineName || 'default');
  }

  return {
    tool: 'contract_guard',
    totalContracts: validContracts.length,
    errorCount: errors.length,
    contracts: validContracts,
    errors,
    drift: driftResults,
    baselineSaved: args.saveBaseline === true,
    autoDiscovered: autoDiscover ? endpoints.length : 0,
    summary: {
      endpointsCovered: validContracts.length,
      typesObserved: [...new Set(validContracts.map(c => c.method))].sort(),
      driftDetected: driftResults ? driftResults.hasDrift : false,
      generatedAt: new Date().toISOString()
    }
  };
}

function getContractBaselineDir() {
  const dir = path.join(__dirname, '..', 'contracts');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getContractBaselinePath(baselineName) {
  const safe = String(baselineName || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(getContractBaselineDir(), `baseline-${safe}.json`);
}

function saveContractBaseline(contracts, baselineName = 'default') {
  const baseline = {
    name: baselineName,
    savedAt: new Date().toISOString(),
    contracts: contracts.map(c => ({
      endpoint: c.endpoint,
      method: c.method,
      status: c.status,
      schema: c.schema
    }))
  };
  const filePath = getContractBaselinePath(baselineName);
  fs.writeFileSync(filePath, JSON.stringify(baseline, null, 2), 'utf8');
  return { saved: true, filePath, contractCount: contracts.length };
}

function loadContractBaseline(baselineName = 'default') {
  const filePath = getContractBaselinePath(baselineName);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function listContractBaselines() {
  const dir = getContractBaselineDir();
  const files = fs.readdirSync(dir).filter(f => f.startsWith('baseline-') && f.endsWith('.json'));
  return files.map(f => {
    const name = f.replace(/^baseline-/, '').replace(/\.json$/, '');
    try {
      const content = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      return { name, savedAt: content.savedAt, contractCount: content.contracts ? content.contracts.length : 0 };
    } catch (_) {
      return { name, savedAt: null, contractCount: 0 };
    }
  });
}

function compareSchemas(current, baseline) {
  const drifts = [];
  if (!current || !baseline) {
    if (current || baseline) drifts.push({ type: 'schema_missing', current: !!current, baseline: !!baseline });
    return drifts;
  }
  if (current.type !== baseline.type) {
    drifts.push({ type: 'type_changed', path: '', current: current.type, baseline: baseline.type });
    return drifts;
  }
  const currentProps = current.properties || {};
  const baselineProps = baseline.properties || {};
  const allKeys = new Set([...Object.keys(currentProps), ...Object.keys(baselineProps)]);
  for (const key of allKeys) {
    if (!(key in baselineProps)) drifts.push({ type: 'field_added', path: key });
    else if (!(key in currentProps)) drifts.push({ type: 'field_removed', path: key });
    else {
      const currentRequired = (current.required || []).includes(key);
      const baselineRequired = (baseline.required || []).includes(key);
      if (currentRequired !== baselineRequired) {
        drifts.push({ type: 'required_changed', path: key, current: currentRequired, baseline: baselineRequired });
      }
      if (JSON.stringify(currentProps[key]) !== JSON.stringify(baselineProps[key])) {
        const nestedDrifts = compareSchemas(currentProps[key], baselineProps[key]);
        for (const d of nestedDrifts) {
          drifts.push({ type: d.type, path: key + (d.path ? '.' + d.path : ''), current: d.current, baseline: d.baseline });
        }
      }
    }
  }
  if (current.items && baseline.items) {
    const itemDrifts = compareSchemas(current.items, baseline.items);
    for (const d of itemDrifts) {
      drifts.push({ type: d.type, path: '[items]' + (d.path ? '.' + d.path : ''), current: d.current, baseline: d.baseline });
    }
  } else if (current.items && !baseline.items) {
    drifts.push({ type: 'items_added', path: '[items]' });
  } else if (!current.items && baseline.items) {
    drifts.push({ type: 'items_removed', path: '[items]' });
  }
  return drifts;
}

function compareContractsWithBaseline(contracts, baselineName = 'default') {
  const baseline = loadContractBaseline(baselineName);
  if (!baseline) {
    return { hasDrift: false, driftCount: 0, drifts: [], message: `Baseline '${baselineName}' 不存在，请先 saveBaseline` };
  }
  const baselineMap = new Map();
  for (const c of baseline.contracts) baselineMap.set(`${c.method}:${c.endpoint}`, c);
  const currentMap = new Map();
  for (const c of contracts) currentMap.set(`${c.method}:${c.endpoint}`, c);

  const drifts = [];
  for (const [key, current] of currentMap.entries()) {
    const base = baselineMap.get(key);
    if (!base) {
      drifts.push({ endpoint: current.endpoint, method: current.method, type: 'endpoint_added', message: '新增端点（基线中不存在）' });
      continue;
    }
    const schemaDrifts = compareSchemas(current.schema, base.schema);
    for (const d of schemaDrifts) {
      drifts.push({ endpoint: current.endpoint, method: current.method, ...d });
    }
  }
  for (const [key, base] of baselineMap.entries()) {
    if (!currentMap.has(key)) {
      drifts.push({ endpoint: base.endpoint, method: base.method, type: 'endpoint_removed', message: '端点已移除（当前不存在）' });
    }
  }
  return {
    hasDrift: drifts.length > 0,
    driftCount: drifts.length,
    drifts,
    baselineName,
    baselineSavedAt: baseline.savedAt
  };
}

function runContractBaseline(args = {}) {
  const action = args.action || 'list';
  if (action === 'list') {
    return { tool: 'contract_baseline', action, baselines: listContractBaselines() };
  }
  if (action === 'save') {
    return { tool: 'contract_baseline', action, result: saveContractBaseline(args.contracts || [], args.name || 'default') };
  }
  if (action === 'load') {
    return { tool: 'contract_baseline', action, baseline: loadContractBaseline(args.name || 'default') };
  }
  if (action === 'compare') {
    return { tool: 'contract_baseline', action, result: compareContractsWithBaseline(args.contracts || [], args.name || 'default') };
  }
  if (action === 'delete') {
    const filePath = getContractBaselinePath(args.name || 'default');
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { tool: 'contract_baseline', action, deleted: true, name: args.name };
    }
    return { tool: 'contract_baseline', action, deleted: false, message: 'Baseline 不存在' };
  }
  return { tool: 'contract_baseline', error: '未知 action: ' + action };
}

function runValidationCompliance(args = {}) {
  const functions = Array.isArray(args.functions) ? args.functions : [];
  const strictMode = args.strictMode !== false;
  const sessionLogs = args.sessionLogs || {};
  const requiredTools = Array.isArray(args.requiredTools) ? args.requiredTools : [];

  const complianceResults = [];
  let totalFunctions = functions.length;
  let compliantCount = 0;
  let nonCompliantCount = 0;
  let partialCompliantCount = 0;

  const requiredStepsForDataSubmit = ['入口可达', '操作可行', '请求正确', '响应正常', '状态更新'];

  for (const func of functions) {
    const funcName = func.name || '未命名功能';
    const funcType = func.type || '未分类';
    const steps = Array.isArray(func.steps) ? func.steps : [];

    const stepStatusMap = new Map();
    const evidenceCount = steps.filter(s => s.evidence).length;
    const executedSteps = steps.filter(s => s.status !== 'not_executed' && s.status !== 'skipped');
    const passedSteps = steps.filter(s => s.status === 'passed');
    const failedSteps = steps.filter(s => s.status === 'failed');

    for (const step of steps) {
      stepStatusMap.set(step.stepType, step.status);
    }

    let complianceStatus = 'COMPLIANT';
    const violations = [];

    if (strictMode && funcType === '数据提交类') {
      const missingSteps = requiredStepsForDataSubmit.filter(stepType => !stepStatusMap.has(stepType));
      const skippedSteps = requiredStepsForDataSubmit.filter(stepType => stepStatusMap.get(stepType) === 'skipped');
      const notExecutedSteps = requiredStepsForDataSubmit.filter(stepType => stepStatusMap.get(stepType) === 'not_executed');

      if (missingSteps.length > 0) {
        violations.push({
          errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
          errorType: '跳过步骤',
          message: `缺少必需的验证步骤：${missingSteps.join(', ')}`,
          requiredActions: [`补充缺失的步骤：${missingSteps.join(', ')}`, '确保完成完整5步链路验证']
        });
        complianceStatus = 'NON-COMPLIANT';
      }

      if (skippedSteps.length > 0) {
        violations.push({
          errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
          errorType: '跳过步骤',
          message: `跳过了必需的验证步骤：${skippedSteps.join(', ')}`,
          requiredActions: ['重新执行跳过的步骤', '确保完成完整5步链路验证']
        });
        complianceStatus = 'NON-COMPLIANT';
      }

      if (notExecutedSteps.length > 0) {
        violations.push({
          errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
          errorType: '跳过步骤',
          message: `必需的验证步骤未执行：${notExecutedSteps.join(', ')}`,
          requiredActions: ['执行未完成的步骤', '确保完成完整5步链路验证']
        });
        complianceStatus = 'NON-COMPLIANT';
      }
    }

    if (evidenceCount < executedSteps.length) {
      violations.push({
        errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
        errorType: '证据不全',
        message: `部分步骤缺少验证证据（${evidenceCount}/${executedSteps.length}）`,
        requiredActions: ['补充缺失的证据（截图、日志等）']
      });
      if (complianceStatus === 'COMPLIANT') {
        complianceStatus = 'PARTIAL';
      }
    }

    // 工具可用性检查
    if (requiredTools.length > 0) {
      const sessionTools = Array.isArray(sessionLogs.toolCalls) ? sessionLogs.toolCalls : [];
      const missingTools = requiredTools.filter(tool => !sessionTools.includes(tool));

      if (missingTools.length > 0) {
        violations.push({
          errorCode: 'TOOL_MISSING',
          errorType: '工具缺失',
          message: `本次验证未使用以下必需工具：${missingTools.join(', ')}。必须使用这些工具才能完成完整的功能链路闭环验证。`,
          requiredActions: [
            `调用缺失的工具：${missingTools.join(', ')}`,
            '确保所有必需工具都已加载到 MCP 服务器中',
            '重新执行验证并包含所有必需工具'
          ]
        });
        if (complianceStatus === 'COMPLIANT') {
          complianceStatus = 'NON-COMPLIANT';
        }
      }
    }

    // 截图证据二次分析检查
    const stepsWithScreenshot = steps.filter(s =>
      s.evidence && (s.evidence.includes('.png') || s.evidence.toLowerCase().includes('screenshot'))
    );
    const stepsWithAnalysis = steps.filter(s =>
      s.screenshotValidation || s.evidenceValidated
    );

    if (stepsWithScreenshot.length > 0 && stepsWithAnalysis.length < stepsWithScreenshot.length) {
      const unanalyzedCount = stepsWithScreenshot.length - stepsWithAnalysis.length;
      violations.push({
        errorCode: 'SCREENSHOT_NOT_ANALYZED',
        errorType: '截图未验证',
        message: `${unanalyzedCount} 张截图未经过二次分析验证。截图必须经过 analyzeScreenshotContent 分析（URL/标题/内容校验）才能作为有效证据。`,
        requiredActions: [
          `对 ${unanalyzedCount} 张截图执行二次分析验证`,
          '使用 browser_screenshot 时确保开启内容分析',
          '确保截图结果包含 screenshot_validation 字段'
        ]
      });
      if (complianceStatus === 'COMPLIANT') {
        complianceStatus = 'PARTIAL';
      }
    }

    // 截图证据二次分析校验
    const screenshotSteps = steps.filter(s =>
      s.evidence && (s.evidence.includes('.png') || s.screenshotValidation || s.evidenceValidated)
    );
    const validatedScreenshots = steps.filter(s =>
      s.screenshotValidation && s.screenshotValidation.status === 'VALID'
    );
    const invalidScreenshots = steps.filter(s =>
      s.screenshotValidation && s.screenshotValidation.status === 'INVALID'
    );

    if (screenshotSteps.length > 0 && validatedScreenshots.length < screenshotSteps.length) {
      const unvalidated = screenshotSteps.length - validatedScreenshots.length;
      violations.push({
        errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
        errorType: '截图未验证',
        message: `${unvalidated} 张截图未经过二次分析验证或验证未通过。截图必须经过内容分析（URL/标题/内容校验）才能作为有效证据。`,
        requiredActions: ['对截图进行二次分析验证', '确保截图内容与目标功能一致', '丢弃无效截图并重新截取']
      });
      if (complianceStatus === 'COMPLIANT') {
        complianceStatus = 'PARTIAL';
      }
    }

    if (invalidScreenshots.length > 0) {
      violations.push({
        errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
        errorType: '截图验证失败',
        message: `${invalidScreenshots.length} 张截图二次分析未通过（URL不匹配/标题不匹配/空白页/内容不匹配），证据无效。`,
        requiredActions: ['丢弃无效截图', '定位截图来源错误原因', '重新在正确页面截取并验证']
      });
      if (complianceStatus === 'COMPLIANT') {
        complianceStatus = 'NON-COMPLIANT';
      }
    }

    if (failedSteps.length > 0) {
      violations.push({
        errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
        errorType: '步骤失败',
        message: `${failedSteps.length} 个步骤验证失败`,
        requiredActions: ['修复失败的步骤', '重新验证']
      });
      complianceStatus = 'NON-COMPLIANT';
    }

    if (complianceStatus === 'COMPLIANT') {
      compliantCount += 1;
    } else if (complianceStatus === 'NON-COMPLIANT') {
      nonCompliantCount += 1;
    } else {
      partialCompliantCount += 1;
    }

    complianceResults.push({
      functionName: funcName,
      functionType: funcType,
      complianceStatus,
      totalSteps: steps.length,
      executedSteps: executedSteps.length,
      passedSteps: passedSteps.length,
      failedSteps: failedSteps.length,
      evidenceCount,
      violations,
      steps
    });
  }

  const overallStatus = nonCompliantCount > 0 ? 'INVALID' : (partialCompliantCount > 0 ? 'PARTIAL' : 'VALID');

  return {
    overallStatus,
    totalFunctions,
    compliantCount,
    nonCompliantCount,
    partialCompliantCount,
    complianceResults,
    toolUsageSummary: {
      requiredTools: requiredTools,
      usedTools: sessionLogs.toolCalls || [],
      missingTools: requiredTools.filter(tool => !(sessionLogs.toolCalls || []).includes(tool)),
      allToolsAvailable: requiredTools.length === 0 ? null :
        requiredTools.every(tool => (sessionLogs.toolCalls || []).includes(tool))
    },
    timestamp: new Date().toISOString(),
    isEnforcementViolation: nonCompliantCount > 0
  };
}

module.exports = { tools, handle, runTraceCorrelationCheck };
