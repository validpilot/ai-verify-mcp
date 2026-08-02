'use strict';

// Handler: session
// Extracted from server.js callTool switch statements

// Device presets for browser_emulate_device (module-level constant for performance)
const DEVICE_PRESETS = {
  'iPhone 14': {
    viewport: { width: 390, height: 844, deviceScaleFactor: 3 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    touch: true,
    orientation: 'portrait'
  },
  'iPhone 15': {
    viewport: { width: 393, height: 852, deviceScaleFactor: 3 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    touch: true,
    orientation: 'portrait'
  },
  'iPhone 15 Pro': {
    viewport: { width: 393, height: 852, deviceScaleFactor: 3 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    touch: true,
    orientation: 'portrait'
  },
  'iPhone 16': {
    viewport: { width: 393, height: 852, deviceScaleFactor: 3 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    touch: true,
    orientation: 'portrait'
  },
  'iPad Pro 12.9': {
    viewport: { width: 1024, height: 1366, deviceScaleFactor: 2 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    touch: true,
    orientation: 'portrait'
  },
  'iPad Air': {
    viewport: { width: 820, height: 1180, deviceScaleFactor: 2 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    touch: true,
    orientation: 'portrait'
  },
  'Pixel 7': {
    viewport: { width: 412, height: 915, deviceScaleFactor: 2.625 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
    touch: true,
    orientation: 'portrait'
  },
  'Samsung Galaxy S23': {
    viewport: { width: 360, height: 780, deviceScaleFactor: 3 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
    touch: true,
    orientation: 'portrait'
  },
  'Desktop': {
    viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    touch: false,
    orientation: 'landscape'
  }
};

const { mcpError } = require('../core/mcp-error');

const tools = [
  "browser_session",
  "browser_emulate_device"
];

async function handle(name, args, deps) {

  // === Destructure deps into local scope (replacing globalThis bridge) ===
  let { page, browser, browserSessionId, consoleLogs, networkLogs, pageErrors, currentCheckpoint, eventCheckpoint, lastAction, sessions, activeSessionName, sessionCounter, traceLogs, traceActive, currentTraceName, backendProbeResults, instrumentationEnabled, imageErrors, lastImageErrorCheckpoint, validationResults, lastQualityChecks, lastValidationRun, requestStartTimes, stateManager } = deps;
  const { MAX_SESSIONS, SCREENSHOT_DIR, HAR_DIR, VISUAL_DIR, VISUAL_BASELINE_DIR, VISUAL_ACTUAL_DIR, VISUAL_DIFF_DIR, VALIDATIONS_DIR, REPORT_DIR, LOG_FILE, PROJECT_ROOT, TOOLS_DIR, logger, ensurePage, text, log, resetRuntimeLogs, getPageLinks, postActionErrorCheck, probeKnownEndpoints, getUnifiedErrors, closeBrowserSession, listBrowserSessions, filterNetwork, filterNetworkDetails, getStorageSnapshot, buildDebugReport, captureStepEvidence, waitForCondition, assertPage, runFlow, installInstrumentation, getBrowserEvents, clearBrowserEvents, startTrace, stopTrace, getArtifacts, clearArtifacts, ensureArtifactsDir, getBackendProbeEndpoints, isCloudApiProbeTarget, screenshotWithRedaction, safeArtifactName, analyzeScreenshotForErrors, exportHar, runFullAudit, visualBaseline, visualCompare, visualReport, runA11yCheck, runPerformanceCheck, runLighthouseAudit, findElement, findPage, suggestLocator, validateLocator, mcpHealthCheck, projectAudit, mcpSelfTest, runValidationCheck, runValidationPlan, runValidationElement, runValidationFlow, buildValidationReport, exportValidationReport, runValidationQuickRun, runDeployVerify, investigateDebug, runBrowserFullRegression, traverseMenu, fetchBackendLogs, buildTraceChain, detectSilentFailures, redact, redactString, isSensitiveKey, trimTraceLogs, genSpanId, genTraceId, browserOperator, evidenceCollector, deepInteractor, errorAggregator, path, fs, execSync, callTool } = deps;
  try {
  // ====== browser_session ======
  // v1.9.5 起合并 browser_session mode=create/switch/close + mode=list
  if (name === 'browser_session') {
    const mode = args.mode || 'list';

    // mode=list：等价于已废弃的 browser_session
    if (mode === 'list') {
      return handle('browser_sessions', args, deps);
    }
    // mode=create：等价于已废弃的 browser_session
    if (mode === 'create') {
      return handle('browser_session_create', args, deps);
    }
    // mode=switch：等价于已废弃的 browser_session
    if (mode === 'switch') {
      return handle('browser_session_switch', args, deps);
    }
    // mode=close：等价于已废弃的 browser_session
    if (mode === 'close') {
      return handle('browser_session_close', args, deps);
    }

    return text(JSON.stringify({ error: `未知 mode: ${mode}` }, null, 2));
  }

  // ====== browser_session mode=list ======
  if (name === 'browser_sessions') {
  const _result = listBrowserSessions();
  return text(JSON.stringify({ ..._result, nextSteps: ['使用 browser_session { mode: \'create\' } 创建新会话', '使用 browser_session { mode: \'switch\' } 切换会话'], suggestions: [{ type: 'next', tool: 'browser_session', reason: '创建新会话' }, { type: 'next', tool: 'browser_session', reason: '切换会话' }] }, null, 2));
  }

  // ====== browser_session mode=create ======
  if (name === 'browser_session_create') {
const name = args.name || args.sessionName || `session-${++sessionCounter}`;
    if (sessions.size >= MAX_SESSIONS && !sessions.has(activeSessionName)) {
      return text(`会话数量已达上限（${MAX_SESSIONS}），请先关闭现有会话`);
    }
    const { target, sessionId } = await ensurePage({ ...args, sessionName: name });
    page = target;
    try { browser = target.context().browser() || browser; } catch (e) { /* persistent context */ }
    if (args.url) await target.goto(args.url, { waitUntil: 'domcontentloaded', timeout: args.timeout || 30000 });
    sessions.set(name, { name, url: target.url(), created: new Date().toISOString(), browser, page });
    activeSessionName = name;
    return text(JSON.stringify({ created: true, activeSession: activeSessionName, sessionName: name, url: target.url(), nextSteps: ['使用 browser_session { mode: \'switch\' } 切换到其他会话', '使用 browser_session { mode: \'list\' } 查看所有会话'], suggestions: [{ type: 'next', tool: 'browser_session', reason: '切换到其他会话' }, { type: 'next', tool: 'browser_session', reason: '查看所有会话' }] }, null, 2));
  }

  // ====== browser_session mode=switch ======
  if (name === 'browser_session_switch') {
const name = args.name || args.sessionName;
    if (!name) {
      return text('请指定要切换的会话名称');
    }
    const session = sessions.get(name);
    if (!session) {
      return text(`会话不存在：${name}`);
    }
    if (session.page && !session.page.isClosed()) {
      page = session.page;
      browser = session.browser;
      activeSessionName = name;
      return text(JSON.stringify({ switched: true, activeSession: activeSessionName, url: page.url(), nextSteps: ['使用 browser_session { mode: \'close\' } 关闭当前会话', '使用 browser_session { mode: \'list\' } 查看所有会话'], suggestions: [{ type: 'next', tool: 'browser_session', reason: '关闭当前会话' }, { type: 'next', tool: 'browser_session', reason: '查看所有会话' }] }, null, 2));
    } else {
      // 会话已关闭，重新打开
      sessions.delete(name);
      return text(`会话已关闭：${name}，请重新创建`);
    }
  }

  // ====== browser_session mode=close ======
  if (name === 'browser_session_close') {
  const _result = await closeBrowserSession(args.name || args.sessionName);
  return text(JSON.stringify({ ..._result, nextSteps: ['使用 browser_session { mode: \'create\' } 创建新会话', '使用 browser_session { mode: \'list\' } 查看剩余会话'], suggestions: [{ type: 'next', tool: 'browser_session', reason: '创建新会话' }, { type: 'next', tool: 'browser_session', reason: '查看剩余会话' }] }, null, 2));
  }

  // ====== browser_emulate_device ======
  if (name === 'browser_emulate_device') {
    const { target } = await ensurePage(args);

    // Get device config from module-level constant
    const deviceName = args.device || 'iPhone 15';
    const deviceConfig = DEVICE_PRESETS[deviceName] || DEVICE_PRESETS['iPhone 15'];

    // Merge with custom overrides
    const viewport = args.viewport || deviceConfig.viewport;
    const userAgent = args.userAgent || deviceConfig.userAgent;
    const touch = args.touch !== undefined ? args.touch : deviceConfig.touch;
    const orientation = args.orientation || deviceConfig.orientation;

    // Apply viewport
    await target.setViewportSize({
      width: viewport.width,
      height: viewport.height
    });

    // Apply device scale factor via emulation
    await target.evaluate((opts) => {
      const { width, height, deviceScaleFactor } = opts;
      // Set viewport meta tag
      let meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'viewport';
        document.head.appendChild(meta);
      }
      meta.content = `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no`;
    }, viewport);

    // Get context for further emulation
    const context = target.context();

    // Apply touch emulation via navigator property override
    // (Playwright doesn't support changing touch after context creation;
    //  hasTouch must be set at newContext time, so we override at JS level)
    await target.evaluate((touchEnabled) => {
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: touchEnabled ? 5 : 0,
        configurable: true
      });
      if (touchEnabled) {
        window.ontouchstart = null;
      }
    }, touch);

    // Apply timezone and locale if needed
    if (args.timezone || args.locale) {
      // These require context options which aren't directly supported
      // But we can set via page.evaluate for some
      if (args.locale) {
        await target.evaluate((locale) => {
          Object.defineProperty(navigator, 'language', { value: locale });
          Object.defineProperty(navigator, 'languages', { value: [locale] });
        }, args.locale);
      }
    }

    // Verify emulation
    const verification = await target.evaluate((opts) => {
      return {
        viewportMatched: window.innerWidth === opts.width && window.innerHeight === opts.height,
        touchEnabled: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
        userAgentMatched: navigator.userAgent.includes(opts.userAgentSnippet || '')
      };
    }, { width: viewport.width, height: viewport.height, userAgentSnippet: deviceName });

    // Get page info
    const pageInfo = await target.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    }));

    return text(JSON.stringify({
      success: true,
      device: deviceName,
      applied: {
        viewport,
        userAgent,
        touch,
        orientation
      },
      pageInfo,
      verification,
      nextSteps: ['使用 browser_session { mode: \'create\' } 为新设备创建会话', '使用 browser_session { mode: \'list\' } 查看当前会话'],
      suggestions: [{ type: 'next', tool: 'browser_session', reason: '为新设备创建会话' }, { type: 'next', tool: 'browser_session', reason: '查看当前会话' }]
    }, null, 2));
  }

  return mcpError(`未知工具（session）: ${name}`, { error: 'UNKNOWN_TOOL', toolName: name });
  } finally {
    Object.assign(deps, { page, browser, browserSessionId, consoleLogs, networkLogs, pageErrors, currentCheckpoint, eventCheckpoint, lastAction, sessions, activeSessionName, sessionCounter, traceLogs, traceActive, currentTraceName, backendProbeResults, instrumentationEnabled, imageErrors, lastImageErrorCheckpoint, validationResults, lastQualityChecks, lastValidationRun, requestStartTimes, stateManager });
  }

}

module.exports = { tools, handle };
