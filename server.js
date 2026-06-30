try { require('dotenv').config(); } catch(e) { console.warn('[ValidPilot] dotenv not loaded:', e.message); }
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
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
const TraceManager = require('./core/trace');
const traceManager = new TraceManager();

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

const allHandlers = [
  handlerBrowser, handlerSession, handlerEvidence, handlerNetwork,
  handlerValidation, handlerDiagnose, handlerVisual, handlerLocator, handlerSystem
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
const LOG_FILE = Logger.LOG_FILE;
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const TRACE_DIR = path.join(__dirname, 'traces');
const HAR_DIR = path.join(__dirname, 'har');
const REPORT_DIR = path.join(__dirname, 'reports');
const VISUAL_DIR = path.join(__dirname, 'visual');
const VISUAL_BASELINE_DIR = path.join(VISUAL_DIR, 'baselines');
const VISUAL_ACTUAL_DIR = path.join(VISUAL_DIR, 'actual');
const VISUAL_DIFF_DIR = path.join(VISUAL_DIR, 'diff');

let validationResults = [];
let lastQualityChecks = {
  visual: [],
  a11y: null,
  performance: null
};
let lastValidationRun = null;

const stateManager = new StateManager();

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
let traceLogs = []; // [{ traceId, spanId, url, status, method, timestamp, errorType, source: 'browser'|'server' }]
const TRACE_HEADER_NAMES = ['traceparent', 'x-trace-id', 'x-request-id', 'x-correlation-id', 'trace-id', 'request-id', 'x-amzn-trace-id'];

// W3C TraceContext helpers
function genHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}
function genTraceId() { return genHex(32); } // 32 hex chars
function genSpanId() { return genHex(16); } // 16 hex chars
function buildTraceparent(traceId, spanId, sampled = true) {
  // 格式: 00-{traceId}-{spanId}-{flags}, flags 01 = sampled
  return `00-${traceId || genTraceId()}-${spanId || genSpanId()}-${sampled ? '01' : '00'}`;
}
function parseTraceparent(h) {
  if (!h) return null;
  const v = String(h).trim();
  const m = v.match(/^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i);
  if (m) return { version: m[1], traceId: m[2], spanId: m[3], flags: m[4], sampled: m[4] === '01' };
  const parts = v.split('-');
  if (parts.length === 1 && /^[0-9a-f]{32}$/i.test(parts[0])) return { traceId: parts[0], flags: '01', sampled: true };
  return null;
}

function findTraceId(headers) {
  if (!headers) return null;
  // 优先 W3C traceparent
  for (const key of ['traceparent']) {
    const val = headers[key] || headers[key.toLowerCase()];
    if (val) {
      const parsed = parseTraceparent(val);
      if (parsed) return { traceId: parsed.traceId, spanId: parsed.spanId, source: 'w3c-traceparent' };
    }
  }
  // 退化: 单独字段
  for (const key of TRACE_HEADER_NAMES) {
    if (key === 'traceparent') continue;
    const val = headers[key] || headers[key.toLowerCase()];
    if (val) return { traceId: val, spanId: null, source: `header:${key}` };
  }
  for (const key of TRACE_HEADER_NAMES) {
    if (key === 'traceparent') continue;
    const underscoreKey = key.replace(/-/g, '_');
    const val = headers[underscoreKey] || headers[underscoreKey.toLowerCase()];
    if (val) return { traceId: val, spanId: null, source: `header:${underscoreKey}` };
  }
  return null;
}
function trimTraceLogs() {
  if (traceLogs.length > 1500) traceLogs = traceLogs.slice(-800);
}

// ===== 浏览器池管理 =====
const BROWSER_POOL_SIZE = 2; // 最多保留2个实例
const browserPool = new Map(); // poolId -> { browser, context, page, createdAt }

const SENSITIVE_KEY_RE = /(password|passwd|pwd|token|secret|authorization|cookie|apikey|api_key|api-key|key)$/i;
const SENSITIVE_TEXT_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
  /ark-[A-Za-z0-9-]{20,}/gi,
  /(api[_-]?key\s*[:=]\s*)[A-Za-z0-9._~+\/-]{8,}/gi,
  /(token\s*[:=]\s*)[A-Za-z0-9._~+\/-]{8,}/gi
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

// ===== 浏览器预热 =====
async function warmupBrowser() {
  try {
    logger.log('INFO', '预热浏览器...', {});
    const wBrowser = await chromium.launch({ headless: true });
    const wContext = await wBrowser.newContext({ viewport: { width: 1280, height: 720 } });
    const wPage = await wContext.newPage();
    await wPage.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 10000 });
    const poolId = '__warmup__';
    browserPool.set(poolId, { browser: wBrowser, context: wContext, page: wPage, createdAt: Date.now() });
    logger.log('INFO', '浏览器预热完成', {});
    return poolId;
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
  stateManager.resetRuntimeLogs(log);

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
    } catch (_) {}

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
  let reused = true;

  // 1) 优先使用现有存活页面
  if (page && !page.isClosed()) {
    try {
      await page.evaluate('1');
      return { target: page, reused: true, sessionId: browserSessionId };
    } catch (e) {
      // 页面已死，继续往下
    }
  }

  // 2) 从池中取可用浏览器（非 extension 模式）
  if (!extensionPath && browserPool.size > 0) {
    for (const [id, poolItem] of browserPool) {
      try {
        await poolItem.page.evaluate('1');
        // 从池中取出
        browser = poolItem.browser;
        page = poolItem.page;
        browserPool.delete(id);
        setupPageListeners(page);
        browserSessionId += 1;
        logger.log('INFO', '复用池中浏览器', { poolId: id });
        return { target: page, reused: true, sessionId: browserSessionId };
      } catch (e) {
        // 池中页面已死，移除
        browserPool.delete(id);
      }
    }
  }

  // 3) 新建浏览器实例
  reused = false;
  if (extensionPath) {
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
  } else {
    browser = await chromium.launch({ headless: args.headless === true ? true : false });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();

    // 加入池（但先不占用——池作为冷备，当前页直接用）
    const poolId = `pool-${Date.now()}`;
    browserPool.set(poolId, { browser, context, page, createdAt: Date.now() });
    // 限制池大小（添加简单保护：等待锁释放）
    if (browserPool.size > BROWSER_POOL_SIZE) {
      const oldest = [...browserPool.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      if (oldest && oldest[0] !== poolId) {
        await oldest[1].browser.close().catch(e => { console.error('[browserPool] cleanup error:', e.message); });
        browserPool.delete(oldest[0]);
      }
    }
  }
  browserSessionId += 1;
  setupPageListeners(page);
  // 注入全局错误捕获脚本（用 __mcpInstrumented 防重，多次调用安全）
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
const BACKEND_API_ENDPOINTS = [
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
const BACKEND_RESPONSE_ERROR_KEYWORDS = /error|exception|undefinedtable|column.*not exist|traceback|internal_server/i;
async function probeKnownEndpoints(target, options = {}) {
  const results = [];
  const endpoints = options.endpoints || BACKEND_API_ENDPOINTS;
  try {
    const baseUrl = target.url().replace(/\/$/, '');
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
      } catch (_) {}
    }
  } catch (_) {}
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
    } catch (_) {}
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
      const baseUrl = page.url().replace(/\/$/, '');
      const knownEndpoints = [
        '/api/v1/health', '/api/v1/identity/me', '/api/v1/settlements',
        '/api/v1/channels', '/api/v1/orders', '/api/v1/leads',
        '/api/v1/campaigns', '/api/v1/merchant/payout-disputes',
        '/api/v1/provider/commission-configs', '/api/v1/provider/settlements'
      ];
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
        } catch (_) {}
      }
      backendProbeCount = result.backendProbeErrors.length;
    } catch (_) {}
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
 */
async function fetchBackendLogs(args = {}) {
  const { traceId, service, since, lines = 50 } = args;
  if (!traceId) return { error: '缺少 traceId 参数', logs: [] };
  
  const sshHost = '192.168.8.4';
  const containers = service ? [service] : ['huokesys-gateway-1', 'huokesys-postgres-1', 'huokesys-redis-1'];
  
  const results = [];
  for (const container of containers) {
    try {
      // docker logs --tail=500 然后用 grep 过滤 traceId
      const cmd = `ssh ${sshHost} "docker logs ${container} --tail 2000 2>&1 | grep -i '${traceId}' | tail -${lines}"`;
      const output = execSync(cmd, { timeout: 10000, encoding: 'utf8', shell: 'powershell' }).trim();
      if (output) {
        results.push({ service: container, lines: output.split('\n').filter(Boolean) });
      }
    } catch (e) {
      // grep 无匹配时 execSync 会抛非0退出码，忽略
      if (e.status !== 1) {
        results.push({ service: container, error: e.message });
      }
    }
  }
  
  return { traceId, totalServices: results.length, logs: results };
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
    } catch (_) {}
    
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
      if (url.match(/\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|css|js)($|\?)/i)) return false;
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
}

async function captureStepEvidence(target, label = 'step', args = {}) {
  ensureArtifactsDir();
  const safeName = `${Date.now()}-${label}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const screenshotPath = path.join(SCREENSHOT_DIR, `${safeName}.png`);
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
      const screenshotPath = path.join(SCREENSHOT_DIR, `${safeName}.png`);
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
  if (args.clearErrors !== false) stateManager.resetRuntimeLogs(log);
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
      else if (step.type === 'clearErrors') stateManager.resetRuntimeLogs(log);
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
    screenshots: listFilesRecursive(SCREENSHOT_DIR).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    traces: listFilesRecursive(TRACE_DIR).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    har: listFilesRecursive(HAR_DIR).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    reports: listFilesRecursive(REPORT_DIR).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    visual: getVisualArtifacts(),
    logFile: fs.existsSync(LOG_FILE) ? LOG_FILE : null
  });
}

function clearArtifacts(args = {}) {
  const includeLogs = args.includeLogs === true;
  const includeVisual = args.includeVisual !== false;
  const dirs = [SCREENSHOT_DIR, TRACE_DIR, HAR_DIR, REPORT_DIR];
  if (includeVisual) dirs.push(VISUAL_BASELINE_DIR, VISUAL_ACTUAL_DIR, VISUAL_DIFF_DIR);
  for (const dir of dirs) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
  if (includeLogs && fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '');
  return { cleared: true, includeLogs, includeVisual, checkpoint: currentCheckpoint };
}

function getVisualArtifacts() {
  ensureArtifactsDir();
  return {
    baselines: listFilesRecursive(VISUAL_BASELINE_DIR).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    actual: listFilesRecursive(VISUAL_ACTUAL_DIR).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    diff: listFilesRecursive(VISUAL_DIFF_DIR).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    recentComparisons: lastQualityChecks.visual.slice(-20).reverse()
  };
}

function safeArtifactName(name, fallback) {
  return String(name || fallback || `artifact-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function visualBaseline(target, args = {}) {
  ensureArtifactsDir();
  const safeName = safeArtifactName(args.name, `baseline-${Date.now()}`);
  const filePath = path.join(VISUAL_BASELINE_DIR, `${safeName}.png`);
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
  const baselinePath = path.join(VISUAL_BASELINE_DIR, `${safeName}.png`);
  if (!fs.existsSync(baselinePath)) throw new Error(`未找到视觉基线：${baselinePath}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const actualPath = path.join(VISUAL_ACTUAL_DIR, `${safeName}-${stamp}.png`);
  const diffPath = path.join(VISUAL_DIFF_DIR, `${safeName}-${stamp}.png`);
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
      } catch (e) {}

      // LCP
      let lcp = 0;
      try {
        const lcpEntries = perf.getEntriesByType('largest-contentful-paint');
        if (lcpEntries.length > 0) lcp = lcpEntries[lcpEntries.length - 1].startTime;
      } catch (e) {}

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
    const lighthouse = require('lighthouse');

    const chrome = await chromeLauncher.launch({
      chromePath,
      chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });

    const categories = args.categories || ['performance', 'accessibility', 'best_practices', 'seo'];
    const formFactor = args.formFactor || 'desktop';

    const options = {
      logLevel: 'error',
      output: 'json',
      onlyCategories: categories,
      port: chrome.port,
      formFactor,
      throttling: args.throttling ? undefined : { throttlingMethod: 'provided' }
    };

    const runnerResult = await lighthouse(url, options);
    await chrome.kill().catch(() => {});

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
      creator: { name: 'ai-verify-mcp', version: '1.0.0' },
      pages: [],
      entries
    }
  });
  const safeName = (args.name || `network-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = path.join(HAR_DIR, `${safeName}.har.json`);
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
      } catch (_) {}
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
    // 当前 navigation span (整页生命周期内复用同一 traceId)
    const navTraceId = sessionStorage.getItem('__mcp_nav_trace_id') || genTraceId();
    const navSpanId = sessionStorage.getItem('__mcp_nav_span_id') || genSpanId();
    sessionStorage.setItem('__mcp_nav_trace_id', navTraceId);
    sessionStorage.setItem('__mcp_nav_span_id', navSpanId);
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
        } catch (_) {}
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
          try { setReqHeader.call(xhr, 'traceparent', buildTp(requestSpanId)); } catch (_) {}
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
      sessionStorage.setItem('__mcp_nav_span_id', sid);
      sessionStorage.setItem('__mcp_nav_trace_id', navTraceId);
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
  const tracePath = path.join(TRACE_DIR, `${safeName}.zip`);
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
    const screenshotPath = path.join(SCREENSHOT_DIR, `${safeName}.png`);
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

// ============================================================
// deploy_verify — 部署验证（HTTP 级别，无需浏览器）
// ============================================================

async function runDeployVerify(args = {}) {
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
    const cssAnalyzer = require('./scripts/css-var-analyzer');
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
    } catch (_) {}
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
            const screenshotPath = path.join(SCREENSHOT_DIR, `${safeName}.png`);
            await screenshotWithRedaction(target, screenshotPath, {});
            stepResult.screenshot = screenshotPath;
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

function exportValidationReport(args = {}) {
  ensureArtifactsDir();
  const run = redact(lastValidationRun || { name: '未执行验证', type: 'none', passed: false, cases: [], artifacts: getArtifacts() });
  const rows = getRunRows(run);
  const failedRows = rows.filter(row => !row.passed);
  const artifacts = run.artifacts || getArtifacts();
  const visualArtifacts = artifacts.visual || getVisualArtifacts();
  const links = [...(artifacts.screenshots || []), ...(artifacts.traces || []), ...(artifacts.har || []), ...(artifacts.reports || []), ...(visualArtifacts.baselines || []), ...(visualArtifacts.actual || []), ...(visualArtifacts.diff || [])];
  const generatedAt = new Date().toISOString();
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${htmlEscape(run.name)} - Validation Report</title><style>body{font-family:Arial,"Microsoft YaHei",sans-serif;margin:24px;color:#222}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f6f8fa}.pass{color:#067d17}.fail{color:#b00020}code{background:#f6f8fa;padding:2px 4px}</style></head><body><h1>浏览器验证 HTML 报告</h1><section><h2>摘要</h2><p>名称：${htmlEscape(run.name)}</p><p>类型：${htmlEscape(run.type)}</p><p>结果：<strong class="${run.passed ? 'pass' : 'fail'}">${run.passed ? '通过' : '待修复'}</strong></p><p>开始：${htmlEscape(run.startedAt || '')}；结束：${htmlEscape(run.endedAt || '')}；导出：${htmlEscape(generatedAt)}</p><p>总数：${run.total || rows.length}；通过：${run.passedCount || rows.filter(row => row.passed).length}；失败：${run.failedCount || failedRows.length}</p></section>${qualityGateHtml()}<section><h2>结果表</h2><table><thead><tr><th>名称</th><th>类型</th><th>结果</th><th>详情</th><th>错误</th></tr></thead><tbody>${rows.map(row => `<tr><td>${htmlEscape(row.name)}</td><td>${htmlEscape(row.type)}</td><td class="${row.passed ? 'pass' : 'fail'}">${row.passed ? '通过' : '失败'}</td><td>${htmlEscape(row.details)}</td><td>${htmlEscape(row.error)}</td></tr>`).join('')}</tbody></table></section><section><h2>失败分析</h2>${failedRows.length ? `<ul>${failedRows.map(row => `<li><strong>${htmlEscape(row.name)}</strong>：${htmlEscape(row.error || row.details || '未提供失败详情')}</li>`).join('')}</ul>` : '<p>无失败项。</p>'}</section><section><h2>Artifacts 链接</h2>${links.length ? `<ul>${links.map(item => `<li><a href="file:///${String(item.path).replace(/\\/g, '/')}">${htmlEscape(item.relativePath || item.name || item.path)}</a></li>`).join('')}</ul>` : '<p>无产物。</p>'}</section><section><h2>原始摘要 JSON</h2><pre>${htmlEscape(JSON.stringify(run, null, 2).slice(0, 20000))}</pre></section></body></html>`;
  const safeTimestamp = generatedAt.replace(/[:.]/g, '-');
  const filePath = path.join(REPORT_DIR, `validation-${safeTimestamp}.html`);
  fs.writeFileSync(filePath, html, 'utf8');
  return { exported: true, filePath, generatedAt, type: run.type, passed: run.passed, rows: rows.length };
}

function buildValidationReport(args = {}) {
  const run = lastValidationRun || { name: '未执行验证', passed: false, cases: [], artifacts: getArtifacts() };
  if (args.format === 'json') return run;
  
  if (run.type === 'suite') {
    const results = run.results || [];
    const failed = results.filter(item => !item.passed);
    const lines = [
      '# 验证套件执行报告',
      '',
      `套件名称：${run.name}`,
      `验证结果：${run.passed ? '✅ 通过' : '❌ 待修复'}`,
      `开始时间：${run.startedAt || ''}`,
      `结束时间：${run.endedAt || ''}`,
      `执行项总数：${run.total || results.length}`,
      `通过：${run.passedCount || results.filter(item => item.passed).length}`,
      `失败：${run.failedCount || failed.length}`,
      `失败后继续：${run.continueOnFailure ? '是' : '否'}`,
      '',
      '## 执行项结果',
      ...results.map((item, index) => `- ${item.passed ? '✅' : '❌'} ${index + 1}. [${item.type}] ${item.name}${item.error ? `：${item.error}` : ''}`),
      '',
      '## 失败分析',
      ...(failed.length ? failed.flatMap(item => [
        `### ${item.name}`,
        `- 类型：${item.type}`,
        `- 错误：${item.error || '无异常抛出'}`,
        `- 子结果失败数：${item.result?.failedCount ?? '未知'}`,
        ''
      ]) : ['无失败执行项。']),
      '',
      '## 证据产物',
      `- screenshots：${run.artifacts?.screenshots?.length || 0}`,
      `- traces：${run.artifacts?.traces?.length || 0}`,
      `- har：${run.artifacts?.har?.length || 0}`,
      `- reports：${run.artifacts?.reports?.length || 0}`,
      `- log：${run.artifacts?.logFile || '无'}`
    ];
    return lines.join('\n');
  }
  const cases = run.cases || [];
  const failed = cases.filter(item => !item.passed);
  const lines = [
    '# 浏览器验证执行报告',
    '',
    `验证名称：${run.name}`,
    `验证结果：${run.passed ? '✅ 通过' : '❌ 待修复'}`,
    `开始时间：${run.startedAt || ''}`,
    `结束时间：${run.endedAt || ''}`,
    `用例总数：${run.total || cases.length}`,
    `通过：${run.passedCount || cases.filter(item => item.passed).length}`,
    `失败：${run.failedCount || failed.length}`,
    '',
    '## 用例结果',
    ...cases.map((item, index) => `- ${item.passed ? '✅' : '❌'} ${index + 1}. ${item.name}${item.error ? `：${item.error}` : ''}`),
    '',
    '## 失败分析',
    ...(failed.length ? failed.flatMap(item => [
      `### ${item.name}`,
      `- 断言通过：${item.assertion ? item.assertion.passed : '无断言'}`,
      `- 错误数：${item.errors?.summary?.total ?? '未知'}`,
      `- 假设：${(item.investigation?.hypotheses || []).join('；') || '无'}`,
      ''
    ]) : ['无失败用例。']),
    '',
    '## 证据产物',
    `- screenshots：${run.artifacts?.screenshots?.length || 0}`,
    `- traces：${run.artifacts?.traces?.length || 0}`,
    `- har：${run.artifacts?.har?.length || 0}`,
    `- log：${run.artifacts?.logFile || '无'}`
  ];
  return lines.join('\n');
}

function validateToolSchemas() {
  const requiredTools = [
    'browser_open', 'browser_click', 'browser_type', 'browser_snapshot', 'browser_console', 'browser_network',
    'browser_errors', 'browser_errors_clear', 'browser_wait', 'browser_assert', 'browser_flow', 'browser_step',
    'browser_trace_start', 'browser_trace_stop', 'browser_artifacts', 'browser_artifacts_clear',
    'browser_instrument', 'browser_events', 'browser_events_clear', 'browser_network_detail', 'browser_har_export',
    'debug_investigate', 'validation_check', 'validation_flow', 'validation_run', 'validation_report', 'validation_suite_run',
    'validation_report_export', 'browser_visual_baseline', 'browser_visual_compare', 'browser_visual_report',
    'browser_a11y_check', 'browser_performance_check', 'browser_locator_validate', 'browser_locator_suggest',
    'browser_hover', 'browser_scroll', 'browser_press_key',
    'mcp_health_check', 'mcp_self_test', 'project_audit', 'css_var_check'
  ];
  const registered = new Set(tools.map(tool => tool.name));
  const missing = requiredTools.filter(name => !registered.has(name));
  const invalid = tools.filter(tool => !tool.name || !tool.description || !(tool.inputSchema || tool.input_schema || tool.arguments)).map(tool => tool.name || '<unnamed>');
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
    version: '1.0.0',
    activeSession: browserSessionId,
    schema,
    directories: dirs,
    checkpoint: currentCheckpoint,
    eventCheckpoint,
    logFile: LOG_FILE
  });
}

/**
 * projectAudit — 扫描项目目录，检测常见代码质量问题
 */
async function projectAudit(args = {}) {
  const projectPath = args.projectPath;
  if (!projectPath) return { ok: false, error: 'projectPath is required' };

  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(projectPath);
  if (!fs.existsSync(root)) return { ok: false, error: `path not found: ${root}` };

  const issues = [];
  const minSeverity = args.severity || 'all';
  const severityOrder = { critical: 1, high: 2, medium: 3, low: 4 };

  function addIssue(severity, id, file, line, description) {
    if (minSeverity !== 'all' && severityOrder[severity] > severityOrder[minSeverity]) return;
    issues.push({ id, severity, file, line: line || 1, description });
  }

  function scanFile(filePath, relativePath) {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return;
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const basename = path.basename(filePath);

    // ── 1. 硬编码密码/密钥 ──
    const passwordPatterns = [
      /password\s*[=:]\s*['"][a-zA-Z0-9_!@#$%^&*()]{4,}['"]/i,
      /secret\s*[=:]\s*['"][a-zA-Z0-9_!@#$%^&*()]{8,}['"]/i,
      /api[_-]?key\s*[=:]\s*['"][a-zA-Z0-9_]{16,}['"]/i,
      /token\s*[=:]\s*['"][a-zA-Z0-9_\-.]{16,}['"]/i
    ];
    if (/\.(yml|yaml|json|env|py|js|ts|ps1|sh)$/i.test(ext)) {
      lines.forEach((line, idx) => {
        passwordPatterns.forEach((pat, pi) => {
          const m = line.match(pat);
          if (m) {
            const val = m[0].replace(/['";]/g, '');
            // Skip obvious placeholders
            if (/your_|changeme|placeholder|example/i.test(val)) return;
            addIssue('high', `SEC-${pi + 1}`, relativePath, idx + 1, `可能的硬编码凭据: ${val.slice(0, 40)}`);
          }
        });
      });
    }

    // ── 2. 硬编码绝对路径 (Windows) ──
    if (/\.(py|js|ts|ps1|sh|bat|cmd)$/i.test(ext)) {
      lines.forEach((line, idx) => {
        const m = line.match(/[a-zA-Z]:\\(?:[^\\"]+\\)+[^\\"]+/);
        if (m) {
          addIssue('medium', `PATH-1`, relativePath, idx + 1, `硬编码绝对路径: ${m[0].slice(0, 60)}`);
        }
      });
    }

    // ── 3. SQL 语法检查 (schema.sql) ──
    if (basename === 'schema.sql' || basename.endsWith('.sql')) {
      lines.forEach((line, idx) => {
        // Detect missing comma between column definitions
        const trimmed = line.trimEnd();
        if (/^\s+\w+/.test(trimmed) && !trimmed.endsWith(',') && !trimmed.includes('PRIMARY KEY') && !trimmed.includes('FOREIGN KEY') && !trimmed.includes('UNIQUE') && !trimmed.includes('CHECK') && !trimmed.includes('REFERENCES') && !trimmed.includes(');') && !trimmed.includes('--') && trimmed.length > 10) {
          const nextLine = lines[idx + 1] ? lines[idx + 1].trim() : '';
          if (nextLine.startsWith('  ') && !nextLine.startsWith(')') && !nextLine.startsWith('--')) {
            addIssue('critical', `SQL-1`, relativePath, idx + 1, `可能的 SQL 语法错误: 列定义缺少逗号`);
          }
        }
      });
    }

    // ── 3b. SQL 列缺失检查 (SQL-COL) ──
    if (basename === 'schema.sql' || basename.endsWith('.sql')) {
      // 构建表 schema 映射: { tableName: Set<columnName> }
      const tableColumns = {};

      // 1) 解析 CREATE TABLE ... (列定义), 支持 IF NOT EXISTS 和库名前缀
      const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`?\w+`?\.)?`?(\w+)`?\s*\(/gi;
      let ctMatch;
      while ((ctMatch = createTableRegex.exec(content)) !== null) {
        const tableName = ctMatch[1].toLowerCase();
        // 从匹配位置向后扫描，找到匹配的闭合 )
        const startPos = ctMatch.index + ctMatch[0].length;
        let depth = 1;
        let endPos = startPos;
        while (endPos < content.length && depth > 0) {
          if (content[endPos] === '(') depth++;
          else if (content[endPos] === ')') depth--;
          endPos++;
        }
        const columnBlock = content.slice(startPos, endPos - 1);
        // 提取列名：每行第一个非空白词为列名（跳过 SQL 关键字）
        const colDefLines = columnBlock.split('\n');
        const cols = new Set();
        for (const colLine of colDefLines) {
          const trimmedLine = colLine.trim();
          if (!trimmedLine || trimmedLine.startsWith('--') || trimmedLine.startsWith('/*')) continue;
          // 提取第一个词作为列名（去掉可能的反引号）
          const firstWord = trimmedLine.split(/\s+/)[0].replace(/[`"]/g, '');
          if (!firstWord) continue;
          // 跳过 SQL 关键字
          if (/^(primary|foreign|unique|check|constraint|index|key|not|null|default|references|fulltext|spatial)\b/i.test(firstWord)) continue;
          // 跳过末尾的 ) 和 ,
          if (firstWord === ')' || firstWord === ',') continue;
          cols.add(firstWord.toLowerCase());
        }
        if (cols.size > 0) {
          tableColumns[tableName] = cols;
        }
      }

      // 2) 解析 ALTER TABLE ... ADD COLUMN ... 提取后续添加的列
      const alterAddRegex = /ALTER\s+TABLE\s+(?:`?\w+`?\.)?`?(\w+)`?\s+ADD\s+(?:COLUMN\s+)?`?(\w+)`?/gi;
      let alMatch;
      while ((alMatch = alterAddRegex.exec(content)) !== null) {
        const tableName = alMatch[1].toLowerCase();
        const colName = alMatch[2].toLowerCase();
        if (!tableColumns[tableName]) {
          tableColumns[tableName] = new Set();
        }
        tableColumns[tableName].add(colName);
      }

      // 3) 解析 SELECT ... FROM 并检查列名
      const selectRegex = /SELECT\s+([\s\S]*?)\s+FROM\s+(?:`?\w+`?\.)?`?(\w+)`?/gi;
      let selMatch;
      while ((selMatch = selectRegex.exec(content)) !== null) {
        const selectClause = selMatch[1].trim();
        const tableName = selMatch[2].toLowerCase();

        // 跳过通配符
        if (/^\s*\*\s*$/.test(selectClause)) continue;

        // 跳过包含子查询的 SELECT
        if (/SELECT\s/i.test(selectClause) && !/^\s*CASE\s/i.test(selectClause)) continue;

        // 如果表不在 schema 中，跳过
        if (!tableColumns[tableName]) continue;

        // 提取列名列表（取逗号分隔的每个部分的首个词，去掉反引号、别名等）
        const colParts = selectClause.split(',').map(c => c.trim());
        for (const part of colParts) {
          // 取首个非空词作为列名，去掉反引号和引号
          const colName = part.split(/\s+/)[0].replace(/[`"\[\]]/g, '').toLowerCase();
          if (!colName || colName === '') continue;
          // 跳过 SQL 函数/关键字
          if (/^(count|sum|avg|min|max|distinct|case|when|then|else|end|as|is|null|not|in|exists|and|or|on|true|false)\b/i.test(colName)) continue;
          // 检查列名是否在表定义中
          if (!tableColumns[tableName].has(colName)) {
            // 找到该 SELECT 语句所在行号
            const lineIdx = lines.findIndex(l => l.toLowerCase().includes(selMatch[0].split('\n')[0].toLowerCase().trim()));
            addIssue('high', 'SQL-COL', relativePath, (lineIdx >= 0 ? lineIdx : 0) + 1,
              `数据库列缺失: SELECT 中引用的列 "${colName}" 未在表 "${tableName}" 的 schema 定义中找到`);
          }
        }
      }
    }

    // ── 4. CSS 变量检测 ──
    if (ext === '.css') {
      // 收集 :root 中定义的所有变量
      const rootDefs = new Set();
      const rootVarValues = {};
      const rootBlockRegex = /:root\s*\{([^}]*)\}/g;
      let rootMatch;
      while ((rootMatch = rootBlockRegex.exec(content)) !== null) {
        const block = rootMatch[1];
        const defRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
        let defMatch;
        while ((defMatch = defRegex.exec(block)) !== null) {
          rootDefs.add(defMatch[1]);
          rootVarValues[defMatch[1]] = defMatch[2].trim();
        }
      }

      if (rootDefs.size > 0) {
        // a/b. 检查 :root 中的每条定义
        const refRegex = /var\(\s*(--[\w-]+)\s*/g;
        for (const [varName, varValue] of Object.entries(rootVarValues)) {
          refRegex.lastIndex = 0;
          let refMatch;
          while ((refMatch = refRegex.exec(varValue)) !== null) {
            const refVar = refMatch[1];
            const lineIdx = lines.findIndex(l => l.includes(varName));
            // a. 循环引用: --xxx: var(--xxx)
            if (refVar === varName) {
              addIssue('high', 'CSS-SELF', relativePath, lineIdx + 1,
                `CSS 变量循环引用: ${varName} 的值通过 var() 引用了自身`);
            // b. 引用未定义变量: --xxx: var(--yyy) 但 --yyy 未在 :root 中定义
            } else if (!rootDefs.has(refVar)) {
              addIssue('high', 'CSS-UNDEF', relativePath, lineIdx + 1,
                `CSS 变量引用未定义: ${varName} 引用了 ${refVar}，但 ${refVar} 未在 :root 中定义`);
            }
          }
        }

        // c. 非 :root 区域中的 var() 引用了未定义变量
        let inRootBlock = false;
        lines.forEach((line, idx) => {
          if (inRootBlock) {
            if (line.includes('}')) inRootBlock = false;
            return;
          }
          if (/:root\s*\{/.test(line)) {
            if (!line.includes('}')) inRootBlock = true;
            return;
          }
          const lineRefRegex = /var\(\s*(--[\w-]+)\s*/g;
          let m;
          while ((m = lineRefRegex.exec(line)) !== null) {
            if (!rootDefs.has(m[1])) {
              addIssue('medium', 'CSS-NOROOT', relativePath, idx + 1,
                `CSS 变量 ${m[1]} 未在 :root 中定义，但在文件中被引用`);
            }
          }
        });
      }
    }
  }

  // ── 递归扫描 ──
  function walk(dir, relativeDir = '') {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const entry of entries) {
      // Skip .git, node_modules, .trae, logs
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'logs') continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else {
        scanFile(fullPath, relPath);
      }
    }
  }

  walk(root);
  return { ok: true, projectPath: root, totalIssues: issues.length, issues };
}

async function mcpSelfTest(args = {}) {
  const { target } = await ensurePage({ headless: args.headless });
  clearArtifacts({ includeLogs: false });
  resetRuntimeLogs();
  await installInstrumentation(target).catch(() => {});
  await clearBrowserEvents(target).catch(() => {});
  const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><html><head><title>MCP Self Test</title></head><body><h1 id="title">MCP Self Test</h1><input id="name" /><button id="btn" onclick="document.body.dataset.clicked=\'yes\';document.getElementById(\'result\').textContent=\'clicked\'">Click</button><div id="result"></div></body></html>');
  await target.goto(dataUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const trace = args.trace === false ? null : await startTrace(target, { name: 'mcp-self-test', screenshots: true, snapshots: true }).catch(error => ({ error: error.message }));
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

  return redact({
    ok: health.ok && flow.passed && errors.summary.total === 0,
    health,
    flow,
    step,
    events,
    errors,
    trace,
    traceStop,
    artifacts,
    skillConsistency
  });
}

// ===== 智能页面发现 =====
const PAGE_PATTERNS = {
  login: {
    urlPatterns: ['/login', '/signin', '/auth/login', '/auth/signin', '/log-in', '/sign-in', '/user/login', '/account/login', '/#/login', '/#/signin'],
    selectors: ['input[type="password"]', 'form input[type="password"]', '#login-form', '.login-form', '.login-page', '[data-page="login"]', '[data-testid="login"]'],
    textIndicators: ['登录', 'Login', 'Sign In', 'SIGN IN', 'log in', 'sign in', 'Forgot your password'],
    titleIndicators: ['Login', 'Sign In', 'Log In', '登录']
  },
  signup: {
    urlPatterns: ['/signup', '/register', '/auth/register', '/auth/signup', '/sign-up', '/user/register', '/account/register', '/create-account', '/#/signup', '/#/register'],
    selectors: ['input[type="email"]', 'input[name="email"]', 'input[id*="email"]', '#signup-form', '.signup-form', '.register-form', '[data-testid="signup"]'],
    textIndicators: ['注册', 'Sign Up', 'SIGN UP', 'Register', 'Create Account', '免费注册', "Don't have an account"],
    titleIndicators: ['Sign Up', 'Register', '注册']
  },
  home: {
    urlPatterns: ['/', '/home', '/index', '/index.html', '/dashboard', '/app', '/#/home', '/#/'],
    selectors: ['nav a[href="/"]', '.logo a', 'header a[href="/"]', 'a[href="/home"]', '[data-testid="home"]'],
    textIndicators: ['首页', 'Home', 'Dashboard', '概览', '欢迎'],
    titleIndicators: ['Home', '首页', 'Dashboard']
  },
  dashboard: {
    urlPatterns: ['/dashboard', '/app', '/console', '/admin/dashboard', '/home', '/#/dashboard'],
    selectors: ['.sidebar', '.dashboard', '.admin-nav', 'aside nav', '[data-page="dashboard"]', '.main-content', '[data-testid="dashboard"]'],
    textIndicators: ['仪表盘', 'Dashboard', '控制台', 'Console', '概览', 'Workspace'],
    titleIndicators: ['Dashboard', '仪表盘', 'Console']
  },
  admin: {
    urlPatterns: ['/admin', '/admin/', '/manage', '/management', '/backend', '/system', '/#/admin'],
    selectors: ['.admin-sidebar', '.admin-nav', '[data-page="admin"]', 'a[href*="admin"]', '.admin-header', '[data-testid="admin"]'],
    textIndicators: ['管理', 'Admin', '管理后台', '后台'],
    titleIndicators: ['Admin', '管理后台']
  },
  settings: {
    urlPatterns: ['/settings', '/profile/settings', '/user/settings', '/account/settings', '/preferences', '/#/settings'],
    selectors: ['a[href*="settings"]', 'a[href*="preferences"]', '#settings-form', '.settings-page', '#settings', '[data-testid="settings"]'],
    textIndicators: ['设置', 'Settings', '偏好', 'Preferences', '个人设置'],
    titleIndicators: ['Settings', '设置']
  },
  profile: {
    urlPatterns: ['/profile', '/user', '/user/profile', '/account', '/me', '/#/profile'],
    selectors: ['a[href*="profile"]', 'a[href*="/user"]', '.user-profile', '#profile-form', '.avatar-upload', '[data-testid="profile"]'],
    textIndicators: ['个人中心', 'Profile', '我的', '个人资料'],
    titleIndicators: ['Profile', '个人中心']
  },
  search: {
    urlPatterns: ['/search', '/find', '/browse', '/explore', '/#/search'],
    selectors: ['input[type="search"]', 'input[placeholder*="search"]', 'input[placeholder*="Search"]', 'input[placeholder*="搜索"]', '#search-form', '.search-box', '[data-testid="search"]'],
    textIndicators: ['搜索', 'Search', '查找', 'Browse'],
    titleIndicators: ['Search', '搜索']
  },
  cart: {
    urlPatterns: ['/cart', '/shop/cart', '/shopping-cart', '/checkout/cart', '/#/cart'],
    selectors: ['.cart', '.shopping-cart', '#cart', 'a[href*="cart"]', '.cart-icon', '[data-testid="cart"]'],
    textIndicators: ['购物车', 'Cart', 'Shopping Cart'],
    titleIndicators: ['Cart', '购物车']
  },
  checkout: {
    urlPatterns: ['/checkout', '/order/checkout', '/payment', '/checkout/shipping', '/#/checkout'],
    selectors: ['.checkout', '#checkout', '.checkout-page', '.payment-form', '[data-testid="checkout"]'],
    textIndicators: ['结算', 'Checkout', '支付', 'Payment'],
    titleIndicators: ['Checkout']
  },
  'forgot-password': {
    urlPatterns: ['/forgot-password', '/reset-password', '/auth/forgot', '/password/reset', '/forgot', '/reset', '/#/forgot-password'],
    selectors: ['input[placeholder*="email"]', 'input[placeholder*="Email"]', 'a[href*="forgot"]', 'a[href*="reset"]', '[data-testid="forgot-password"]'],
    textIndicators: ['忘记密码', 'Forgot Password', '重置密码', 'Reset Password'],
    titleIndicators: ['Forgot Password', 'Reset Password', '忘记密码']
  },
  logout: {
    urlPatterns: ['/logout', '/signout', '/auth/logout', '/user/logout', '/#/logout'],
    selectors: ['a[href*="logout"]', 'a[href*="signout"]', '[data-testid="logout"]'],
    textIndicators: ['退出', 'Logout', 'Sign Out', '登出'],
    titleIndicators: ['Logout']
  }
};

async function findPage(target, args = {}) {
  const { target: pageTarget } = await ensurePage(args);
  // 等待SPA页面渲染
  await new Promise(r => setTimeout(r, 800)).catch(() => {});
  
  const currentUrl = pageTarget.url();
  const currentOrigin = new URL(currentUrl).origin;
  const baseUrl = args.baseUrl || currentOrigin;

  const results = {};

  // 支持 "all" - 检测所有类型
  const targets = target === 'all' ? Object.keys(PAGE_PATTERNS) : [target];

  for (const t of targets) {
    const pattern = PAGE_PATTERNS[t];
    if (!pattern) {
      results[t] = { error: `未知的页面类型：${t}，支持：${Object.keys(PAGE_PATTERNS).join(', ')}` };
      continue;
    }

    const pageInfo = {
      targetType: t,
      currentUrl,
      onTargetPage: false,
      matchMethod: null,
      matchDetail: null,
      matchScore: 0,
      suggestions: [],
      links: [],
      buttons: []
    };

    let score = 0;

    // 1. 检查当前URL是否匹配（包括hash路由）
    const currentUrlObj = new URL(currentUrl);
    const currentPath = currentUrlObj.pathname;
    const currentHash = (currentUrlObj.hash || '').toLowerCase();
    for (const urlPattern of pattern.urlPatterns) {
      // 匹配pathname
      if (currentPath === urlPattern || currentPath.startsWith(urlPattern + '/') || currentPath.startsWith(urlPattern + '?')) {
        pageInfo.onTargetPage = true;
        pageInfo.matchMethod = 'url';
        pageInfo.matchDetail = `当前URL路径(${currentPath})匹配模式 ${urlPattern}`;
        pageInfo.matchScore = 100;
        score = Math.max(score, 100);
        break;
      }
      // 匹配hash路由（SPA应用如 /#/login）
      if (urlPattern.startsWith('/#/') && currentHash === urlPattern.replace('/#', '')) {
        pageInfo.onTargetPage = true;
        pageInfo.matchMethod = 'hash_url';
        pageInfo.matchDetail = `当前URL hash(${currentHash})匹配模式 ${urlPattern}`;
        pageInfo.matchScore = 95;
        score = Math.max(score, 95);
        break;
      }
      if (urlPattern === '/#/' && (currentHash === '/#' || currentHash === '/#/')) {
        pageInfo.onTargetPage = true;
        pageInfo.matchMethod = 'hash_url';
        pageInfo.matchDetail = `当前URL hash(${currentHash})匹配首页`;
        pageInfo.matchScore = 95;
        score = Math.max(score, 95);
        break;
      }
    }

    // 2. 检查页面元素特征（如果可以在当前页面）
    if (!pageInfo.onTargetPage) {
      try {
        const elementCheck = await pageTarget.evaluate(({ selectors, textIndicators, titleIndicators }) => {
          let score = 0;
          let bestMatch = { matched: false, via: null, detail: null, score: 0 };

          // 检查页面标题
          const title = document.title;
          if (titleIndicators) {
            for (const ti of titleIndicators) {
              if (title.toLowerCase().includes(ti.toLowerCase())) {
                const s = ti.length > 3 ? 90 : 80;
                if (s > bestMatch.score) {
                  bestMatch = { matched: true, via: 'title', detail: `页面标题"${title}"包含"${ti}"`, score: s };
                }
              }
            }
          }
          // 检查CSS选择器（存在即可见）
          for (const sel of selectors) {
            try {
              const el = document.querySelector(sel);
              if (el) {
                const rect = el.getBoundingClientRect();
                if (rect.width && rect.height) {
                  const s = 70;
                  if (s > bestMatch.score) {
                    bestMatch = { matched: true, via: 'selector', detail: sel, text: (el.innerText || el.textContent || '').trim().substring(0, 100), score: s };
                  }
                }
              }
            } catch(e) {}
          }
          // 检查按钮文本（SPA常用按钮导航）
          const allButtons = document.querySelectorAll('button, [role="button"], .btn, input[type="submit"]');
          for (const btn of allButtons) {
            const btnText = (btn.innerText || btn.textContent || btn.value || '').trim();
            if (!btnText) continue;
            const btnLower = btnText.toLowerCase();
            for (const indicator of textIndicators) {
              if (btnLower.includes(indicator.toLowerCase())) {
                const s = 60;
                if (s > bestMatch.score) {
                  bestMatch = { matched: true, via: 'button_text', detail: `按钮"${btnText.substring(0, 50)}"`, score: s };
                }
              }
            }
          }
          // 检查导航栏/侧边栏等语义区域的文本
          const navAreas = document.querySelectorAll('nav, [role="navigation"], .nav, .sidebar, .menu, header nav');
          for (const nav of navAreas) {
            const navText = nav.innerText || '';
            for (const indicator of textIndicators) {
              if (navText.includes(indicator)) {
                const s = 50;
                if (s > bestMatch.score) {
                  bestMatch = { matched: true, via: 'nav_text', detail: `导航区域包含"${indicator}"`, score: s };
                }
              }
            }
          }
          // 检查页面可见文本
          const bodyText = document.body.innerText;
          for (const text of textIndicators) {
            if (bodyText.includes(text)) {
              const s = 40;
              if (s > bestMatch.score) {
                bestMatch = { matched: true, via: 'page_text', detail: `页面包含文本"${text}"`, score: s };
              }
            }
          }
          return bestMatch;
        }, { selectors: pattern.selectors, textIndicators: pattern.textIndicators, titleIndicators: pattern.titleIndicators });

        if (elementCheck.matched) {
          pageInfo.onTargetPage = true;
          pageInfo.matchMethod = elementCheck.via;
          pageInfo.matchDetail = elementCheck.detail;
          pageInfo.matchScore = elementCheck.score;
          score = Math.max(score, elementCheck.score);
        }
      } catch (e) {
        // ignore evaluate errors
      }
    }

    // 3. 收集该类型的链接（a标签 + 按钮）
    try {
      const collected = await pageTarget.evaluate(({ t, urlPatterns, selectors, textIndicators }) => {
        const allLinks = [];
        const seenHref = new Set();
        const seenText = new Set();

        // 从a标签提取
        document.querySelectorAll('a[href]').forEach(a => {
          const href = a.href || a.getAttribute('href') || '';
          const text = (a.innerText || a.textContent || '').trim().substring(0, 100);
          if (href && !href.startsWith('javascript:') && href !== '#' && !seenHref.has(href)) {
            seenHref.add(href);
            // 检查是否匹配目标类型
            const hrefLower = href.toLowerCase();
            let relevance = 0;
            for (const p of urlPatterns) {
              if (hrefLower.includes(p)) relevance = Math.max(relevance, 10);
            }
            for (const sel of selectors) {
              if (a.matches(sel)) relevance = Math.max(relevance, 8);
            }
            for (const txt of textIndicators) {
              if (text.includes(txt)) relevance = Math.max(relevance, 6);
            }
            if (relevance > 0) {
              allLinks.push({ type: 'link', href: href.substring(0, 300), text: text.substring(0, 80), relevance, selector: `a` });
            }
          }
        });

        // 从按钮提取（SPA关键增强）
        document.querySelectorAll('button, [role="button"], .btn, [role="link"], [onclick]').forEach(btn => {
          const btnText = (btn.innerText || btn.textContent || btn.value || '').trim().substring(0, 80);
          if (!btnText || seenText.has(btnText.toLowerCase())) return;
          const btnLower = btnText.toLowerCase();
          let relevance = 0;
          for (const txt of textIndicators) {
            if (btnLower.includes(txt.toLowerCase())) relevance = Math.max(relevance, 6);
          }
          // 检查周围上下文
          const parentText = (btn.parentElement?.innerText || '').trim().substring(0, 100);
          for (const txt of textIndicators) {
            if (parentText.toLowerCase().includes(txt.toLowerCase())) relevance = Math.max(relevance, 4);
          }
          if (relevance > 0) {
            seenText.add(btnText.toLowerCase());
            const btnId = btn.id ? `#${btn.id}` : '';
            const btnClass = btn.className && typeof btn.className === 'string' ? `.${btn.className.split(' ')[0]}` : '';
            allLinks.push({
              type: 'button',
              href: null,
              text: btnText.substring(0, 80),
              relevance,
              selector: btn.tagName.toLowerCase() + btnId + btnClass || 'button',
              action: 'click'
            });
          }
        });

        // 按relevance排序
        allLinks.sort((a, b) => b.relevance - a.relevance);
        const links = allLinks.filter(l => l.type === 'link').slice(0, 10);
        const buttons = allLinks.filter(l => l.type === 'button').slice(0, 10);
        return { links, buttons };
      }, { t, urlPatterns: pattern.urlPatterns, selectors: pattern.selectors, textIndicators: pattern.textIndicators });

      pageInfo.links = collected.links;
      pageInfo.buttons = collected.buttons;
    } catch (e) {
      // ignore
    }

    // 4. 生成建议
    if (!pageInfo.onTargetPage) {
      if (pageInfo.links.length > 0) {
        pageInfo.suggestions.push(`页面有 ${pageInfo.links.length} 个链接可能与"${t}"相关`);
      }
      if (pageInfo.buttons.length > 0) {
        pageInfo.suggestions.push(`页面有 ${pageInfo.buttons.length} 个按钮可能与"${t}"相关（SPA应用）`);
      }
      if (pageInfo.links.length > 0 || pageInfo.buttons.length > 0) {
        pageInfo.suggestions.push(`建议：使用 browser_click 点击相关元素，或使用 browser_open 直接导航`);
      }

      // 尝试建议URL
      const suggestedUrls = [];
      for (const urlPattern of pattern.urlPatterns) {
        suggestedUrls.push(baseUrl.replace(/\/$/, '') + urlPattern);
      }
      pageInfo.suggestedUrls = suggestedUrls.slice(0, 5);
    } else {
      pageInfo.suggestions.push(`已在 ${t} 页面（匹配方式：${pageInfo.matchMethod}）`);
    }

    results[t] = pageInfo;
  }

  // 如果指定了navigate且当前不在目标页面，且有建议URL
  if (args.navigate && !results[target]?.onTargetPage && results[target]?.suggestedUrls?.length > 0) {
    // 尝试多个建议URL（优先选非hash的，不行再试hash）
    for (const suggestedUrl of results[target].suggestedUrls) {
      try {
        await pageTarget.goto(suggestedUrl, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
        results[target].navigatedTo = suggestedUrl;
        results[target].navigationResult = pageTarget.url();
        // 如果是hash URL，多等一会让SPA渲染
        if (suggestedUrl.includes('/#')) {
          await new Promise(r => setTimeout(r, 1000)).catch(() => {});
        }
        break;
      } catch (e) {
        continue;
      }
    }
  }

  return results;
}

async function findElement(target, args = {}) {
  const text = String(args.text || '').trim();
  const role = args.role ? String(args.role).toLowerCase() : null;
  const tagName = args.tagName ? String(args.tagName).toLowerCase() : null;
  const onlyVisible = args.onlyVisible !== false;
  const limit = Number(args.limit) || 5;

  if (!text) {
    return { results: [], total: 0, query: { text, role, tagName } };
  }

  const results = await target.evaluate((params) => {
    const { text, role, tagName, onlyVisible } = params;
    const textLower = text.toLowerCase();
    const allResults = [];
    const seenSelectors = new Set();

    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden') return false;
      if (parseFloat(style.opacity) < 0.1) return false;
      if (rect.width <= 0 || rect.height <= 0) return false;
      return true;
    }

    function getElementText(el) {
      const t = (el.innerText || el.textContent || el.value || '').trim();
      return t.replace(/\s+/g, ' ');
    }

    function generateSelector(el) {
      if (el.id) {
        return `#${CSS.escape(el.id)}`;
      }
      const name = el.getAttribute('name');
      if (name && el.tagName.match(/^(INPUT|SELECT|TEXTAREA|BUTTON|FORM)$/)) {
        return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
      }
      const tag = el.tagName.toLowerCase();
      const classes = typeof el.className === 'string'
        ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.')
        : '';
      const classPart = classes ? `.${classes}` : '';
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(sib =>
          sib.tagName === el.tagName && (!classes || (typeof sib.className === 'string' && sib.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.') === classes))
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(el) + 1;
          return `${tag}${classPart}:nth-child(${index})`;
        }
      }
      return `${tag}${classPart}`;
    }

    function buildResult(el, confidence, matchMethod) {
      const fullSelector = generateSelector(el);
      if (seenSelectors.has(fullSelector)) return null;
      seenSelectors.add(fullSelector);
      const rect = el.getBoundingClientRect();
      const visible = isVisible(el);
      return {
        selector: fullSelector,
        text: getElementText(el).slice(0, 200),
        tagName: el.tagName.toLowerCase(),
        confidence,
        visible,
        position: { top: Math.round(rect.top), left: Math.round(rect.left) },
        matchMethod
      };
    }

    function matchesRole(el, roleName) {
      const elRole = el.getAttribute('role')?.toLowerCase() || '';
      if (elRole === roleName) return true;
      const tag = el.tagName.toLowerCase();
      const roleMap = {
        button: ['button', 'input[type="submit"]', 'input[type="button"]', 'input[type="reset"]'],
        link: ['a'],
        textbox: ['input[type="text"]', 'input[type="email"]', 'input[type="password"]', 'input[type="search"]', 'input[type="tel"]', 'input[type="url"]', 'textarea'],
        input: ['input', 'textarea', 'select'],
        checkbox: ['input[type="checkbox"]'],
        radio: ['input[type="radio"]'],
        combobox: ['select'],
        img: ['img'],
        heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
      };
      const tags = roleMap[roleName] || [];
      return tags.some(t => {
        if (t.includes('[type=')) {
          const [baseTag, typePart] = t.split('[');
          const typeVal = typePart.replace(/type="([^"]+)"\]/, '$1');
          return tag === baseTag && el.type?.toLowerCase() === typeVal;
        }
        return tag === t;
      });
    }

    function matchesTagName(el, tn) {
      return el.tagName.toLowerCase() === tn.toLowerCase();
    }

    function filterByCriteria(el) {
      if (role && !matchesRole(el, role)) return false;
      if (tagName && !matchesTagName(el, tagName)) return false;
      if (onlyVisible && !isVisible(el)) return false;
      return true;
    }

    const buttonLinkSelector = 'button, a[href], [role="button"], [role="link"], input[type="submit"], input[type="button"], .btn';

    const strategies = [
      {
        name: 'button_link_exact',
        confidence: 1.0,
        selector: buttonLinkSelector,
        match: (el) => getElementText(el).toLowerCase() === textLower
      },
      {
        name: 'any_element_exact',
        confidence: 0.9,
        selector: '*',
        match: (el) => getElementText(el).toLowerCase() === textLower
      },
      {
        name: 'button_link_contains',
        confidence: 0.8,
        selector: buttonLinkSelector,
        match: (el) => getElementText(el).toLowerCase().includes(textLower)
      },
      {
        name: 'placeholder_match',
        confidence: 0.75,
        selector: 'input, textarea',
        match: (el) => {
          const ph = el.getAttribute('placeholder') || '';
          return ph.toLowerCase() === textLower || ph.toLowerCase().includes(textLower);
        }
      },
      {
        name: 'aria_label_match',
        confidence: 0.75,
        selector: '*',
        match: (el) => {
          const aria = el.getAttribute('aria-label') || '';
          return aria.toLowerCase() === textLower || aria.toLowerCase().includes(textLower);
        }
      },
      {
        name: 'title_alt_match',
        confidence: 0.7,
        selector: '*',
        match: (el) => {
          const title = el.getAttribute('title') || '';
          const alt = el.getAttribute('alt') || '';
          return title.toLowerCase() === textLower || title.toLowerCase().includes(textLower) ||
                 alt.toLowerCase() === textLower || alt.toLowerCase().includes(textLower);
        }
      },
      {
        name: 'role_text_fuzzy',
        confidence: 0.6,
        selector: '*',
        match: (el) => {
          if (!role) return false;
          const elText = getElementText(el).toLowerCase();
          return matchesRole(el, role) && (elText.includes(textLower) || textLower.includes(elText));
        }
      }
    ];

    for (const strategy of strategies) {
      try {
        const elements = document.querySelectorAll(strategy.selector);
        for (const el of elements) {
          if (!filterByCriteria(el)) continue;
          if (strategy.match(el)) {
            const result = buildResult(el, strategy.confidence, strategy.name);
            if (result) allResults.push(result);
          }
        }
      } catch (_) {}
    }

    allResults.sort((a, b) => b.confidence - a.confidence);

    return {
      results: allResults.slice(0, 100),
      total: allResults.length
    };
  }, { text, role, tagName, onlyVisible });

  const limitedResults = results.results.slice(0, limit);
  return redact({
    query: { text, role, tagName, onlyVisible, limit },
    results: limitedResults,
    total: results.total,
    returned: limitedResults.length
  });
}

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
async function traverseMenu(args = {}) {
  const { target } = await ensurePage(args);
  const maxDepth = Math.min(args.maxDepth || 3, 5);
  const maxItems = args.maxItems || 30;
  const waitMs = Math.min(args.waitMs || 500, 1000);
  const includeSubMenus = args.includeSubMenus !== false;

  const startUrl = target.url();
  
  // 全局超时（60秒后强制返回）
  let timeoutReached = false;
  const timeoutId = setTimeout(() => { timeoutReached = true; }, 55000);
  function checkTimeout() { return timeoutReached; }
  const allItems = [];
  const visited = new Set();
  let totalClicks = 0;
  let totalErrors = 0;

  // 辅助：快速按文本点击元素（优先evaluate，避免Playwright locator等待）
  async function smartClick(text, href) {
    // 策略1：evaluate内联点击（最快，不会等待不存在的元素）
    try {
      const clicked = await target.evaluate((txt, hrf) => {
        const all = document.querySelectorAll('a, button, [role="menuitem"], [role="tab"], [role="button"], [role="link"], .nav-link, .nav-item, .menu-item, .dropdown-item, .dropdown-toggle, span[onclick]');
        // 精确匹配文本
        for (const el of all) {
          const t = (el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
          if (t === txt) { try { el.scrollIntoView?.({block:'center',behavior:'instant'}); } catch(_){} el.click(); return true; }
        }
        // 精确匹配href
        if (hrf) {
          for (const el of all) {
            if (el.tagName === 'A' && el.href === hrf) { try { el.scrollIntoView?.(); } catch(_){} el.click(); return true; }
          }
        }
        // 部分匹配文本
        for (const el of all) {
          const t = (el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
          if (t.includes(txt) || txt.includes(t)) { try { el.scrollIntoView?.({block:'center',behavior:'instant'}); } catch(_){} el.click(); return true; }
        }
        // 部分匹配href
        if (hrf) {
          for (const el of all) {
            if (el.tagName === 'A' && hrf.includes(el.href)) { try { el.scrollIntoView?.(); } catch(_){} el.click(); return true; }
          }
        }
        return false;
      }, text, href || '');
      if (clicked) return true;
    } catch (_) { /* evaluate失败 */ }
    
    // 策略2：快速selector点击（仅用于有id的明确元素）
    if (href && !href.startsWith('javascript:')) {
      try {
        await target.click(`a[href="${href.replace(/"/g, '\\"')}"]`, { timeout: 2000 });
        return true;
      } catch (_) {}
    }
    return false;
  }

  // 发现当前页面的所有导航项
  async function discoverNavItems() {
    return await target.evaluate(() => {
      const navSelectors = [
        'nav', '[role="navigation"]', '[role="menubar"]', '[role="tablist"]', '[role="tree"]',
        '.nav', '.navbar', '.sidebar', '.menu', '.menu-bar', '.main-nav', '.top-nav',
        'header nav', 'aside nav',
        '.ant-menu', '.ant-menu-root', '.el-menu', '.ivu-menu', '.n-menu',
        '[class*="sidebar"]', '[class*="nav-"]', '[class*="Nav"]', '[class*="menu-"]', '[class*="Menu"]',
        '.tabs', '.tab-bar', '[class*="tree"]',
        // 中文网站常见导航容器
        '#head', '#header', '#top-nav', '#nav', '#navbar', '.head', '.header',
        '#s-top-left', '.s-top-left', '#top', '.top-bar', '#topbar',
        '#top_nav', '#nav-bar', '.nav-bar', '.nav-wrap', '.nav-wrapper',
        '[id*="nav"]:not([id*="hidden"]):not([id*="loading"])',
        '[class*="header"]:not([class*="hidden"])',
        '[id*="header"]:not([id*="hidden"])'
    ];
    const navContainers = document.querySelectorAll(navSelectors.join(','));

    // 如果没找到标准导航容器，降级扫描整个页面
    let useGlobalFallback = navContainers.length === 0;

    function extractClickables(container) {
        const result = [];
        const seen = new Set();
        const clickables = container.querySelectorAll(
          'a[href], button, [role="menuitem"], [role="tab"], [role="button"], ' +
          '.ant-menu-item, .el-menu-item, .ivu-menu-item, .n-menu-item, ' +
          '[class*="menu-item"], [class*="nav-item"], ' +
          '.nav-link, .dropdown-item, .dropdown-toggle'
        );
        clickables.forEach(el => {
          const text = (el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
          if (!text || text.length > 80 || seen.has(text)) return;
          seen.add(text);
          let level = 0;
          let p = el.parentElement;
          while (p && p !== container && p !== document.body) {
            if (p.matches('li, [role="menuitem"], [role="treeitem"], .ant-menu-item, .el-menu-item, .ivu-menu-item, .n-menu-item, [class*="menu-item"], [class*="nav-item"], .dropdown-menu, .sub-menu, [class*="submenu"], [class*="children"]')) {
              level++;
            }
            p = p.parentElement;
          }
          const hasSub = el.getAttribute('aria-haspopup') === 'true' ||
                        el.getAttribute('aria-expanded') !== null ||
                        !!el.querySelector('ul, .sub-menu, .dropdown-menu, [class*="submenu"], [class*="children"]');
          result.push({
            text: text.substring(0, 60),
            tagName: el.tagName.toLowerCase(),
            href: el.tagName === 'A' ? (el.href || '').substring(0, 300) : '',
            level,
            hasSubMenu: hasSub
          });
        });
        return result;
      }

      let all = [];
      navContainers.forEach(c => { all = all.concat(extractClickables(c)); });
      
      // 降级：从页面body提取所有顶级链接
      if (useGlobalFallback || all.length === 0) {
        // 收集页面中所有有意义的链接（过滤无文本的图标链接）
        document.querySelectorAll('a[href]:not([href=""]):not([href="#"]):not([href*="javascript"])').forEach(a => {
          const text = (a.innerText || a.textContent || '').trim();
          if (text && text.length <= 60) {
            let level = 0;
            // 检查是否可能在某个列表/菜单中
            const parentLi = a.closest('li');
            if (parentLi) {
              const parentUl = parentLi.closest('ul');
              if (parentUl) {
                const liCount = parentUl.querySelectorAll('li').length;
                if (liCount > 1) level = 1;
                // 嵌套li
                const grandparent = parentUl.parentElement?.closest('li');
                if (grandparent) level = 2;
              }
            }
            all.push({
              text: text.substring(0, 60),
              tagName: 'a',
              href: a.href.substring(0, 300),
              level,
              hasSubMenu: false
            });
          }
        });
        // 收集页面中的按钮
        document.querySelectorAll('button:not([disabled])').forEach(btn => {
          const text = (btn.innerText || btn.textContent || btn.getAttribute('aria-label') || '').trim();
          if (text && text.length <= 60 && !all.some(i => i.text === text)) {
            all.push({
              text: text.substring(0, 60),
              tagName: 'button',
              href: '',
              level: 0,
              hasSubMenu: false
            });
          }
        });
      }
      
      const dedup = [];
      const seenGlobal = new Set();
      all.forEach(item => {
        const key = item.text.toLowerCase();
        if (!seenGlobal.has(key)) { seenGlobal.add(key); dedup.push(item); }
      });
      return dedup.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
    });
  }

  // 点击一个元素并检查错误（带安全超时）
  async function clickAndCheck(text, href, level) {
    if (visited.has(text)) return null;
    visited.add(text);

    const beforeUrl = target.url();
    
    // smartClick带2秒超时
    let clicked = false;
    try {
      clicked = await Promise.race([
        smartClick(text, href),
        new Promise(r => setTimeout(() => r(false), 2000))
      ]);
    } catch (_) { clicked = false; }
    if (!clicked) return null;

    totalClicks++;
    await new Promise(r => setTimeout(r, Math.min(waitMs, 1000)));
    try { await target.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {}); } catch (_) {}
    await new Promise(r => setTimeout(r, 200));

    const errors = await postActionErrorCheck(target, 'traverse', text);
    if (errors.detected) totalErrors++;

    const result = {
      text,
      level,
      status: 'clicked',
      urlBefore: beforeUrl,
      urlAfter: target.url(),
      navigated: beforeUrl !== target.url(),
      errors: errors.detected ? { count: errors.count, console: errors.console.length, page: errors.page.length, network: errors.network.length } : null
    };

    if (result.navigated) {
      try { result.pageTitle = await target.title(); } catch (_) {}
    }
    return result;
  }

  // 发现子菜单项
  async function discoverChildren(parentText) {
    return await target.evaluate((pText) => {
      const all = document.querySelectorAll('a, button, [role="menuitem"], [role="tab"]');
      let parentEl = null;
      for (const el of all) {
        if ((el.innerText || '').trim().includes(pText) || (el.textContent || '').trim().includes(pText)) {
          parentEl = el;
          break;
        }
      }
      if (!parentEl) return [];

      let subContainer = parentEl.querySelector('ul, .sub-menu, .dropdown-menu, [class*="submenu"], [class*="children"]');
      if (!subContainer) {
        let next = parentEl.nextElementSibling;
        while (next) {
          if (next.matches('ul, .sub-menu, .dropdown-menu, [class*="submenu"], [class*="children"]')) {
            subContainer = next;
            break;
          }
          next = next.nextElementSibling;
        }
      }
      if (!subContainer || subContainer.offsetParent === null) return [];

      const items = [];
      const seen = new Set();
      subContainer.querySelectorAll('a, button, [role="menuitem"]').forEach(el => {
        const text = (el.innerText || el.textContent || '').trim();
        if (text && !seen.has(text)) {
          seen.add(text);
          items.push({
            text: text.substring(0, 60),
            href: el.tagName === 'A' ? (el.href || '').substring(0, 300) : ''
          });
        }
      });
      return items;
    }, parentText);
  }

  // ==== 主逻辑 ====
  const menuItems = await discoverNavItems();
  if (menuItems.length === 0) {
    return {
      startUrl, endUrl: target.url(), status: 'no_nav_items',
      message: '当前页面未发现导航菜单。可能是因为：①页面已登录但没有导航栏；②SPA尚未渲染；③需要先打开一个应用页面。建议先调用 browser_open 打开目标应用。',
      itemsFound: 0
    };
  }

  // 按层级分组
  const levelGroups = {};
  for (const item of menuItems) {
    const lvl = Math.min(item.level + 1, maxDepth);
    if (!levelGroups[lvl]) levelGroups[lvl] = [];
    if (levelGroups[lvl].length < maxItems) levelGroups[lvl].push(item);
  }

  // 从第一级开始点击（带超时检查）
  for (const item of (levelGroups[1] || []).concat(levelGroups[0] || [])) {
    if (totalClicks >= maxItems || checkTimeout()) break;
    if (visited.has(item.text)) continue;

    const first = await clickAndCheck(item.text, item.href, 1);
    if (!first) continue;

    if (includeSubMenus && item.hasSubMenu && item.level < maxDepth && totalClicks < maxItems && !checkTimeout()) {
      await new Promise(r => setTimeout(r, Math.min(500, waitMs)));
      const children = await discoverChildren(item.text);
      for (const child of children) {
        if (totalClicks >= maxItems || checkTimeout()) break;
        const second = await clickAndCheck(child.text, child.href, 2);
        if (!second) continue;

        if (includeSubMenus && 2 < maxDepth && totalClicks < maxItems && !checkTimeout()) {
          await new Promise(r => setTimeout(r, 300));
          const grandchildren = await discoverChildren(child.text);
          for (const grand of grandchildren) {
            if (totalClicks >= maxItems || checkTimeout()) break;
            const third = await clickAndCheck(grand.text, grand.href, 3);
            if (third) allItems.push(third);
          }
        }
        allItems.push(second);
      }
    }
    allItems.push(first);
  }

  clearTimeout(timeoutId);
  return {
    startUrl, endUrl: target.url(), status: timeoutReached ? 'timeout' : 'completed',
    itemsFound: menuItems.length, itemsClicked: totalClicks, errorsFound: totalErrors, maxDepth,
    pathSummary: {
      level1: allItems.filter(i => i.level === 1).length,
      level2: allItems.filter(i => i.level === 2).length,
      level3: allItems.filter(i => i.level === 3).length,
      withErrors: allItems.filter(i => i.errors).length,
      navigatedPages: allItems.filter(i => i.navigated).length
    },
    results: allItems
  };
}

async function runBrowserFullRegression(args = {}) {
  console.error('[runBrowserFullRegression] CALLED, args:', JSON.stringify(args));
  // 共享全局浏览器实例（ensurePage 创建并维护），与 browser_open/browser_navigate 相同
  // 默认 headless:false（可见浏览器窗口），让测试人员能实时查看点击过程
  // 设置 args.visible=false 时后台运行，使用截图作为执行证据
  const useHeadless = args.visible === false;
  let target = null;
  try {
    const ensured = await ensurePage({ headless: useHeadless });
    target = ensured.target;
    console.error('[runBrowserFullRegression] using ensured page (reused=' + ensured.reused + ', headless=' + useHeadless + ')');
  } catch (e) {
    return {
      passed: false, executed: true,
      error: `获取浏览器失败: ${e.message}`,
      summary: { totalFunctions: 0, clicked: 0, passed: 0, failed: 0, skipped: 0, pagesVisited: 0 },
      closedLoop: { navigableFunctions: 0, returnableFunctions: 0, loopScore: 0, loopComplete: false },
      blockingIssues: [], details: []
    };
  }

  const targetUrl = args.url || 'http://192.168.8.4:5173/app.html';
  if (!args.url) {
    console.warn('[runBrowserFullRegression] 未传 url，使用默认:', targetUrl);
  }

  const maxItems = Math.min(args.maxItems || 50, 100);
  const timeout = (args.timeout || 180) * 1000;
  const clickDelay = 1500;
  const startTime = Date.now();

  const result = {
    passed: false, executed: true,
    summary: { totalFunctions: 0, clicked: 0, passed: 0, failed: 0, skipped: 0, pagesVisited: 0 },
    closedLoop: { navigableFunctions: 0, returnableFunctions: 0, loopScore: 0, loopComplete: false },
    blockingIssues: [], details: [],
    captureEvidence: {
      consoleListeners: false, pageListeners: false, networkListeners: false,
      initialLogs: { console: 0, page: 0, network: 0 },
      initialSample: [],
      runtimeLogsBeforeReset: { console: 0, page: 0, network: 0 },
      capturedSample: [],
      perActionBreakdown: [],
      screenshots: [],
      capturedTotalErrors: 0,
      capturedErrorTypes: { console: 0, page: 0, network: 0 }
    }
  };

  let isTimeout = () => Date.now() - startTime >= timeout;

  // 本地日志缓冲区（独立于全局 getRuntimeLogs，避免被覆盖/清空）
  const localLogs = { console: [], page: [], network: [] };
  // ===== 永久错误累加器 =====
  // 底层原理：resetLogs() 会清空 localLogs，导致操作间隙的错误永久丢失
  // 永久累加器永不清除，确保所有 CDP/Playwright 事件都被保留
  // 最终扫描时从永久累加器中找出所有遗漏的 403/500
  const permanentErrors = { console: [], page: [], network: [] };
  let cdpSession = null;

  // 过滤静态资源，只保留有意义的 API 请求
  function isApiUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      if (url.startsWith('data:') || url.startsWith('blob:')) return false;
      const u = new URL(url);
      const path = u.pathname;
      if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|webp)(\?|#|$)/i.test(path)) return false;
      if (/\/favicon/i.test(path)) return false;
      return true;
    } catch (_) { return false; }
  }

  // ---- 辅助函数 ----
  async function installListeners() {
    if (typeof target === 'undefined' || target == null) return;
    try {
      // ===== Playwright 标准事件（备选） =====
      // 同时写入 localLogs（用于阶段性捕获）和 permanentErrors（终身保留）
      target.on('console', (msg) => {
        try {
          if (msg.type() === 'error') {
            const entry = { message: msg.text(), ts: Date.now(), source: 'pw' };
            localLogs.console.push(entry);
            permanentErrors.console.push(entry);
          }
        } catch (_) {}
      });
      target.on('pageerror', (err) => {
        try {
          const entry = { message: err.message, ts: Date.now(), source: 'pw' };
          localLogs.page.push(entry);
          permanentErrors.page.push(entry);
        } catch (_) {}
      });
      // requestfailed 保留为 CDP 的补充
      target.on('requestfailed', (req) => {
        try {
          const u = req.url();
          if (u && isApiUrl(u)) {
            const entry = { url: u, method: req.method(), status: 0, failure: req.failure()?.errorText || 'failed', ts: Date.now(), source: 'pw' };
            localLogs.network.push(entry);
            permanentErrors.network.push(entry);
          }
        } catch (_) {}
      });
      target.on('response', (res) => {
        try {
          const st = res.status();
          const u = res.url();
          if (st >= 400 && u && isApiUrl(u)) {
            const entry = { url: u, method: res.request().method(), status: st, ts: Date.now(), source: 'pw' };
            localLogs.network.push(entry);
            permanentErrors.network.push(entry);
          }
        } catch (_) {}
      });
      result.captureEvidence.consoleListeners = true;
      result.captureEvidence.pageListeners = true;
      result.captureEvidence.networkListeners = true;
    } catch (_) {}

    // ===== CDP 直连（主要来源，不漏任何请求）— 必须在 goto 前完成 =====
    try {
      cdpSession = await target.context().newCDPSession(target);
      if (!cdpSession) return;
      await cdpSession.send('Network.enable');
      await cdpSession.send('Runtime.enable');
      // ===== CDP Log.enable（第四层控制台捕获） =====
      // 捕获 CSP 违规、安全策略错误、"Failed to load resource" 等
      // 这些消息不经过 Runtime.consoleAPICalled，只能通过 Log.entryAdded 获取
      try {
        await cdpSession.send('Log.enable');
        cdpSession.on('Log.entryAdded', (params) => {
          try {
            const entry = params.entry || {};
            const text = entry.text || '';
            const level = entry.level || 'log';
            const source = entry.source || '';
            if (!text) return;
            // CSP 违规、网络错误、安全策略违规
            if (/(csp|csp-violation|security|403|forbidden|500|5\d{2}|refused|blocked)/i.test(text) || source === 'security' || level === 'error') {
              const logEntry = { message: `[${source}] ${text}`, level, ts: Date.now(), source: 'cdp-log' };
              localLogs.console.push(logEntry);
              permanentErrors.console.push(logEntry);
            }
          } catch (_) {}
        });
      } catch (_) {}

      // ===== CDP Runtime.exceptionThrown（第五层：未捕获异常） =====
      // 捕获 unhandled rejection、运行时异常等
      try {
        cdpSession.on('Runtime.exceptionThrown', (params) => {
          try {
            const exc = params.exceptionDetails || {};
            const text = exc.text || exc.exception?.description || '';
            const line = exc.lineNumber || 0;
            const col = exc.columnNumber || 0;
            if (!text) return;
            const entry = { message: `[exception@${line}:${col}] ${text}`, ts: Date.now(), source: 'cdp-exc' };
            localLogs.page.push(entry);
            permanentErrors.page.push(entry);
          } catch (_) {}
        });
      } catch (_) {}

      cdpSession.on('Network.responseReceived', (params) => {
        try {
          const resp = params.response || {};
          const url = resp.url || '';
          const status = resp.status || 0;
          if (status >= 400 && url && isApiUrl(url)) {
            const method = (resp.requestHeaders && (resp.requestHeaders[':method'] || resp.requestHeaders.method)) || '?';
            const entry = { url, method, status, ts: Date.now(), source: 'cdp' };
            localLogs.network.push(entry);
            permanentErrors.network.push(entry);
          }
        } catch (_) {}
      });

      cdpSession.on('Network.loadingFailed', (params) => {
        try {
          const url = params.documentURL || params.url || '';
          const errorText = params.errorText || 'unknown';
          if (url && isApiUrl(url)) {
            const entry = { url, method: '?', status: 0, failure: errorText, ts: Date.now(), source: 'cdp' };
            localLogs.network.push(entry);
            permanentErrors.network.push(entry);
          }
        } catch (_) {}
      });

      cdpSession.on('Runtime.consoleAPICalled', (params) => {
        try {
          const type = params.type || 'log';
          if (type !== 'error' && type !== 'warning' && type !== 'assert') return;
          const args = params.args || [];
          const text = args.map(a => {
            if (a.value !== undefined) return String(a.value);
            if (a.description) return a.description;
            if (a.preview) return JSON.stringify(a.preview);
            return '';
          }).join(' ');
          if (!text) return;
          const entry = { message: text, level: type, ts: Date.now(), source: 'cdp' };
          localLogs.console.push(entry);
          permanentErrors.console.push(entry);
        } catch (_) {}
      });

      console.error('[runBrowserFullRegression] CDP session established');
    } catch (e) {
      console.error('[runBrowserFullRegression] CDP setup failed (non-fatal):', e.message);
    }

    // ===== 运行时 JS 拦截器（第三层，最可靠） =====
    // 通过 addInitScript 在每个页面都注入，拦截 fetch 和 XMLHttpRequest
    try {
      if (typeof target !== 'undefined' && target != null) {
        const interceptorCode = `
(function() {
  if (window.__interceptorInstalled) return;
  window.__interceptorInstalled = true;
  window.__interceptedApiResponses = [];
  window.__interceptorSeq = 0;

  // 拦截 fetch
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = async function() {
      const args = arguments;
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
      const method = (args[1] && args[1].method) || 'GET';
      try {
        const resp = await origFetch.apply(this, args);
        const status = resp.status;
        if (status >= 400 && url && !url.match(/\\\\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|webp)(\\\\?|#|$)/i) && !url.match(/\\/favicon/i)) {
          const clone = resp.clone ? resp.clone() : null;
          let bodyText = '';
          try { if (clone) bodyText = (await clone.text()).slice(0,200); } catch(e) {}
          window.__interceptedApiResponses.push({
            url: url, method: method, status: status,
            ts: Date.now(), body: bodyText,
            seq: ++window.__interceptorSeq
          });
        }
        return resp;
      } catch(e) {
        window.__interceptedApiResponses.push({
          url: url, method: method, status: 0,
          ts: Date.now(), error: e.message,
          seq: ++window.__interceptorSeq
        });
        throw e;
      }
    };
  }

  // 拦截 XMLHttpRequest
  if (window.XMLHttpRequest) {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function() {
      this.__interceptedMethod = (arguments[0] || 'GET').toUpperCase();
      this.__interceptedUrl = arguments[1] || '';
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
      const xhr = this;
      const url = xhr.__interceptedUrl || '';
      const method = xhr.__interceptedMethod || 'GET';
      const origOnload = xhr.onload;
      const origOnreadystatechange = xhr.onreadystatechange;
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          const st = xhr.status;
          if (st >= 400 && url && !url.match(/\\\\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map|webp)(\\\\?|#|$)/i) && !url.match(/\\/favicon/i)) {
            window.__interceptedApiResponses.push({
              url: url, method: method, status: st,
              ts: Date.now(), body: (xhr.responseText || '').slice(0,200),
              seq: ++window.__interceptorSeq
            });
          }
        }
        if (origOnreadystatechange) origOnreadystatechange.apply(xhr, arguments);
        if (origOnload && xhr.readyState === 4) origOnload.apply(xhr, arguments);
      };
      return origSend.apply(xhr, arguments);
    };
  }
})();
`;
        await target.context().addInitScript(interceptorCode);
        // 对当前已存在的页面也直接注入（addInitScript 只对新页面生效）
        await target.evaluate(interceptorCode).catch(() => {});
        console.error('[runBrowserFullRegression] Runtime JS interceptor installed via addInitScript + evaluate');
      }
    } catch (e) {
      console.error('[runBrowserFullRegression] JS interceptor setup failed (non-fatal):', e.message);
    }
  }
  function snapshotLocalLogs() {
    return {
      console: localLogs.console.length,
      page: localLogs.page.length,
      network: localLogs.network.length
    };
  }
  function deltaAndClear(sinceTime) {
    // 自上次记录到现在新出现的错误
    const dc = localLogs.console.filter(e => e.ts >= sinceTime);
    const dp = localLogs.page.filter(e => e.ts >= sinceTime);
    const dn = localLogs.network.filter(e => e.ts >= sinceTime);
    return { console: dc, page: dp, network: dn };
  }

  async function captureErrors(sinceTs) {
    const errs = { consoleErrors: 0, networkErrors: 0, pageError: null, errorText: null, items: [] };
    try {
      const bodyText = await target.evaluate(() => document.body?.innerText || '');
      const m = bodyText.match(/加载失败|系统内部错误|Internal Server Error|出错了|服务器繁忙|服务器错误|500\s*Error/i);
      if (m) errs.errorText = m[0];
    } catch (_) {}
    // 优先使用 localLogs（更可信），其次合并全局 getRuntimeLogs
    const combined = { console: [], page: [], network: [] };
    const since = sinceTs || 0;
    combined.console = localLogs.console.filter(e => e.ts >= since);
    combined.page = localLogs.page.filter(e => e.ts >= since);
    combined.network = localLogs.network.filter(e => e.ts >= since);

    // 读取运行时 JS 拦截器（第三层）捕获的数据
    // 会被 addInitScript 注入到每个页面
    try {
      const intercepted = await target.evaluate(() => {
        if (!window.__interceptedApiResponses || !window.__interceptedApiResponses.length) return [];
        const items = window.__interceptedApiResponses.slice(0);
        const lastSeq = window.__interceptorLastReadSeq || 0;
        window.__interceptorLastReadSeq = items.reduce((max, item) => Math.max(max, item.seq || 0), lastSeq);
        return items.filter(item => (item.seq || 0) > lastSeq);
      }).catch(() => []);
      for (const item of intercepted) {
        combined.network.push({ url: item.url, method: item.method, status: item.status, ts: item.ts, source: 'js' });
        localLogs.network.push({ url: item.url, method: item.method, status: item.status, ts: item.ts, source: 'js' });
      }
    } catch (_) {}

    // ===== 第四层：Performance API 扫描（通用兜底） =====
    // 原理：Performance API 记录了所有已完成的资源请求，包括状态码。
    // 这层作为 CDP 和 JS 拦截器的兜底，捕获任何遗漏的网络错误。
    // 参考：OODA 循环的 Observe 阶段 — 使用所有可用工具观察系统状态
    try {
      const perfEntries = await target.evaluate(() => {
        return performance.getEntriesByType('resource')
          .filter(e => e.responseStatus >= 400)
          .map(e => ({ url: e.name, status: e.responseStatus, initiatorType: e.initiatorType }));
      }).catch(() => []);
      for (const pe of perfEntries) {
        const exists = combined.network.some(n => n.url === pe.url && n.status === pe.status);
        if (!exists) {
          combined.network.push({ url: pe.url, method: 'PERF', status: pe.status, ts: Date.now(), source: 'perf' });
          localLogs.network.push({ url: pe.url, method: 'PERF', status: pe.status, ts: Date.now(), source: 'perf' });
        }
      }
    } catch (_) {}

    errs.consoleErrors = combined.console.length;
    errs.networkErrors = combined.network.length;
    errs.pageError = combined.page.length > 0 ? combined.page[0].message : null;
    errs.items = [
      ...combined.console.slice(0, 20).map(e => ({ type: 'console', msg: e.message })),
      ...combined.network.slice(0, 20).map(e => ({ type: 'network', msg: `${e.method || '?'} ${e.url || '?'} ${e.status || ''}` })),
      ...combined.page.slice(0, 5).map(e => ({ type: 'page', msg: e.message }))
    ];
    return errs;
  }

  function resetLogs() {
    localLogs.console.length = 0;
    localLogs.page.length = 0;
    localLogs.network.length = 0;
  }

  async function tryClick(selOrText, isSelector) {
    // 三级点击策略
    if (isSelector && selOrText) {
      try { await target.evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, selOrText); return true; } catch (_) {}
    }
    if (!isSelector && selOrText && selOrText.length > 0 && selOrText.length < 100) {
      try { const el = await target.locator('text="' + selOrText.replace(/"/g, '\\"') + '"').first(); await el.click({ timeout: 3000 }); return true; } catch (_) {}
    }
    if (isSelector && selOrText) {
      try { await target.click(selOrText, { timeout: 3000 }); return true; } catch (_) {}
    }
    return false;
  }

  let totalClicked = 0;

  try {
    // 已默认填充 url，不再强制要求

    // ===== 关键：在导航前安装监听器（先安装了再 goto） =====
    await installListeners();

    // 先导航到目标页面（这是用户能看到真实页面的关键）
    await target.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
    // 等待页面渲染稳定 + 让用户看到实际页面内容
    await new Promise(r => setTimeout(r, 3000));
    // 📸 首页截图
    try { const buf = await target.screenshot({ type: 'png', fullPage: false }); result.captureEvidence.screenshots.push({ stage: 'home', label: '首页', data: buf.toString('base64').slice(0, 500) }); } catch (_) {}

    // 验证页面前提：确实加载了内容，不是空白页
    let pageTitle = '';
    try { pageTitle = await target.title(); } catch (_) {}
    if (!pageTitle || pageTitle === '') {
      // 尝试再等待并检查 body
      await new Promise(r => setTimeout(r, 2000));
      try { pageTitle = await target.title(); } catch (_) {}
    }
    // 通过 Performance API 直接诊断所有网络请求（不依赖任何事件监听器）
    let perfErrors = [];
    try {
      perfErrors = await target.evaluate(() => {
        const entries = performance.getEntriesByType('resource');
        const errors = [];
        for (const e of entries) {
          // Performance API 中 fetch/XHR 通过 transferSize 和 responseStatus 判断
          const status = e.responseStatus || 0;
          if (status >= 400) {
            errors.push({ url: e.name, status, initiatorType: e.initiatorType });
          }
        }
        return errors;
      }).catch(() => []);
    } catch (_) {}
    // 把初始错误快照存入 result.captureEvidence
    const initialSnap = snapshotLocalLogs();
    result.captureEvidence.runtimeLogsBeforeReset = initialSnap;
    result.captureEvidence.capturedSample = [
      ...localLogs.console.slice(0, 3).map(e => ({ type: 'console', msg: e.message })),
      ...localLogs.network.slice(0, 3).map(e => ({ type: 'network', msg: `${e.method} ${e.url} ${e.status}` })),
      ...localLogs.page.slice(0, 3).map(e => ({ type: 'page', msg: e.message }))
    ];
    result.captureEvidence.initialLogs = { console: localLogs.console.length, page: localLogs.page.length, network: localLogs.network.length };
    result.captureEvidence.initialSample = result.captureEvidence.capturedSample.slice(0, 10);
    // 注入 CDP/CDP session 状态标记和 Performance API 诊断结果
    result.captureEvidence.cdpSessionCreated = !!cdpSession;
    if (perfErrors.length > 0) {
      result.captureEvidence.performanceApiErrors = perfErrors;
      result.captureEvidence.capturedSample.unshift(...perfErrors.map(e => ({ type: 'network', msg: `PerformanceAPI: ${e.url} ${e.status}` })));
      // 同时补入 localLogs 防止遗漏
      for (const pe of perfErrors) {
        localLogs.network.push({ url: pe.url, method: '?', status: pe.status, ts: Date.now(), source: 'perf' });
      }
    }

    // 解析相对 URL
    function resolveUrl(href) {
      try { return new URL(href, target.url()).href; } catch (_) { return null; }
    }
    function isSameOriginNav(href) {
      try {
        const current = new URL(target.url());
        const t = new URL(href, current.href);
        return t.origin === current.origin && t.pathname + t.hash + t.search !== current.pathname + current.hash + current.search;
      } catch (_) { return false; }
    }

    // ====== 阶段 1：从首页发现所有导航链接 ======
    let homepageLinks = [];
    try {
      homepageLinks = await target.evaluate(() => {
        const items = [];
        const seenHref = new Set(), seenText = new Set();
        document.querySelectorAll('a[href]').forEach(a => {
          const href = a.getAttribute('href');
          const text = (a.textContent || '').trim();
          if (href && !href.startsWith('javascript:') && !href.startsWith('data:') && !seenHref.has(href)) {
            seenHref.add(href);
            items.push({ href, text, tag: 'a', isButton: false });
          }
        });
        document.querySelectorAll('button, [role="button"], .btn, [onclick]').forEach(b => {
          const text = (b.textContent || '').trim();
          const href = b.getAttribute('data-href') || b.getAttribute('data-url') || '';
          if (text && !seenText.has(text)) {
            seenText.add(text);
            items.push({ href, text, tag: b.tagName ? b.tagName.toLowerCase() : 'button', isButton: true });
          }
        });
        return items;
      });
    } catch (_) {}

    // 分类：导航链接 vs 页面动作
    const navItems = [];
    const actionItems = [];
    const seenNavUrls = new Set();
    for (const item of homepageLinks) {
      if (item.href && isSameOriginNav(item.href)) {
        const resolved = resolveUrl(item.href);
        const key = resolved ? resolved.replace(/\/+$/, '').replace(/#$/, '') : item.href;
        if (resolved && !seenNavUrls.has(key)) {
          seenNavUrls.add(key);
          navItems.push({ text: item.text, href: item.href, resolvedUrl: resolved, tag: item.tag });
        }
      } else {
        actionItems.push(item);
      }
    }

    result.summary.totalFunctions = navItems.length + actionItems.length;

    // ====== 阶段 2：BFS 遍历每个导航页面 ======
    // 先回到首页确保起点正确
    await target.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 1000));

    for (let ni = 0; ni < navItems.length && !isTimeout() && totalClicked < maxItems; ni++) {
      const nav = navItems[ni];
      await resetLogs();

      const pageDetail = {
        function: `导航: ${nav.text || nav.resolvedUrl}`,
        text: nav.text || '',
        category: '导航页面',
        urlBefore: target.url(), urlAfter: '',
        navigated: false, returned: false, passed: true,
        consoleErrors: 0, networkErrors: 0, pageError: null, errorText: null,
        subFunctions: [], subClicked: 0, subPassed: 0, subFailed: 0
      };

      try {
        if (isTimeout()) break;
        console.error('[runBrowserFullRegression] 📄 导航到页面:', nav.text || nav.resolvedUrl);
        // 📸 页面导航截图
        try { const buf = await target.screenshot({ type: 'png', fullPage: false }); result.captureEvidence.screenshots.push({ stage: 'nav', label: nav.text || nav.resolvedUrl, data: buf.toString('base64').slice(0, 500) }); } catch (_) {}
        await target.goto(nav.resolvedUrl, { waitUntil: 'networkidle', timeout: 15000 });
        await new Promise(r => setTimeout(r, 1000));
        pageDetail.navigated = true;
        pageDetail.urlAfter = target.url();

        const navActionTs = Date.now() - 1000; // 误差缓冲
        const navErrs = await captureErrors(0); // 导航后捕获所有累积错误
        pageDetail.consoleErrors = navErrs.consoleErrors;
        pageDetail.networkErrors = navErrs.networkErrors;
        pageDetail.pageError = navErrs.pageError;
        pageDetail.errorText = navErrs.errorText;
        for (const e of navErrs.items) {
          result.blockingIssues.push({ function: `导航: ${nav.text || nav.resolvedUrl}`, url: pageDetail.urlAfter, issue: e.type === 'console' ? 'console_error' : 'network_error', detail: e.msg });
        }

        // 扫描该子页面上的所有可交互元素（排除导航链接）
        let subFunctions = [];
        try {
          subFunctions = await target.evaluate(() => {
            const items = [];
            const seen = new Set();
            const qs = 'a[href], button, [role="button"], .btn, [onclick], input[type="submit"], input[type="button"]';
            document.querySelectorAll(qs).forEach(el => {
              const tag = (el.tagName || '').toLowerCase();
              const text = (el.textContent || '').trim() || el.getAttribute('value') || el.getAttribute('aria-label') || '';
              const href = el.getAttribute('href') || '';
              const key = text || href;
              if (key && !seen.has(key)) {
                seen.add(key);
                let sel = '';
                if (el.id) sel = '#' + el.id.replace(/[:"\s]/g, '\\$&');
                else if (el.getAttribute('data-testid')) sel = '[data-testid="' + el.getAttribute('data-testid') + '"]';
                else {
                  const cls = Array.from(el.classList).filter(c => !c.startsWith('_') && !c.startsWith('ng-') && !c.startsWith('ant-')).slice(0, 1).map(c => '.' + c.replace(/[:"\s]/g, '\\$&')).join('');
                  sel = tag + cls || tag;
                }
                items.push({ text, href, tag, selector: sel });
              }
            });
            return items;
          });
        } catch (_) {}

        // 过滤掉同源导航链接（避免再次导航到其他页面），保留动作按钮
        // [重要] 限制每页最多 2 个子功能，保留 API 配额给 select 角色切换测试（阶段 3.5）
        const uniqueActions = subFunctions.filter(f => {
          if (f.href) { try { const u = new URL(f.href, target.url()); if (u.origin === new URL(target.url()).origin && u.pathname !== new URL(target.url()).pathname) return false; } catch (_) {} }
          return true;
        }).slice(0, 2);

        pageDetail.subFunctions = uniqueActions.map(f => f.text || f.selector);

        // 点击每个独特功能
        for (let fi = 0; fi < uniqueActions.length && !isTimeout() && totalClicked < maxItems; fi++) {
          await new Promise(r => setTimeout(r, clickDelay));
          const fn = uniqueActions[fi];
          const subDetail = {
            function: `${nav.text || '页面'} > ${fn.text || fn.selector || `功能${fi+1}`}`,
            text: fn.text || '', selector: fn.selector || '',
            category: '页面功能', urlBefore: target.url(), urlAfter: '',
            navigated: false, returned: false, passed: true,
            consoleErrors: 0, networkErrors: 0, pageError: null, errorText: null, error: null
          };

          try {
            await resetLogs();
            console.error('[runBrowserFullRegression] 🖱️ 点击:', fn.selector || fn.text || `功能${fi+1}`);
            let clicked = await tryClick(fn.selector, true);
            if (!clicked) clicked = await tryClick(fn.text, false);
            if (!clicked && fn.selector) clicked = await tryClick(fn.selector, true);

            if (!clicked) {
              subDetail.passed = false; subDetail.error = '无法定位点击';
              totalClicked++;
              result.details.push(subDetail);
              pageDetail.subFailed++;
              continue;
            }

            try { await target.waitForLoadState('networkidle', { timeout: 5000 }); } catch (_) { await new Promise(r => setTimeout(r, 1500)); }
            await new Promise(r => setTimeout(r, 500));

            subDetail.urlAfter = target.url();
            subDetail.navigated = subDetail.urlAfter !== subDetail.urlBefore;

            // 捕获本次点击期间产生的错误（自点击前的那个时戳起）
            const clickSinceTs = Date.now() - 2000; // 2秒误差缓冲，覆盖点击前后
            const funcErrs = await captureErrors(clickSinceTs);
            subDetail.consoleErrors = funcErrs.consoleErrors;
            subDetail.networkErrors = funcErrs.networkErrors;
            subDetail.pageError = funcErrs.pageError;
            subDetail.errorText = funcErrs.errorText;
            // 记录 per-action 证据
            result.captureEvidence.perActionBreakdown.push({
              function: subDetail.function,
              consoleErrors: funcErrs.consoleErrors,
              networkErrors: funcErrs.networkErrors,
              pageError: funcErrs.pageError,
              errorText: funcErrs.errorText,
              sample: funcErrs.items.slice(0, 3)
            });
            for (const e of funcErrs.items) {
              result.blockingIssues.push({ function: subDetail.function, url: subDetail.urlAfter, issue: e.type === 'console' ? 'console_error' : 'network_error', detail: e.msg });
            }

            // ===== 深度交互（Phase C）：像人类一样探索 =====
            // 点击一个功能后，检测弹窗/表单，智能填充并提交，检测深层错误
            // 覆盖场景：新增代运营授权、提交订单、表单验证错误等
            try {
              const uiState = await deepInteractor.detectUIState(target);
              subDetail._uiState = {
                modal: !!uiState.modal,
                modalTitle: uiState.modal ? (uiState.modal.title || '') : '',
                forms: uiState.forms.length,
                toasts: uiState.toasts.length,
              };

              if (uiState.modal && uiState.modal.hasForm) {
                // 弹窗中有表单 → 智能填充并提交
                const formResult = await deepInteractor.interactWithForm(target, { fillFields: true, submit: true });
                subDetail._deepInteraction = formResult;

                // 收集表单提交后的错误
                if (formResult.submitted) {
                  const submitErrs = await captureErrors(Date.now() - 4000);
                  for (const e of submitErrs.items) {
                    result.blockingIssues.push({
                      function: `${subDetail.function}>表单提交`,
                      url: target.url(),
                      issue: e.type === 'console' ? 'console_error' : 'network_error',
                      detail: `[表单提交] ${e.msg}`,
                    });
                  }
                  if (submitErrs.items.length > 0) {
                    subDetail.consoleErrors += submitErrs.consoleErrors;
                    subDetail.networkErrors += submitErrs.networkErrors;
                    subDetail._deepInteraction.submitErrors = submitErrs.items.length;
                    subDetail._deepInteraction.submitErrorSample = submitErrs.items.slice(0, 3);
                  }
                  // 提交成功（弹窗关闭）= 功能通过
                  if (formResult.success) {
                    subDetail._deepInteraction.workflowSuccess = true;
                  }
                }
              } else if (uiState.forms.length > 0 && !uiState.modal) {
                // 独立表单 → 智能填充并提交
                const formResult = await deepInteractor.interactWithForm(target, { fillFields: true, submit: true });
                subDetail._deepInteraction = formResult;
                if (formResult.submitted) {
                  const submitErrs = await captureErrors(Date.now() - 4000);
                  for (const e of submitErrs.items) {
                    result.blockingIssues.push({
                      function: `${subDetail.function}>表单提交`,
                      url: target.url(),
                      issue: e.type === 'console' ? 'console_error' : 'network_error',
                      detail: `[表单提交] ${e.msg}`,
                    });
                  }
                  if (submitErrs.items.length > 0) {
                    subDetail.consoleErrors += submitErrs.consoleErrors;
                    subDetail.networkErrors += submitErrs.networkErrors;
                  }
                }
              } else if (uiState.modal && !uiState.modal.hasForm) {
                // 纯弹窗（无表单）→ 尝试关闭
                try { await target.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 300)); } catch (_) {}
              }
            } catch (_) {}

            if (subDetail.navigated) {
              try { await target.goBack({ waitUntil: 'networkidle', timeout: 10000 }); subDetail.returned = true; } catch (_) { subDetail.returned = false; }
            } else {
              subDetail.returned = true;
            }
            subDetail.passed = subDetail.consoleErrors === 0 && subDetail.networkErrors === 0 && !subDetail.pageError && !subDetail.errorText;

          } catch (e) { subDetail.passed = false; subDetail.error = e.message; }

          totalClicked++;
          pageDetail.subClicked++;
          if (subDetail.passed) pageDetail.subPassed++; else pageDetail.subFailed++;
          result.details.push(subDetail);
        }

        pageDetail.passed = pageDetail.consoleErrors === 0 && pageDetail.networkErrors === 0 && !pageDetail.pageError && !pageDetail.errorText && pageDetail.subFailed === 0;

      } catch (e) { pageDetail.passed = false; pageDetail.error = e.message; }

      // 返回首页
      try { await target.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }); await new Promise(r => setTimeout(r, 1500)); } catch (_) {}
      result.details.push(pageDetail);
    }

    // ====== 阶段 3：点击首页自身的非导航功能（已回到首页） ======
    // 这些是纯按钮/操作，不是导航链接
    // 包含 select 下拉菜单（如角色切换），逐一选择每个 option 验证
    result.captureEvidence._reachedStage3 = true;
    const homeActions = [];
    try {
      const rawHomeActions = await target.evaluate(() => {
        const items = []; const seen = new Set();
        document.querySelectorAll('button, [role="button"], .btn, [onclick], input[type="submit"], input[type="button"]').forEach(el => {
          const text = (el.textContent || '').trim() || el.getAttribute('value') || el.getAttribute('aria-label') || '';
          if (text && !seen.has(text)) {
            seen.add(text);
            let sel = '';
            if (el.id) sel = '#' + el.id.replace(/[:"\s]/g, '\\$&');
            else { const cls = Array.from(el.classList).filter(c => !c.startsWith('_') && !c.startsWith('ng-')).slice(0, 1).map(c => '.' + c.replace(/[:"\s]/g, '\\$&')).join(''); sel = (el.tagName || '').toLowerCase() + cls || ''; }
            items.push({ text, selector: sel, tag: 'button' });
          }
        });
        // 也发现 select 下拉菜单（如角色切换），记录可选的每个 option
        document.querySelectorAll('select').forEach(sel => {
          const selId = sel.id ? '#' + sel.id.replace(/[:"\s]/g, '\\$&') : '';
          const selName = sel.name || sel.id || 'select';
          const options = sel.querySelectorAll('option');
          const optGroups = {};
          options.forEach(opt => {
            const groupLabel = opt.closest('optgroup')?.getAttribute('label') || '';
            const label = (groupLabel ? groupLabel + ' > ' : '') + (opt.textContent || '').trim();
            if (label && !seen.has(label)) {
              seen.add(label);
              items.push({ text: label, selector: selId || selName, tag: 'select', value: opt.getAttribute('value') || '' });
            }
          });
        });
        return items;
      });
      // 过滤掉已经在 navItems 中处理过的（即导航按钮）
      // 同时过滤掉 select 选项——它们会触发角色/状态变更，交给阶段 3.5 做独立测试
      // 参考：SRE 排错铁律二 — 一次只改变一个变量，select 状态变更应在隔离环境中测试
      const navTexts = new Set(navItems.map(n => n.text));
      const beforeFilter = rawHomeActions.length;
      const selectCount = rawHomeActions.filter(i => i.tag === 'select').length;
      for (const item of rawHomeActions) {
        if (!navTexts.has(item.text) && item.tag !== 'select') homeActions.push(item);
      }
      result.captureEvidence._debugSelect = { totalRaw: beforeFilter, selectOptionsFound: selectCount, homeActionsAfter: homeActions.length, selectInHome: 0, stage3Skip: true, reason: 'select选项移入阶段3.5独立测试，避免污染状态' };
    } catch (e) { result.captureEvidence._debugSelect = { error: e.message }; }

    // ====== SPA 内容变化跟踪：记录首页基线 DOM 快照 ======
    let baseDomFingerprint = null;
    try {
      baseDomFingerprint = await target.evaluate(() => {
        const allEls = document.querySelectorAll('body *');
        let visibleCount = 0;
        for (const el of allEls) {
          if (visibleCount >= 500) break;
          try { const s = window.getComputedStyle(el); if (s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null) visibleCount++; } catch (_) {}
        }
        const mainText = (document.body.innerText || '').trim().slice(0, 2000);
        const hash = mainText.length + '_' + mainText.slice(0, 100);
        return { visibleCount, textHash: hash };
      });
    } catch (_) {}

    for (let hi = 0; hi < homeActions.length && !isTimeout() && totalClicked < maxItems; hi++) {
      await new Promise(r => setTimeout(r, clickDelay));
      const fn = homeActions[hi];
      const detail = {
        function: `首页 > ${fn.text || fn.selector || `功能${hi+1}`}`,
        text: fn.text || '', selector: fn.selector || '',
        category: '首页功能', urlBefore: target.url(), urlAfter: '',
        navigated: false, returned: false, passed: true,
        consoleErrors: 0, networkErrors: 0, pageError: null, errorText: null, error: null
      };

      try {
        await resetLogs();
        let clicked = false;
        if (fn.tag === 'select' && fn.selector && fn.value) {
          // select 下拉菜单：先重置到首页确保基线一致
          // 原则（一次只改变一个变量）：每次 select 都从首页重新出发，避免上个操作污染状态
          // 参考：SRE 排错铁律二 — 先修第一个错误（每次测试独立，互不干扰）
          try {
            await target.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await new Promise(r => setTimeout(r, 1500));
            await resetLogs();
          } catch (_) {}
          // 使用 selectOption 而非点击
          try {
            console.error('[runBrowserFullRegression] 🔽 select选项:', fn.text, `(value=${fn.value})`);
            await target.selectOption(fn.selector, fn.value, { timeout: 5000 });
            clicked = true;
          } catch (_) {
            try { await target.selectOption(fn.selector, { value: fn.value }, { timeout: 3000 }); clicked = true; } catch (_) {}
          }
        } else {
          console.error('[runBrowserFullRegression] 🖱️ 首页点击:', fn.text || fn.selector);
          clicked = await tryClick(fn.selector, true);
          if (!clicked) clicked = await tryClick(fn.text, false);
          if (!clicked && fn.selector) clicked = await tryClick(fn.selector, true);
        }

        if (!clicked) { detail.passed = false; detail.error = '无法定位点击'; totalClicked++; result.details.push(detail); continue; }

        try { await target.waitForLoadState('networkidle', { timeout: 5000 }); } catch (_) { await new Promise(r => setTimeout(r, 1500)); }
        await new Promise(r => setTimeout(r, 500));

        detail.urlAfter = target.url();

        // ====== SPA 页面内容变化检测：URL 未变但 DOM 显著变化 ======
        // 传统 goTo/goBack 无法追踪 SPA 的 JS 驱动导航
        // 通过对比点击前后 DOM 可见元素数和文本特征来判断页面是否切换
        // 参考：OODA 循环 Observe 阶段 — 不仅看 URL，还要看页面真实状态
        let spaNavigated = false;
        let spaNewContent = null;
        let fpDelta = 0;
        if (!detail.navigated && baseDomFingerprint) {
          try {
            const newFp = await target.evaluate(() => {
              const allEls = document.querySelectorAll('body *');
              let visibleCount = 0;
              for (const el of allEls) {
                if (visibleCount >= 500) break;
                try { const s = window.getComputedStyle(el); if (s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null) visibleCount++; } catch (_) {}
              }
              const mainText = (document.body.innerText || '').trim().slice(0, 2000);
              const hash = mainText.length + '_' + mainText.slice(0, 100);
              return { visibleCount, textHash: hash };
            });
            const elemDelta = Math.abs(newFp.visibleCount - baseDomFingerprint.visibleCount);
            fpDelta = elemDelta;
            const textChanged = newFp.textHash !== baseDomFingerprint.textHash;
            // 阈值判断：元素数差 > 15 或文本哈希变化视为 SPA 导航
            // 但排除纯 UI 切换（如主题、通知面板）— 这些通常元素数差 < 80 且不改变核心内容
            if ((elemDelta > 50 || textChanged) && elemDelta < 500) {
              spaNavigated = true;
              // 扫描新页面中的可交互元素
              spaNewContent = await target.evaluate(() => {
                const items = [];
                const candidates = document.querySelectorAll('button, a[href]:not([href="#"]), [role="button"], [tabindex]:not([tabindex="-1"])');
                for (const el of candidates) {
                  try {
                    if (el.offsetParent === null) continue;
                    const text = (el.textContent || '').trim();
                    if (!text || text.length > 25 || text.length < 1) continue;
                    const id = el.id ? '#' + el.id : '';
                    const cls = Array.from(el.classList).filter(c => !c.startsWith('_') && c !== 'nav-item' && c !== 'btn').slice(0, 2).map(c => '.' + c).join('');
                    const sel = id || (el.tagName.toLowerCase() + cls) || '';
                    if (sel) items.push({ text, selector: sel, tag: el.tagName.toLowerCase() });
                    if (items.length >= 3) break;
                  } catch (_) {}
                }
                return items;
              }).catch(() => null);
            }
          } catch (_) {}
        }
        detail.navigated = (detail.urlAfter !== detail.urlBefore) || spaNavigated;
        if (spaNavigated) {
          detail._spa = true;
          result.summary.pagesVisited = (result.summary.pagesVisited || 0) + 1;
          console.error('[runBrowserFullRegression] 🔄 SPA页面变化:', fn.text || fn.selector, `(元素差: ${fpDelta})`);
        }

        const homeClickSinceTs = Date.now() - 2000;
        const errs = await captureErrors(homeClickSinceTs);
        detail.consoleErrors = errs.consoleErrors; detail.networkErrors = errs.networkErrors;
        detail.pageError = errs.pageError; detail.errorText = errs.errorText;
        result.captureEvidence.perActionBreakdown.push({
          function: detail.function,
          consoleErrors: errs.consoleErrors,
          networkErrors: errs.networkErrors,
          pageError: errs.pageError,
          errorText: errs.errorText,
          sample: errs.items.slice(0, 3)
        });
        for (const e of errs.items) {
          result.blockingIssues.push({ function: detail.function, url: detail.urlAfter, issue: e.type === 'console' ? 'console_error' : 'network_error', detail: e.msg });
        }

        // SPA 返回：尝试点击新页面中的可交互元素（深度 2 探索），再尝试返回
        if (spaNavigated && spaNewContent && spaNewContent.length > 0) {
          try {
            const targetEl = spaNewContent[0];
            console.error('[runBrowserFullRegression] 🔍 SPA深度探索:', targetEl.text);
            try { await target.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.click(); }, targetEl.selector); } catch (_) {}
            try { await target.waitForLoadState('networkidle', { timeout: 5000 }); } catch (_) { await new Promise(r => setTimeout(r, 1500)); }
            await new Promise(r => setTimeout(r, 500));
          } catch (_) {}
        }

        // 返回：URL 变化用 goBack，SPA 变化点击同一按钮切换回
        if (detail.urlAfter !== detail.urlBefore) {
          try { await target.goBack({ waitUntil: 'networkidle', timeout: 10000 }); detail.returned = true; } catch (_) { detail.returned = false; }
        } else if (spaNavigated) {
          // SPA 返回：点击同一个按钮 toggle 回去
          try {
            if (fn.selector) {
              await target.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.click(); }, fn.selector);
              try { await target.waitForLoadState('networkidle', { timeout: 5000 }); } catch (_) { await new Promise(r => setTimeout(r, 1500)); }
              await new Promise(r => setTimeout(r, 500));
              detail.returned = true;
            }
          } catch (_) { detail.returned = false; }
        } else {
          detail.returned = true;
        }

        detail.passed = detail.consoleErrors === 0 && detail.networkErrors === 0 && !detail.pageError && !detail.errorText;

      } catch (e) { detail.passed = false; detail.error = e.message; }

      totalClicked++;
      result.details.push(detail);
    }

    // ====== 阶段 3.5：通用 select 状态变更独立测试 ======
    //
    // 设计原理（从底层模式出发）：
    //   通用模式：SelectChange → StateChange → NewAPIRequests → PermissionErrors(4xx)
    //   这个模式适用于 ANY 页面上的 ANY select 元素，不限于特定角色或页面。
    //
    // [重要] 阶段 3.5 前冷却期：
    //   BFS 遍历（阶段 1-3）消耗了大量 API 配额，此时服务端可能已限流（429）。
    //   如果直接测试 select 选项，所有响应都会被 429 掩盖，无法看到真实错误（如 403/500）。
    //   因此必须在阶段 3.5 前等待限流清除。
    //   参考：Exponential Backoff 策略 — 退避等待后再试
    try {
      // 先扫描当前是否有 429 限流
      const preCheckErrs = await captureErrors(Date.now() - 5000);
      const hasRecent429 = preCheckErrs.items.some(i => /429|too many|rate limit/i.test(i.msg || ''));
      result.captureEvidence._selectCooldownPreCheck = { hasRecent429, pre429Count: preCheckErrs.items.filter(i => /429/i.test(i.msg || '')).length };
      if (hasRecent429) {
        // 检测到限流，等待 30 秒让服务端恢复
        // 指数退避策略：检测到限流后至少等 30 秒
        console.error('[runBrowserFullRegression] ⏳ 检测到限流429，等待30秒冷却...');
        await new Promise(r => setTimeout(r, 30000));
        console.error('[runBrowserFullRegression] ✅ 冷却完成，开始 select 状态测试');
      }
    } catch (_) {}

    // 设计原理（续）：
    //   通用模式：SelectChange → StateChange → NewAPIRequests → PermissionErrors(4xx)
    //   这个模式适用于 ANY 页面上的 ANY select 元素，不限于特定角色或页面。
    //
    // 为什么需要独立测试（区别于阶段3的遍历）：
    //   阶段3的遍历在一个循环中依次尝试所有选项，但 select 切换会改变页面状态，
    //   导致后续选项无法正确执行（SRE 排错铁律：一次只改变一个变量）。
    //   本阶段为每个 select 选项重置到首页基线，独立测试。
    //
    // 融入的运维排错方法论：
    //   - OODA 循环：Observe（重置+截图）→ Orient（检测状态变化）→ Decide（分类错误模式）→ Act（记录证据）
    //   - 故障模式目录：403 select → 权限变更 → 新 API 请求 → 403 拒绝
    //   - 一次只改变一个变量：每个选项从干净首页重新出发
    //
    // 这个测试不限于"角色切换"，它适用于所有 select 下拉框的状态变更检测。
    try {
      // 先获取页面上所有 select 及其选项
      const allSelectsInfo = await target.evaluate(() => {
        return Array.from(document.querySelectorAll('select')).map(sel => {
          const selId = sel.id ? '#' + sel.id : '';
          const selName = sel.name || sel.id || 'select';
          return {
            selector: selId || selName,
            options: Array.from(sel.options).map(o => ({ text: o.text, value: o.getAttribute('value') || o.value }))
          };
        });
      }).catch(() => []);
      result.captureEvidence._selectStateTest = { selectCount: allSelectsInfo.length, totalTested: 0, errorPatterns: [] };

      // 对每个 select 的每个 option 做独立测试
      // 注意：select 状态测试不受 maxItems 限制（是独立测试而非 BFS 点击数）
      // 只受 timeout 全局超时保护，避免提前退出
      // 间隔原则：每个操作之间等待 3 秒，避免触发服务端限流（429）
      // 参考：OODA 循环 — Act 后 Observe，给服务端足够时间恢复
      for (const selInfo of allSelectsInfo) {
        for (const opt of selInfo.options) {
          if (isTimeout()) break;
          if (!opt.value && !opt.text) continue; // 跳过空选项

          // 每个选项之间等待 3 秒，避免频繁操作触发限流
          // SRE 排错铁律三：一次只改变一个变量——包括时间维度上的隔离
          await new Promise(r => setTimeout(r, 3000));

          // Observe: 重置到首页基线（一次只改变一个变量）
          try {
            await target.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await new Promise(r => setTimeout(r, 1500));
          } catch (_) { continue; }
          await resetLogs();
          const urlBefore = target.url();

          // Act: 选中选项
          let selected = false;
          console.error('[runBrowserFullRegression] 🔽 阶段3.5 select选项:', selInfo.selector, '→', opt.text || opt.value);
          try {
            await target.selectOption(selInfo.selector, opt.value, { timeout: 5000 });
            selected = true;
          } catch (_) {
            try { await target.selectOption(selInfo.selector, { value: opt.value }, { timeout: 3000 }); selected = true; } catch (_) {}
          }
          if (!selected) continue;

          try { await target.waitForLoadState('networkidle', { timeout: 8000 }); } catch (_) { await new Promise(r => setTimeout(r, 2000)); }
          await new Promise(r => setTimeout(r, 500));
          const urlAfter = target.url();
          const navigated = urlAfter !== urlBefore;

          // 📸 select 选项测试截图
          try { const buf = await target.screenshot({ type: 'png', fullPage: false }); result.captureEvidence.screenshots.push({ stage: 'select', label: `${selInfo.selector} → ${opt.text || opt.value}`, data: buf.toString('base64').slice(0, 500) }); } catch (_) {}

          // Orient + Decide: 捕获错误并分类
          const sinceTs = Date.now() - 3000;
          const errs = await captureErrors(sinceTs);

          // ===== 后选择深度探索：角色切换后扫描页面，发现隐藏错误 =====
          // 有些错误只在角色切换后访问特定页面时才暴露（如"服务商预览"页面500）
          // 这里自动点击一个导航按钮，模拟人类切换角色后浏览功能的行为
          // 参考：OODA 循环 Orient 阶段 — 切换视角（角色）后重新观察系统
          try {
            // 先检查前一步的网络错误中是否有 429，如果有则跳过深度探索（限流中，额外请求只会触发更多 429）
            const deepSkip = errs.items.some(i => /429|too many requests|rate limit/i.test(i.msg || ''));
            if (!deepSkip) {
              // 查找页面上的可点击导航项（第一个非触发器的元素）
              const pageNavItem = await target.evaluate(() => {
                const navs = document.querySelectorAll('button, a[href], [role="button"], .nav-item, .btn');
                for (const el of navs) {
                  const text = (el.textContent || '').trim();
                  const tag = (el.tagName || '').toLowerCase();
                  const href = el.getAttribute('href') || '';
                  // 跳过 select 触发器、主题切换、通知、聊天等系统UI
                  if (/theme|notif|chat|mobile-menu|close|☰|🌙|🔔|💬|✕|roleSelect|select/i.test(el.id || '') || /theme|notif|chat/i.test(el.className || '')) continue;
                  if (text && text.length > 0 && text.length < 20) {
                    let sel = '';
                    if (el.id) sel = '#' + el.id.replace(/[:"\s]/g, '\\$&');
                    else if (el.getAttribute('data-testid')) sel = '[data-testid="' + el.getAttribute('data-testid') + '"]';
                    else { const cls = Array.from(el.classList).filter(c => !c.startsWith('_')).slice(0, 1).map(c => '.' + c.replace(/[:"\s]/g, '\\$&')).join(''); sel = tag + cls || tag; }
                    return { text, selector: sel, tag };
                  }
                }
                return null;
              }).catch(() => null);
              if (pageNavItem) {
                console.error('[runBrowserFullRegression] 🔍 角色切换后深度探索:', pageNavItem.text);
                try {
                  await target.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.click(); }, pageNavItem.selector);
                  try { await target.waitForLoadState('networkidle', { timeout: 6000 }); } catch (_) { await new Promise(r => setTimeout(r, 2000)); }
                  await new Promise(r => setTimeout(r, 1000));
                  // 用 Performance API 扫描是否有角色切换后独有的错误（如 500）
                  const perfScan = await target.evaluate(() => {
                    return performance.getEntriesByType('resource')
                      .filter(e => e.responseStatus >= 400)
                      .map(e => ({ url: e.name, status: e.responseStatus }));
                  }).catch(() => []);
                  const newErrors = perfScan.filter(pe => !errs.items.some(e => e.msg && e.msg.includes(pe.url)));
                  for (const ne of newErrors) {
                    const msg = `[深度探索] ${ne.url} ${ne.status}`;
                    errs.items.push({ type: 'network', msg });
                    if (ne.status >= 500) errs.networkErrors++;
                    else if (ne.status >= 400) errs.networkErrors++;
                  }
                  result.captureEvidence._selectDeepExploration = result.captureEvidence._selectDeepExploration || [];
                  result.captureEvidence._selectDeepExploration.push({
                    option: opt.text || opt.value,
                    navItem: pageNavItem.text,
                    foundErrors: newErrors.length,
                    sample: newErrors.slice(0, 3)
                  });
                } catch (_) {}
              }
            }
          } catch (_) {}

          // 如果大量错误是 429，说明服务端限流了，等待后重试一次
          const hasRateLimit = errs.items.some(i => /429|too many requests|rate limit/i.test(i.msg || ''));
          if (hasRateLimit) {
            await new Promise(r => setTimeout(r, 5000)); // 等 5 秒
            // 重新捕获（不重新操作，用 Performance API 看是否有新状态）
            const retryErrs = await captureErrors(sinceTs);
            // 如果重试后还是有大量 429，跳过这个选项
            const stillRateLimited = retryErrs.items.filter(i => /429|too many requests|rate limit/i.test(i.msg || '')).length > 2;
            if (!stillRateLimited) {
              // 重试后限流解除，重新初始化
              try {
                await target.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await new Promise(r => setTimeout(r, 1500));
                await resetLogs();
                await target.selectOption(selInfo.selector, opt.value, { timeout: 5000 });
                try { await target.waitForLoadState('networkidle', { timeout: 8000 }); } catch (_) { await new Promise(r => setTimeout(r, 2000)); }
                await new Promise(r => setTimeout(r, 500));
                const retrySinceTs = Date.now() - 3000;
                const retryErrs2 = await captureErrors(retrySinceTs);
                // 用重试后的结果覆盖
                Object.assign(errs, retryErrs2);
              } catch (_) {}
            }
          }

          // 错误模式分类（通用模式检测，不限于任何页面）
          // 注意：5xx 检测使用末尾锚定和精确模式，避免匹配 IP 地址（如 192.168.500.1）和端口号（如 :5000）
          // 真实 5xx 状态码的特征：位于消息末尾（网络条目格式）、括号内、或包含明确的服务端错误关键词
          const patterns = [];
          const has403 = errs.items.some(i => /403|forbidden|禁止访问/i.test(i.msg || ''));
          const has401 = errs.items.some(i => /401|unauthorized|未授权/i.test(i.msg || ''));
          const has5xx = errs.items.some(i => {
            const msg = i.msg || '';
            // 网络条目格式: "METHOD URL STATUS" — 状态码在末尾
            if (/ (50[0-9])\s*$/.test(msg)) return true;
            // 控制台格式: "(500)" 或 "status 500" 或 "HTTP 500"
            if (/\(50[0-9]\)/i.test(msg)) return true;
            if (/[sS]tatus\s*[:：]?\s*50[0-9]\b/.test(msg)) return true;
            // 明确的服务端错误文本
            if (/\b(server error|Internal Server Error)\b/i.test(msg)) return true;
            if (/服务器错误/i.test(msg)) return true;
            return false;
          });
          const hasConsole = errs.consoleErrors > 0;
          // 429 属于限流，不是应用逻辑错误，单独记录但不作为 blocking error
          const rateLimited = errs.items.filter(i => /429|too many requests|rate limit/i.test(i.msg || '')).length;
          if (has403) patterns.push('permission_denied(403)');
          if (has401) patterns.push('auth_required(401)');
          if (has5xx) patterns.push('server_error(5xx)');
          if (hasConsole && !has403 && !has401 && !has5xx && rateLimited === 0) patterns.push('console_error');

          if (patterns.length > 0) {
            result.captureEvidence._selectStateTest.errorPatterns.push({
              selectSelector: selInfo.selector,
              option: opt,
              patterns: patterns,
              navigated: navigated,
              errors: {
                console: errs.consoleErrors,
                network: errs.networkErrors,
                sample: errs.items.slice(0, 3)
              }
            });
          }

          // 记录详情（passed 判定排除 429 限流，只反映真实错误）
          const non429Errors = errs.items.filter(i => !/429|too many requests|rate limit/i.test(i.msg || ''));
          const hasRealErrors = non429Errors.length > 0;
          const detail = {
            function: `状态变更测试 > ${selInfo.selector} > ${opt.text || opt.value}`,
            text: opt.text || '', selector: selInfo.selector,
            category: '状态变更测试', urlBefore, urlAfter,
            navigated, returned: false, passed: !hasRealErrors && patterns.length === 0,
            consoleErrors: errs.consoleErrors, networkErrors: errs.networkErrors,
            pageError: errs.pageError, errorText: errs.errorText,
            error: hasRealErrors ? `真实错误: ${non429Errors.length} 条 (${non429Errors.slice(0, 3).map(e => { const m = e.msg || ''; return m.match(/ (40[0-9]|50[0-9])$/)?.[1] || m.match(/\(40[0-9]|50[0-9]\)/)?.[0] || 'err'; }).join(', ')})` : (patterns.length > 0 ? `检测到: ${patterns.join(', ')}` : null)
          };
          if (navigated) { try { await target.goBack({ waitUntil: 'networkidle', timeout: 10000 }); detail.returned = true; } catch (_) { detail.returned = false; } }
          else { detail.returned = true; }

          // 有错误模式时记录到 blockingIssues
          for (const pattern of patterns) {
            result.blockingIssues.push({
              function: detail.function, url: urlAfter,
              issue: `state_change_error`,
              detail: `[${pattern}] 选择 ${selInfo.selector} > ${opt.text || opt.value} 后触发 ${errs.networkErrors} 个网络错误, ${errs.consoleErrors} 个控制台错误`
            });
          }
          // 也记录详细的 error items
          for (const e of errs.items) {
            result.blockingIssues.push({ function: detail.function, url: urlAfter, issue: e.type === 'console' ? 'console_error' : 'network_error', detail: e.msg });
          }

          totalClicked++;
          result.details.push(detail);
          result.summary.totalFunctions++;
          result.captureEvidence._selectStateTest.totalTested++;
          result.captureEvidence.perActionBreakdown.push({
            function: detail.function,
            consoleErrors: errs.consoleErrors,
            networkErrors: errs.networkErrors,
            pageError: errs.pageError,
            errorText: errs.errorText,
            sample: errs.items.slice(0, 3)
          });
        }
        if (isTimeout() || totalClicked >= maxItems) break;
      }
    } catch (e) {
      result.captureEvidence._selectStateTest = { error: e.message };
    }

    // ====== 汇总统计 ======
    result.summary.clicked = totalClicked;
    result.summary.passed = result.details.filter(d => d.passed).length;
    result.summary.failed = result.details.filter(d => !d.passed).length;
    result.summary.skipped = Math.max(0, result.summary.totalFunctions - totalClicked);
    result.summary.pagesVisited = navItems.length + 1;

    // ====== 捕获证据汇总 ======
    // 这些数字能证明我们确实捕获到错误，而不是漏报
    const finalSnap = snapshotLocalLogs();
    result.captureEvidence.capturedTotalErrors = finalSnap.console + finalSnap.page + finalSnap.network;
    result.captureEvidence.capturedErrorTypes = { console: finalSnap.console, page: finalSnap.page, network: finalSnap.network };
    // 取最多前 30 条错误样本
    result.captureEvidence.capturedSampleFull = [
      ...localLogs.console.slice(0, 10).map(e => ({ type: 'console', msg: e.message })),
      ...localLogs.network.slice(0, 15).map(e => ({ type: 'network', msg: `${e.method || ''} ${e.url || ''} ${e.status || ''}`, status: e.status })),
      ...localLogs.page.slice(0, 5).map(e => ({ type: 'page', msg: e.message }))
    ];

    // ====== 闭环分析 ======
    const navDetailItems = result.details.filter(d => d.navigated);
    result.closedLoop.navigableFunctions = navDetailItems.length;
    result.closedLoop.returnableFunctions = navDetailItems.filter(d => d.returned).length;
    result.closedLoop.loopScore = navDetailItems.length > 0
      ? Math.round((result.closedLoop.returnableFunctions / navDetailItems.length) * 100)
      : 100;
    result.closedLoop.loopComplete = result.closedLoop.loopScore >= 90;

    result.passed = result.blockingIssues.length === 0 && totalClicked > 0;

    // ====== Performance API 最终扫描 ======
    // 用 Performance API 检查是否有遗漏的 403/500 等错误（如角色切换后的 settlements API）
    try {
      const perfResources = await target.evaluate(() => {
        return performance.getEntriesByType('resource')
          .filter(e => e.responseStatus >= 400)
          .map(e => ({ url: e.name, status: e.responseStatus, initiatorType: e.initiatorType }));
      }).catch(() => []);
      if (perfResources.length > 0) {
        result.captureEvidence.performanceFinalScan = perfResources;
        for (const pr of perfResources) {
          if (pr.status >= 400) {  // 检查所有 >=400 的状态码，不只是 403
            const exists = result.blockingIssues.some(b => b.detail && b.detail.includes(pr.url));
            if (!exists) {
              result.blockingIssues.push({
                function: 'performance_final_scan',
                url: pr.url,
                issue: pr.status >= 500 ? 'server_error' : 'network_error',
                detail: `PerformanceAPI: ${pr.url} ${pr.status}`
              });
            }
          }
        }
        // 补充到 capturedSampleFull
        for (const pr of perfResources) {
          if (!result.captureEvidence.capturedSampleFull.some(s => s.msg && s.msg.includes(pr.url))) {
            result.captureEvidence.capturedSampleFull.push({ type: 'network', msg: `PerformanceAPI: ${pr.url} ${pr.status}`, status: pr.status });
          }
        }
      }
    } catch (_) {}

    // ====== 永久累加器最终扫描 ======
    // 底层原理：resetLogs() 清空 localLogs 会导致操作间隙的错误永久丢失
    // permanentErrors 永不清除，这里扫描所有遗漏的 403/401/500 等错误
    // 参考：SRE 排错铁律二 — 永不丢失证据
    try {
      const allPermErrors = [
        ...permanentErrors.console.map(e => ({ type: 'console', msg: e.message, ts: e.ts })),
        ...permanentErrors.network.map(e => ({ type: 'network', msg: `${e.method || ''} ${e.url || ''} ${e.status || ''}`, status: e.status, url: e.url, ts: e.ts })),
        ...permanentErrors.page.map(e => ({ type: 'page', msg: e.message, ts: e.ts }))
      ];
      result.captureEvidence.permanentErrorCount = allPermErrors.length;
      result.captureEvidence.permanentErrorSample = allPermErrors.slice(-20); // 取最后 20 条

      // 从 permanentErrors 中找出在 blockingIssues 中没有记录的 403/401/500
      const blockingUrls = new Set(
        result.blockingIssues
          .filter(b => b.detail)
          .map(b => {
            const m = b.detail.match(/(https?:\/\/[^\s]+)/);
            return m ? m[1] : null;
          })
          .filter(Boolean)
      );

      for (const ne of permanentErrors.network) {
        if ((ne.status === 403 || ne.status === 401 || (ne.status >= 500 && ne.status < 600)) && ne.url) {
          if (!blockingUrls.has(ne.url)) {
            result.blockingIssues.push({
              function: 'permanent_accumulator_scan',
              url: ne.url,
              issue: ne.status >= 500 ? 'server_error' : 'network_error',
              detail: `[${ne.source}] ${ne.method || ''} ${ne.url} ${ne.status}`
            });
            blockingUrls.add(ne.url);
          }
        }
      }
    } catch (_) {}

  } catch (err) {
    result.passed = false;
    result.error = err.message;
  }
  // CDP session 清理
  if (cdpSession) { try { cdpSession.detach(); } catch (_) {} cdpSession = null; }

  // ===== 最终过滤：去除假阳性错误 =====
  // 1. 429 Rate Limit — 测试工具自身触发的限流，不是应用 Bug
  // 2. IP 地址中的 5xx 被误匹配为状态码（如 192.168.50x.x、:5000 端口等）
  // 3. 重复错误（相同 URL + 相同状态码只保留一条）
  try {
    const unique = new Map(); // key: url+status → 去重
    const filtered = [];
    const removedCounts = { rateLimit: 0, false5xxFromIP: 0, duplicate: 0 };
    for (const bi of result.blockingIssues) {
      const detail = bi.detail || '';
      // 跳过 429 限流
      if (/429|too many requests|rate limit/i.test(detail)) { removedCounts.rateLimit++; continue; }
      // 跳过 IP 地址中的假 5xx（安全问题：IP 如 192.168.500.1 或端口如 :5000 会被误匹配为 500）
      // 判断规则：如果 detail 中包含 "\d+\.50[0-9]\." 或 ":\d*50[0-9]" 这类 IP/端口模式，
      // 且不是以 " 50[0-9]"（末尾状态码）或 "(50[0-9])" 或 "status 50[0-9]" 结尾，则排除
      if (/server_error|5xx/i.test(bi.issue || '')) {
        const ipFalsePositive = /\d+\.50[0-9]\./.test(detail) || /:\d*50[0-9]\b/.test(detail);
        const isRealStatus = / (50[0-9])\s*$/.test(detail) || /\(50[0-9]\)/.test(detail) || /[sS]tatus\s*[:：]?\s*50[0-9]\b/.test(detail);
        if (ipFalsePositive && !isRealStatus) { removedCounts.false5xxFromIP++; continue; }
      }
      // 去重：提取 URL 和状态码做精确去重
      let dedupKey = `${bi.url || ''}|${bi.issue || ''}`;
      // 从 detail 中提取状态码（如 "GET /api/xxx 403" → "403"）
      const statusMatch = detail.match(/ (50[0-9]|40[0-9]|429)\s*$/);
      if (statusMatch) dedupKey += `|${statusMatch[1]}`;
      else dedupKey += `|${detail.slice(0, 80)}`; // fallback: 用 detail 前缀
      if (unique.has(dedupKey)) { removedCounts.duplicate++; continue; }
      unique.set(dedupKey, true);
      filtered.push(bi);
    }
    result.blockingIssues = filtered;
    result.captureEvidence._postFilter = removedCounts;
    // 更新 passed 状态（只有真错误才算）
    result.passed = result.blockingIssues.length === 0;
  } catch (_) {}

  // 性能快照（新增）
  let performanceSnapshot = null;
  try {
    performanceSnapshot = await target.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByType('paint');
      return {
        lcp: nav?.loadingExperience?.metrics?.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
        cls: nav?.loadingExperience?.metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile,
        fcp: paint.find(e => e.name === 'first-contentful-paint')?.startTime,
        tti: nav?.domInteractive,
      };
    });
  } catch (_) {}
  if (performanceSnapshot) {
    result.performanceSnapshot = performanceSnapshot;
  }

  return result;
}

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
  requestStartTimes,

  // === Constants ===
  MAX_SESSIONS, SCREENSHOT_DIR, HAR_DIR, VISUAL_DIR,
  VISUAL_BASELINE_DIR, VISUAL_ACTUAL_DIR, VISUAL_DIFF_DIR,
  VALIDATIONS_DIR, REPORT_DIR, LOG_FILE, PROJECT_ROOT,

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
  detectSilentFailures, redact,
  trimTraceLogs, genSpanId, genTraceId,

  // === Modules ===
  browserOperator, evidenceCollector, deepInteractor, errorAggregator,

  // === Node built-ins ===
  path, fs, execSync,
};

async function callTool(name, args = {}) {
  logger.log('INFO', '调用工具', { name, args });

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
    return await handler.handle(name, args, deps);

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
  const server = new Server({ name: 'ai-verify-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });
  
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
      const result = await callTool(name, args || {});
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
  
  process.on('uncaughtException', (error) => {
    logger.log('ERROR', 'Uncaught Exception', { error: error.message, stack: error.stack });
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.log('ERROR', 'Unhandled Rejection', { reason: reason?.message || String(reason) });
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
    } catch (_) {}
    logger.log('INFO', 'Shutdown complete');
    process.exit(0);
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('exit', () => {
    if (!shuttingDown) {
      try { if (browser) browser.close().catch(() => {}); } catch (_) {}
      for (const [, item] of browserPool) {
        try { item.browser.close().catch(() => {}); } catch (_) {}
      }
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.log('INFO', 'ValidPilot OSS MCP Server ready (stdio mode)', { version: '1.0.0', tools: tools.length });

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
            serverInfo: { name: 'ai-verify-mcp', version: '1.0.0' }
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
    try { if (page && !page.isClosed()) await page.close(); } catch (_) {}
    try { if (browser) await browser.close(); } catch (_) {}
    for (const [, item] of browserPool) {
      try { await item.browser.close(); } catch (_) {}
    }
    browserPool.clear();
    httpServer.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Pattern store - accumulated fix knowledge
if (!global.__patternStore) {
  global.__patternStore = [];
}
// Record HuoKe HIS gateway fix (round 1)
const huokeFix = {
  id: 'huoke-his-gateway-schema-fix',
  score: 2.0,
  title: 'HuoKe HIS gateway 4x P0 API fix',
  symptom: '4 个 API 端点返回 404/500 (identity/me, tenants, reports/overview, reports/channel-roi)',
  rootCause: 'schema.sql 中 DEFAULT community 缺少引号（应为 DEFAULT \'community\'），导致整个数据库 schema 迁移失败，核心表（leads/orders/settlements）未创建',
  fix: 'sed -i "s/DEFAULT community/DEFAULT \'community\'/g" /app/infra/postgres/schema.sql + 删除 _migrations 表后重新执行 apply_schema()',
  verifyAction: 'curl 验证 6 个端点全部返回 HTTP 200',
  tags: ['python', 'postgres', 'schema', 'flask', 'fastapi', 'huoke'],
  createdAt: new Date().toISOString()
};
// Add if not duplicate
const exists = global.__patternStore.some(p => p.id === huokeFix.id);
if (!exists) {
  global.__patternStore.push(huokeFix);
}
// Record comprehensive DB schema fix (round 2)
const huokeFix2 = {
  id: 'huoke-his-comprehensive-db-fix',
  score: 2.0,
  title: 'HuoKe HIS comprehensive DB schema repair (4 missing columns/1 missing table/2 migrations)',
  symptom: 'orders → 500 (UndefinedColumn: status), settlements → 500 (UndefinedColumn: payout_status), ' +
    'settlement-accounts → 500 (UndefinedTable: settlement_accounts), settlements → 500 (payout_requested_at missing), ' +
    'migrations 009-010 not applied, callback-douyin → 500 (leads table), migration_roles.sql not executed',
  rootCause: [
    'orders 表 status 列: 代码 SELECT id, status, ... 但 schema.sql 未定义 status',
    'settlements 表 payout_status 列: 代码 SELECT ... payout_status 但 schema.sql 未定义',
    'settlements 表 payout_requested_at 列: 同样缺失',
    'settlement_accounts 表: 代码 INSERT INTO settlement_accounts 但无 CREATE TABLE',
    'migrations 009-010: apply_migrations() 执行失败跳过',
    'migration_roles.sql: 文件在 infra/ 目录但不在 migrations/ 中，从未自动执行',
    'callback-douyin: 容器启动顺序导致 leads 表尚不存在时已开始查询'
  ].join('; '),
  fix: 'ALTER TABLE ADD COLUMN IF NOT EXISTS (3次) + CREATE TABLE settlement_accounts (16列+2索引) + ' +
    'docker exec psql -f migration_roles.sql + docker exec psql -f 009.sql + docker exec psql -f 010.sql',
  verifyAction: '14 个核心 API 端点全部 200, 前端页面无报错, 40 张表, 68 个外键, 16 个性能索引',
  tags: ['python', 'postgres', 'schema', 'flask', 'fastapi', 'huoke', 'missing-column', 'missing-table', 'migration'],
  createdAt: new Date().toISOString()
};
// Add if not duplicate
const exists2 = global.__patternStore.some(p => p.id === huokeFix2.id);
if (!exists2) {
  global.__patternStore.push(huokeFix2);
}

const MODE = process.env.MCP_MODE || 'stdio';
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
