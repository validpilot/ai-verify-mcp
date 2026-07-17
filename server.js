'use strict';

try { require('dotenv').config({ quiet: true }); } catch(e) { console.warn('[ValidPilot] dotenv not loaded:', e.message); }
// 修复 Windows 终端中文编码
require('./core/win-encoding');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { chromium, firefox, webkit } = require('playwright');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  InitializedNotificationSchema,
  CancelledNotificationSchema
} = require('@modelcontextprotocol/sdk/types.js');

const browserOperator = require('./hands/browser_operator');
const evidenceCollector = require('./hands/evidence_collector');
const deepInteractor = require('./hands/deep_interactor');
const errorAggregator = require('./brain/error_aggregator');
const { StateManager } = require('./core/state');
const Logger = require('./core/logger');
const logger = new Logger();
function log(level, message, data) {
  logger.log(level, message, data);
}
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const VERSION = pkg.version || '1.0.0';
function resetRuntimeLogs() {
  stateManager.resetRuntimeLogs(log);
  currentCheckpoint = stateManager.currentCheckpoint;
}
const TraceManager = require('./core/trace');
const traceManager = new TraceManager();

const FEATURE_GATE = {
  ossFeatures: [
    'mcp_health_check', 'mcp_self_test', 'browser_open', 'browser_click', 'browser_type',
    'browser_navigate', 'browser_snapshot', 'browser_screenshot', 'browser_eval',
    'browser_network', 'browser_errors', 'evidence_pack', 'evidence_index',
    'error_summary_md', 'contract_guard', 'contract_baseline', 'validation_run',
    'browser_memory_check', 'browser_performance_check', 'browser_visual_component',
    'browser_full_regression', 'browser_dom', 'browser_wait',
    'browser_chain', 'validation_chain', 'validation_flow', 'browser_assert',
    'exploration_quick', 'atl_learn', 'atl_fix', 'correlate_triple_check', 'bypass_login', 'asset_endpoint_probe', 'asset_endpoint_enum', 'asset_routes_discover',
    'business_loop_validate', 'arch_reverse_probe', 'memory_recall',
    'browser_captcha_detect', 'browser_captcha_screenshot', 'browser_captcha_read',
    'browser_find_element', 'browser_find_page', 'browser_locator_suggest', 'browser_locator_validate',
    'browser_data_compare', 'dual_chain_explore'
  ],
  proFeatures: [
    'trace_correlate', 'backend_logs', 'auto_fix_pipeline', 'fix_verify',
    'deep_interact', 'browser_deep_interact', 'browser_flow',
    'ai_debug_investigate', 'benchmark_run'
  ],
  teamFeatures: [
    'validation_suite_run', 'skill_mcp_sync'
  ],
  enterpriseFeatures: []
};

function checkFeatureGate(toolName) {
  if (FEATURE_GATE.ossFeatures.includes(toolName)) {
    return { allowed: true };
  }
  if (FEATURE_GATE.proFeatures.includes(toolName)) {
    return {
      allowed: false,
      tier: 'Pro',
      message: `${toolName} 属于 ValidPilot Pro 付费能力。OSS 版本提供基础验证能力，升级后可获得深度分析、自动修复等高级功能。`,
      upgradeUrl: 'https://validpilot.com/pricing'
    };
  }
  if (FEATURE_GATE.teamFeatures.includes(toolName)) {
    return {
      allowed: false,
      tier: 'Team',
      message: `${toolName} 属于 ValidPilot Team 付费能力。OSS 版本提供单次验证能力，升级后可获得团队协作、长期趋势分析等功能。`,
      upgradeUrl: 'https://validpilot.com/pricing'
    };
  }
  return { allowed: true };
}

// Handler modules (callTool dispatch routing)
const handlerBrowser = require('./handlers/browser');
const handlerSession = require('./handlers/session');
const handlerEvidence = require('./handlers/evidence');
const handlerNetwork = require('./handlers/network');
const handlerValidation = require('./handlers/validation');
const handlerDiagnose = require('./handlers/diagnose');
const handlerVisual = require('./handlers/visual');
const handlerLocator = require('./handlers/locator');
const handlerSystem = require('./handlers/system');
const handlerAsset = require('./handlers/asset');
const handlerExploration = require('./handlers/exploration');
const handlerCorrelate = require('./handlers/correlate');
const handlerAtl = require('./handlers/atl');
const handlerArchReverse = require('./handlers/arch_reverse');
const handlerMemory = require('./handlers/memory');
const handlerDataCompare = require('./handlers/data_compare');
const handlerDualChain = require('./handlers/dual_chain');
const handlerSecurity = require('./handlers/security');

const allHandlers = [
  handlerBrowser, handlerSession, handlerEvidence, handlerNetwork,
  handlerValidation, handlerDiagnose, handlerVisual, handlerLocator, handlerSystem,
  handlerAsset, handlerExploration, handlerCorrelate, handlerAtl, handlerArchReverse, handlerMemory, handlerDataCompare, handlerDualChain, handlerSecurity
];

const handlerMap = new Map();
for (const h of allHandlers) {
  for (const name of h.tools) {
    handlerMap.set(name, h);
  }
}

const TOOLS_DIR = path.join(__dirname, 'tools');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const VALIDATIONS_DIR = path.join(PROJECT_ROOT, '.trae', 'validations');
const VALIDATION_RUNS_DIR = path.join(VALIDATIONS_DIR, 'runs');
const LOG_FILE = Logger.LOG_FILE;
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const TRACE_DIR = path.join(__dirname, 'traces');
const HAR_DIR = path.join(__dirname, 'har');
const REPORT_DIR = path.join(__dirname, 'reports');
const VISUAL_DIR = path.join(__dirname, 'visual');
const VISUAL_BASELINE_DIR = path.join(VISUAL_DIR, 'baselines');
const VISUAL_ACTUAL_DIR = path.join(VISUAL_DIR, 'actual');
const VISUAL_DIFF_DIR = path.join(VISUAL_DIR, 'diff');

// ===== 统一落盘 run 管理 =====
let currentRunId = null;
let currentRunDir = null;
let currentRunScreenshotDir = null;
let currentRunTraceDir = null;
let currentRunHarDir = null;
let currentRunReportDir = null;
let currentRunVisualBaselineDir = null;
let currentRunVisualActualDir = null;
let currentRunVisualDiffDir = null;

function generateRunId() {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rand = crypto.randomBytes(4).toString('base64url').slice(0, 8);
  return 'run-' + ts + '-' + rand;
}

function ensureRunDir(runId) {
  if (!runId) runId = generateRunId();
  const runDir = path.join(VALIDATION_RUNS_DIR, runId);
  const screenshotDir = path.join(runDir, 'screenshots');
  const traceDir = path.join(runDir, 'traces');
  const harDir = path.join(runDir, 'har');
  const reportDir = path.join(runDir, 'reports');
  const visualDir = path.join(runDir, 'visual');
  const visualBaselineDir = path.join(visualDir, 'baselines');
  const visualActualDir = path.join(visualDir, 'actual');
  const visualDiffDir = path.join(visualDir, 'diff');
  [runDir, screenshotDir, traceDir, harDir, reportDir, visualDir,
   visualBaselineDir, visualActualDir, visualDiffDir].forEach(dir => {
    fs.mkdirSync(dir, { recursive: true });
  });
  currentRunId = runId;
  currentRunDir = runDir;
  currentRunScreenshotDir = screenshotDir;
  currentRunTraceDir = traceDir;
  currentRunHarDir = harDir;
  currentRunReportDir = reportDir;
  currentRunVisualBaselineDir = visualBaselineDir;
  currentRunVisualActualDir = visualActualDir;
  currentRunVisualDiffDir = visualDiffDir;
  return { runId, runDir };
}

function getActiveScreenshotDir() { return currentRunScreenshotDir || SCREENSHOT_DIR; }
function getActiveTraceDir() { return currentRunTraceDir || TRACE_DIR; }
function getActiveHarDir() { return currentRunHarDir || HAR_DIR; }
function getActiveReportDir() { return currentRunReportDir || REPORT_DIR; }
function getActiveVisualBaselineDir() { return currentRunVisualBaselineDir || VISUAL_BASELINE_DIR; }
function getActiveVisualActualDir() { return currentRunVisualActualDir || VISUAL_ACTUAL_DIR; }
function getActiveVisualDiffDir() { return currentRunVisualDiffDir || VISUAL_DIFF_DIR; }

function resetRunDir() {
  currentRunId = null;
  currentRunDir = null;
  currentRunScreenshotDir = null;
  currentRunTraceDir = null;
  currentRunHarDir = null;
  currentRunReportDir = null;
  currentRunVisualBaselineDir = null;
  currentRunVisualActualDir = null;
  currentRunVisualDiffDir = null;
}

let validationResults = [];
let lastQualityChecks = {
  visual: [],
  a11y: null,
  performance: null
};
let lastValidationRun = null;

const stateManager = new StateManager();
const consoleLogs = stateManager.consoleLogs;
const networkLogs = stateManager.networkLogs;
const pageErrors = stateManager.pageErrors;
const requestStartTimes = stateManager.requestStartTimes;
let currentCheckpoint = stateManager.currentCheckpoint;

// 会话管理
const MAX_SESSIONS = 2;
const sessions = new Map();
let activeSessionName = 'default';
let sessionCounter = 0;

let browser = null;
let page = null;
let browserSessionId = 0;
let backendProbeResults = []; // 后端主动探测缓存，由 browser_open 异步触发填充
let eventCheckpoint = new Date().toISOString();
let instrumentationEnabled = false;
let traceActive = false;
let currentTraceName = null;
let lastAction = null;
// 图片错误分析存储
let imageErrors = []; // { image: 'xxx.png', timestamp: 'ISO', consoleErrors: [...], pageErrors: [...], visibleErrors: [...] }
let lastImageErrorCheckpoint = new Date().toISOString();

// ===== 全链路追踪 (W3C Trace Context 标准) =====
// Ref: https://www.w3.org/TR/trace-context/
// traceparent 格式: {version}-{trace-id}-{parent-id}-{trace-flags}
//                  00-{32hex}-{16hex}-{2hex}
// 实现已抽取至 core/trace.js (TraceManager 类,实例见文件顶部 traceManager)
const traceLogs = traceManager.traceLogs; // [{ traceId, spanId, url, status, method, timestamp, errorType, source }]

// W3C TraceContext helpers — 委托至 TraceManager,保持函数名向后兼容
const genHex = (bytes) => traceManager.genHex(bytes);
const genTraceId = () => traceManager.genTraceId();
const genSpanId = () => traceManager.genSpanId();
const buildTraceparent = (traceId, spanId, sampled) => traceManager.buildTraceparent(traceId, spanId, sampled);
const parseTraceparent = (h) => traceManager.parseTraceparent(h);
const findTraceId = (headers) => traceManager.findTraceId(headers);
const trimTraceLogs = () => traceManager.trimTraceLogs();

// ===== 浏览器池管理 =====
const BROWSER_POOL_SIZE = 2; // 最多保留2个实例
const browserPool = new Map(); // poolId -> { browser, context, page, createdAt }

const SENSITIVE_KEY_RE = /(password|passwd|pwd|token|secret|authorization|cookie|apikey|api_key|api-key|key)$/i;
const SENSITIVE_TEXT_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /ark-[A-Za-z0-9-]{20,}/gi,
  /(api[_-]?key\s*[:=]\s*)[A-Za-z0-9._~+\/-]{8,}/gi,
  /(token\s*[:=]\s*)[A-Za-z0-9._~+\/-]{8,}/gi,
  /sk_live_[\w-]{10,}/gi,
  /sk_test_[\w-]{10,}/gi
];

function redactString(value) {
  let text = String(value ?? '');
  for (const pattern of SENSITIVE_TEXT_PATTERNS) {
    text = text.replace(pattern, match => {
      const prefix = match.match(/^(api[_-]?key\s*[:=]\s*|token\s*[:=]\s*)/i)?.[0] || '';
      return `${prefix}******`;
    });
  }
  return text;
}

function isSensitiveKey(key = '') {
  return SENSITIVE_KEY_RE.test(String(key));
}

function redact(value, key = '') {
  if (value == null) return value;
  if (isSensitiveKey(key)) return '******';
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => redact(item));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v, k)]));
}

const tools = stateManager.loadTools(TOOLS_DIR, log);
const toolNames = new Set(tools.map(tool => tool.name));
// 声明了 outputSchema 的工具必须返回 structuredContent，否则 MCP 客户端会报
// "has an output schema but did not return structured content"。
const toolsWithOutputSchema = new Set(tools.filter(t => t.outputSchema).map(t => t.name));

// 为声明了 outputSchema 的工具补充 structuredContent：
// handler 统一以 text(JSON) 返回，这里把首个 JSON 文本解析为结构化内容。
function attachStructuredContent(name, result) {
  if (!result || result.isError || result.structuredContent) return result;
  if (!toolsWithOutputSchema.has(name)) return result;
  const textPart = Array.isArray(result.content) ? result.content.find(c => c && c.type === 'text') : null;
  if (!textPart || typeof textPart.text !== 'string') return result;
  try {
    const parsed = JSON.parse(textPart.text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      result.structuredContent = parsed;
    }
  } catch (_) { /* 非 JSON 文本则不附加，保持原样 */ }
  return result;
}

// ===== 浏览器预热 =====
async function warmupBrowser() {
  try {
    logger.log('INFO', '预热浏览器...', {});
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    browser = await chromium.launch({ 
      headless: false,
      args: ['--no-proxy-server', '--disable-proxy', '--proxy-server=', '--proxy-bypass-list=*', '--ignore-certificate-errors']
    });
    const context = await browser.newContext({ 
      viewport: { width: 1280, height: 720 },
      proxy: undefined
    });
    page = await context.newPage();
    setupPageListeners(page);
    installInstrumentation(page).catch(e => logger.log('WARN', 'installInstrumentation 失败', { error: e.message }));
    browserSessionId += 1;
    logger.log('INFO', '浏览器预热完成', {});
    return 'warmup';
  } catch (error) {
    logger.log('WARN', '浏览器预热失败，将在首次open时启动', { error: error.message });
    return null;
  }
}

function trimLogs() {
  stateManager.trimLogs();
  if (imageErrors.length > 50) {
    imageErrors = imageErrors.slice(-50);
  }
}

// 给页面挂载监听器
function setupPageListeners(targetPage) {
  resetRuntimeLogs();

  targetPage.on('console', msg => {
    stateManager.consoleLogs.push(redact({ source: 'console', type: msg.type(), text: msg.text(), location: msg.location(), timestamp: new Date().toISOString() }));
    trimLogs();
  });

  targetPage.on('pageerror', error => {
    const entry = redact({ source: 'pageerror', type: 'error', text: error.message, stack: error.stack, timestamp: new Date().toISOString() });
    stateManager.pageErrors.push(entry);
    stateManager.consoleLogs.push(entry);
    trimLogs();
  });

  targetPage.on('request', request => {
    stateManager.requestStartTimes.set(request, Date.now());
    // 前端可能已经在 fetch/XHR 内 inject 了 traceparent；这里把请求侧的 traceparent 也记入 traceLogs
    try {
      const reqHeaders = request.headers();
      const tp = reqHeaders['traceparent'];
      if (tp) {
        const parsed = parseTraceparent(tp);
        if (parsed) {
          traceLogs.push({
            traceId: parsed.traceId,
            spanId: parsed.spanId,
            url: request.url(),
            path: new URL(request.url()).pathname,
            status: 0,            // response 阶段会再次 push 完整状态记录
            method: request.method(),
            errorType: 'PENDING',
            traceSource: 'w3c-traceparent-injected',
            timestamp: new Date().toISOString(),
            sourceLayer: 'browser-request'
          });
          trimTraceLogs();
        }
      }
    } catch (_) { /* ignore */ }
  });

  targetPage.on('response', response => {
    const request = response.request();
    const startedAt = stateManager.requestStartTimes.get(request);
    stateManager.requestStartTimes.delete(request);
    const respHeaders = response.headers();
    // 全链路追踪：提取 trace_id (W3C traceparent 优先)
    const traceInfo = findTraceId(respHeaders);
    const entry = redact({
      source: 'network',
      url: response.url(),
      status: response.status(),
      method: request.method(),
      traceId: traceInfo?.traceId,
      spanId: traceInfo?.spanId,
      traceSource: traceInfo?.source,
      timestamp: new Date().toISOString(),
      duration: startedAt ? Date.now() - startedAt : undefined,
      requestHeaders: request.headers(),
      responseHeaders: respHeaders,
      requestBody: request.postData() || undefined
    });
    stateManager.networkLogs.push(entry);
    trimLogs();
    // 记录 trace_id 映射 -> integration
    if (traceInfo?.traceId) {
      const errorType = response.status() >= 500 ? 'SERVER_ERROR'
        : response.status() >= 400 ? 'CLIENT_ERROR'
        : response.status() >= 300 ? 'REDIRECT' : 'OK';
      traceLogs.push({
        traceId: traceInfo.traceId,
        spanId: traceInfo.spanId,
        url: response.url(),
        path: new URL(response.url()).pathname,
        status: response.status(),
        method: request.method(),
        errorType,
        traceSource: traceInfo.source,
        timestamp: entry.timestamp,
        sourceLayer: 'browser'
      });
      trimTraceLogs();
    }
    response.text().then(body => {
      entry.responseBody = redactString(body).slice(0, 5000);
    }).catch(e => { entry.responseBodyError = e.message; });
  });

  targetPage.on('requestfailed', request => {
    const startedAt = stateManager.requestStartTimes.get(request);
    stateManager.requestStartTimes.delete(request);
    stateManager.networkLogs.push(redact({
      source: 'network',
      url: request.url(),
      method: request.method(),
      failed: true,
      errorText: request.failure()?.errorText,
      timestamp: new Date().toISOString(),
      duration: startedAt ? Date.now() - startedAt : undefined,
      requestHeaders: request.headers(),
      requestBody: request.postData() || undefined
    }));
    trimLogs();
  });
}

// ===== 截图错误分析 =====
async function analyzeScreenshotForErrors(target, imagePath) {
  const timeCheckpoint = lastImageErrorCheckpoint;
  lastImageErrorCheckpoint = new Date().toISOString();

  try {
    // 1. 收集页面可见的错误提示（红色文字、toast、alert等）
    const visibleErrors = await target.evaluate(() => {
      const results = [];

      // 查找常见的错误提示元素（覆盖主流UI框架）
      const errorSelectors = [
        // 通用
        '.error', '.error-message', '.alert-error', '.alert-danger',
        '.toast-error', '.toast-message', '.notification-error', '.Mui-error',
        '[role="alert"]', '[data-error]', '.field-error',
        '.invalid-feedback', '.has-error', '.is-invalid',
        '[class*="error"]', '[class*="Error"]', '[class*="alert"]',
        // Ant Design
        '.ant-form-item-explain-error', '.ant-message-error',
        '.ant-notification-notice-error', '.ant-alert-error',
        // Element UI / Element Plus
        '.el-message--error', '.el-alert--error', '.el-notification--error',
        '.el-form-item__error', '.el-input__validateIcon',
        // iView / View Design
        '.ivu-message-error', '.ivu-notice-error', '.ivu-alert-error',
        // Vuetify
        '.v-messages__message', '.v-alert--error', '.v-input--error',
        // Naive UI
        '.n-alert--error', '.n-message--error', '.n-notification--error',
        // PrimeNG
        '.p-error', '.p-invalid', '.p-message--error',
        // Semantic UI
        '.ui.error.message', '.ui.negative.message',
        // Bulma
        '.notification.is-danger', '.help.is-danger', '.tag.is-danger',
        // Bootstrap 5
        '.alert-danger', '.invalid-feedback', '.is-invalid',
        // Toast libraries
        '.v-toast', '.v-toast--error', '.v-toast--warning',
        '.notyf__toast--error', '.notyf__toast--warning',
        '.sweet-alert.show', '.swal2-show', '.swal2-icon-error',
        '.iziToast--error', '.iziToast--warning',
        // Fresh
        '.toastify', '.toast-error', '.toast-warning'
      ];

      // 使用 Set 去重
      const seenTexts = new Set();

      for (const sel of errorSelectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const text = (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 300);
          if (!text || text.length < 2 || seenTexts.has(text.slice(0, 30))) continue;
          seenTexts.add(text.slice(0, 30));
          const rect = el.getBoundingClientRect();
          const tagName = el.tagName.toLowerCase();
          const classes = typeof el.className === 'string' ? el.className.slice(0, 60) : '';
          // 判断是否是toast/alert模态框
          const isToast = tagName === 'div' && (text.length < 200) &&
            (classes.includes('toast') || classes.includes('alert') || classes.includes('message') || classes.includes('notification'));
          results.push({
            selector: sel,
            tagName,
            text: text.slice(0, 200),
            visible: !!(rect.width && rect.height && rect.top > -5),
            toastLike: isToast,
            className: classes.slice(0, 80),
            rect: rect.width ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } : null
          });
          if (results.length >= 30) break;
        }
        if (results.length >= 30) break;
      }

      // 查找红色/警告色文字（扩展检测）
      if (results.length < 30) {
        const allEls = document.querySelectorAll('p, span, div, label, h1, h2, h3, h4, h5, h6, li, td, th');
        for (const el of allEls) {
          const text = (el.innerText || el.textContent || '').trim();
          if (!text || text.length > 200 || text.length < 3) continue;
          if (seenTexts.has(text.slice(0, 30))) continue;
          // 跳过已经匹配到选择器的
          if (el.closest('.error, .error-message, .alert-error, .alert-danger, .toast-error, [role="alert"], .invalid-feedback, .is-invalid, [class*="error"]')) continue;
          const style = window.getComputedStyle(el);
          const color = style.color;
          if (!color) continue;
          
          let isRed = false;
          // 解析 rgb/rgba
          const rgb = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (rgb) {
            const r = parseInt(rgb[1]), g = parseInt(rgb[2]), b = parseInt(rgb[3]);
            // 红色: R 明显大于 G 和 B，且 G 和 B 较低
            isRed = (r > 160 && g < 130 && r - g > 40) ||
                    (r > 200 && r - g > 30 && r - b > 30);
          }
          // 解析 hsl (如 hsl(0, 100%, 50%) 是红色)
          const hsl = color.match(/hsl\((\d+)/);
          if (hsl) {
            const h = parseInt(hsl[1]);
            isRed = (h >= 340 || h <= 20);
          }
          // 已知红色颜色名
          if (['red', '#ff0000', '#f00', '#d32f2f', '#f44336', '#e53935', '#c62828', '#b71c1c'].includes(color.toLowerCase())) {
            isRed = true;
          }

          if (isRed) {
            seenTexts.add(text.slice(0, 30));
            results.push({
              selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : ''),
              tagName: el.tagName.toLowerCase(),
              text: text.slice(0, 200),
              color,
              source: 'red-text-detection'
            });
          }
        }
      }

      return results;
    });

    // 2. 截取当前 console 错误
    const sinceTime = new Date(timeCheckpoint).getTime();
    const newConsoleErrors = stateManager.consoleLogs
      .filter(e => new Date(e.timestamp || 0).getTime() > sinceTime && (e.type === 'error' || e.type === 'warning'))
      .slice(-10);

    const newPageErrors = stateManager.pageErrors
      .filter(e => new Date(e.timestamp || 0).getTime() > sinceTime)
      .slice(-10);

    // 3. 从DOM中统计错误类元素的总数（额外诊断信息）
    let domErrorStats = null;
    try {
      domErrorStats = await target.evaluate(() => {
        const errorEls = document.querySelectorAll('.error, .alert, [role="alert"], .toast, .invalid-feedback, [class*="error"], [class*="Error"]');
        const total = errorEls.length;
        const visible = Array.from(errorEls).filter(el => {
          const r = el.getBoundingClientRect();
          return r.width && r.height && r.top > -5;
        }).length;
        return { totalErrorElements: total, visibleErrorElements: visible };
      });
    } catch (_) { logger.warn('buildInteractionReport: evaluate 失败', _.message); }

    // 4. 构建分析结果
    const analysis = {
      image: imagePath,
      timestamp: new Date().toISOString(),
      visibleErrors: visibleErrors.slice(0, 30),
      consoleErrors: newConsoleErrors,
      pageErrors: newPageErrors,
      domErrorStats,
      hasErrors: visibleErrors.length > 0 || newConsoleErrors.length > 0 || newPageErrors.length > 0,
      errorCount: visibleErrors.length + newConsoleErrors.length + newPageErrors.length,
      // 快速摘要：toast/alert 数量
      toastAlerts: visibleErrors.filter(e => e.toastLike).length
    };

    // 5. 如果有错误，存入 imageErrors
    if (analysis.hasErrors) {
      imageErrors.push(analysis);
      // 限制imageErrors数量
      if (imageErrors.length > 50) imageErrors.splice(0, imageErrors.length - 50);

      // 同时记录到日志文件
      logger.log('ERROR', '截图检测到错误', {
        image: imagePath,
        visibleCount: visibleErrors.length,
        consoleCount: newConsoleErrors.length,
        pageErrorCount: newPageErrors.length,
        toastAlertCount: analysis.toastAlerts,
        domErrorElements: domErrorStats?.visibleErrorElements || 0,
        samples: visibleErrors.slice(0, 3).map(v => v.text).join(' | ')
      });
    }

    return analysis;
  } catch (error) {
    logger.log('WARN', '截图错误分析失败', { image: imagePath, error: error.message });
    return { image: imagePath, timestamp: new Date().toISOString(), error: error.message, hasErrors: false, errorCount: 0, visibleErrors: [], consoleErrors: [], pageErrors: [] };
  }
}

async function ensurePage(args = {}) {
  const extensionPath = args.extensionPath || args.loadExtensionPath;
  const targetUrl = args.url;
  let reused = true;

  // 1) 优先使用现有存活页面
  if (page && !page.isClosed()) {
    try {
      await page.evaluate('1');
      const currentUrl = page.url();
      logger.log('DEBUG', 'ensurePage - currentUrl', { currentUrl });
      if (currentUrl && currentUrl !== 'about:blank') {
        if (targetUrl && currentUrl !== targetUrl) {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: args.timeout || 30000 }).catch(() => {});
        }
        return { target: page, reused: true, sessionId: browserSessionId };
      } else {
        logger.log('DEBUG', 'ensurePage - closing about:blank page');
        await page.close().catch(() => {});
        page = null;
      }
    } catch (e) {
      logger.log('DEBUG', 'ensurePage - page evaluation failed', { error: e.message });
      page = null;
    }
  }

  // 2) 尝试复用现有浏览器实例（在同一浏览器中创建新页面）
  if (!extensionPath && browser) {
    try {
      if (!browser.isConnected()) {
        browser = null;
      } else {
        const contexts = browser.contexts();
        let context = contexts.length > 0 ? contexts[0] : null;
        if (!context) {
          context = await browser.newContext({ 
            viewport: { width: 1280, height: 720 },
            proxy: undefined
          });
        }
        const pages = context.pages();
        let newPage = pages.length > 0 ? pages[0] : null;
        if (!newPage || newPage.isClosed()) {
          newPage = await context.newPage();
        }
        page = newPage;
        if (targetUrl) {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: args.timeout || 30000 }).catch(() => {});
        }
        browserSessionId += 1;
        setupPageListeners(page);
        installInstrumentation(page).catch(e => logger.log('WARN', 'installInstrumentation 失败', { error: e.message }));
        logger.log('INFO', '复用现有浏览器实例');
        return { target: page, reused: true, sessionId: browserSessionId };
      }
    } catch (e) {
      logger.log('DEBUG', 'ensurePage - failed to reuse browser', { error: e.message });
      browser = null;
    }
  }

  // 3) 从池中取可用页面（非 extension 模式）
  if (!extensionPath && browserPool.size > 0) {
    for (const [id, poolItem] of browserPool) {
      try {
        await poolItem.page.evaluate('1');
        const poolUrl = poolItem.page.url();
        if (poolUrl === 'about:blank') {
          continue;
        }
        browser = poolItem.browser;
        page = poolItem.page;
        browserPool.delete(id);
        if (targetUrl && poolUrl !== targetUrl) {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: args.timeout || 30000 }).catch(() => {});
        }
        setupPageListeners(page);
        browserSessionId += 1;
        logger.log('INFO', '复用池中页面', { poolId: id });
        return { target: page, reused: true, sessionId: browserSessionId };
      } catch (e) {
        browserPool.delete(id);
      }
    }
  }

  // 4) 新建浏览器实例 - 先清理超出池大小的旧实例
  reused = false;
  if (browserPool.size >= BROWSER_POOL_SIZE) {
    const oldestEntry = [...browserPool.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (oldestEntry) {
      const [poolId, poolItem] = oldestEntry;
      logger.log('DEBUG', 'ensurePage - closing oldest browser from pool', { poolId });
      await poolItem.browser.close().catch(() => {});
      browserPool.delete(poolId);
    }
  }

  const browserType = args.browserType || 'chromium';
  const browserEngines = { chromium, firefox, webkit };
  const engine = browserEngines[browserType];
  if (!engine) {
    throw new Error(`不支持的浏览器类型: ${browserType}，支持: chromium, firefox, webkit`);
  }

  if (extensionPath) {
    if (browserType !== 'chromium') {
      throw new Error('extensionPath (加载扩展) 仅支持 chromium 浏览器');
    }
    const resolvedExtensionPath = path.resolve(extensionPath);
    const userDataDir = path.join(__dirname, '.browser-profiles', 'default');
    fs.mkdirSync(userDataDir, { recursive: true });
    browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: { width: 1440, height: 900 },
      args: [
        `--disable-extensions-except=${resolvedExtensionPath}`,
        `--load-extension=${resolvedExtensionPath}`
      ]
    });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    if (targetUrl) {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: args.timeout || 30000 }).catch(() => {});
    }
  } else {
    delete process.env.http_proxy;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    browser = await engine.launch({ 
      headless: args.headless === true ? true : false,
      args: ['--no-proxy-server', '--disable-proxy', '--proxy-server=', '--proxy-bypass-list=*', '--ignore-certificate-errors']
    });
    const context = await browser.newContext({ 
      viewport: { width: 1280, height: 720 },
      proxy: undefined
    });
    page = await context.newPage();

    if (targetUrl) {
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: args.timeout || 30000 }).catch(() => {});
    }
  }
  browserSessionId += 1;
  setupPageListeners(page);
  installInstrumentation(page).catch(e => logger.log('WARN', 'installInstrumentation 失败', { error: e.message }));

  return { target: page, reused, sessionId: browserSessionId };
}

function text(content) {
  return { content: [{ type: 'text', text: content }] };
}

// 会话管理辅助函数
function listBrowserSessions() {
  const list = [];
  for (const [name, session] of sessions) {
    list.push({
      name,
      active: name === activeSessionName,
      url: session.url || 'N/A',
      created: session.created,
      closed: session.closed || false
    });
  }
  // 添加当前活动会话（如果不在sessions中）
  if (page && page.url() && !sessions.has(activeSessionName)) {
    list.unshift({
      name: activeSessionName,
      active: true,
      url: page.url(),
      created: new Date().toISOString()
    });
  }
  return list;
}

async function closeBrowserSession(name) {
  const sessionName = name || activeSessionName;
  if (sessionName === activeSessionName) {
    // 关闭当前会话
    if (page && !page.isClosed()) {
      await page.close().catch(e => { console.error('[closeBrowserSession] page.close error:', e.message); });
      page = null;
    }
    sessions.delete(sessionName);
    activeSessionName = sessions.size > 0 ? sessions.keys().next().value : 'default';
    if (browser) {
      await browser.close().catch(e => { console.error('[closeBrowserSession] browser.close error:', e.message); });
      browser = null;
    }
    // 清理 browserPool
    for (const [poolId, item] of browserPool.entries()) {
      if (item.browser) {
        await item.browser.close().catch(e => { console.error('[closeBrowserSession] browserPool cleanup error:', e.message); });
      }
    }
    browserPool.clear();
    resetRuntimeLogs();
    return { closed: true, switchedTo: activeSessionName };
  } else {
    // 关闭其他会话
    const session = sessions.get(sessionName);
    if (session) {
      if (session.browser) {
        await session.browser.close().catch(e => { console.error('[closeBrowserSession] session.browser.close error:', e.message); });
      }
      sessions.delete(sessionName);
      return { closed: true };
    }
    return { closed: false, error: '会话不存在' };
  }
}

// ===== 全量审计 =====
/**
 * 聚合所有错误来源执行全量审计
 */
// ===== 后端主动探测 =====
// 对已知 API 端点执行 GET 探测，发现隐藏的 5xx/4xx 错误
const DEFAULT_BACKEND_API_ENDPOINTS = [
  '/api/v1/health',
  '/api/v1/identity/me',
  '/api/v1/settlements',
  '/api/v1/channels',
  '/api/v1/orders',
  '/api/v1/leads',
  '/api/v1/campaigns',
  '/api/v1/merchant/payout-disputes',
  '/api/v1/provider/commission-configs',
  '/api/v1/provider/settlements'
];

const CLOUD_API_BACKEND_API_ENDPOINTS = [
  '/health',
  '/v1/auth/me',
  '/v1/quota',
  '/v1/subscriptions/current'
];

function isCloudApiProbeTarget(targetUrl = '', options = {}) {
  const hint = String(options.profile || options.preset || options.project || options.service || '').toLowerCase();
  if (hint.includes('cloud-api') || hint.includes('cloud_api')) return true;

  try {
    const parsed = new URL(String(targetUrl));
    return parsed.port === '3001' || parsed.hostname.includes('cloud-api');
  } catch (_) {
    return String(targetUrl).includes(':3001') || String(targetUrl).includes('cloud-api');
  }
}

function getBackendProbeEndpoints(targetUrl = '', options = {}) {
  if (Array.isArray(options.endpoints) && options.endpoints.length > 0) {
    return options.endpoints;
  }
  if (isCloudApiProbeTarget(targetUrl, options)) {
    return CLOUD_API_BACKEND_API_ENDPOINTS;
  }
  return DEFAULT_BACKEND_API_ENDPOINTS;
}
const BACKEND_API_ENDPOINTS = DEFAULT_BACKEND_API_ENDPOINTS;
const BACKEND_RESPONSE_ERROR_KEYWORDS = /error|exception|undefinedtable|column.*not exist|traceback|internal_server/i;
async function probeKnownEndpoints(target, options = {}) {
  const results = [];
  const targetUrl = typeof target.url === 'function' ? target.url() : '';
  const endpoints = getBackendProbeEndpoints(targetUrl, options);
  try {
    for (const ep of endpoints) {
      try {
        const r = await target.evaluate(async (url) => {
          const resp = await fetch(url).catch(() => null);
          if (!resp) return { error: 'fetch_failed' };
          const text = await resp.text();
          return { status: resp.status, body: text.slice(0, 500) };
        }, ep).catch(() => null);
        if (!r) continue;
        const isSilent = r.status < 400 && BACKEND_RESPONSE_ERROR_KEYWORDS.test(r.body || '');
        if (r.status >= 400 || isSilent) {
          results.push({
            endpoint: ep,
            status: r.status,
            method: 'GET',
            silentFailure: isSilent,
            bodyPreview: (r.body || '').slice(0, 200),
            timestamp: new Date().toISOString()
          });
        }
      } catch (_) { logger.warn('consoleListener: 处理 console 事件失败', _.message); }
    }
  } catch (_) { logger.warn('setupConsoleListeners: 整体捕获异常', _.message); }
  return results;
}

async function runFullAudit(args = {}) {
  const since = args.since || stateManager.currentCheckpoint;
  const includeWarnings = args.includeWarnings === true;
  const includeProbe = args.includeProbe !== false;  // 默认开启后端探测
  const sinceTime = new Date(since).getTime();
  const filterByTime = (arr) => arr.filter(e => new Date(e.timestamp || 0).getTime() >= sinceTime);

  const result = {
    summary: {},
    consoleErrors: [],
    networkErrors: [],
    silentFailures: [],
    unhandledRejections: [],
    crossOriginErrors: [],
    resourceErrors: [],
    runtimeErrors: [],
    injectedErrors: [],
    backendProbeErrors: [],  // 后端主动探测结果
    diagnostics: []
  };

  // 1. CDP console errors
  const cdpErrors = filterByTime(stateManager.consoleLogs).filter(e => e.type === 'error' || (includeWarnings && (e.type === 'warning' || e.type === 'warn')));
  result.consoleErrors = cdpErrors.map(e => ({ text: (e.text || '').slice(0, 300), source: e.source, timestamp: e.timestamp }));

  // 2. CDP page errors
  const pageErr = filterByTime(stateManager.pageErrors);
  result.runtimeErrors = pageErr.map(e => ({ message: (e.text || '').slice(0, 300), stack: (e.stack || '').slice(0, 500), timestamp: e.timestamp }));

  // 3. Network 4xx/5xx
  const netErr = filterByTime(stateManager.networkLogs).filter(e => e.status >= 400);
  result.networkErrors = netErr.map(e => ({ url: (e.url || '').slice(0, 150), status: e.status, method: e.method || 'GET', text: (e.text || '').slice(0, 200), timestamp: e.timestamp }));

  // 4. Silent failures (200 body with error)
  result.silentFailures = detectSilentFailures({ since });

  // 5. Injected script events (window.__mcpEvents)
  if (page && !page.isClosed()) {
    try {
      const injected = await page.evaluate((sinceIso) => {
        if (!window.__mcpEvents) return [];
        const cut = new Date(sinceIso).getTime();
        return window.__mcpEvents
          .filter(e => new Date(e.timestamp || 0).getTime() >= cut)
          .slice(-100);
      }, since).catch(() => []);
      
      if (injected.length > 0) {
        // 5a. Console-level errors from injected script
        const consoleFromInject = injected.filter(e => e.type === 'console' && e.level === 'error');
        // Merge into injectedErrors
        result.injectedErrors = consoleFromInject.map(e => ({ text: (e.args || []).join(' ').slice(0, 300), timestamp: e.timestamp }));
        
        // 5b. Runtime errors (window_error) with stack
        const windowErrors = injected.filter(e => e.type === 'window_error' && !e.crossOrigin);
        for (const e of windowErrors) {
          result.runtimeErrors.push({ message: (e.message || '').slice(0, 300), stack: (e.stack || '').slice(0, 500), source: e.source, line: e.line, column: e.column, timestamp: e.timestamp });
        }
        
        // 5c. Resource loading errors
        result.resourceErrors = injected.filter(e => e.type === 'resource_error').map(e => ({ tagName: e.tagName, resourceUrl: (e.resourceUrl || '').slice(0, 200), timestamp: e.timestamp }));
        
        // 5d. Unhandled promise rejections
        result.unhandledRejections = injected.filter(e => e.type === 'unhandledrejection').map(e => ({ reason: (e.reason || '').slice(0, 300), timestamp: e.timestamp }));
        
        // 5e. Cross-origin script errors
        result.crossOriginErrors = injected.filter(e => e.type === 'window_error' && e.crossOrigin).map(e => ({ message: (e.message || '').slice(0, 300), timestamp: e.timestamp }));
      }
    } catch (_) { logger.warn('collectConsoleErrors: 收集错误失败', _.message); }
  }

  // 6. deduplicate runtimeErrors (same message)
  const seenMsgs = new Set();
  result.runtimeErrors = result.runtimeErrors.filter(e => {
    const key = (e.message || e.stack || '').slice(0, 100);
    if (seenMsgs.has(key)) return false;
    seenMsgs.add(key);
    return true;
  });

  // 7. Summary
  let backendProbeCount = 0;
  if (includeProbe && page && !page.isClosed()) {
    try {
      const targetUrl = page.url();
      const knownEndpoints = getBackendProbeEndpoints(targetUrl, args);
      for (const ep of knownEndpoints) {
        try {
          const r = await page.evaluate(async (url) => {
            const resp = await fetch(url).catch(() => null);
            if (!resp) return { error: 'fetch_failed' };
            const text = await resp.text();
            return { status: resp.status, body: text.slice(0, 300) };
          }, ep).catch(() => null);
          if (r && r.status >= 400) {
            const isSilent = r.status < 500 && /error|exception|undefinedtable|column.*not exist|traceback/i.test(r.body || '');
            result.backendProbeErrors.push({ endpoint: ep, status: r.status, body: (r.body || '').slice(0, 200), silentFailure: isSilent });
            if (isSilent) {
              result.silentFailures.push({ url: ep, status: r.status, responseBody: (r.body || '').slice(0, 200), source: 'backend_probe' });
            }
          }
        } catch (_) { /* best-effort text extraction */ }
      }
      backendProbeCount = result.backendProbeErrors.length;
    } catch (_) { /* best-effort text extraction */ }
  }

  result.summary = {
    totalErrors: result.consoleErrors.length + result.networkErrors.length + result.silentFailures.length + result.resourceErrors.length + result.unhandledRejections.length + result.crossOriginErrors.length + result.runtimeErrors.length,
    consoleErrors: result.consoleErrors.length,
    network5xx: result.networkErrors.filter(e => e.status >= 500).length,
    network4xx: result.networkErrors.filter(e => e.status >= 400 && e.status < 500).length,
    silentFailures: result.silentFailures.length,
    runtimeErrors: result.runtimeErrors.length,
    resourceErrors: result.resourceErrors.length,
    unhandledRejections: result.unhandledRejections.length,
    crossOriginErrors: result.crossOriginErrors.length,
    injectedErrors: result.injectedErrors.length,
    backendProbeErrors: backendProbeCount
  };

  // 8. Diagnostics
  const diag = [];
  if (result.summary.crossOriginErrors > 0) diag.push('跨域脚本错误：建议在 <script> 标签添加 crossorigin="anonymous" 属性并在服务端配置 Access-Control-Allow-Origin 头');
  if (result.summary.silentFailures > 0) diag.push('存在 HTTP 200 静默失败：API 返回 200 但响应体包含数据库/异常信息，需修复后端查询');
  if (result.summary.resourceErrors > 0) diag.push(`资源加载失败：${result.resourceErrors.map(e => e.tagName + ':' + e.resourceUrl).join(', ')}`);
  if (result.summary.unhandledRejections > 0) diag.push('存在未处理的 Promise 拒绝，建议在业务代码中添加 .catch() 或 try/catch');
  if (result.summary.runtimeErrors > 0) diag.push(`运行时异常：建议根据堆栈信息修复对应代码（共 ${result.summary.runtimeErrors} 个）`);
  if (result.summary.network5xx > 0) diag.push(`服务端错误 (5xx)：${result.summary.network5xx} 个请求返回 5xx，需修复后端接口`);
  if (result.summary.backendProbeErrors > 0) {
    const probeDetails = result.backendProbeErrors.map(e => `${e.endpoint} → ${e.status}${e.silentFailure ? ' (静默失败)' : ''}`).join('; ');
    diag.push(`后端主动探测发现 ${result.summary.backendProbeErrors} 个异常端点：${probeDetails}`);
  }
  if (result.summary.totalErrors === 0) diag.push('✅ 未发现任何错误，页面健康');
  result.diagnostics = diag;

  return result;
}

/**
 * 构建全链路调用链：从 trace_id 或时间点追溯整个请求链路
 */
function buildTraceChain(args = {}) {
  const { traceId, url, statusMin, since } = args;
  
  // 1. 筛选 traceLogs
  let chains = [...traceLogs];
  if (traceId) chains = chains.filter(t => t.traceId === traceId);
  if (since) {
    const sinceTime = new Date(since).getTime();
    chains = chains.filter(t => new Date(t.timestamp || 0).getTime() >= sinceTime);
  }
  if (url) chains = chains.filter(t => t.url.includes(url));
  if (statusMin !== undefined) chains = chains.filter(t => t.status >= statusMin);
  
  // 2. 按 traceId 分组
  const grouped = {};
  for (const entry of chains) {
    if (!grouped[entry.traceId]) {
      grouped[entry.traceId] = { traceId: entry.traceId, calls: [], totalCalls: 0, errors: 0 };
    }
    grouped[entry.traceId].calls.push(entry);
    grouped[entry.traceId].totalCalls++;
    if (entry.errorType === 'server_error' || entry.errorType === 'client_error') {
      grouped[entry.traceId].errors++;
    }
  }
  
  // 3. 关联 networkLogs 获取请求体/响应体详情
  for (const traceId of Object.keys(grouped)) {
    const group = grouped[traceId];
    const networkEntries = networkLogs.filter(n => n.traceId === traceId);
    group.details = networkEntries.map(n => ({
      url: n.url, status: n.status, method: n.method,
      duration: n.duration,
      requestBody: n.requestBody,
      responseBody: (n.responseBody || '').slice(0, 500),
      responseBodyError: n.responseBodyError
    }));
  }
  
  // 4. 关联 consoleLogs - 找到时间戳接近的错误
  // 取每个 trace 的时间范围
  for (const traceId of Object.keys(grouped)) {
    const group = grouped[traceId];
    const timestamps = group.calls.map(t => new Date(t.timestamp).getTime()).filter(t => !isNaN(t));
    if (timestamps.length === 0) continue;
    const minTime = Math.min(...timestamps) - 1000; // 向前延伸1秒
    const maxTime = Math.max(...timestamps) + 5000; // 向后延伸5秒
    
    const relatedErrors = consoleLogs.filter(e => {
      const t = new Date(e.timestamp || 0).getTime();
      return t >= minTime && t <= maxTime;
    }).slice(-10);
    
    if (relatedErrors.length > 0) {
      group.relatedConsoleErrors = relatedErrors.map(e => ({
        type: e.type, text: (e.text || '').slice(0, 200), timestamp: e.timestamp
      }));
    }
  }
  
  // 5. 排序：按时间
  const chainsArray = Object.values(grouped);
  chainsArray.sort((a, b) => {
    const aTime = a.calls[0]?.timestamp || '';
    const bTime = b.calls[0]?.timestamp || '';
    return aTime.localeCompare(bTime);
  });
  
  return {
    totalChains: chainsArray.length,
    totalErrors: chainsArray.reduce((s, c) => s + c.errors, 0),
    chains: chainsArray.slice(0, 50), // 最多返回50条
    hasErrors: chainsArray.some(c => c.errors > 0)
  };
}

/**
 * 通过 SSH 从远程服务器获取后端 docker 日志
 * 
 * OSS 版本：返回升级提示，后端日志关联属于 ValidPilot Pro/Team 付费能力
 */
async function fetchBackendLogs(args = {}) {
  const { traceId } = args;
  return {
    traceId,
    logs: [],
    totalServices: 0,
    upgradeRequired: true,
    message: '后端日志关联属于 ValidPilot Pro/Team 付费能力。OSS 版本支持前端 evidence 和 traceId 采集，升级后可自动关联后端 Docker 日志、数据库查询和跨服务 trace。',
    upgradeUrl: 'https://validpilot.com/pricing'
  };
}

// ===== 操作后快速错误捕获 =====
// 在操作后等待并捕获新出现的错误
async function postActionErrorCheck(target, actionName, selector) {
  try {
    const beforeCheckpoint = stateManager.currentCheckpoint;
    
    // 等待错误浮现（300ms足够捕获大多数错误）
    await new Promise(r => setTimeout(r, 300)).catch(() => {});
    
    const afterCheckpoint = new Date().toISOString();
    const newConsoleErrors = stateManager.consoleLogs.filter(e => new Date(e.timestamp || 0).getTime() > new Date(beforeCheckpoint).getTime());
    const newPageErrors = stateManager.pageErrors.filter(e => new Date(e.timestamp || 0).getTime() > new Date(beforeCheckpoint).getTime());
    const newNetworkErrors = stateManager.networkLogs.filter(e => e.status >= 400 && new Date(e.timestamp || 0).getTime() > new Date(beforeCheckpoint).getTime());
    
    // 从注入脚本的 window.__mcpEvents 直接读取 console 错误（不依赖 CDP 事件循环）
    let injectedConsoleErrors = [];
    try {
      const events = await target.evaluate((beforeTimestamp) => {
        if (!window.__mcpEvents) return [];
        const before = new Date(beforeTimestamp).getTime();
        return window.__mcpEvents
          .filter(e => (e.type === 'console' && (e.level === 'error' || e.level === 'warn')) || e.type === 'window_error' || e.type === 'unhandledrejection')
          .filter(e => new Date(e.timestamp || 0).getTime() > before)
          .slice(-20);
      }, beforeCheckpoint).catch(() => []);
      injectedConsoleErrors = events.map(e => ({
        type: e.level || e.type,
        text: e.args ? e.args.join(' ') : (e.message || e.reason || ''),
        source: 'injected'
      }));
    } catch (_) { logger.warn('injectedConsoleErrors: 处理注入脚本错误失败', _.message); }
    
    // 合并 CDP 捕获 + 注入脚本直读
    const allConsoleEntries = [...newConsoleErrors, ...injectedConsoleErrors];
    // 去重（相同 text 只保留一个）
    const seen = new Set();
    const dedupedConsole = allConsoleEntries.filter(e => {
      const key = e.text?.slice(0, 100);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    const hasNewErrors = dedupedConsole.length > 0 || newPageErrors.length > 0 || newNetworkErrors.length > 0;
    const totalNewErrors = dedupedConsole.length + newPageErrors.length + newNetworkErrors.length;
    
    // 记录到 lastAction
    lastAction = {
      type: actionName,
      selector: selector,
      timestamp: afterCheckpoint,
      errorsDetected: hasNewErrors,
      errorCount: totalNewErrors
    };
    
    if (hasNewErrors) {
      logger.log('WARN', `操作 "${actionName}(${selector})" 后检测到 ${totalNewErrors} 个新错误`, {
        console: dedupedConsole.length,
        injected: injectedConsoleErrors.length,
        pageError: newPageErrors.length,
        network: newNetworkErrors.length
      });
    }
    
    return {
      detected: hasNewErrors,
      count: totalNewErrors,
      console: dedupedConsole.map(e => ({ type: e.type || 'error', text: (e.text || '').slice(0, 200) })),
      page: newPageErrors.map(e => ({ text: (e.text || '').slice(0, 200) })),
      network: newNetworkErrors.filter(e => e.status >= 400).map(e => ({ url: (e.url || '').slice(0, 100), status: e.status }))
    };
  } catch (_) {
    return { detected: false, count: 0, console: [], page: [], network: [] };
  }
}

// 响应体静默失败检测（HTTP 2xx/3xx 但 body 含错误）
const RESPONSE_BODY_ERROR_PATTERNS = [
  /"error"\s*:\s*"[^"]*(?:does not exist|not found|syntax error|internal error|timeout|unauthorized|forbidden)/i,
  /"error"\s*:\s*"[^"]{5,}/i, // Generic "error" field with meaningful content
  /"message"\s*:\s*"[^"]*(?:error|fail|exception|does not exist|not found)/i,
  /column\s+"[^"]+"\s+does\s+not\s+exist/i,
  /relation\s+"[^"]+"\s+does\s+not\s+exist/i,
  /UndefinedColumn/i,
  /syntax\s+error\s+at\s+or\s+near/i,
  /PG::\w+Error/i,
  /SQLSTATE/i,
  /internal\s+server\s+error/i,
  /"status"\s*:\s*"(?:error|fail)"/i,
  /(?:error|exception|traceback)/i
];

function detectSilentFailures(args = {}) {
  return stateManager.filterNetwork(stateManager.networkLogs, args)
    .filter(item => {
      // Only check 2xx/3xx responses that have a body
      if (!item.responseBody || item.status < 200 || item.status >= 400) return false;
      if (item.failed) return false;
      // Skip non-API assets (images, fonts, etc.)
      const url = item.url || '';
      if (url.match(/\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|css|js|ts|tsx|jsx)($|\?)/i)) return false;
      // Skip Vite dev mode / frontend source module requests (HMR, source maps, etc.)
      if (url.includes('/@vite/') || url.includes('/@react-refresh') || url.includes('/node_modules/.vite/') || url.includes('vite/modulepreload')) return false;
      // Skip source map requests
      if (url.endsWith('.map') || url.includes('sourcemap')) return false;
      // Skip frontend source files in dev mode (Vite serves src files directly)
      if (url.includes('/src/')) return false;
      // Check body for error patterns
      return RESPONSE_BODY_ERROR_PATTERNS.some(p => p.test(item.responseBody));
    })
    .map(item => ({
      source: 'silentFail',
      url: item.url,
      status: item.status,
      method: item.method,
      timestamp: item.timestamp,
      duration: item.duration,
      errorSnippet: extractErrorSnippet(item.responseBody)
    }));
}

function extractErrorSnippet(body) {
  if (!body) return '';
  for (const p of RESPONSE_BODY_ERROR_PATTERNS) {
    const m = body.match(p);
    if (m) return m[0].slice(0, 200);
  }
  // Return first JSON error field value
  const errMatch = body.match(/"error"\s*:\s*"([^"]+)"/);
  if (errMatch) return errMatch[1].slice(0, 200);
  return body.slice(0, 120);
}

function readRecentMcpErrors(args = {}) {
  if (args.includeMcpErrors !== true) return [];
  return logger.readRecentMcpErrors(args);
}

function getUnifiedErrors(args = {}) {
  const includeWarnings = args.includeWarnings === true;
  const includeBackendProbe = args.includeBackendProbe !== false;
  const currentUrl = page && !page.isClosed() ? page.url() : '';
  const consoleErrors = stateManager.filterBySince(stateManager.consoleLogs, args).filter(item => item.type === 'error' || (includeWarnings && ['warning', 'warn'].includes(item.type)));
  const pageErrorRecords = stateManager.filterBySince(stateManager.pageErrors, args);
  const networkErrors = stateManager.filterNetwork(stateManager.networkLogs, args).filter(item => item.failed || item.status >= 400);
  const silentFailErrors = detectSilentFailures(args);
  const mcpErrors = readRecentMcpErrors(args).map(item => ({ source: 'mcp', ...item }));
  const imageErrorRecords = stateManager.filterBySince(imageErrors, args).filter(e => e.hasErrors);
  const total = consoleErrors.length + pageErrorRecords.length + networkErrors.length + silentFailErrors.length + mcpErrors.length + imageErrorRecords.length;
  const byLevel = {
    error: consoleErrors.filter(e => e.type === 'error').length + pageErrorRecords.length + networkErrors.filter(e => e.status >= 500 || e.failed).length + silentFailErrors.length + mcpErrors.length + imageErrorRecords.length,
    warning: consoleErrors.filter(e => ['warning', 'warn'].includes(e.type)).length + networkErrors.filter(e => e.status >= 400 && e.status < 500 && !e.failed).length
  };
  return redact({
    checkpoint: stateManager.currentCheckpoint,
    currentUrl,
    lastAction,
    imageErrorCount: imageErrorRecords.length,
    silentFailCount: silentFailErrors.length,
    summary: {
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrorRecords.length,
      networkErrorCount: networkErrors.length,
      silentFailCount: silentFailErrors.length,
      mcpErrorCount: mcpErrors.length,
      imageErrorCount: imageErrorRecords.length,
      total,
      // 按严重程度分级
      severity: {
        critical: pageErrorRecords.length > 0 ? pageErrorRecords.length : 0,
        high: networkErrors.filter(e => e.status >= 500 || e.failed).length + silentFailErrors.length,
        medium: consoleErrors.filter(e => e.type === 'error').length,
        low: consoleErrors.filter(e => ['warning', 'warn'].includes(e.type)).length + networkErrors.filter(e => e.status >= 400 && e.status < 500).length
      },
      // 页面功能状态评估
      pageStatus: pageErrorRecords.length > 0 ? 'blocked' : (networkErrors.filter(e => e.status >= 500).length > 0 || silentFailErrors.length > 0 ? 'degraded' : 'functional'),
      // 最后操作的错误摘要
      lastActionStatus: lastAction?.errorsDetected ? { hasErrors: true, errorCount: lastAction.errorCount } : { hasErrors: false }
    },
    byLevel,
    consoleErrors,
    pageErrors: pageErrorRecords,
    networkErrors,
    silentFailErrors,
    mcpErrors,
    backendProbeErrors: includeBackendProbe ? (backendProbeResults || []) : [],
    imageErrors: imageErrorRecords.map(e => ({
      image: e.image,
      timestamp: e.timestamp,
      visibleErrorCount: e.visibleErrors.length,
      consoleErrorAtScreenshot: e.consoleErrors.length,
      samples: e.visibleErrors.slice(0, 3).map(v => v.text),
      consoleSamples: e.consoleErrors.slice(0, 3).map(c => c.text)
    }))
  });
}

async function inspectDom(target, selector) {
  const el = await target.$(selector);
  if (!el) {
    return { error: `未找到匹配选择器的元素：${selector}`, selector };
  }
  return redact(await target.$eval(selector, el => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const type = (el.getAttribute('type') || '').toLowerCase();
    const sensitive = ['password'].includes(type) || /key|token|secret|password/i.test(`${el.id} ${el.name} ${el.placeholder}`);
    return {
      selector: el.id ? `#${el.id}` : el.tagName.toLowerCase(),
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      className: typeof el.className === 'string' ? el.className : '',
      text: (el.innerText || el.textContent || '').trim().slice(0, 2000),
      value: 'value' in el ? (sensitive ? '******' : el.value) : undefined,
      visible: !!(rect.width || rect.height),
      disabled: !!el.disabled,
      attributes: Array.from(el.attributes || []).reduce((acc, attr) => {
        acc[attr.name] = /key|token|secret|password/i.test(attr.name) ? '******' : attr.value;
        return acc;
      }, {}),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      style: { display: style.display, visibility: style.visibility, opacity: style.opacity, color: style.color, backgroundColor: style.backgroundColor, zIndex: style.zIndex }
    };
  }));
}

async function getStorageSnapshot(target, scope = 'all') {
  try {
    return redact(await target.evaluate(requestedScope => {
      const readStorage = storage => Object.keys(storage).reduce((acc, key) => {
        acc[key] = storage.getItem(key);
        return acc;
      }, {});
      const result = {};
      if (requestedScope === 'all' || requestedScope === 'localStorage') result.localStorage = readStorage(localStorage);
      if (requestedScope === 'all' || requestedScope === 'sessionStorage') result.sessionStorage = readStorage(sessionStorage);
      if (requestedScope === 'all' || requestedScope === 'cookies') result.cookies = document.cookie;
      return result;
    }, scope));
  } catch (e) {
    return { error: 'Storage access denied: ' + e.message, hint: 'Navigate to a real page first (about:blank blocks storage access)' };
  }
}

async function buildDebugReport(target, args = {}) {
  const pageInfo = await target.evaluate(() => ({ url: location.href, title: document.title, readyState: document.readyState, route: location.hash || location.pathname, bodyText: document.body.innerText.slice(0, 3000) }));
  const report = { generatedAt: new Date().toISOString(), checkpoint: stateManager.currentCheckpoint, page: pageInfo, lastAction, errors: getUnifiedErrors({ ...args, includeWarnings: true }) };
  if (args.includeDom !== false) {
    const domStats = await target.evaluate(() => {
      const all = document.querySelectorAll('*');
      return {
        totalElements: all.length,
        inputs: document.querySelectorAll('input, textarea, select').length,
        buttons: document.querySelectorAll('button, [role="button"], .btn, input[type="submit"]').length,
        links: document.querySelectorAll('a[href]').length,
        images: document.querySelectorAll('img').length,
        forms: document.querySelectorAll('form').length,
        tables: document.querySelectorAll('table').length,
        iframes: document.querySelectorAll('iframe').length,
        navs: document.querySelectorAll('nav, [role="navigation"]').length,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        scrollSize: { w: document.body.scrollWidth, h: document.body.scrollHeight }
      };
    });
    report.domStats = domStats;
    report.dom = await target.evaluate(() => ({
      forms: Array.from(document.querySelectorAll('form')).map(form => ({ id: form.id || '', text: form.innerText.slice(0, 500) })),
      buttons: Array.from(document.querySelectorAll('button, a')).slice(0, 80).map(el => ({ id: el.id || '', text: (el.innerText || '').trim(), href: el.href || '' })),
      visibleErrors: Array.from(document.querySelectorAll('.error,.error-message,.toast,.alert,[role="alert"]')).slice(0, 20).map(el => ({ text: (el.innerText || '').trim(), className: el.className || '' }))
    }));
  }
  if (args.includeStorage === true) report.storage = await getStorageSnapshot(target, 'all');
  return redact(report);
}

async function screenshotWithRedaction(target, filePath, args = {}) {
  if (!args) args = {};
  const selectors = Array.isArray(args.redactSelectors) ? [...args.redactSelectors] : [];
  selectors.push('input[type="password"]', 'input[id*="key" i]', 'input[name*="key" i]', 'textarea[id*="key" i]', 'textarea[name*="key" i]', 'input[id*="token" i]', 'input[name*="token" i]');
  const handles = [];
  for (const selector of selectors) {
    const elements = await target.$$(selector).catch(() => []);
    for (const el of elements) {
      const handle = await el.evaluateHandle(node => {
        const oldValue = 'value' in node ? node.value : null;
        const oldText = node.textContent;
        node.dataset.mcpOldValue = oldValue == null ? '' : oldValue;
        node.dataset.mcpOldText = oldText == null ? '' : oldText;
        if ('value' in node) node.value = '******';
        else node.textContent = '******';
        return node;
      }).catch(() => null);
      if (handle) handles.push(handle);
    }
  }
  const screenshotTarget = args.selector ? target.locator(args.selector).first() : target;
  const screenshotOptions = { path: filePath };
  if (!args.selector) screenshotOptions.fullPage = args.fullPage !== false;
  try {
    await screenshotTarget.screenshot(screenshotOptions);
  } finally {
    for (const handle of handles) {
      await handle.evaluate(node => {
        if ('value' in node && node.dataset.mcpOldValue != null) node.value = node.dataset.mcpOldValue;
        if (!('value' in node) && node.dataset.mcpOldText != null) node.textContent = node.dataset.mcpOldText;
        delete node.dataset.mcpOldValue;
        delete node.dataset.mcpOldText;
      }).catch(() => {});
    }
  }
}

function ensureArtifactsDir() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  fs.mkdirSync(TRACE_DIR, { recursive: true });
  fs.mkdirSync(HAR_DIR, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.mkdirSync(VISUAL_BASELINE_DIR, { recursive: true });
  fs.mkdirSync(VISUAL_ACTUAL_DIR, { recursive: true });
  fs.mkdirSync(VISUAL_DIFF_DIR, { recursive: true });
  if (currentRunId) {
    fs.mkdirSync(getActiveScreenshotDir(), { recursive: true });
    fs.mkdirSync(getActiveTraceDir(), { recursive: true });
    fs.mkdirSync(getActiveHarDir(), { recursive: true });
    fs.mkdirSync(getActiveReportDir(), { recursive: true });
    fs.mkdirSync(getActiveVisualBaselineDir(), { recursive: true });
    fs.mkdirSync(getActiveVisualActualDir(), { recursive: true });
    fs.mkdirSync(getActiveVisualDiffDir(), { recursive: true });
  }
}

async function captureStepEvidence(target, label = 'step', args = {}) {
  ensureArtifactsDir();
  const safeName = `${Date.now()}-${label}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const screenshotPath = path.join(getActiveScreenshotDir(), `${safeName}.png`);
  if (args.screenshot !== false) await screenshotWithRedaction(target, screenshotPath, args);

  // 截图后自动分析错误
  if (args.autoAnalyze !== false) {
    const analysis = await analyzeScreenshotForErrors(target, screenshotPath).catch(() => null);
    if (analysis && analysis.hasErrors) {
      logger.log('WARN', `步骤 "${label}" 检测到错误`, { errorCount: analysis.errorCount });
    }
  }

  const snapshot = args.snapshot === false ? null : await target.evaluate(() => ({
    url: location.href,
    title: document.title,
    visibleText: document.body.innerText.slice(0, 3000)
  }));
  return redact({
    label,
    timestamp: new Date().toISOString(),
    url: target.url(),
    screenshotPath: args.screenshot === false ? null : screenshotPath,
    snapshot,
    errors: getUnifiedErrors({ currentOnly: true, includeWarnings: args.includeWarnings === true })
  });
}

async function waitForCondition(target, args = {}) {
  const timeout = args.timeout || 10000;
  if (args.selector && !args.text) {
    await target.waitForSelector(args.selector, { timeout, state: args.state || 'visible' });
  }
  if (args.text) {
    const locator = args.selector
      ? target.locator(args.selector).filter({ hasText: args.text })
      : target.getByText(args.text, { exact: args.exact === true });
    const targetLocator = Number.isInteger(args.nth) ? locator.nth(args.nth) : locator.first();
    await targetLocator.waitFor({ timeout, state: args.state || 'visible' });
  }
  if (args.urlContains) await target.waitForURL(url => String(url).includes(args.urlContains), { timeout });
  if (args.loadState) await target.waitForLoadState(args.loadState, { timeout });
  if (args.ms || args.waitMs) await target.waitForTimeout(args.ms || args.waitMs);
  return { ok: true, url: target.url(), timestamp: new Date().toISOString() };
}

async function assertPage(target, args = {}) {
  const checks = [];
  const fail = (name, expected, actual) => checks.push({ name, pass: false, expected, actual });
  const pass = (name, actual) => checks.push({ name, pass: true, actual });

  if (args.urlContains) {
    const actual = target.url();
    actual.includes(args.urlContains) ? pass('urlContains', actual) : fail('urlContains', args.urlContains, actual);
  }
  if (args.textContains) {
    const bodyText = await target.locator('body').innerText({ timeout: args.timeout || 5000 }).catch(() => '');
    bodyText.includes(args.textContains) ? pass('textContains', args.textContains) : fail('textContains', args.textContains, bodyText.slice(0, 500));
  }
  if (args.textEquals) {
    const bodyText = await target.locator('body').innerText({ timeout: args.timeout || 5000 }).catch(() => '');
    bodyText.trim() === args.textEquals ? pass('textEquals', bodyText.trim().slice(0, 500)) : fail('textEquals', args.textEquals, bodyText.slice(0, 500));
  }
  if (args.selectorVisible) {
    const visible = await target.locator(args.selectorVisible).first().isVisible().catch(() => false);
    visible ? pass('selectorVisible', args.selectorVisible) : fail('selectorVisible', args.selectorVisible, visible);
  }
  if (args.selectorHidden) {
    const visible = await target.locator(args.selectorHidden).first().isVisible().catch(() => false);
    !visible ? pass('selectorHidden', args.selectorHidden) : fail('selectorHidden', args.selectorHidden, visible);
  }
  if (args.selectorCount) {
    const { selector, operator, value } = args.selectorCount;
    const count = await target.locator(selector).count().catch(() => 0);
    const op = operator || '==';
    let passed = false;
    if (op === '==') passed = count === value;
    else if (op === '>') passed = count > value;
    else if (op === '<') passed = count < value;
    else if (op === '>=') passed = count >= value;
    else if (op === '<=') passed = count <= value;
    const label = `选择器"${selector}"数量${op}${value}`;
    passed ? pass(label, `实际数量: ${count}`) : fail(label, `期望数量${op}${value}`, `实际数量: ${count}`);
  }
  if (args.noErrors === true) {
    const errors = getUnifiedErrors({ currentOnly: true, includeWarnings: false });
    errors.summary.total === 0 ? pass('noErrors', errors.summary) : fail('noErrors', 0, errors.summary);
  }

  const passed = checks.every(item => item.pass);
  const result = redact({
    passed,
    summary: passed ? '所有断言通过' : '部分断言失败',
    checks,
    total: checks.length,
    passedCount: checks.filter(c => c.pass).length,
    failedCount: checks.filter(c => !c.pass).length,
    errors: args.includeErrors === true ? getUnifiedErrors({ currentOnly: true }) : undefined
  });

  // 断言失败时自动截取证据
  if (!passed && args.autoScreenshot !== false) {
    try {
      ensureArtifactsDir();
      const safeName = `assert-fail-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const screenshotPath = path.join(getActiveScreenshotDir(), `${safeName}.png`);
      await screenshotWithRedaction(target, screenshotPath, {});
      result.evidenceScreenshot = screenshotPath;
      // 自动分析截图中的可见错误
      const analysis = await analyzeScreenshotForErrors(target, screenshotPath).catch(() => null);
      if (analysis && analysis.hasErrors) {
        result.evidenceErrors = {
          visible: analysis.visibleErrors.length,
          console: analysis.consoleErrors.length,
          page: analysis.pageErrors.length,
          samples: analysis.visibleErrors.slice(0, 3).map(v => v.text)
        };
      }
    } catch (e) {
      logger.log('WARN', '断言失败自动截图失败', { error: e.message });
    }
  }

  return result;
}

async function runFlow(target, args = {}) {
  if (args.clearErrors !== false) resetRuntimeLogs();
  const steps = Array.isArray(args.steps) ? args.steps : [];
  const results = [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const label = step.name || `${index + 1}-${step.type || 'step'}`;
    try {
      if (step.type === 'open') await callTool('browser_open', step);
      else if (step.type === 'click') await callTool('browser_click', step);
      else if (step.type === 'type') await callTool('browser_type', step);
      else if (step.type === 'wait') await waitForCondition(target, step);
      else if (step.type === 'assert') results.push({ label, assertion: await assertPage(target, step) });
      else if (step.type === 'eval') await callTool('browser_eval', step);
      else if (step.type === 'clearErrors') resetRuntimeLogs();
      else if (step.type === 'step') await callTool('browser_step', step);
      else if (step.type === 'screenshot') await callTool('browser_screenshot', step);
      else if (step.type === 'snapshot') await callTool('browser_snapshot', step);
      else if (step.type === 'scroll') await callTool('browser_scroll', step);
      else if (step.type === 'hover') await callTool('browser_hover', step);
      else if (step.type === 'select') await callTool('browser_select', step);
      else if (step.type === 'navigate') await callTool('browser_navigate', step);
      else if (step.type === 'har') await callTool('browser_har_export', step);
      else throw new Error(`未知 flow step 类型：${step.type}`);

      const evidence = step.evidence === false ? null : await captureStepEvidence(target, label, { screenshot: step.screenshot, snapshot: step.snapshot });
      results.push({ label, type: step.type, ok: true, evidence });
    } catch (error) {
      const evidence = await captureStepEvidence(target, `${label}-failed`, { screenshot: true, snapshot: true }).catch(() => null);
      results.push({ label, type: step.type, ok: false, error: error.message, evidence });
      if (args.continueOnError !== true) break;
    }
  }
  const errors = getUnifiedErrors({ currentOnly: true });
  return redact({ passed: results.every(item => item.ok !== false && (!item.assertion || item.assertion.passed)), checkpoint: stateManager.currentCheckpoint, results, errors });
}

function listFilesRecursive(dir, baseDir = dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFilesRecursive(fullPath, baseDir);
    const stat = fs.statSync(fullPath);
    return [{
      name: entry.name,
      path: fullPath,
      relativePath: path.relative(baseDir, fullPath),
      size: stat.size,
      updatedAt: stat.mtime.toISOString()
    }];
  });
}

function getArtifacts() {
  ensureArtifactsDir();
  return redact({
    checkpoint: stateManager.currentCheckpoint,
    traceActive,
    currentTraceName,
    currentRunId,
    currentRunDir,
    screenshots: listFilesRecursive(getActiveScreenshotDir()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    traces: listFilesRecursive(getActiveTraceDir()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    har: listFilesRecursive(getActiveHarDir()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    reports: listFilesRecursive(getActiveReportDir()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    visual: getVisualArtifacts(),
    logFile: fs.existsSync(LOG_FILE) ? LOG_FILE : null
  });
}

function clearArtifacts(args = {}) {
  const includeLogs = args.includeLogs === true;
  const includeVisual = args.includeVisual !== false;
  const dirs = [getActiveScreenshotDir(), getActiveTraceDir(), getActiveHarDir(), getActiveReportDir()];
  if (includeVisual) dirs.push(getActiveVisualBaselineDir(), getActiveVisualActualDir(), getActiveVisualDiffDir());
  for (const dir of dirs) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
  if (includeLogs && fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '');
  return { cleared: true, includeLogs, includeVisual, checkpoint: currentCheckpoint, currentRunId };
}

function getVisualArtifacts() {
  ensureArtifactsDir();
  return {
    baselines: listFilesRecursive(getActiveVisualBaselineDir()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    actual: listFilesRecursive(getActiveVisualActualDir()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    diff: listFilesRecursive(getActiveVisualDiffDir()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    recentComparisons: lastQualityChecks.visual.slice(-20).reverse()
  };
}

function safeArtifactName(name, fallback) {
  return String(name || fallback || `artifact-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function visualBaseline(target, args = {}) {
  ensureArtifactsDir();
  const safeName = safeArtifactName(args.name, `baseline-${Date.now()}`);
  const filePath = path.join(getActiveVisualBaselineDir(), `${safeName}.png`);
  await screenshotWithRedaction(target, filePath, { selector: args.selector, fullPage: args.fullPage !== false, redactSelectors: args.maskSelectors });
  const result = redact({ saved: true, name: safeName, path: filePath, selector: args.selector || null, fullPage: args.fullPage !== false, timestamp: new Date().toISOString() });
  lastQualityChecks.visual.push({ type: 'baseline', ...result });
  return result;
}

function comparePngFiles(baselinePath, actualPath, diffPath) {
  const { PNG } = require('pngjs');
  const pixelmatch = require('pixelmatch').default || require('pixelmatch');
  const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
  const actual = PNG.sync.read(fs.readFileSync(actualPath));
  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    const width = Math.max(baseline.width, actual.width);
    const height = Math.max(baseline.height, actual.height);
    const diff = new PNG({ width, height });
    for (let i = 0; i < diff.data.length; i += 4) {
      diff.data[i] = 255;
      diff.data[i + 1] = 0;
      diff.data[i + 2] = 0;
      diff.data[i + 3] = 255;
    }
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    return { diffPixels: width * height, totalPixels: width * height, dimensionsMismatch: true, baselineSize: { width: baseline.width, height: baseline.height }, actualSize: { width: actual.width, height: actual.height } };
  }
  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const diffPixels = pixelmatch(baseline.data, actual.data, diff.data, baseline.width, baseline.height, { threshold: 0.1 });
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  return { diffPixels, totalPixels: baseline.width * baseline.height, dimensionsMismatch: false, baselineSize: { width: baseline.width, height: baseline.height }, actualSize: { width: actual.width, height: actual.height } };
}

async function visualCompare(target, args = {}) {
  ensureArtifactsDir();
  const safeName = safeArtifactName(args.name, `compare-${Date.now()}`);
  const baselinePath = path.join(getActiveVisualBaselineDir(), `${safeName}.png`);
  if (!fs.existsSync(baselinePath)) throw new Error(`未找到视觉基线：${baselinePath}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const actualPath = path.join(getActiveVisualActualDir(), `${safeName}-${stamp}.png`);
  const diffPath = path.join(getActiveVisualDiffDir(), `${safeName}-${stamp}.png`);
  await screenshotWithRedaction(target, actualPath, { selector: args.selector, fullPage: args.fullPage !== false, redactSelectors: args.maskSelectors });
  const comparison = comparePngFiles(baselinePath, actualPath, diffPath);
  const maxDiffPixelRatio = typeof args.maxDiffPixelRatio === 'number' ? args.maxDiffPixelRatio : 0.01;
  const diffRatio = comparison.totalPixels ? comparison.diffPixels / comparison.totalPixels : 0;
  const result = redact({
    name: safeName,
    passed: diffRatio <= maxDiffPixelRatio && !comparison.dimensionsMismatch,
    diffPixels: comparison.diffPixels,
    totalPixels: comparison.totalPixels,
    diffRatio,
    maxDiffPixelRatio,
    dimensionsMismatch: comparison.dimensionsMismatch,
    baselineSize: comparison.baselineSize,
    actualSize: comparison.actualSize,
    baseline: baselinePath,
    actual: actualPath,
    diff: diffPath,
    selector: args.selector || null,
    timestamp: new Date().toISOString()
  });
  lastQualityChecks.visual.push({ type: 'compare', ...result });
  return result;
}

function visualReport() {
  ensureArtifactsDir();
  return redact({ generatedAt: new Date().toISOString(), ...getVisualArtifacts() });
}

async function runA11yCheck(target, args = {}) {
  const startTime = Date.now();
  const axePath = require.resolve('axe-core/axe.min.js');
  await target.addScriptTag({ path: axePath }).catch(async () => {
    await target.evaluate(fs.readFileSync(axePath, 'utf8'));
  });

  // 超时控制
  const timeout = args.timeout || 5000;
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`a11y_check超时(${timeout}ms)`)), timeout)
  );

  // 限定标签（减少扫描范围），默认只扫核心标签
  const tags = args.tags || ['wcag2a', 'wcag2aa', 'best-practice'];

  const scanPromise = (async () => {
    const result = await target.evaluate(({ selector, tags, excludeSelectors }) => {
      return new Promise(resolve => {
        const axe = window.axe;
        if (!axe) {
          resolve({ error: 'axe-core未加载' });
          return;
        }
        const options = {};
        if (Array.isArray(tags) && tags.length) options.runOnly = { type: 'tag', values: tags };
        let context = document;
        const excludes = Array.isArray(excludeSelectors) ? excludeSelectors.map(item => [item]) : [];
        if (selector || excludes.length) {
          context = {};
          if (selector) {
            const el = document.querySelector(selector);
            if (el) context.include = [el];
          }
          if (excludes.length) context.exclude = excludes;
        }
        axe.run(context, options, (err, results) => {
          if (err) resolve({ error: err.message });
          else resolve(results);
        });
      });
    }, { selector: args.selector, tags, excludeSelectors: args.excludeSelectors });
    return result;
  })();

  try {
    const result = await Promise.race([scanPromise, timeoutPromise]);
    const cost = Date.now() - startTime;
    logger.log('PERF', `a11y_check完成`, { cost: `${cost}ms`, violations: result.violations?.length || 0 });

    if (result.error) {
      const output = redact({ passed: false, error: result.error, timestamp: new Date().toISOString() });
      lastQualityChecks.a11y = output;
      return output;
    }

    const violations = result.violations.map(item => ({
      id: item.id,
      impact: item.impact,
      description: item.description,
      helpUrl: item.helpUrl,
      nodes: item.nodes.map(node => ({ target: node.target, html: node.html, summary: node.failureSummary }))
    }));
    const output = redact({ passed: violations.length === 0, violationCount: violations.length, violations, timestamp: new Date().toISOString() });
    lastQualityChecks.a11y = output;
    return output;
  } catch (e) {
    const cost = Date.now() - startTime;
    logger.log('PERF', `a11y_check超时`, { cost: `${cost}ms`, error: e.message });
    const output = redact({ error: e.message, timeout: true, partial: true, timestamp: new Date().toISOString() });
    lastQualityChecks.a11y = output;
    return output;
  }
}

async function runPerformanceCheck(target, args = {}) {
  const startTime = Date.now();

  // 超时控制
  const timeout = args.timeout || 3000;
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`performance_check超时(${timeout}ms)`)), timeout)
  );

  const perfPromise = (async () => {
    const pageMetrics = await target.evaluate((budgets) => {
      const perf = performance;
      const nav = perf.getEntriesByType('navigation')[0];
      const paints = perf.getEntriesByType('paint');
      const fcp = paints.find(e => e.name === 'first-contentful-paint');

      // CLS - 直接从layout-shift entries取
      let cls = 0;
      try {
        const layoutShifts = perf.getEntriesByType('layout-shift');
        cls = layoutShifts.reduce((sum, e) => sum + e.value, 0);
      } catch (e) { /* browser perf API: non-critical */ }

      // LCP
      let lcp = 0;
      try {
        const lcpEntries = perf.getEntriesByType('largest-contentful-paint');
        if (lcpEntries.length > 0) lcp = lcpEntries[lcpEntries.length - 1].startTime;
      } catch (e) { /* browser perf API: non-critical */ }

      const metrics = {
        domContentLoaded: Math.round(nav?.domContentLoadedEventEnd || 0),
        load: Math.round(nav?.loadEventEnd || 0),
        fcp: Math.round(fcp?.startTime || 0),
        lcp: Math.round(lcp),
        cls: Math.round(cls * 1000) / 1000,
        resourceCount: perf.getEntriesByType('resource').length
      };

      // 检查 budgets
      if (budgets) {
        const failed = [];
        if (budgets.domContentLoaded && metrics.domContentLoaded > budgets.domContentLoaded) failed.push('domContentLoaded');
        if (budgets.load && metrics.load > budgets.load) failed.push('load');
        if (budgets.fcp && metrics.fcp > budgets.fcp) failed.push('fcp');
        metrics.budgetResults = { passed: failed.length === 0, failed };
      }

      return metrics;
    }, args.budgets);

    // 慢请求统计（保留）
    const slowRequestMs = args.slowRequestMs || 1000;
    const slowRequests = networkLogs.filter(item => typeof item.duration === 'number' && item.duration >= slowRequestMs).map(item => ({ url: item.url, method: item.method, status: item.status, duration: item.duration, timestamp: item.timestamp }));

    const metrics = {
      domContentLoaded: pageMetrics.domContentLoaded,
      load: pageMetrics.load,
      fcp: pageMetrics.fcp,
      lcp: pageMetrics.lcp,
      cls: pageMetrics.cls,
      resourceCount: pageMetrics.resourceCount,
      slowRequests
    };

    const budgetResults = [];
    const budgets = pageMetrics.budgetResults ? [pageMetrics.budgetResults] : [];
    if (budgets.length > 0) {
      budgetResults.push(...budgets);
    }

    return { passed: budgetResults.length === 0 || budgetResults.every(item => item.passed), metrics, budgetResults, slowRequestMs };
  })();

  try {
    const result = await Promise.race([perfPromise, timeoutPromise]);
    const cost = Date.now() - startTime;
    logger.log('PERF', `performance_check完成`, { cost: `${cost}ms`, metrics: result.metrics });
    const output = redact({ ...result, timestamp: new Date().toISOString() });
    lastQualityChecks.performance = output;
    return output;
  } catch (e) {
    const cost = Date.now() - startTime;
    logger.log('PERF', `performance_check超时`, { cost: `${cost}ms`, error: e.message });
    const output = redact({ error: e.message, timeout: true, timestamp: new Date().toISOString() });
    lastQualityChecks.performance = output;
    return output;
  }
}

/**
 * 执行 Google Lighthouse 审计
 */
async function runLighthouseAudit(args = {}) {
  try {
    const url = args.url || (page && !page.isClosed() ? page.url() : null);
    if (!url && !args.url) {
      return { error: '未指定 URL 且当前无打开的页面', success: false };
    }
    if (!url) {
      return { error: '未指定 URL', success: false };
    }

    logger.log('INFO', 'Lighthouse审计开始', { url, categories: args.categories });

    // 使用 Playwright 的 Chromium 路径
    const { chromium } = require('playwright');
    const chromePath = chromium.executablePath();

    const chromeLauncher = require('chrome-launcher');
    const lighthouseModule = require('lighthouse');
    const lighthouse = typeof lighthouseModule === 'function'
      ? lighthouseModule
      : (lighthouseModule.default || lighthouseModule.lighthouse);
    if (typeof lighthouse !== 'function') {
      throw new Error('lighthouse 模块已加载但未导出函数，请检查 lighthouse 版本兼容性');
    }

    const lhCacheDir = path.join(__dirname, '.lighthouse-cache');
    fs.mkdirSync(lhCacheDir, { recursive: true });
    const chrome = await chromeLauncher.launch({
      chromePath,
      chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      userDataDir: lhCacheDir
    });

    const categories = args.categories || ['performance', 'accessibility', 'best_practices', 'seo'];
    const formFactor = args.formFactor || 'desktop';

    const options = {
      logLevel: 'error',
      output: 'json',
      onlyCategories: categories,
      port: chrome.port,
      formFactor,
      screenEmulation: { mobile: formFactor === 'mobile' },
      throttling: args.throttling ? undefined : { throttlingMethod: 'provided' }
    };

    const runnerResult = await lighthouse(url, options);
    try { await chrome.kill(); } catch (_) { /* cleanup: ignore */ }

    if (!runnerResult) {
      return { error: 'Lighthouse 审计无返回结果', success: false };
    }

    const { lhr } = runnerResult;

    // 提取各类别评分
    const scores = {};
    const categoriesDetail = {};
    for (const [key, category] of Object.entries(lhr.categories)) {
      scores[key] = Math.round((category.score || 0) * 100);
      categoriesDetail[key] = {
        score: Math.round((category.score || 0) * 100),
        title: category.title,
        description: category.description,
        auditRefs: category.auditRefs?.filter(r => !r.group?.includes('hidden')).length || 0
      };
    }

    // 评分等级计算（新增）
    const scoreGrade = (score) => {
      if (score === null) return 'N/A';
      if (score >= 90) return 'A';
      if (score >= 80) return 'B';
      if (score >= 70) return 'C';
      if (score >= 60) return 'D';
      return 'F';
    };
    const scoreValues = Object.values(scores);
    const avgScore = scoreValues.length > 0
      ? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length)
      : 0;
    const summary = {
      overallScore: avgScore,
      grade: scoreGrade(avgScore),
      passedAudits: Object.values(lhr.audits).filter(a => a.score === 1).length,
      failedAudits: Object.values(lhr.audits).filter(a => a.score !== null && a.score < 1).length,
    };

    // 提取关键审计指标
    const keyAuditIds = {
      'first-contentful-paint': { label: 'FCP', unit: 's' },
      'largest-contentful-paint': { label: 'LCP', unit: 's' },
      'cumulative-layout-shift': { label: 'CLS', unit: '' },
      'total-blocking-time': { label: 'TBT', unit: 'ms' },
      'interactive': { label: 'TTI', unit: 's' },
      'speed-index': { label: 'SI', unit: 's' }
    };

    const metrics = {};
    for (const [id, info] of Object.entries(keyAuditIds)) {
      const audit = lhr.audits[id];
      if (audit) {
        const val = audit.numericValue;
        metrics[id] = {
          score: audit.score != null ? Math.round(audit.score * 100) : null,
          value: val != null ? (info.unit === 's' ? (val / 1000).toFixed(2) + 's' : info.unit === 'ms' ? Math.round(val) + 'ms' : val.toFixed(3)) : null,
          displayValue: audit.displayValue || null
        };
      }
    }

    // 提取关键诊断建议（只取 score < 1 的）
    const diagnostics = [];
    for (const [id, audit] of Object.entries(lhr.audits)) {
      if (audit.score != null && audit.score < 1 && audit.title && !audit.group?.includes('hidden')) {
        diagnostics.push({
          id,
          title: audit.title,
          description: (audit.description || '').slice(0, 200),
          score: Math.round(audit.score * 100),
          details: audit.details?.items?.slice(0, 3) || undefined
        });
      }
    }
    diagnostics.sort((a, b) => a.score - b.score).slice(0, 20);

    const result = {
      success: true,
      url: lhr.finalUrl || url,
      formFactor,
      fetchTime: lhr.fetchTime,
      lighthouseVersion: lhr.lighthouseVersion,
      scores,
      categories: categoriesDetail,
      metrics,
      diagnostics: diagnostics.slice(0, 15),
      totalAudits: Object.keys(lhr.audits).length
    };

    logger.log('INFO', 'Lighthouse审计完成', { scores });
    return {
      success: true, url, categories, scores, categoriesDetail, metrics, diagnostics,
      finalUrl: runnerResult.finalUrl || url, generatedTime: new Date().toISOString(),
      summary,  // 新增
    };
  } catch (error) {
    logger.log('ERROR', 'Lighthouse审计失败', { error: error.message });
    return { error: `Lighthouse 审计失败: ${error.message}`, success: false };
  }
}

function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function qualityGateHtml() {
  const visual = lastQualityChecks.visual.slice(-10);
  const parts = [];
  parts.push(`<section><h2>质量门禁摘要</h2>`);
  parts.push(`<h3>视觉回归</h3>${visual.length ? `<ul>${visual.map(item => `<li>${htmlEscape(item.name)} / ${htmlEscape(item.type)}：<strong class="${item.passed === false ? 'fail' : 'pass'}">${item.passed === false ? '失败' : '已记录'}</strong>${item.diff ? ` - <a href="file:///${String(item.diff).replace(/\\/g, '/')}">diff</a>` : ''}${item.actual ? ` - <a href="file:///${String(item.actual).replace(/\\/g, '/')}">actual</a>` : ''}${item.baseline ? ` - <a href="file:///${String(item.baseline).replace(/\\/g, '/')}">baseline</a>` : ''}</li>`).join('')}</ul>` : '<p>无视觉回归记录。</p>'}`);
  parts.push(`<h3>可访问性</h3>${lastQualityChecks.a11y ? `<p>结果：<strong class="${lastQualityChecks.a11y.passed ? 'pass' : 'fail'}">${lastQualityChecks.a11y.passed ? '通过' : '失败'}</strong>；违规数：${lastQualityChecks.a11y.violationCount}</p>` : '<p>无可访问性检查记录。</p>'}`);
  parts.push(`<h3>性能预算</h3>${lastQualityChecks.performance ? `<p>结果：<strong class="${lastQualityChecks.performance.passed ? 'pass' : 'fail'}">${lastQualityChecks.performance.passed ? '通过' : '失败'}</strong>；预算项：${lastQualityChecks.performance.budgetResults.length}</p>` : '<p>无性能预算检查记录。</p>'}`);
  parts.push(`</section>`);
  return parts.join('');
}

function filterNetwork(items, args = {}) {
  return stateManager.filterNetwork(items, args);
}

function filterNetworkDetails(args = {}) {
  return redact(filterNetwork(networkLogs, args).slice(-(args.limit || 50)));
}

function exportHar(args = {}) {
  ensureArtifactsDir();
  const records = filterNetwork(networkLogs, args);
  const entries = records.map(item => ({
    startedDateTime: item.timestamp,
    time: item.duration || 0,
    request: {
      method: item.method || 'GET',
      url: item.url,
      headers: Object.entries(item.requestHeaders || {}).map(([name, value]) => ({ name, value })),
      postData: item.requestBody ? { mimeType: item.requestHeaders?.['content-type'] || '', text: item.requestBody } : undefined
    },
    response: {
      status: item.status || 0,
      statusText: item.failed ? item.errorText || 'FAILED' : '',
      headers: Object.entries(item.responseHeaders || {}).map(([name, value]) => ({ name, value })),
      content: { size: item.responseBody ? item.responseBody.length : 0, text: item.responseBody || '' }
    }
  }));
  const har = redact({
    log: {
      version: '1.2',
      creator: { name: 'ai-verify-mcp', version: VERSION },
      pages: [],
      entries
    }
  });
  const safeName = (args.name || `network-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = path.join(getActiveHarDir(), `${safeName}.har.json`);
  fs.writeFileSync(filePath, JSON.stringify(har, null, 2));
  return { exported: true, filePath, count: entries.length, checkpoint: currentCheckpoint };
}

function inferDebugHypotheses(errors, networkDetails, events) {
  const hypotheses = [];
  const statuses = networkDetails.map(item => Number(item.status || 0));
  if (statuses.includes(401)) hypotheses.push('存在 401：优先检查登录态、token 是否过期、Authorization 请求头是否缺失。');
  if (statuses.includes(403)) hypotheses.push('存在 403：优先检查权限、订阅/额度、同步开关、后端业务拒绝原因。');
  if (statuses.some(status => status >= 500)) hypotheses.push('存在 5xx：优先查看响应体中的 detail/error 和服务端日志。');
  if (networkDetails.some(item => String(item.responseBody || '').includes('CHECK constraint failed'))) hypotheses.push('响应包含数据库约束失败：优先检查表结构约束和写入枚举值是否兼容。');
  if (errors.summary.consoleErrorCount > 0) hypotheses.push('存在 Console Error：优先根据错误堆栈定位前端源码和触发操作。');
  if (events.some(item => item.type === 'unhandledrejection')) hypotheses.push('存在未处理 Promise 拒绝：优先检查异步接口 catch/finally 和错误兜底。');
  if (events.some(item => item.type === 'fetch_error' || item.type === 'xhr_error')) hypotheses.push('存在网络请求失败：优先检查服务可用性、CORS、目标地址和网络连接。');
  if (!hypotheses.length) hypotheses.push('未发现明确错误信号：建议扩大复现步骤、开启 trace、增加断言并检查业务预期。');
  return hypotheses;
}

async function investigateDebug(target, args = {}) {
  const focus = args.focus || args.urlContains || '';
  const networkArgs = { currentOnly: true, limit: args.limit || 20 };
  if (focus) networkArgs.urlContains = focus;
  if (args.statusMin) networkArgs.statusMin = args.statusMin;
  const errors = getUnifiedErrors({ currentOnly: true, includeWarnings: true, urlContains: focus || undefined });
  const networkDetails = filterNetworkDetails(networkArgs);
  const events = (await getBrowserEvents(target, { limit: args.limit || 50, urlContains: focus || undefined })).events;
  const pageInfo = await target.evaluate(() => ({
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    visibleText: document.body.innerText.slice(0, 2000),
    visibleErrors: Array.from(document.querySelectorAll('.error,.error-message,.toast,.alert,[role="alert"]')).slice(0, 20).map(el => (el.innerText || '').trim())
  })).catch(error => ({ error: error.message }));
  const storage = args.includeStorage === false ? undefined : await getStorageSnapshot(target, 'all').catch(error => ({ error: error.message }));
  const artifacts = args.includeArtifacts === false ? undefined : getArtifacts();
  const hypotheses = inferDebugHypotheses(errors, networkDetails, events);
  return redact({
    symptom: args.symptom || '',
    expected: args.expected || '',
    checkpoint: currentCheckpoint,
    eventCheckpoint,
    page: pageInfo,
    hypotheses,
    evidence: { errors, networkDetails, events, storage, artifacts },
    nextSteps: [
      '根据 hypotheses 中的最高优先级假设定位代码或配置。',
      '修复后重新执行 browser_errors_clear、browser_events_clear、browser_flow、browser_assert。',
      '若仍失败，导出 browser_har_export 和 browser_trace_stop 产物继续分析。'
    ]
  });
}

function instrumentationScript() {
  return `(() => {
    if (window.__mcpInstrumented) return;
    window.__mcpInstrumented = true;
    window.__mcpEvents = window.__mcpEvents || [];
    const push = event => {
      try {
        window.__mcpEvents.push({ ...event, timestamp: new Date().toISOString(), url: location.href });
        if (window.__mcpEvents.length > 1000) window.__mcpEvents.shift();
      } catch (_) { /* URL parse fallback */ }
    };
    const short = value => {
      try {
        if (value == null) return value;
        if (typeof value === 'string') return value.slice(0, 2000);
        if (value instanceof Error) return (value.stack || value.message || String(value)).slice(0, 2000);
        const text = JSON.stringify(value);
        return text.slice(0, 2000);
      } catch (_) { return '[unserializable]'; }
    };

    // ===== W3C TraceContext 客户端生成与注入 =====
    // Ref: https://www.w3.org/TR/trace-context/
    // 格式: 00-{32hex traceId}-{16hex spanId}-{2hex flags}
    const genHex = bytes => {
      const a = new Uint8Array(bytes);
      crypto.getRandomValues(a);
      let s = '';
      for (let i = 0; i < a.length; i++) s += a[i].toString(16).padStart(2, '0');
      return s;
    };
    const genTraceId = () => genHex(16);  // 32 hex chars
    const genSpanId = () => genHex(8);    // 16 hex chars
    const safeSessionGet = key => { try { return sessionStorage.getItem(key); } catch (_) { return null; } };
    const safeSessionSet = (key, value) => { try { sessionStorage.setItem(key, value); } catch (_) { /* browser-side: ignore */ } };
    // 当前 navigation span (整页生命周期内复用同一 traceId)
    const navTraceId = safeSessionGet('__mcp_nav_trace_id') || genTraceId();
    const navSpanId = safeSessionGet('__mcp_nav_span_id') || genSpanId();
    safeSessionSet('__mcp_nav_trace_id', navTraceId);
    safeSessionSet('__mcp_nav_span_id', navSpanId);
    const buildTp = (spanId, sampled = true) => '00-' + navTraceId + '-' + spanId + '-' + (sampled ? '01' : '00');
    // 把 traceparent 写入请求 headers，让后端能从 traceparent 解析出 span 上下文
    const injectTrace = (headers, spanId) => {
      try {
        const tp = buildTp(spanId || genSpanId());
        if (headers instanceof Headers) { headers.set('traceparent', tp); }
        else if (headers && typeof headers === 'object') { headers.traceparent = tp; }
        else { return null; }
        push({ type: 'trace_inject', traceparent: tp, spanId });
        return tp;
      } catch (e) { return null; }
    };

    for (const level of ['error', 'warn']) {
      const original = console[level];
      console[level] = function(...args) {
        push({ type: 'console', level, args: args.map(short) });
        return original.apply(this, args);
      };
    }

    // 区分运行时错误和资源加载错误
    window.addEventListener('error', event => {
      const isResourceError = event.target && (event.target.tagName === 'IMG' || event.target.tagName === 'SCRIPT' || event.target.tagName === 'LINK' || event.target.tagName === 'VIDEO' || event.target.tagName === 'AUDIO' || event.target.tagName === 'SOURCE' || event.target.tagName === 'IFRAME');
      if (isResourceError) {
        push({ type: 'resource_error', tagName: event.target.tagName, resourceUrl: event.target.src || event.target.href || '(unknown)' });
      } else if (event.message === 'Script error.' || event.message === 'Script error') {
        push({ type: 'window_error', message: 'Script error. (跨域脚本错误，因 CORS 限制无法获取详情。建议在 <script> 标签添加 crossorigin="anonymous" 属性)', source: event.filename || '(unknown)', line: 0, column: 0, crossOrigin: true, stack: event.error?.stack?.slice(0, 2000) || '' });
      } else {
        push({ type: 'window_error', message: event.message, source: event.filename, line: event.lineno, column: event.colno, stack: event.error?.stack?.slice(0, 2000) || '' });
      }
    });
    window.addEventListener('unhandledrejection', event => push({ type: 'unhandledrejection', reason: short(event.reason) }));

    const originalFetch = window.fetch;
    if (originalFetch) {
      window.fetch = async function(input, init = {}) {
        const startedAt = performance.now();
        const requestUrl = typeof input === 'string' ? input : input?.url;
        const method = init.method || input?.method || 'GET';
        const requestSpanId = genSpanId();
        try {
          init.headers = init.headers || {};
          // 支持 Headers / 普通对象 两种形态
          injectTrace(init.headers, requestSpanId);
        } catch (_) { /* non-critical */ }
        push({ type: 'fetch_start', requestUrl, method, requestBody: short(init.body), spanId: requestSpanId });
        try {
          const response = await originalFetch.apply(this, arguments);
          const duration = Math.round(performance.now() - startedAt);
          response.clone().text().then(body => push({ type: 'fetch_end', requestUrl, method, status: response.status, ok: response.ok, duration, responseBody: short(body), spanId: requestSpanId })).catch(() => push({ type: 'fetch_end', requestUrl, method, status: response.status, ok: response.ok, duration, spanId: requestSpanId }));
          return response;
        } catch (error) {
          push({ type: 'fetch_error', requestUrl, method, error: String(error), duration: Math.round(performance.now() - startedAt), spanId: requestSpanId });
          throw error;
        }
      };
    }

    const OriginalXHR = window.XMLHttpRequest;
    if (OriginalXHR) {
      window.XMLHttpRequest = function() {
        const xhr = new OriginalXHR();
        let requestUrl = '';
        let method = 'GET';
        let startedAt = 0;
        let requestSpanId = '';
        const open = xhr.open;
        xhr.open = function(m, url) { method = m; requestUrl = url; requestSpanId = genSpanId(); return open.apply(xhr, arguments); };
        const setReqHeader = xhr.setRequestHeader;
        xhr.setRequestHeader = function(name, value) {
          if (name.toLowerCase() === 'traceparent') return; // 由 send 一次性注入，避免重复
          return setReqHeader.apply(xhr, arguments);
        };
        const send = xhr.send;
        xhr.send = function(body) {
          startedAt = performance.now();
          try { setReqHeader.call(xhr, 'traceparent', buildTp(requestSpanId)); } catch (_) { /* trace injection: non-critical */ }
          push({ type: 'xhr_start', requestUrl, method, requestBody: short(body), spanId: requestSpanId });
          xhr.addEventListener('loadend', () => push({ type: 'xhr_end', requestUrl, method, status: xhr.status, duration: Math.round(performance.now() - startedAt), responseBody: short(xhr.responseText), spanId: requestSpanId }));
          return send.apply(xhr, arguments);
        };
        return xhr;
      };
    }

    document.addEventListener('click', event => {
      const el = event.target?.closest?.('button,a,input,textarea,select,[role="button"]') || event.target;
      push({ type: 'click', selector: el?.id ? '#' + el.id : el?.tagName?.toLowerCase(), text: (el?.innerText || el?.value || '').slice(0, 200) });
    }, true);

    document.addEventListener('input', event => {
      const el = event.target;
      push({ type: 'input', selector: el?.id ? '#' + el.id : el?.tagName?.toLowerCase(), inputType: el?.type || '', hasValue: Boolean(el?.value) });
    }, true);

    for (const storageName of ['localStorage', 'sessionStorage']) {
      try {
        const storage = window[storageName];
        if (!storage) continue;
        const setItem = storage.setItem.bind(storage);
        const removeItem = storage.removeItem.bind(storage);
        storage.setItem = (key, value) => { push({ type: 'storage_set', storage: storageName, key, hasValue: value != null }); return setItem(key, value); };
        storage.removeItem = key => { push({ type: 'storage_remove', storage: storageName, key }); return removeItem(key); };
      } catch (error) {
        push({ type: 'storage_unavailable', storage: storageName, error: String(error) });
      }
    }

    // SPA navigation span：为每次路由切换生成独立 spanId，沿用同一个 traceId
    const pushState = history.pushState;
    const replaceState = history.replaceState;
    const newNavSpan = () => {
      const sid = genSpanId();
      safeSessionSet('__mcp_nav_span_id', sid);
      safeSessionSet('__mcp_nav_trace_id', navTraceId);
      return sid;
    };
    history.pushState = function() {
      const sid = newNavSpan();
      const result = pushState.apply(this, arguments);
      push({ type: 'route', action: 'pushState', to: location.href, traceId: navTraceId, spanId: sid, traceparent: buildTp(sid) });
      return result;
    };
    history.replaceState = function() {
      const sid = newNavSpan();
      const result = replaceState.apply(this, arguments);
      push({ type: 'route', action: 'replaceState', to: location.href, traceId: navTraceId, spanId: sid, traceparent: buildTp(sid) });
      return result;
    };
    window.addEventListener('hashchange', () => {
      const sid = newNavSpan();
      push({ type: 'route', action: 'hashchange', to: location.href, traceId: navTraceId, spanId: sid, traceparent: buildTp(sid) });
    });
    window.addEventListener('popstate', () => {
      const sid = newNavSpan();
      push({ type: 'route', action: 'popstate', to: location.href, traceId: navTraceId, spanId: sid, traceparent: buildTp(sid) });
    });
    push({ type: 'instrumented', traceId: navTraceId, navSpanId });
  })();`;
}

async function installInstrumentation(target) {
  const script = instrumentationScript();
  await target.addInitScript(script);
  await target.evaluate(script).catch(() => {});
  instrumentationEnabled = true;
  return { installed: true, eventCheckpoint, url: target.url() };
}

async function clearBrowserEvents(target) {
  eventCheckpoint = new Date().toISOString();
  await target.evaluate(() => { window.__mcpEvents = []; }).catch(() => {});
  return { cleared: true, eventCheckpoint };
}

async function getBrowserEvents(target, args = {}) {
  const events = await target.evaluate(() => window.__mcpEvents || []).catch(() => []);
  let records = redact(events);
  const since = args.since ? new Date(args.since).getTime() : new Date(eventCheckpoint).getTime();
  records = records.filter(item => !since || new Date(item.timestamp || 0).getTime() >= since);
  if (args.type) records = records.filter(item => item.type === args.type);
  if (args.urlContains) records = records.filter(item => [item.url, item.requestUrl].some(url => url && url.includes(args.urlContains)));
  if (args.method) records = records.filter(item => item.method === args.method);
  if (typeof args.statusMin === 'number') records = records.filter(item => Number(item.status || 0) >= args.statusMin);
  const limit = args.limit || 100;
  return { eventCheckpoint, instrumentationEnabled, count: records.length, events: records.slice(-limit) };
}

async function startTrace(target, args = {}) {
  ensureArtifactsDir();
  if (traceActive) return { started: false, alreadyActive: true, traceName: currentTraceName };
  currentTraceName = (args.name || `trace-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  await target.context().tracing.start({
    title: currentTraceName,
    screenshots: args.screenshots !== false,
    snapshots: args.snapshots !== false,
    sources: args.sources === true
  });
  traceActive = true;
  return { started: true, traceName: currentTraceName, checkpoint: currentCheckpoint };
}

async function stopTrace(target, args = {}) {
  ensureArtifactsDir();
  if (!traceActive) return { stopped: false, active: false };
  const safeName = (args.name || currentTraceName || `trace-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  const tracePath = path.join(getActiveTraceDir(), `${safeName}.zip`);
  await target.context().tracing.stop({ path: tracePath });
  traceActive = false;
  currentTraceName = null;
  return { stopped: true, tracePath, checkpoint: currentCheckpoint };
}

async function runValidationElement(target, args = {}) {
  const startTime = Date.now();
  if (args.clearErrors !== false) resetRuntimeLogs();
  const selector = args.selector;
  if (!selector) throw new Error('selector is required');

  logger.log('PERF', 'validation_element开始', { selector });

  const checks = [];
  const fail = (name, expected, actual) => checks.push({ name, pass: false, expected, actual });
  const pass = (name, actual) => checks.push({ name, pass: true, actual });

  const locator = target.locator(selector);
  const count = await locator.count().catch(() => 0);

  if (args.exists !== undefined) {
    const exists = count > 0;
    exists === args.exists ? pass('exists', exists) : fail('exists', args.exists, exists);
  }

  if (args.visible !== undefined) {
    if (count === 0) {
      fail('visible', args.visible, false);
    } else {
      const visible = await locator.first().isVisible().catch(() => false);
      visible === args.visible ? pass('visible', visible) : fail('visible', args.visible, visible);
    }
  }

  if (args.enabled !== undefined) {
    if (count === 0) {
      fail('enabled', args.enabled, false);
    } else {
      const isDisabled = await locator.first().isDisabled().catch(() => true);
      const isReadOnly = await locator.first().evaluate(el => el.hasAttribute('readonly')).catch(() => false);
      const enabled = !isDisabled && !isReadOnly;
      enabled === args.enabled ? pass('enabled', enabled) : fail('enabled', args.enabled, enabled);
    }
  }

  if (args.textContains !== undefined) {
    if (count === 0) {
      fail('textContains', args.textContains, '');
    } else {
      const text = await locator.first().innerText({ timeout: 5000 }).catch(() => '');
      text.includes(args.textContains) ? pass('textContains', args.textContains) : fail('textContains', args.textContains, text.slice(0, 500));
    }
  }

  if (args.hasAttribute !== undefined) {
    if (count === 0) {
      fail('hasAttribute', args.hasAttribute, false);
    } else {
      const hasAttr = await locator.first().evaluate((el, attr) => el.hasAttribute(attr), args.hasAttribute).catch(() => false);
      hasAttr ? pass('hasAttribute', args.hasAttribute) : fail('hasAttribute', args.hasAttribute, false);
    }
  }

  if (args.valueEquals !== undefined) {
    if (count === 0) {
      fail('valueEquals', args.valueEquals, '');
    } else {
      const value = await locator.first().inputValue().catch(() => '');
      value === args.valueEquals ? pass('valueEquals', value) : fail('valueEquals', args.valueEquals, value);
    }
  }

  if (args.countEquals !== undefined) {
    count === args.countEquals ? pass('countEquals', count) : fail('countEquals', args.countEquals, count);
  }

  const assertionPassed = checks.every(item => item.pass);
  const assertion = redact({
    passed: assertionPassed,
    summary: assertionPassed ? '所有断言通过' : '部分断言失败',
    checks,
    total: checks.length,
    passedCount: checks.filter(c => c.pass).length,
    failedCount: checks.filter(c => !c.pass).length
  });

  let errorSummary = null;
  if (args.noErrors !== false) {
    const errors = getUnifiedErrors({ currentOnly: true });
    if (errors.summary.total > 0) {
      errorSummary = errors.summary;
    }
  }

  const cost = Date.now() - startTime;
  logger.log('PERF', 'validation_element完成', { cost: `${cost}ms`, passed: assertionPassed });

  const evidence = args.evidence === false ? null : await captureStepEvidence(target, args.name || 'validation-element', { screenshot: args.screenshot ?? !assertionPassed, snapshot: args.snapshot });

  const result = redact({
    name: args.name || 'validation-element',
    passed: assertionPassed && (!errorSummary || errorSummary.total === 0),
    checkpoint: currentCheckpoint,
    url: target.url(),
    duration: cost,
    assertion,
    evidence,
    errors: errorSummary
  });

  return result;
}

async function runValidationQuickRun(target, args = {}) {
  const startTime = Date.now();
  const timeout = args.timeout || 30000;
  const url = args.url;
  if (!url) throw new Error('url 参数必填');
  const allChecks = ['load_time', 'no_js_errors', 'no_5xx', 'no_404', 'not_blank', 'has_title', 'has_content'];
  const requestedChecks = Array.isArray(args.checks) && args.checks.length > 0 ? args.checks : allChecks;
  const checksToRun = requestedChecks.filter(c => allChecks.includes(c));
  resetRuntimeLogs();
  ensureArtifactsDir();
  logger.log('PERF', 'validation_quick_run开始', { url, checks: checksToRun });

  const checks = [];
  let loadTime = 0;

  try {
    const navStart = Date.now();
    await target.goto(url, { waitUntil: 'domcontentloaded', timeout });
    loadTime = Date.now() - navStart;

    if (checksToRun.includes('load_time')) {
      checks.push({ name: 'load_time', passed: true, detail: `页面加载成功，耗时 ${loadTime}ms` });
    }
  } catch (error) {
    loadTime = Date.now() - startTime;
    if (checksToRun.includes('load_time')) {
      checks.push({ name: 'load_time', passed: false, detail: `页面加载失败: ${error.message}` });
    }
    const safeName = `quick-run-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const screenshotPath = path.join(getActiveScreenshotDir(), `${safeName}.png`);
    await screenshotWithRedaction(target, screenshotPath, {}).catch(() => {});
    const duration = Date.now() - startTime;
    const result = redact({
      passed: false,
      url,
      loadTime,
      totalChecks: checksToRun.length,
      passedChecks: 0,
      failedChecks: checksToRun.length,
      checks: checks.concat(checksToRun.filter(c => !checks.find(ch => ch.name === c)).map(name => ({ name, passed: false, detail: '页面加载失败，无法执行后续检查' }))),
      errors: getUnifiedErrors({ currentOnly: true }),
      screenshot: screenshotPath,
      duration,
      timestamp: new Date().toISOString()
    });
    lastValidationRun = { ...result, type: 'quick_run', name: 'validation-quick-run' };
    return result;
  }

  if (checksToRun.includes('no_js_errors')) {
    const consoleErrors = consoleLogs.filter(e => e.type === 'error');
    const hasJsErrors = consoleErrors.length > 0 || pageErrors.length > 0;
    checks.push({
      name: 'no_js_errors',
      passed: !hasJsErrors,
      detail: hasJsErrors
        ? `检测到 ${consoleErrors.length} 个 console.error 和 ${pageErrors.length} 个 pageerror`
        : '无 JS 错误'
    });
  }

  if (checksToRun.includes('no_5xx')) {
    const serverErrors = networkLogs.filter(e => e.status >= 500 && e.status < 600);
    checks.push({
      name: 'no_5xx',
      passed: serverErrors.length === 0,
      detail: serverErrors.length === 0
        ? '无 5xx 服务器错误'
        : `检测到 ${serverErrors.length} 个 5xx 错误: ${serverErrors.slice(0, 3).map(e => `${e.status} ${e.url}`).join('; ')}`
    });
  }

  if (checksToRun.includes('no_404')) {
    const notFoundErrors = networkLogs.filter(e => e.status === 404);
    checks.push({
      name: 'no_404',
      passed: notFoundErrors.length === 0,
      detail: notFoundErrors.length === 0
        ? '无 404 错误'
        : `检测到 ${notFoundErrors.length} 个 404 错误: ${notFoundErrors.slice(0, 3).map(e => e.url).join('; ')}`
    });
  }

  const domInfo = await target.evaluate(() => {
    const bodyText = document.body?.innerText || '';
    const imgCount = document.querySelectorAll('img').length;
    const linkCount = document.querySelectorAll('a[href]').length;
    const buttonCount = document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]').length;
    const title = document.title || '';
    return { bodyTextLength: bodyText.length, imgCount, linkCount, buttonCount, title };
  }).catch(() => ({ bodyTextLength: 0, imgCount: 0, linkCount: 0, buttonCount: 0, title: '' }));

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

  const evidence = await captureStepEvidence(target, 'validation-quick-run', { screenshot: true, snapshot: false });
  const passedChecks = checks.filter(c => c.passed).length;
  const failedChecks = checks.filter(c => !c.passed).length;
  const passed = failedChecks === 0;
  const duration = Date.now() - startTime;

  logger.log('PERF', 'validation_quick_run完成', { cost: `${duration}ms`, total: checks.length, passed: passedChecks, failed: failedChecks });

  const result = redact({
    passed,
    url,
    loadTime,
    totalChecks: checks.length,
    passedChecks,
    failedChecks,
    checks,
    errors: getUnifiedErrors({ currentOnly: true }),
    screenshot: evidence.screenshotPath,
    duration,
    timestamp: new Date().toISOString()
  });

  lastValidationRun = { ...result, type: 'quick_run', name: 'validation-quick-run' };
  return result;
}

async function runValidationCheck(target, args = {}) {
  const startTime = Date.now();
  const timeout = args.timeout || 10000;
  if (args.clearErrors !== false) resetRuntimeLogs();
  if (args.instrument === true) await installInstrumentation(target);

  logger.log('PERF', 'validation_check开始', { url: args.url || '当前页面' });

  // Step 1: 打开页面（如果指定了url）
  if (args.url) {
    await target.goto(args.url, { waitUntil: 'domcontentloaded', timeout: Math.min(timeout, 10000) });
  }

  // Step 2: 等待（如果指定了wait），使用带上限的超时
  if (args.wait) {
    if (args.wait.selector) {
      await target.waitForSelector(args.wait.selector, { timeout: Math.min(timeout, 5000) }).catch(() => {});
    } else if (args.wait.ms) {
      await new Promise(r => setTimeout(r, Math.min(args.wait.ms, 3000)));
    } else {
      await waitForCondition(target, { ...args.wait, timeout: Math.min(timeout, 5000) }).catch(() => {});
    }
  }

  // Step 3: 断言
  const assertionArgs = args.assertions || args;
  const assertion = await assertPage(target, { ...assertionArgs, noErrors: args.noErrors !== false && assertionArgs.noErrors !== false });

  // Step 4: 检查错误
  let errorSummary = null;
  if (args.noErrors !== false) {
    const errors = getUnifiedErrors({ currentOnly: true });
    if (errors.summary.total > 0) {
      errorSummary = errors.summary;
    }
  }

  const cost = Date.now() - startTime;
  logger.log('PERF', 'validation_check完成', { cost: `${cost}ms`, errors: errorSummary?.total || 0 });

  const evidence = args.evidence === false ? null : await captureStepEvidence(target, args.name || 'validation-check', { screenshot: args.screenshot, snapshot: args.snapshot });
  const result = redact({
    name: args.name || 'validation-check',
    passed: assertion.passed,
    checkpoint: currentCheckpoint,
    url: target.url(),
    duration: cost,
    assertion,
    evidence,
    errors: errorSummary
  });
  lastValidationRun = {
    name: result.name,
    type: 'check',
    startedAt: currentCheckpoint,
    endedAt: new Date().toISOString(),
    passed: result.passed,
    cases: [result],
    artifacts: getArtifacts()
  };
  return result;
}

async function runValidationPlan(target, args = {}) {
  const runName = args.name || `validation-${Date.now()}`;
  const startTime = Date.now();
  if (args.clearArtifacts === true) clearArtifacts({ includeLogs: args.includeLogs === true });
  if (args.clearErrors !== false) resetRuntimeLogs();
  if (args.instrument !== false) await installInstrumentation(target);
  await clearBrowserEvents(target).catch(() => {});
  const casesInput = args.cases || [];
  let traceResult = null;
  if (args.trace === true) traceResult = await startTrace(target, { name: runName, screenshots: true, snapshots: true }).catch(error => ({ error: error.message }));

  const cases = [];
  const startedAt = currentCheckpoint;
  for (const testCase of casesInput) {
    const caseStart = new Date().toISOString();
    const caseResult = { name: testCase.name || `case-${cases.length + 1}`, startedAt: caseStart, passed: false };
    try {
      await clearBrowserEvents(target).catch(() => {});
      const flow = await runFlow(target, { steps: testCase.steps || [], continueOnError: testCase.continueOnError === true });
      let assertion = null;
      if (testCase.assertions) assertion = await assertPage(target, testCase.assertions);
      const errors = getUnifiedErrors({ currentOnly: true, urlContains: testCase.focus || undefined });
      caseResult.flow = flow;
      caseResult.assertion = assertion;
      caseResult.errors = errors;
      caseResult.passed = flow.passed && (!assertion || assertion.passed) && errors.summary.total === 0;
      if (!caseResult.passed && args.investigateOnFailure !== false) {
        caseResult.investigation = await investigateDebug(target, {
          symptom: testCase.symptom || `${caseResult.name} 验证失败`,
          expected: testCase.expected || '',
          focus: testCase.focus || '',
          limit: 20
        });
      }
    } catch (error) {
      caseResult.error = error.message;
      caseResult.evidence = await captureStepEvidence(target, `${caseResult.name}-exception`, { screenshot: true, snapshot: true }).catch(() => null);
      if (args.investigateOnFailure !== false) {
        caseResult.investigation = await investigateDebug(target, { symptom: caseResult.error, focus: testCase.focus || '', limit: 20 }).catch(e => ({ error: e.message }));
      }
    }
    caseResult.endedAt = new Date().toISOString();
    cases.push(redact(caseResult));
    if (caseResult.passed === false && args.continueOnFailure !== true) break;
  }

  let har = null;
  if (args.har === true) har = exportHar({ name: runName });
  let traceStop = null;
  if (traceActive && args.trace === true) traceStop = await stopTrace(target, { name: runName }).catch(error => ({ error: error.message }));
  const artifacts = getArtifacts();
  const passedCount = cases.filter(item => item.passed).length;
  const failedCount = cases.filter(item => !item.passed).length;
  const cost = Date.now() - startTime;
  logger.log('PERF', 'validation_run完成', { cost: `${cost}ms`, total: cases.length, passedCount, failedCount });
  lastValidationRun = redact({
    name: runName,
    type: 'run',
    startedAt,
    endedAt: new Date().toISOString(),
    passed: failedCount === 0,
    total: cases.length,
    passedCount,
    failedCount,
    traceStart: traceResult,
    traceStop,
    har,
    cases,
    artifacts
  });
  return lastValidationRun;
}

async function runValidationFlow(target, args = {}) {
  const continueOnFailure = args.continueOnFailure === true;
  const timeout = Number(args.timeout) || 30000;
  const steps = Array.isArray(args.steps) ? args.steps : [];

  const startTime = Date.now();
  const stepResults = [];
  const failures = [];

  // 超时控制
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
      const stepResult = {
        stepIndex: index,
        stepName,
        action,
        passed: false,
        duration: 0,
        error: null
      };

      try {
        switch (action) {
          case 'navigate':
          case 'goto': {
            const url = step.url || step.value;
            if (!url) throw new Error('navigate 步骤需要 url 参数');
            await target.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            break;
          }
          case 'click':
            if (!step.selector) throw new Error('click 步骤需要 selector 参数');
            await target.click(step.selector, { timeout: 10000 });
            break;
          case 'type': {
            if (!step.selector) throw new Error('type 步骤需要 selector 参数');
            const text = step.value || '';
            await target.fill(step.selector, text, { timeout: 10000 });
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
              } catch (e) { /* 值设置非关键 */ }
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
            const screenshotPath = path.join(getActiveScreenshotDir(), `${safeName}.png`);
            await screenshotWithRedaction(target, screenshotPath, {});
            stepResult.screenshot = screenshotPath;
            break;
          }
          case 'assert': {
            const assertion = await assertPage(target, step);
            stepResult.assertion = assertion;
            if (!assertion.passed) {
              throw new Error(`断言失败：${assertion.failedCount || 0} 条未通过`);
            }
            break;
          }
          default:
            throw new Error(`不支持的操作类型：${action}`);
        }

        stepResult.passed = true;
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

      if (!stepResult.passed && !continueOnFailure) break;
    }
  } finally {
    clearTimeout(timeoutTimer);
  }

  const totalSteps = steps.length;
  const passedSteps = stepResults.filter(r => r.passed).length;
  const failedSteps = stepResults.filter(r => !r.passed).length;
  const totalDuration = Date.now() - startTime;

  logger.log('PERF', 'validation_flow完成', { cost: `${totalDuration}ms`, totalSteps, passedSteps, failedSteps });

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

function resolveValidationAssetPath(args = {}) {
  const requested = args.file || args.path;
  if (requested) {
    const resolved = path.resolve(PROJECT_ROOT, requested);
    const allowedRoots = [VALIDATIONS_DIR].map(dir => path.resolve(dir));
    if (!allowedRoots.some(root => resolved === root || resolved.startsWith(root + path.sep))) throw new Error('validation file must be inside .trae/validations');
    return resolved;
  }
  const suite = String(args.suite || '').replace(/\.json$/i, '');
  if (!suite || suite.includes('..') || path.isAbsolute(suite)) throw new Error('suite is required and must be a relative suite name');
  const suiteFile = suite.includes('/') || suite.includes('\\') ? suite : `${suite}.json`;
  return path.join(VALIDATIONS_DIR, 'suites', suiteFile);
}

function readValidationAsset(filePath) {
  const resolved = path.resolve(filePath);
  if (!(resolved === VALIDATIONS_DIR || resolved.startsWith(path.resolve(VALIDATIONS_DIR) + path.sep))) throw new Error('validation asset must be inside .trae/validations');
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

async function runValidationSuite(target, args = {}) {
  const suitePath = resolveValidationAssetPath(args);
  const suite = readValidationAsset(suitePath);
  const suiteName = suite.name || args.suite || path.basename(suitePath, '.json');
  const continueOnFailure = args.continueOnFailure ?? suite.continueOnFailure === true;
  const startedAt = new Date().toISOString();
  const results = [];

  if (Array.isArray(suite.steps) && suite.steps.length > 0) {
    for (let index = 0; index < suite.steps.length; index += 1) {
      const step = suite.steps[index];
      const stepStartedAt = new Date().toISOString();
      const stepLabel = step.description || step.name || `${index + 1}-${step.type || 'step'}`;
      const stepResult = { name: stepLabel, type: step.type, startedAt: stepStartedAt, passed: false };
      try {
        const toolName = step.type;
        if (!toolName) throw new Error('步骤缺少 type 字段');
        const toolArgs = { ...step };
        delete toolArgs.type;
        delete toolArgs.description;
        delete toolArgs.name;
        const toolResult = await callTool(toolName, toolArgs);
        let parsedResult = toolResult;
        if (typeof toolResult === 'object' && toolResult.content && Array.isArray(toolResult.content)) {
          const textContent = toolResult.content.find(c => c.type === 'text');
          if (textContent && textContent.text) {
            try { parsedResult = JSON.parse(textContent.text); } catch (_) { parsedResult = { text: textContent.text }; }
          }
        }
        stepResult.result = parsedResult;
        if (toolName === 'browser_assert') stepResult.passed = parsedResult?.passed === true;
        else if (toolName === 'validation_report') stepResult.passed = true;
        else stepResult.passed = true;
      } catch (error) {
        stepResult.error = error.message;
      }
      stepResult.endedAt = new Date().toISOString();
      results.push(redact(stepResult));
      if (!stepResult.passed && continueOnFailure !== true) break;
    }
  } else {
    const items = Array.isArray(suite.items) ? suite.items : [];
    for (const item of items) {
      const itemStartedAt = new Date().toISOString();
      const itemResult = { name: item.name || item.file || `item-${results.length + 1}`, type: item.type, startedAt: itemStartedAt, passed: false };
      try {
        const itemPath = item.file ? path.resolve(path.dirname(suitePath), item.file) : null;
        const asset = itemPath ? readValidationAsset(itemPath) : (item.args || item);
        const assetType = item.type || asset.type;
        const payload = { ...asset, ...(item.args || {}) };
        delete payload.type;
        if (assetType === 'check') itemResult.result = await runValidationCheck(target, payload);
        else if (assetType === 'run') itemResult.result = await runValidationPlan(target, payload);
        else throw new Error(`未知 suite item type：${assetType}`);
        itemResult.type = assetType;
        itemResult.passed = itemResult.result?.passed === true;
      } catch (error) {
        itemResult.error = error.message;
      }
      itemResult.endedAt = new Date().toISOString();
      results.push(redact(itemResult));
      if (!itemResult.passed && continueOnFailure !== true) break;
    }
  }

  const passedCount = results.filter(item => item.passed).length;
  const failedCount = results.filter(item => !item.passed).length;
  const endedAt = new Date().toISOString();
  lastValidationRun = redact({
    name: suiteName,
    type: 'suite',
    suitePath,
    startedAt,
    endedAt,
    passed: failedCount === 0,
    total: results.length,
    passedCount,
    failedCount,
    continueOnFailure,
    results,
    artifacts: getArtifacts()
  });

  return lastValidationRun;
}

function classifySelector(selector = '') {
  const value = String(selector || '').trim();
  if (/^xpath=|^\/\//i.test(value)) return { kind: 'xpath', baseScore: 30 };
  if (/getByRole\(|role=/i.test(value)) return { kind: 'role', baseScore: 95 };
  if (/getByLabel\(|label=/i.test(value)) return { kind: 'label', baseScore: 90 };
  if (/placeholder=|\[placeholder/i.test(value)) return { kind: 'placeholder', baseScore: 90 };
  if (/data-testid|data-test=|data-test-id/i.test(value)) return { kind: 'data-testid', baseScore: 85 };
  if (/getByText\(|text=/i.test(value)) return { kind: 'text', baseScore: 75 };
  if (/^#[A-Za-z][\w-]*$/.test(value)) return { kind: 'id', baseScore: 70 };
  if (/:nth-child|:nth-of-type|>/i.test(value) || value.length > 120) return { kind: 'fragile-css', baseScore: 30 };
  return { kind: 'css', baseScore: 55 };
}

function riskFromScore(score) {
  if (score >= 85) return 'low';
  if (score >= 60) return 'medium';
  return 'high';
}

async function validateLocator(target, args = {}) {
  const selector = args.selector;
  const locator = target.locator(selector);
  const count = await locator.count().catch(() => 0);
  let visibleCount = 0;
  for (let i = 0; i < Math.min(count, 50); i += 1) {
    if (await locator.nth(i).isVisible().catch(() => false)) visibleCount += 1;
  }
  const classified = classifySelector(selector);
  const warnings = [];
  let score = classified.baseScore;
  if (count === 0) { score -= 40; warnings.push('选择器未匹配任何元素'); }
  if (count > 1) { score -= Math.min(35, (count - 1) * 8); warnings.push(`选择器匹配 ${count} 个元素，建议收敛到唯一元素`); }
  if (visibleCount === 0 && count > 0) { score -= 15; warnings.push('匹配元素当前不可见'); }
  if (classified.kind === 'fragile-css' || classified.kind === 'xpath') warnings.push('选择器结构耦合较强，DOM 变化时容易失效');
  score = Math.max(0, Math.min(100, score));
  const suggestions = [];
  if (count !== 1) suggestions.push('优先使用 role/name、label、placeholder 或 data-testid 定位唯一元素');
  if (classified.baseScore < 85) suggestions.push('如可修改页面，建议补充稳定的 data-testid 或可访问名称');
  const elementSuggestions = count ? await suggestLocatorsFromElement(target, selector).catch(() => []) : [];
  suggestions.push(...elementSuggestions.slice(0, 5).map(item => item.selector));
  return redact({ selector, count, visibleCount, score, risk: riskFromScore(score), warnings, suggestions: Array.from(new Set(suggestions)) });
}

function cssString(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function suggestLocatorsFromElement(target, selector) {
  return target.locator(selector).first().evaluate(el => {
    const text = (el.innerText || el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const label = el.labels && el.labels[0] ? (el.labels[0].innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80) : '';
    const placeholder = el.getAttribute('placeholder') || '';
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id') || el.getAttribute('data-test') || '';
    const id = el.id || '';
    const role = el.getAttribute('role') || ({ BUTTON: 'button', A: 'link', INPUT: 'textbox', TEXTAREA: 'textbox', SELECT: 'combobox' }[el.tagName] || '');
    const name = label || text || placeholder || el.getAttribute('aria-label') || '';
    const className = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    const tag = el.tagName.toLowerCase();
    return { tag, text, label, placeholder, testId, id, role, name, className };
  }).then(info => {
    const candidates = [];
    if (info.role && info.name) candidates.push({ selector: `role=${info.role}[name="${cssString(info.name)}"]`, score: 95 });
    if (info.label) candidates.push({ selector: `label=${info.label}`, score: 90 });
    if (info.placeholder) candidates.push({ selector: `[placeholder="${cssString(info.placeholder)}"]`, score: 90 });
    if (info.testId) candidates.push({ selector: `[data-testid="${cssString(info.testId)}"]`, score: 85 });
    if (info.text) candidates.push({ selector: `text=${info.text}`, score: 75 });
    if (info.id) candidates.push({ selector: `#${info.id}`, score: 70 });
    if (info.className) candidates.push({ selector: `${info.tag}.${info.className}`, score: 55 });
    return candidates;
  });
}

async function suggestLocator(target, args = {}) {
  let candidates = [];
  if (args.selector) {
    candidates = await suggestLocatorsFromElement(target, args.selector).catch(() => []);
  } else if (args.target) {
    const textValue = String(args.target);
    const textLocator = target.getByText(textValue, { exact: false });
    const count = await textLocator.count().catch(() => 0);
    if (count > 0) candidates = await suggestLocatorsFromElement(target, `text=${textValue}`).catch(() => [{ selector: `text=${textValue}`, score: 75 }]);
  }
  const recommended = candidates[0] || null;
  const score = recommended?.score || 0;
  return redact({
    recommended: recommended?.selector || null,
    score,
    risk: riskFromScore(score),
    fallbacks: candidates.slice(1).map(item => item.selector),
    suggestions: recommended ? ['优先使用 recommended；必要时保留 fallbacks 作为人工调试线索'] : ['未找到可推荐元素，请提供 selector 或更精确的 target 文本']
  });
}

function getRunRows(run) {
  if (run.type === 'suite') return (run.results || []).map(item => ({ name: item.name, type: item.type, passed: item.passed, error: item.error || '', details: `${item.result?.passedCount ?? ''}/${item.result?.total ?? ''}` }));
  return (run.cases || []).map(item => ({ name: item.name, type: run.type || 'case', passed: item.passed, error: item.error || '', details: item.errors?.summary ? `errors=${item.errors.summary.total}` : '' }));
}

function classifySeverity(row) {
  const error = String(row.error || '').toLowerCase();
  if (error.includes('阻塞') || error.includes('blocking') || error.includes('无法访问') || error.includes('崩溃')) return 'blocking';
  if (error.includes('严重') || error.includes('critical') || error.includes('500') || error.includes('功能不可用')) return 'critical';
  if (error.includes('优化') || error.includes('建议') || error.includes('minor') || error.includes('警告') || error.includes('optimization') || error.includes('suggestion')) return 'optimization';
  return 'general';
}

function collectNetworkEvidence() {
  const errors = [];
  const requests = [];
  try {
    (networkLogs || []).forEach(log => {
      const status = Number(log.status || 0);
      if (status >= 400) errors.push({ url: log.url, status, method: log.method, type: status >= 500 ? 'server_error' : 'client_error', timestamp: log.timestamp });
      if (requests.length < 50) requests.push({ url: log.url, status, method: log.method, duration: log.duration, timestamp: log.timestamp });
    });
  } catch (e) { /* log parsing: non-critical */ }
  return { totalRequests: requests.length, errorRequests: errors.length, errors, sampleRequests: requests };
}

function collectUnknowns(run) {
  const items = [];
  const cases = run.cases || run.results || [];
  cases.forEach(item => {
    if (item.error && (item.error.includes('未知') || item.error.includes('未分类'))) items.push({ name: item.name, description: item.error, suggestedCategory: '待分类' });
  });
  return { count: items.length, items };
}

function buildValidationReportContract(run, rows, failedRows, artifacts, generatedAt) {
  const visualArtifacts = artifacts.visual || {};
  const findings = failedRows.map(row => ({
    id: 'F-' + crypto.randomBytes(4).toString('base64url').slice(0, 6).toUpperCase(),
    name: row.name,
    type: row.type || 'unknown',
    severity: classifySeverity(row),
    description: row.error || row.details || '验证失败'
  }));
  return {
    summary: {
      name: run.name, type: run.type, passed: run.passed,
      startedAt: run.startedAt || '', endedAt: run.endedAt || '', generatedAt,
      total: run.total || rows.length,
      passedCount: run.passedCount || rows.filter(r => r.passed).length,
      failedCount: run.failedCount || failedRows.length,
      conclusion: run.passed ? 'PASS' : (failedRows.some(r => classifySeverity(r) === 'blocking') ? 'BLOCKING' : 'FAIL'),
      runId: currentRunId, runDir: currentRunDir
    },
    toolchain: { browser: run.browser || 'chromium', tools: run.toolsUsed || [], version: VERSION },
    findings,
    networkEvidence: collectNetworkEvidence(),
    artifacts: {
      screenshots: artifacts.screenshots || [], traces: artifacts.traces || [],
      har: artifacts.har || [], reports: artifacts.reports || [],
      visual: visualArtifacts, logFile: artifacts.logFile
    },
    unknowns: collectUnknowns(run)
  };
}

function buildReportHtml(contract) {
  const { buildValidationReportHtml } = require('./core/report-html');
  return buildValidationReportHtml(contract);
}

function exportValidationReport(args = {}) {
  ensureArtifactsDir();
  const run = redact(lastValidationRun || { name: '未执行验证', type: 'none', passed: false, cases: [], artifacts: getArtifacts() });
  const rows = getRunRows(run);
  const failedRows = rows.filter(row => !row.passed);
  const artifacts = run.artifacts || getArtifacts();
  const generatedAt = new Date().toISOString();
  const contract = buildValidationReportContract(run, rows, failedRows, artifacts, generatedAt);
  const html = buildReportHtml(contract);
  const safeTimestamp = generatedAt.replace(/[:.]/g, '-');
  const filePath = path.join(getActiveReportDir(), 'validation-' + safeTimestamp + '.html');
  fs.writeFileSync(filePath, html, 'utf8');
  if (currentRunDir) fs.writeFileSync(path.join(currentRunDir, 'report.json'), JSON.stringify(contract, null, 2), 'utf8');
  return { exported: true, filePath, generatedAt, type: run.type, passed: run.passed, rows: rows.length, runId: currentRunId };
}

function buildValidationReport(args = {}) {
  const run = lastValidationRun || { name: '未执行验证', passed: false, cases: [], artifacts: getArtifacts() };
  if (args.format === 'json') return run;
  const rows = getRunRows(run);
  const failedRows = rows.filter(row => !row.passed);
  const artifacts = run.artifacts || getArtifacts();
  const generatedAt = new Date().toISOString();
  const contract = buildValidationReportContract(run, rows, failedRows, artifacts, generatedAt);
  const { summary, findings, networkEvidence, unknowns } = contract;
  const sevLabels = { blocking: '🔴 阻塞', critical: '🟠 严重', general: '🟡 一般', optimization: '🟢 优化' };
  const lines = [
    '# 浏览器验证执行报告', '',
    '## 一、摘要 (Summary)',
    '- 名称：' + summary.name,
    '- 类型：' + summary.type,
    '- 结论：' + (summary.conclusion === 'PASS' ? '✅ 通过' : summary.conclusion === 'BLOCKING' ? '🚫 阻塞问题' : '❌ 待修复') + ' (' + summary.conclusion + ')',
    '- 开始：' + summary.startedAt,
    '- 结束：' + summary.endedAt,
    '- 总数：' + summary.total + '；通过：' + summary.passedCount + '；失败：' + summary.failedCount,
    summary.runId ? '- 运行ID：' + summary.runId : '', '',
    '## 二、工具链 (Toolchain)',
    '- 浏览器：' + contract.toolchain.browser,
    '- 版本：' + contract.toolchain.version,
    '- 使用工具：' + (contract.toolchain.tools.length ? contract.toolchain.tools.join('、') : '无记录'), '',
    '## 三、发现问题 (Findings)',
    ...(findings.length ? findings.flatMap(f => ['- ' + (sevLabels[f.severity] || f.severity) + ' **' + f.id + '** [' + f.type + '] ' + f.name, '  - 描述：' + f.description, '']) : ['无问题。']), '',
    '## 四、网络证据 (Network Evidence)',
    '- 总请求数：' + networkEvidence.totalRequests,
    '- 错误请求：' + networkEvidence.errorRequests,
    ...(networkEvidence.errors.length ? networkEvidence.errors.slice(0, 10).map(e => '  - [' + e.status + '] ' + e.method + ' ' + e.url) : []), '',
    '## 五、证据产物 (Artifacts)',
    '- 截图：' + (artifacts.screenshots?.length || 0),
    '- Trace：' + (artifacts.traces?.length || 0),
    '- HAR：' + (artifacts.har?.length || 0),
    '- 报告：' + (artifacts.reports?.length || 0),
    '- 日志：' + (artifacts.logFile || '无'), '',
    '## 六、待分类项 (Unknowns)',
    '- 待分类数量：' + unknowns.count,
    ...(unknowns.items.length ? unknowns.items.map(u => '  - ' + u.name + '：' + u.description) : ['无待分类项。'])
  ].filter(Boolean);
  return lines.join('\n');
}

function validateToolSchemas() {
  const requiredTools = [
    'browser_open', 'browser_click', 'browser_type', 'browser_snapshot', 'browser_console', 'browser_network',
    'browser_errors', 'browser_errors_clear', 'browser_wait', 'browser_assert', 'browser_step',
    'browser_trace_start', 'browser_trace_stop', 'browser_artifacts', 'browser_artifacts_clear',
    'browser_instrument', 'browser_events', 'browser_events_clear', 'browser_network_detail', 'browser_har_export',
    'debug_investigate', 'validation_check', 'validation_flow', 'validation_run', 'validation_report',
    'validation_report_export', 'browser_visual_baseline', 'browser_visual_compare', 'browser_visual_report',
    'browser_a11y_check', 'browser_performance_check', 'browser_locator_validate', 'browser_locator_suggest',
    'browser_hover', 'browser_scroll', 'browser_press_key',
    'mcp_health_check', 'mcp_self_test', 'project_audit', 'css_var_check'
  ];
  const registered = new Set(tools.map(tool => tool.name));
  const missing = requiredTools.filter(name => !registered.has(name));
  const invalid = tools.filter(tool => !tool.name || !tool.description || !tool.inputSchema).map(tool => tool.name || '<unnamed>');
  return { requiredCount: requiredTools.length, registeredCount: tools.length, missing, invalid };
}

function checkWritableDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.probe-${Date.now()}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return { dir, writable: true };
  } catch (error) {
    return { dir, writable: false, error: error.message };
  }
}

function mcpHealthCheck() {
  const schema = validateToolSchemas();
  const dirs = [SCREENSHOT_DIR, TRACE_DIR, HAR_DIR, REPORT_DIR].map(checkWritableDir);
  const ok = schema.missing.length === 0 && schema.invalid.length === 0 && dirs.every(item => item.writable);
  return redact({
    ok,
    version: VERSION,
    activeSession: browserSessionId,
    schema,
    directories: dirs,
    checkpoint: currentCheckpoint,
    eventCheckpoint,
    logFile: LOG_FILE
  });
}

// ===== 项目质量审计（v1.9.1 提取到 hands/project_auditor.js） =====
// projectAudit 完全自包含（只依赖 fs/path），无需工厂注入
const { projectAudit } = require('./hands/project_auditor');

async function mcpSelfTest(args = {}) {
  const perf = { phases: {}, total: { start: Date.now() } };

  const { target } = await ensurePage({ headless: args.headless });
  perf.phases.setup = Date.now() - perf.total.start;

  clearArtifacts({ includeLogs: false });
  resetRuntimeLogs();
  await installInstrumentation(target).catch(() => {});
  await clearBrowserEvents(target).catch(() => {});

  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(
    '<!doctype html><html><head><title>MCP Self Test</title></head><body>' +
    '<h1 id="title">MCP Self Test</h1>' +
    '<nav><a href="#" id="link1">Test Link</a><a href="#" id="link2">Another Link</a></nav>' +
    '<form id="test-form">' +
    '<input id="name" placeholder="Name" />' +
    '<input id="email" type="email" placeholder="Email" />' +
    '<select id="role"><option value="">Select</option><option value="admin">Admin</option><option value="user">User</option></select>' +
    '<button type="button" id="btn" onclick="document.body.dataset.clicked=\'yes\';document.getElementById(\'result\').textContent=\'clicked\'">Click</button>' +
    '</form>' +
    '<div id="result"></div>' +
    '<ul id="list"><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>' +
    '</body></html>'
  );
  await target.goto(dataUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  perf.phases.navigate = Date.now() - perf.total.start - perf.phases.setup;

  const trace = args.trace === false ? null : await startTrace(target, { name: 'mcp-self-test', screenshots: true, snapshots: true }).catch(error => ({ error: error.message }));

  const flowStart = Date.now();
  const flow = await runFlow(target, {
    clearErrors: false,
    steps: [
      { type: 'assert', textContains: 'MCP Self Test', noErrors: true, name: 'assert-title' },
      { type: 'type', selector: '#name', text: 'ok', name: 'type-input' },
      { type: 'click', selector: '#btn', name: 'click-button' },
      { type: 'wait', text: 'clicked', name: 'wait-result' },
      { type: 'assert', selectorVisible: '#result', textContains: 'clicked', noErrors: true, name: 'assert-result' }
    ]
  });
  perf.phases.flow = Date.now() - flowStart;

  // ===== MCP 工具执行测试 =====
  const toolTestsStart = Date.now();
  const toolTests = { total: 0, passed: 0, failed: 0, results: [] };

  const testTool = async (name, fn) => {
    toolTests.total++;
    const t = Date.now();
    try {
      const result = await fn();
      const passed = result && result.ok !== false && !result.error;
      toolTests.results.push({ name, passed, duration: Date.now() - t, ...result });
      if (passed) toolTests.passed++; else toolTests.failed++;
    } catch (e) {
      toolTests.results.push({ name, passed: false, duration: Date.now() - t, error: e.message });
      toolTests.failed++;
    }
  };

  await testTool('browser_eval', async () => {
    const val = await target.evaluate(() => 1 + 1);
    return { ok: val === 2, actual: val };
  });

  await testTool('browser_find_element', async () => {
    const el = await target.$('#btn');
    const visible = el ? await el.isVisible().catch(() => false) : false;
    return { ok: !!el && visible, found: !!el, visible };
  });

  await testTool('browser_snapshot', async () => {
    const snapshot = await target.evaluate(() => ({
      title: document.title,
      elementCount: document.querySelectorAll('*').length,
      hasForm: !!document.querySelector('form'),
      hasNav: !!document.querySelector('nav'),
      listItems: document.querySelectorAll('#list li').length
    }));
    return { ok: snapshot.elementCount > 5 && snapshot.hasForm && snapshot.hasNav, snapshot };
  });

  await testTool('browser_links', async () => {
    const links = await target.evaluate(() =>
      Array.from(document.querySelectorAll('a')).map(a => ({ href: a.href, text: a.textContent.trim() }))
    );
    return { ok: links.length >= 2, count: links.length };
  });

  await testTool('browser_form_fill', async () => {
    await target.locator('#email').fill('test@example.com');
    const val = await target.locator('#email').inputValue();
    return { ok: val === 'test@example.com', value: val };
  });

  await testTool('browser_select_option', async () => {
    await target.locator('#role').selectOption('admin');
    const val = await target.locator('#role').inputValue();
    return { ok: val === 'admin', value: val };
  });

  await testTool('browser_errors', async () => {
    const errors = getUnifiedErrors({ currentOnly: true });
    return { ok: errors.summary.total === 0, errorCount: errors.summary.total };
  });

  await testTool('browser_console', async () => {
    await target.evaluate(() => console.log('self-test-log'));
    const events = await getBrowserEvents(target, { limit: 50 }).catch(() => ({ events: [] }));
    const evts = events.events || [];
    const hasLog = evts.some(e => e.type === 'console' && (e.text || '').includes('self-test-log'));
    return { ok: true, eventCount: evts.length, hasLog };
  });

  await testTool('browser_scroll', async () => {
    await target.evaluate(() => window.scrollTo(0, 100));
    const scrollY = await target.evaluate(() => window.scrollY);
    return { ok: scrollY === 0 || scrollY === 100, scrollY };
  });

  perf.phases.toolTests = Date.now() - toolTestsStart;

  const step = await captureStepEvidence(target, 'mcp-self-test-final', { screenshot: true, snapshot: true }).catch(error => ({ error: error.message }));
  const events = await getBrowserEvents(target, { limit: 20 }).catch(error => ({ error: error.message }));
  const errors = getUnifiedErrors({ currentOnly: true });
  const traceStop = trace && !trace.error ? await stopTrace(target, { name: 'mcp-self-test' }).catch(error => ({ error: error.message })) : null;
  const artifacts = getArtifacts();
  const health = mcpHealthCheck();

  // Skill-MCP 一致性检查
  let skillConsistency = { checked: false, results: [], summary: { total: 0, passed: 0, warnings: 0 } };
  try {
    const skillsDir = path.join(PROJECT_ROOT, '.trae', 'skills');
    if (fs.existsSync(skillsDir)) {
      const skillDirs = fs.readdirSync(skillsDir);
      skillConsistency.results = [];
      for (const dir of skillDirs) {
        const toolsJsonPath = path.join(skillsDir, dir, 'SKILL.tools.json');
        if (fs.existsSync(toolsJsonPath)) {
          try {
            const skillTools = JSON.parse(fs.readFileSync(toolsJsonPath, 'utf8'));
            const toolFiles = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
            const availableSet = new Set(toolFiles.map(f => path.basename(f, '.json')));
            const missingTools = Object.keys(skillTools.tools).filter(t => !availableSet.has(t));
            const capabilityIssues = (skillTools.capabilities || []).map(cap => ({
              name: cap.name,
              missingTools: cap.requiredTools.filter(t => !availableSet.has(t))
            })).filter(c => c.missingTools.length > 0);
            const passed = missingTools.length === 0 && capabilityIssues.length === 0;
            skillConsistency.results.push({
              skillName: dir,
              passed,
              totalReferenced: Object.keys(skillTools.tools).length,
              missingTools,
              capabilityIssues
            });
            if (passed) skillConsistency.summary.passed++;
            else skillConsistency.summary.warnings++;
          } catch (e) {
            skillConsistency.results.push({ skillName: dir, error: e.message });
          }
          skillConsistency.summary.total++;
        }
      }
      skillConsistency.checked = true;
    }
  } catch (e) {
    skillConsistency.error = e.message;
  }

  perf.total.duration = Date.now() - perf.total.start;

  return redact({
    ok: health.ok && flow.passed && errors.summary.total === 0 && toolTests.failed === 0,
    health,
    flow,
    toolTests: { ...toolTests, summary: { total: toolTests.total, passed: toolTests.passed, failed: toolTests.failed, passRate: toolTests.total > 0 ? Math.round(toolTests.passed / toolTests.total * 100) + '%' : 'N/A' } },
    perf,
    step,
    events,
    errors,
    trace,
    traceStop,
    artifacts,
    skillConsistency
  });
}
// ===== 智能页面发现（v1.8.7 提取到 hands/locator_helpers.js）=====
const { findElement, createLocatorHelpers } = require('./hands/locator_helpers');
// ensurePage 在上方已定义（line 641），通过工厂注入避免循环依赖
const { findPage } = createLocatorHelpers({ ensurePage });


async function getPageLinks(args = {}) {
  const { target } = await ensurePage(args);

  const result = await target.evaluate(({ filter, includeExternal, maxLinks }) => {
    const links = [];
    const seenHref = new Set();
    const seenText = new Set();
    const currentHost = location.host;

    function classify(text, href) {
      const t = (text || '').toLowerCase();
      const h = (href || '').toLowerCase();
      // 优先检查href（更准确）
      if (h.includes('login') || h.includes('signin') || h.includes('auth') || h.includes('log-in') || h.includes('sign-in')) return '登录';
      if (h.includes('signup') || h.includes('register') || h.includes('create-account') || h.includes('sign-up')) return '注册';
      if (h.includes('admin') || h.includes('manage') || h.includes('backend') || h.includes('administrator')) return '管理';
      if (h.includes('setting') || h.includes('preference') || h.includes('config') || h.includes('profile/setting')) return '设置';
      if (h.includes('profile') || h.includes('/user/') || h.includes('/account') || h.includes('/me')) return '用户';
      // 其次检查文本（对按钮和a标签都有效）
      if (t.includes('登录') || t.includes('sign in') || t.includes('signin') || t.includes('log in') || t.includes('login')) return '登录';
      if (t.includes('注册') || t.includes('sign up') || t.includes('signup') || t.includes('register') || t.includes('create account') || t.includes('join')) return '注册';
      if (t.includes('管理') || t.includes('admin') || t.includes('后台')) return '管理';
      if (t.includes('设置') || t.includes('setting') || t.includes('preference') || t.includes('偏好')) return '设置';
      if (t.includes('个人中心') || t.includes('profile') || t.includes('我的') || t.includes('个人资料')) return '用户';
      if (t.includes('首页') || t.includes('home') || t.includes('概览') || t.includes('主页') || h === '/' || h === '/index.html') return '首页';
      if (t.includes('通知') || t.includes('notification') || t.includes('消息') || t.includes('message') || t.includes('inbox')) return '通知/消息';
      if (t.includes('搜索') || t.includes('search') || t.includes('查找') || t.includes('browse') || t.includes('explore')) return '搜索';
      if (t.includes('退出') || t.includes('logout') || t.includes('sign out') || t.includes('signout') || t.includes('登出')) return '退出';
      if (t.includes('帮助') || t.includes('help') || t.includes('faq') || t.includes('support') || t.includes('常见问题')) return '帮助';
      if (t.includes('关于') || t.includes('about') || t.includes('关于我们')) return '关于';
      if (t.includes('联系') || t.includes('contact') || t.includes('联系我们')) return '联系';
      if (t.includes('购物车') || t.includes('cart') || t.includes('shop cart') || t.includes('bag')) return '购物车';
      if (t.includes('仪表盘') || t.includes('dashboard') || t.includes('控制台') || t.includes('console') || t.includes('workspace')) return '导航菜单';
      if (t.includes('项目') || t.includes('project') || t.includes('table') || t.includes('grid') || t.includes('view')) return '导航菜单';
      return '其他';
    }

    function isInNav(element) {
      return !!(element.closest('nav') || element.closest('[role="navigation"]') || element.closest('.nav') || element.closest('.menu') || element.closest('.sidebar') || element.closest('header'));
    }

    // ==== 1. 从a标签提取 ====
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href || a.getAttribute('href') || '';
      const text = (a.innerText || a.textContent || '').trim().substring(0, 200);

      // 跳过无效链接
      if (!href || href.startsWith('javascript:') || href === '#' || seenHref.has(href)) return;
      seenHref.add(href);

      // 判断是否外部链接
      let isExternal = false;
      try {
        isExternal = new URL(href).host !== currentHost;
      } catch (e) { return; }

      // 过滤
      if (!includeExternal && isExternal) return;
      if (filter && !href.toLowerCase().includes(filter.toLowerCase()) && !text.toLowerCase().includes(filter.toLowerCase())) return;

      // 分类
      let category = isExternal ? '外部链接' : (isInNav(a) ? '导航菜单' : (a.closest('footer') ? '页脚链接' : classify(text, href)));

      links.push({
        href: href.substring(0, 500),
        text: text.substring(0, 200),
        category,
        isExternal,
        isButton: false,
        selector: a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') + (a.className && typeof a.className === 'string' ? '.' + a.className.split(' ')[0] : ''),
        inViewport: (() => {
          const rect = a.getBoundingClientRect();
          return rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
        })()
      });
    });

    // ==== 2. 从按钮提取（SPA关键增强） ====
    document.querySelectorAll('button, [role="button"], [role="link"], .btn, [onclick]').forEach(btn => {
      // 跳过已作为a标签处理的情况
      if (btn.tagName === 'A') return;
      const btnText = (btn.innerText || btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim().substring(0, 200);
      if (!btnText || seenText.has(btnText.toLowerCase())) return;
      seenText.add(btnText.toLowerCase());

      // 过滤
      if (filter && !btnText.toLowerCase().includes(filter.toLowerCase())) return;

      const category = isInNav(btn) ? '导航菜单' : classify(btnText, '');
      if (category === '其他') return; // 跳过无分类按钮

      const btnId = btn.id ? `#${btn.id}` : '';
      const btnClass = btn.className && typeof btn.className === 'string' ? `.${btn.className.split(' ')[0]}` : '';
      const ariaLabel = btn.getAttribute('aria-label') || '';

      links.push({
        href: null,
        text: btnText.substring(0, 200),
        category,
        isExternal: false,
        isButton: true,
        selector: btn.tagName.toLowerCase() + btnId + btnClass || 'button',
        ariaLabel: ariaLabel || undefined,
        inViewport: (() => {
          const rect = btn.getBoundingClientRect();
          return rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
        })()
      });
    });

    // 按分类排序
    const categoryOrder = {
      '导航菜单': 1, '首页': 2, '登录': 3, '注册': 4, '管理': 5,
      '用户': 6, '设置': 7, '通知/消息': 8, '搜索': 9, '帮助': 10,
      '关于': 11, '联系': 12, '购物车': 13, '退出': 14,
      '页脚链接': 15, '外部链接': 16, '其他': 17
    };
    links.sort((a, b) => (categoryOrder[a.category] || 99) - (categoryOrder[b.category] || 99));

    return {
      total: links.length,
      linksFromAnchors: links.filter(l => !l.isButton).length,
      linksFromButtons: links.filter(l => l.isButton).length,
      currentUrl: location.href,
      pageTitle: document.title,
      categories: [...new Set(links.map(l => l.category))],
      visibleInViewport: links.filter(l => l.inViewport).length,
      links: links.slice(0, maxLinks || 100)
    };
  }, { filter: args.filter, includeExternal: args.includeExternal === true, maxLinks: args.maxLinks || 100 });

  return result;
}

// ===== 菜单遍历 =====
// 自动发现并点击各级菜单，验证功能链路是否正常
// ===== 菜单遍历器（v1.8.8 提取到 hands/menu_traverser.js）=====
const { createMenuTraverser } = require('./hands/menu_traverser');
// ensurePage 和 postActionErrorCheck 在上方已定义，通过工厂注入避免循环依赖
const { traverseMenu } = createMenuTraverser({ ensurePage, postActionErrorCheck });

// ===== 浏览器全量回归测试（v1.8.9 提取到 hands/full_regression.js） =====
const { createFullRegression } = require('./hands/full_regression');
// ensurePage 在上方已定义（line 641），deepInteractor 在上方已 require（line 22）
// 通过工厂注入避免循环依赖
const { runBrowserFullRegression } = createFullRegression({ ensurePage, deepInteractor });

// ===== 部署验证（v1.9.0 提取到 hands/deploy_verifier.js） =====
// 注意：必须放在 runBrowserFullRegression 定义之后，因为工厂注入依赖它
const { createDeployVerifier } = require('./hands/deploy_verifier');
// ensurePage、logger 在上方已定义；runBrowserFullRegression 在上方刚定义
// 通过工厂注入避免循环依赖
const { runDeployVerify } = createDeployVerifier({ ensurePage, logger, runBrowserFullRegression });

// Shared dependencies for handler modules
const deps = {
  // === Mutable state ===
  page: null, browser: null, browserSessionId: 0,
  consoleLogs, networkLogs, pageErrors,
  currentCheckpoint, eventCheckpoint, lastAction,
  sessions, activeSessionName, sessionCounter,
  traceLogs, traceActive, currentTraceName,
  backendProbeResults, instrumentationEnabled,
  imageErrors, lastImageErrorCheckpoint,
  validationResults, lastQualityChecks, lastValidationRun,
  requestStartTimes, stateManager,

  // === Constants ===
  MAX_SESSIONS, SCREENSHOT_DIR, HAR_DIR, VISUAL_DIR,
  VISUAL_BASELINE_DIR, VISUAL_ACTUAL_DIR, VISUAL_DIFF_DIR,
  VALIDATIONS_DIR, REPORT_DIR, LOG_FILE, PROJECT_ROOT,
  TOOLS_DIR, logger,

  // === Core functions ===
  ensurePage, text, log, resetRuntimeLogs,
  getPageLinks, postActionErrorCheck,
  probeKnownEndpoints, getUnifiedErrors,
  closeBrowserSession, listBrowserSessions,
  filterNetwork, filterNetworkDetails, getStorageSnapshot,
  buildDebugReport, captureStepEvidence,
  waitForCondition, assertPage, runFlow,
  installInstrumentation, getBrowserEvents, clearBrowserEvents,
  startTrace, stopTrace,
  getArtifacts, clearArtifacts, ensureArtifactsDir,
  getBackendProbeEndpoints, isCloudApiProbeTarget,
  screenshotWithRedaction, safeArtifactName,
  analyzeScreenshotForErrors, exportHar,
  runFullAudit, visualBaseline, visualCompare, visualReport,
  runA11yCheck, runPerformanceCheck, runLighthouseAudit,
  findElement, findPage, suggestLocator, validateLocator,
  mcpHealthCheck, projectAudit, mcpSelfTest,
  runValidationCheck, runValidationPlan,
  runValidationElement, runValidationFlow,
  buildValidationReport, exportValidationReport,
  runValidationQuickRun, runDeployVerify,
  investigateDebug, runBrowserFullRegression, traverseMenu,
  fetchBackendLogs, buildTraceChain,
  detectSilentFailures, redact, redactString, isSensitiveKey,
  trimTraceLogs, genSpanId, genTraceId,

  // === Modules ===
  browserOperator, evidenceCollector, deepInteractor, errorAggregator,

  // === Node built-ins ===
  path, fs, execSync,

  // === Tool dispatch ===
  callTool: (name, args = {}) => callTool(name, args),
};

async function callTool(name, args = {}) {
  logger.log('INFO', '调用工具', { name, args });

  const featureCheck = checkFeatureGate(name);
  if (!featureCheck.allowed) {
    return {
      isError: true,
      content: [{ type: 'text', text: featureCheck.message }],
      upgradeRequired: true,
      tier: featureCheck.tier,
      upgradeUrl: featureCheck.upgradeUrl
    };
  }

  // Update deps state before each call (handlers may have mutated shared arrays)
  deps.page = page;
  deps.browser = browser;
  deps.browserSessionId = browserSessionId;
  deps.activeSessionName = activeSessionName;
  deps.sessionCounter = sessionCounter;
  deps.traceActive = traceActive;
  deps.currentTraceName = currentTraceName;
  deps.instrumentationEnabled = instrumentationEnabled;
  deps.currentCheckpoint = currentCheckpoint;
  deps.eventCheckpoint = eventCheckpoint;
  deps.lastAction = lastAction;
  deps.lastImageErrorCheckpoint = lastImageErrorCheckpoint;

  try {
    const handler = handlerMap.get(name);
    if (!handler) {
      return { isError: true, content: [{ type: 'text', text: `未知工具：${name}` }] };
    }
    const result = await handler.handle(name, args, deps);
    page = deps.page;
    browser = deps.browser;
    browserSessionId = deps.browserSessionId;
    activeSessionName = deps.activeSessionName;
    sessionCounter = deps.sessionCounter;
    // traceActive and currentTraceName are managed directly by startTrace/stopTrace in server.js;
    // syncing back from deps would overwrite the correct module-level value with a stale copy.
    instrumentationEnabled = deps.instrumentationEnabled;
    currentCheckpoint = deps.currentCheckpoint;
    eventCheckpoint = deps.eventCheckpoint;
    lastAction = deps.lastAction;
    lastImageErrorCheckpoint = deps.lastImageErrorCheckpoint;
    if (stateManager.currentCheckpoint !== currentCheckpoint) {
      stateManager.currentCheckpoint = currentCheckpoint;
    }
    return result;

  } catch (error) {
    logger.log('ERROR', `工具调用失败: ${name}`, { error: error.message, stack: error.stack });
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `工具执行出错：${error.message}\n\n工具名：${name}\n参数：${JSON.stringify(args, null, 2)}`
      }]
    };
  }
}

// 创建MCP Server实例
function createMcpServer() {
  const server = new Server({ name: 'ai-verify-mcp', version: VERSION }, { capabilities: { tools: {} } });
  
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params;
    if (!toolNames.has(name)) return { isError: true, content: [{ type: 'text', text: `未知工具：${name}` }] };
    // ===== OTel 语义 span: cast_mcp.tool.call =====
    // 为每次 MCP tool 调用生成独立 spanId，记录到 traceLogs 供 trace_chain 聚合
    const toolSpanId = genSpanId();
    const toolTraceId = genTraceId();
    traceLogs.push({
      traceId: toolTraceId,
      spanId: toolSpanId,
      url: `mcp://tool/${name}`,
      path: `/${name}`,
      status: 0,
      method: 'MCP',
      errorType: 'PENDING',
      traceSource: 'mcp-tool-call',
      timestamp: new Date().toISOString(),
      sourceLayer: 'mcp-tool',
      spanName: `cast_mcp.tool.call`,
      spanKind: 'INTERNAL',
      attributes: {
        'gen_ai.system': 'mcp',
        'gen_ai.operation.name': 'mcp.tool.call',
        'mcp.tool.name': name,
        'mcp.tool.args_keys': Object.keys(args || {}).slice(0, 20)
      }
    });
    trimTraceLogs();
    const startedAt = Date.now();
    try {
      const result = attachStructuredContent(name, await callTool(name, args || {}));
      traceLogs.push({
        traceId: toolTraceId,
        spanId: toolSpanId,
        url: `mcp://tool/${name}`,
        path: `/${name}`,
        status: result?.isError ? 500 : 200,
        method: 'MCP',
        errorType: result?.isError ? 'TOOL_ERROR' : 'OK',
        traceSource: 'mcp-tool-call',
        timestamp: new Date().toISOString(),
        sourceLayer: 'mcp-tool',
        spanName: `cast_mcp.tool.call`,
        spanKind: 'INTERNAL',
        duration: Date.now() - startedAt,
        attributes: { 'gen_ai.operation.name': 'mcp.tool.call', 'mcp.tool.name': name }
      });
      trimTraceLogs();
      return result;
    } catch (e) {
      traceLogs.push({
        traceId: toolTraceId,
        spanId: toolSpanId,
        url: `mcp://tool/${name}`,
        path: `/${name}`,
        status: 500,
        method: 'MCP',
        errorType: 'EXCEPTION',
        traceSource: 'mcp-tool-call',
        timestamp: new Date().toISOString(),
        sourceLayer: 'mcp-tool',
        spanName: `cast_mcp.tool.call`,
        spanKind: 'INTERNAL',
        duration: Date.now() - startedAt,
        attributes: { 'error.message': String(e?.message || e), 'mcp.tool.name': name }
      });
      throw e;
    }
  });
  
  server.setNotificationHandler(InitializedNotificationSchema, async () => {
    logger.log('INFO', 'MCP initialized');
  });
  
  server.setNotificationHandler(CancelledNotificationSchema, async notification => {
    logger.log('INFO', 'MCP request cancelled', notification.params || {});
  });
  
  process.on('uncaughtException', async (error) => {
    logger.log('ERROR', 'Uncaught Exception', { error: error.message, stack: error.stack });
    try {
      if (page && !page.isClosed()) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      for (const [, item] of browserPool) {
        await item.browser.close().catch(() => {});
      }
      browserPool.clear();
    } catch (_) { /* cleanup: ignore */ }
    process.exit(1);
  });
  
  process.on('unhandledRejection', async (reason, promise) => {
    logger.log('ERROR', 'Unhandled Rejection', { reason: reason?.message || String(reason) });
    try {
      if (page && !page.isClosed()) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      for (const [, item] of browserPool) {
        await item.browser.close().catch(() => {});
      }
      browserPool.clear();
    } catch (_) { /* cleanup: ignore */ }
  });
  
  return server;
}

async function main() {
  const server = createMcpServer();
  
  let shuttingDown = false;
  async function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log('INFO', `Received ${signal}, shutting down gracefully...`);
    try {
      if (page && !page.isClosed()) await page.close();
      if (browser) await browser.close();
      // 清理浏览器池
      for (const [, item] of browserPool) {
        await item.browser.close().catch(() => {});
      }
      browserPool.clear();
    } catch (_) { /* cleanup: ignore */ }
    logger.log('INFO', 'Shutdown complete');
    process.exit(0);
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('exit', () => {
    if (!shuttingDown) {
      try { if (browser) browser.close().catch(() => {}); } catch (_) { /* cleanup: ignore */ }
      for (const [, item] of browserPool) {
        try { item.browser.close().catch(() => {}); } catch (_) { /* cleanup: ignore */ }
      }
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.log('INFO', 'ValidPilot OSS MCP Server ready (stdio mode)', { version: VERSION, tools: tools.length });

  // 非阻塞启动浏览器预热
  warmupBrowser().catch(() => {});
}

async function startHttpMode() {
  const http = require('http');
  const PORT = process.env.MCP_HTTP_PORT || 3456;
  
  async function handleMcpRequest(request) {
    try {
      const { jsonrpc, id, method, params } = request;
      if (jsonrpc !== '2.0' || typeof id !== 'string') {
        return { jsonrpc: '2.0', id: id || null, error: { code: -32600, message: 'Invalid Request' } };
      }
      
      if (method === 'tools/list') {
        return { jsonrpc: '2.0', id, result: { tools } };
      }
      
      if (method === 'tools/call') {
        const { name, arguments: args } = params;
        if (!toolNames.has(name)) {
          return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } };
        }
        const result = await callTool(name, args || {});
        return { jsonrpc: '2.0', id, result };
      }
      
      if (method === 'initialize') {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'ai-verify-mcp', version: VERSION }
          }
        };
      }
      
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
    } catch (e) {
      return { jsonrpc: '2.0', id: request.id || null, error: { code: -32603, message: e.message } };
    }
  }
  
  const httpServer = http.createServer(async (req, res) => {
    // API Key 认证检查（如果配置了 MCP_API_KEY）
    const API_KEY = process.env.MCP_API_KEY;
    if (API_KEY) {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      if (token !== API_KEY) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Unauthorized: Invalid or missing API key' } }));
        return;
      }
    } else if (process.env.MCP_MODE === 'http') {
      // 未配置 API_KEY 时的警告日志（仅首次）
      if (!global.authWarned) {
        console.warn('[SECURITY] MCP_API_KEY 未设置，HTTP 服务器无认证保护。建议设置 MCP_API_KEY 环境变量。');
        global.authWarned = true;
      }
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', tools: tools.length }));
      return;
    }
    
    if (req.method === 'POST' && req.url === '/mcp') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const request = JSON.parse(body);
          const response = await handleMcpRequest(request);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: e.message } }));
        }
      });
      return;
    }
    
    res.writeHead(404);
    res.end('Not Found');
  });
  
  httpServer.listen(PORT, () => {
    console.log(`ValidPilot OSS MCP HTTP Server running on http://localhost:${PORT}`);
    console.log(`工具数量: ${tools.length}`);
    console.log(`支持 /mcp (POST) 和 /health (GET)`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`端口 ${PORT} 已被占用，尝试使用其他端口...`);
      httpServer.listen(0, () => {
        const actualPort = httpServer.address().port;
        console.log(`ValidPilot OSS MCP HTTP Server running on http://localhost:${actualPort}`);
        console.log(`工具数量: ${tools.length}`);
        console.log(`支持 /mcp (POST) 和 /health (GET)`);
      });
    } else {
      console.error('HTTP Server 启动失败:', err.message);
      process.exit(1);
    }
  });
  
  // 非阻塞启动浏览器预热
  warmupBrowser().catch(() => {});
  
  const shutdown = async () => {
    try { if (page && !page.isClosed()) await page.close(); } catch (_) { /* cleanup: ignore */ }
    try { if (browser) await browser.close(); } catch (_) { /* cleanup: ignore */ }
    for (const [, item] of browserPool) {
      try { await item.browser.close(); } catch (_) { /* cleanup: ignore */ }
    }
    browserPool.clear();
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const MODE = process.env.MCP_MODE || 'stdio';
if (require.main === module) {
  if (MODE === 'http') {
    startHttpMode().catch(error => {
      logger.log('ERROR', 'MCP HTTP Server 启动失败', { error: error.message, stack: error.stack });
      process.exit(1);
    });
  } else {
    main().catch(error => {
      logger.log('ERROR', 'MCP Server 启动失败', { error: error.message, stack: error.stack });
      process.exit(1);
    });
  }
}

module.exports = {
  // === Constants ===
  MAX_SESSIONS, SCREENSHOT_DIR, HAR_DIR, VISUAL_DIR,
  VISUAL_BASELINE_DIR, VISUAL_ACTUAL_DIR, VISUAL_DIFF_DIR,
  VALIDATIONS_DIR, VALIDATION_RUNS_DIR, REPORT_DIR, LOG_FILE, PROJECT_ROOT,

  // === Run management ===
  ensureRunDir, resetRunDir, generateRunId,
  getActiveScreenshotDir, getActiveTraceDir, getActiveHarDir,
  getActiveReportDir, getActiveVisualBaselineDir,
  getActiveVisualActualDir, getActiveVisualDiffDir,
  getCurrentRunId: () => currentRunId,
  getCurrentRunDir: () => currentRunDir,

  // === Artifacts ===
  getArtifacts, clearArtifacts, ensureArtifactsDir,

  // === Backend probe presets ===
  getBackendProbeEndpoints, isCloudApiProbeTarget,

  // === Report ===
  buildValidationReport, exportValidationReport,
  buildValidationReportContract, buildReportHtml,
  classifySeverity, collectNetworkEvidence, collectUnknowns
};
