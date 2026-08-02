'use strict';

// Handler: locator
// Extracted from server.js callTool switch statements

const { mcpError, mcpParamMissing } = require('../core/mcp-error');

const tools = [
  "browser_find",
  "browser_locator"
];

async function handle(name, args, deps) {

  // === Destructure deps into local scope (replacing globalThis bridge) ===
  let { page, browser, browserSessionId, consoleLogs, networkLogs, pageErrors, currentCheckpoint, eventCheckpoint, lastAction, sessions, activeSessionName, sessionCounter, traceLogs, traceActive, currentTraceName, backendProbeResults, instrumentationEnabled, imageErrors, lastImageErrorCheckpoint, validationResults, lastQualityChecks, lastValidationRun, requestStartTimes, stateManager } = deps;
  const { MAX_SESSIONS, SCREENSHOT_DIR, HAR_DIR, VISUAL_DIR, VISUAL_BASELINE_DIR, VISUAL_ACTUAL_DIR, VISUAL_DIFF_DIR, VALIDATIONS_DIR, REPORT_DIR, LOG_FILE, PROJECT_ROOT, TOOLS_DIR, logger, ensurePage, text, log, resetRuntimeLogs, getPageLinks, postActionErrorCheck, probeKnownEndpoints, getUnifiedErrors, closeBrowserSession, listBrowserSessions, filterNetwork, filterNetworkDetails, getStorageSnapshot, buildDebugReport, captureStepEvidence, waitForCondition, assertPage, runFlow, installInstrumentation, getBrowserEvents, clearBrowserEvents, startTrace, stopTrace, getArtifacts, clearArtifacts, ensureArtifactsDir, getBackendProbeEndpoints, isCloudApiProbeTarget, screenshotWithRedaction, safeArtifactName, analyzeScreenshotForErrors, exportHar, runFullAudit, visualBaseline, visualCompare, visualReport, runA11yCheck, runPerformanceCheck, runLighthouseAudit, findElement, findPage, suggestLocator, validateLocator, mcpHealthCheck, projectAudit, mcpSelfTest, runValidationCheck, runValidationPlan, runValidationElement, runValidationFlow, buildValidationReport, exportValidationReport, runValidationQuickRun, runDeployVerify, investigateDebug, runBrowserFullRegression, traverseMenu, fetchBackendLogs, buildTraceChain, detectSilentFailures, redact, redactString, isSensitiveKey, trimTraceLogs, genSpanId, genTraceId, browserOperator, evidenceCollector, deepInteractor, errorAggregator, path, fs, execSync, callTool } = deps;
  try {
  // ====== browser_find ======
  // v1.9.5 起合并 browser_find mode=element/page
  if (name === 'browser_find') {
    const mode = args.mode || 'element';
    if (mode === 'element') {
      return handle('browser_find_element', args, deps);
    }
    if (mode === 'page') {
      return handle('browser_find_page', args, deps);
    }
    return mcpParamMissing('mode', name);
  }

  // ====== browser_find mode=element ======
  if (name === 'browser_find_element') {
const { target } = await ensurePage();
    const result = await findElement(target, args);
    const count = result?.count || result?.elements?.length || 0;
    const resultData = {
      ...result,
      nextSteps: count > 0 ? [
        '调用 browser_click 点击找到的元素',
        '调用 browser_type 在找到的输入框中输入',
        '调用 browser_highlight 高亮元素确认位置',
        '调用 browser_screenshot 截图留存证据'
      ] : [
        '调用 browser_dom 查看页面 DOM 结构',
        '调用 browser_snapshot 获取页面完整快照',
        '调用 browser_locator { mode: \'suggest\' } 获取定位建议'
      ],
      suggestions: count > 0 ? [
        { type: 'next', tool: 'browser_click', reason: '点击找到的元素进行交互验证' },
        { type: 'next', tool: 'browser_highlight', reason: '高亮元素确认定位准确性' }
      ] : [
        { type: 'fix', tool: 'browser_locator_suggest', reason: '获取更准确的元素定位建议' },
        { type: 'fix', tool: 'browser_dom', reason: '查看页面 DOM 结构确认元素是否存在' }
      ]
    };
    return text(JSON.stringify(resultData, null, 2));
  }

  // ====== browser_find_page ======
  if (name === 'browser_find_page') {
    if (!args.target) return mcpParamMissing('target', name, '请添加 target 参数（login / signup / home / dashboard / admin / settings / profile / search / cart / checkout / forgot-password / reset-password / logout / all）');
    const result = await findPage(args.target, args);
    const resultData = {
      ...result,
      nextSteps: result?.found ? [
        '调用 browser_open 切换到找到的页面',
        '调用 browser_screenshot 查看页面状态',
        '调用 browser_performance { mode: \'check\' } 检查页面性能'
      ] : [
        '确认目标 URL 是否正确',
        '检查页面是否已加载完成',
        '调用 browser_open 重新打开目标页面'
      ],
      suggestions: result?.found ? [
        { type: 'next', tool: 'browser_open', reason: '切换到找到的页面' },
        { type: 'next', tool: 'browser_screenshot', reason: '查看页面实际状态' }
      ] : [
        { type: 'fix', tool: 'browser_open', reason: '重新打开目标页面' }
      ]
    };
    return text(JSON.stringify(resultData, null, 2));
  }

  // ====== browser_locator ======
  // v1.9.5 起合并 browser_locator mode=suggest/validate
  if (name === 'browser_locator') {
    const mode = args.mode || 'suggest';
    if (mode === 'suggest') {
      return handle('browser_locator_suggest', args, deps);
    }
    if (mode === 'validate') {
      return handle('browser_locator_validate', args, deps);
    }
    return mcpParamMissing('mode', name);
  }

  // ====== browser_locator mode=suggest ======
  if (name === 'browser_locator_suggest') {
const { target } = await ensurePage(args);
    const result = await suggestLocator(target, args);
    const sugArr = result?.suggestions || [];
    const hasSuggestions = sugArr.length > 0 || (result?.length ?? 0) > 0;
    const resultData = {
      ...result,
      nextSteps: hasSuggestions ? [
        '调用 browser_locator_validate 验证推荐定位器',
        '调用 browser_click 使用推荐定位器点击',
        '调用 browser_highlight 高亮推荐元素'
      ] : [
        '调用 browser_dom 查看页面 DOM 结构',
        '使用更具体的描述重新尝试',
        '调用 browser_snapshot 查看页面元素分布'
      ],
      toolSuggestions: hasSuggestions ? [
        { type: 'next', tool: 'browser_locator', reason: '验证推荐定位器的准确性' },
        { type: 'next', tool: 'browser_click', reason: '使用定位器进行交互' }
      ] : [
        { type: 'fix', tool: 'browser_dom', reason: '查看页面 DOM 结构手动定位' }
      ]
    };
    return text(JSON.stringify(resultData, null, 2));
  }

  // ====== browser_locator mode=validate ======
  if (name === 'browser_locator_validate') {
const { target } = await ensurePage(args);
    const result = await validateLocator(target, args);
    const isValid = result?.valid || result?.found || false;
    const resultData = {
      ...result,
      nextSteps: isValid ? [
        '调用 browser_click 使用验证通过的定位器操作',
        '调用 browser_highlight 高亮元素确认位置',
        '将验证通过的定位器保存到测试脚本'
      ] : [
        '调用 browser_locator { mode: \'suggest\' } 获取更好的定位器',
        '调用 browser_find { mode: \'element\' } 智能搜索元素',
        '调用 browser_dom 查看 DOM 结构'
      ],
      suggestions: isValid ? [
        { type: 'next', tool: 'browser_click', reason: '使用验证通过的定位器' }
      ] : [
        { type: 'fix', tool: 'browser_locator_suggest', reason: '获取更准确的定位器' }
      ]
    };
    return text(JSON.stringify(resultData, null, 2));
  }

  return mcpError(`未知工具（locator）: ${name}`, { error: 'UNKNOWN_TOOL', toolName: name });
  } finally {
    Object.assign(deps, { page, browser, browserSessionId, consoleLogs, networkLogs, pageErrors, currentCheckpoint, eventCheckpoint, lastAction, sessions, activeSessionName, sessionCounter, traceLogs, traceActive, currentTraceName, backendProbeResults, instrumentationEnabled, imageErrors, lastImageErrorCheckpoint, validationResults, lastQualityChecks, lastValidationRun, requestStartTimes, stateManager });
  }

}

module.exports = { tools, handle };
