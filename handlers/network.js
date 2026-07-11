'use strict';

// Handler: network
// Extracted from server.js callTool switch statements
const { mcpError, mcpParamMissing } = require('../core/mcp-error');

const tools = [
  "browser_network",
  "browser_network_detail",
  "browser_console",
  "browser_errors",
  "browser_errors_clear",
  "browser_storage",
  "browser_cookies"
];

async function handle(name, args, deps) {

  // === Destructure deps into local scope (replacing globalThis bridge) ===
  let { page, browser, browserSessionId, consoleLogs, networkLogs, pageErrors, currentCheckpoint, eventCheckpoint, lastAction, sessions, activeSessionName, sessionCounter, traceLogs, traceActive, currentTraceName, backendProbeResults, instrumentationEnabled, imageErrors, lastImageErrorCheckpoint, validationResults, lastQualityChecks, lastValidationRun, requestStartTimes, stateManager } = deps;
  const { MAX_SESSIONS, SCREENSHOT_DIR, HAR_DIR, VISUAL_DIR, VISUAL_BASELINE_DIR, VISUAL_ACTUAL_DIR, VISUAL_DIFF_DIR, VALIDATIONS_DIR, REPORT_DIR, LOG_FILE, PROJECT_ROOT, TOOLS_DIR, logger, ensurePage, text, log, resetRuntimeLogs, getPageLinks, postActionErrorCheck, probeKnownEndpoints, getUnifiedErrors, closeBrowserSession, listBrowserSessions, filterNetwork, filterNetworkDetails, getStorageSnapshot, buildDebugReport, captureStepEvidence, waitForCondition, assertPage, runFlow, installInstrumentation, getBrowserEvents, clearBrowserEvents, startTrace, stopTrace, getArtifacts, clearArtifacts, ensureArtifactsDir, getBackendProbeEndpoints, isCloudApiProbeTarget, screenshotWithRedaction, safeArtifactName, analyzeScreenshotForErrors, exportHar, runFullAudit, visualBaseline, visualCompare, visualReport, runA11yCheck, runPerformanceCheck, runLighthouseAudit, findElement, findPage, suggestLocator, validateLocator, mcpHealthCheck, projectAudit, mcpSelfTest, runValidationCheck, runValidationPlan, runValidationElement, runValidationFlow, buildValidationReport, exportValidationReport, runValidationQuickRun, runDeployVerify, investigateDebug, runBrowserFullRegression, traverseMenu, fetchBackendLogs, buildTraceChain, detectSilentFailures, redact, redactString, isSensitiveKey, trimTraceLogs, genSpanId, genTraceId, browserOperator, evidenceCollector, deepInteractor, errorAggregator, path, fs, execSync, callTool } = deps;
  try {
  // ====== browser_network ======
  if (name === 'browser_network') {
    const records = filterNetwork(networkLogs, args);
    const includeDetails = args.includeDetails === true;
    const processed = records.map(item => {
      const base = redact(item);
      if (!includeDetails) {
        delete base.requestBody;
        delete base.responseBody;
        delete base.requestHeaders;
        delete base.responseHeaders;
        return base;
      }
      const method = (item.method || '').toUpperCase();
      const hasRequestBody = method === 'POST' || method === 'PUT' || method === 'PATCH';
      if (!hasRequestBody) {
        delete base.requestBody;
      }
      if (base.responseBody && base.responseBody.length > 500) {
        base.responseBody = base.responseBody.slice(0, 500);
      }
      return base;
    });
    const errors = processed.filter(r => r.status >= 400);
    const slow = processed.filter(r => r.duration && r.duration > 3000);
    const resultData = {
      total: processed.length,
      errors: errors.length,
      slowRequests: slow.length,
      records: processed.slice(0, args.limit || 50),
      nextSteps: errors.length > 0 ? [
        '调用 browser_network_detail 查看失败请求详情',
        '调用 browser_errors 查看控制台错误',
        '调用 browser_counterfactual_analyze 分析网络错误根因',
        '调用 browser_diagnose 诊断页面问题'
      ] : slow.length > 0 ? [
        '调用 browser_performance_check 检查页面性能',
        '调用 browser_network_detail 查看慢请求详情',
        '调用 browser_diagnose 分析性能瓶颈'
      ] : [
        '调用 browser_screenshot 截图留存证据',
        '调用 validation_run 运行完整验证流程'
      ],
      suggestions: errors.length > 0 ? [
        { type: 'fix', tool: 'browser_network_detail', reason: '查看失败请求的详细信息' },
        { type: 'fix', tool: 'browser_counterfactual_analyze', reason: '分析网络错误是否是测试失败的根因' }
      ] : [
        { type: 'next', tool: 'browser_screenshot', reason: '网络正常，截图留存证据' }
      ],
      paidUpgradeHint: '需要网络请求拦截和修改、Mock API 响应、性能瓶颈智能分析？升级到 Pro 版本获取高级网络调试能力。'
    };
    return text(JSON.stringify(resultData, null, 2));
  }

  // ====== browser_network_detail ======
  if (name === 'browser_network_detail') {
  return text(JSON.stringify({
    ...filterNetworkDetails(args),
    nextSteps: ['使用 browser_errors 查看聚合错误', '使用 browser_performance_check 分析性能'],
    suggestions: [{ type: 'next', tool: 'browser_errors', reason: '查看聚合错误信息' }],
    paidUpgradeHint: '需要网络请求拦截和修改、Mock API 响应、性能瓶颈智能分析？升级到 Pro 版本获取高级网络调试能力。'
  }, null, 2));
  }

  // ====== browser_console ======
  if (name === 'browser_console') {
const level = args.level && args.level !== 'all' ? args.level : null;
    const filtered = level ? consoleLogs.filter(item => item.type === level) : consoleLogs;
    const limited = (args.limit ? filtered.slice(-args.limit) : filtered.slice(-50));
    const logs = redact(limited);
    return text(JSON.stringify({
      logs,
      count: logs.length,
      nextSteps: logs.length > 0 ? [
        '使用 browser_errors 查看聚合错误信息',
        '使用 browser_smoke_test 执行冒烟测试'
      ] : [
        '使用 browser_screenshot 截图留存证据'
      ],
      paidUpgradeHint: '需要 AI 自动分析控制台日志模式、关联错误与操作步骤、生成修复建议？升级到 Pro 版本获取智能日志分析能力。'
    }, null, 2));
  }

  // ====== browser_errors ======
  if (name === 'browser_errors') {
    const result = getUnifiedErrors(args);

    // 从 Playwright page 实时获取最新的 console 错误和 pageerror
    if (page && !page.isClosed()) {
      try {
        const freshErrors = await page.evaluate((sinceArg) => {
          const fresh = { consoleErrors: [], pageErrors: [] };
          const now = new Date().toISOString();
          // 读取注入脚本收集的事件
          if (window.__mcpEvents && Array.isArray(window.__mcpEvents)) {
            window.__mcpEvents.forEach(e => {
              if (e.type === 'console' && e.level === 'error') {
                fresh.consoleErrors.push({
                  source: 'console',
                  type: 'error',
                  text: (e.args ? e.args.join(' ') : '').slice(0, 500),
                  location: e.location || null,
                  timestamp: e.timestamp || now
                });
              } else if (e.type === 'window_error' || e.type === 'unhandledrejection') {
                fresh.pageErrors.push({
                  source: 'pageerror',
                  type: 'error',
                  text: (e.message || e.reason || '').slice(0, 800),
                  stack: e.stack || null,
                  timestamp: e.timestamp || now
                });
              }
            });
          }
          return fresh;
        }, args.since || null).catch(() => ({ consoleErrors: [], pageErrors: [] }));

        // 按 since/currentOnly 过滤实时错误
        let filterSince = 0;
        if (args.since) {
          filterSince = new Date(args.since).getTime();
        } else if (args.currentOnly !== false) {
          filterSince = new Date(result.checkpoint || 0).getTime();
        }

        const filterByTime = items => items.filter(e => {
          const t = new Date(e.timestamp || 0).getTime();
          return !filterSince || t >= filterSince;
        });

        const freshConsole = filterByTime(freshErrors.consoleErrors);
        const freshPage = filterByTime(freshErrors.pageErrors);

        // 合并去重辅助函数
        const makeKey = e => `${e.timestamp}|${e.text}`;

        const mergeUnique = (existing, freshItems) => {
          const keys = new Set(existing.map(makeKey));
          const added = [];
          freshItems.forEach(item => {
            const k = makeKey(item);
            if (!keys.has(k)) {
              added.push(item);
              keys.add(k);
            }
          });
          return added;
        };

        const newConsole = mergeUnique(result.consoleErrors, freshConsole);
        const newPage = mergeUnique(result.pageErrors, freshPage);

        if (newConsole.length > 0 || newPage.length > 0) {
          // 追加到结果中
          result.consoleErrors = [...result.consoleErrors, ...newConsole];
          result.pageErrors = [...result.pageErrors, ...newPage];

          // 更新 summary 计数
          const newConsoleErrorCount = newConsole.filter(e => e.type === 'error').length;
          const newConsoleWarnCount = newConsole.filter(e => ['warning', 'warn'].includes(e.type)).length;

          result.summary.consoleErrorCount = (result.summary.consoleErrorCount || 0) + newConsole.length;
          result.summary.pageErrorCount = (result.summary.pageErrorCount || 0) + newPage.length;
          result.summary.total = (result.summary.total || 0) + newConsole.length + newPage.length;

          if (result.summary.severity) {
            result.summary.severity.critical = (result.summary.severity.critical || 0) + newPage.length;
            result.summary.severity.medium = (result.summary.severity.medium || 0) + newConsoleErrorCount;
            result.summary.severity.low = (result.summary.severity.low || 0) + newConsoleWarnCount;
          }

          if (result.byLevel) {
            result.byLevel.error = (result.byLevel.error || 0) + newConsoleErrorCount + newPage.length;
            result.byLevel.warning = (result.byLevel.warning || 0) + newConsoleWarnCount;
          }

          // 标记有实时新增的错误
          result.realtimeFresh = {
            consoleAdded: newConsole.length,
            pageAdded: newPage.length
          };
        }
      } catch (_) {}
    }

    return text(JSON.stringify({
      ...result,
      nextSteps: result?.summary?.total > 0 ? [
        '调用 browser_network 查看网络请求详情',
        '调用 browser_diagnose 分析错误根因',
        '调用 browser_screenshot 截图留存错误状态',
        '调用 browser_counterfactual_analyze 进行反事实根因分析'
      ] : [
        '页面无新错误，继续验证流程',
        '调用 browser_screenshot 截图留存证据',
        '调用 validation_run 运行完整验证'
      ],
      suggestions: result?.summary?.total > 0 ? [
        { type: 'fix', tool: 'browser_diagnose', reason: '分析错误的根因和修复方案' },
        { type: 'fix', tool: 'browser_counterfactual_analyze', reason: '分析错误是否是测试失败的根因' }
      ] : [
        { type: 'next', tool: 'browser_screenshot', reason: '无错误，截图留存证据' }
      ],
      paidUpgradeHint: '需要 AI 自动分析错误堆栈、匹配已知问题模式、生成修复代码？升级到 Pro 版本获取智能错误分析能力。'
    }, null, 2));
  }

  // ====== browser_errors_clear ======
  if (name === 'browser_errors_clear') {
  resetRuntimeLogs();
    return text(JSON.stringify({
      cleared: true,
      checkpoint: currentCheckpoint,
      nextSteps: ['使用 browser_screenshot 进行截图验证', '使用 browser_smoke_test 执行冒烟测试'],
      paidUpgradeHint: '需要自动错误清理与跟踪、历史错误趋势分析？升级到 Pro 版本获取智能错误管理能力。'
    }, null, 2));
  }

  // ====== browser_storage ======
  if (name === 'browser_storage') {
const { target } = await ensurePage();
    return text(JSON.stringify({
      ...(await getStorageSnapshot(target, args.scope || 'all')),
      nextSteps: ['使用 browser_cookies 检查 Cookie 状态', '使用 browser_events 查看浏览器事件'],
      paidUpgradeHint: '需要跨页面状态同步、存储变更监控、AI 驱动状态分析？升级到 Pro 版本获取智能状态管理能力。'
    }, null, 2));
  }

  // ====== browser_cookies ======
  if (name === 'browser_cookies') {
const { target } = await ensurePage();
    const action = args.action || 'get';
    if (action === 'clear') {
      await target.context().clearCookies();
      return text(JSON.stringify({ action: 'clear', success: true, message: '所有Cookie已清除' }, null, 2));
    }
    if (action === 'set') {
      if (!args.cookie || !args.cookie.name) {
        return mcpParamMissing('cookie.name', name);
      }
      await target.context().addCookies([{
        name: args.cookie.name,
        value: args.cookie.value,
        domain: args.cookie.domain || new URL(target.url()).hostname,
        path: args.cookie.path || '/',
        ...(args.cookie.expires ? { expires: args.cookie.expires } : {}),
        ...(args.cookie.httpOnly !== undefined ? { httpOnly: args.cookie.httpOnly } : {}),
        ...(args.cookie.secure !== undefined ? { secure: args.cookie.secure } : {}),
        ...(args.cookie.sameSite ? { sameSite: args.cookie.sameSite } : {})
      }]);
      return text(JSON.stringify({ action: 'set', success: true, cookie: args.cookie.name }, null, 2));
    }
    // get
    let cookies = await target.context().cookies();
    if (args.domain) {
      cookies = cookies.filter(c => c.domain.includes(args.domain.replace(/^\./, '')));
    }
    if (args.name) {
      cookies = cookies.filter(c => c.name.toLowerCase().includes(args.name.toLowerCase()));
    }
    // 敏感值脱敏
    const safeCookies = cookies.map(c => ({
      name: c.name,
      value: c.value.length > 20 ? c.value.substring(0, 8) + '...' : c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires ? new Date(c.expires * 1000).toISOString() : 'session',
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite
    }));
    return text(JSON.stringify({
      action: 'get',
      total: cookies.length,
      cookies: safeCookies,
      nextSteps: ['使用 browser_storage 查看本地存储', '使用 browser_network 分析网络请求中的 Cookie'],
      paidUpgradeHint: '需要自动 Cookie 管理、隐私合规检查、跨域 Cookie 分析？升级到 Pro 版本获取智能 Cookie 管理能力。'
    }, null, 2));
  }

  return mcpError(`未知工具（network）: ${name}`, { error: 'UNKNOWN_TOOL', toolName: name });
  } finally {
    Object.assign(deps, { page, browser, browserSessionId, consoleLogs, networkLogs, pageErrors, currentCheckpoint, eventCheckpoint, lastAction, sessions, activeSessionName, sessionCounter, traceLogs, traceActive, currentTraceName, backendProbeResults, instrumentationEnabled, imageErrors, lastImageErrorCheckpoint, validationResults, lastQualityChecks, lastValidationRun, requestStartTimes, stateManager });
  }

}

module.exports = { tools, handle };
