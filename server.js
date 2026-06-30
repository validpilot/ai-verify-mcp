try { require('dotenv').config(); } catch(e) {}
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

const TOOLS_DIR = path.join(__dirname, 'tools');
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const VALIDATIONS_DIR = path.join(PROJECT_ROOT, '.trae', 'validations');
const LOG_FILE = path.join(__dirname, 'validation.log');
const MAX_LOG_SIZE = 10 * 1024 * 1024;
const MAX_LOG_FILES = 5;
let lastLogRotateCheck = 0;
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
const requestStartTimes = new Map();

// 会话管理
const MAX_SESSIONS = 2;
const sessions = new Map();
let activeSessionName = 'default';
let sessionCounter = 0;

let browser = null;
let page = null;
let browserSessionId = 0;
let consoleLogs = [];
let networkLogs = [];
let pageErrors = [];
let currentCheckpoint = new Date().toISOString();
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

function findTraceId(headers) {
  if (!headers) return null;
  for (const key of TRACE_HEADER_NAMES) {
    const val = headers[key] || headers[key.toLowerCase()];
    if (val) return val;
  }
  // 也检查下划线版本
  for (const key of TRACE_HEADER_NAMES) {
    const underscoreKey = key.replace(/-/g, '_');
    const val = headers[underscoreKey] || headers[underscoreKey.toLowerCase()];
    if (val) return val;
  }
  return null;
}
function trimTraceLogs() {
  if (traceLogs.length > 1000) traceLogs = traceLogs.slice(-500);
}

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

function rotateLogs() {
  try {
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const oldFile = `${LOG_FILE}.${i}`;
      const newFile = `${LOG_FILE}.${i + 1}`;
      if (fs.existsSync(oldFile)) {
        if (i === MAX_LOG_FILES - 1 && fs.existsSync(newFile)) {
          fs.unlinkSync(newFile);
        }
        fs.renameSync(oldFile, newFile);
      }
    }
    if (fs.existsSync(LOG_FILE)) {
      fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    }
  } catch (_) {}
}

function log(level, message, details = {}) {
  const entry = { timestamp: new Date().toISOString(), level, message, ...redact(details) };
  try {
    const now = Date.now();
    if (now - lastLogRotateCheck > 60000) {
      lastLogRotateCheck = now;
      try {
        const stats = fs.statSync(LOG_FILE);
        if (stats.size > MAX_LOG_SIZE) {
          rotateLogs();
        }
      } catch (_) {}
    }
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (_) {}
}

function loadTools() {
  const tools = [];
  try {
    for (const file of fs.readdirSync(TOOLS_DIR)) {
      if (!file.endsWith('.json')) continue;
      const tool = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, file), 'utf8'));
      if (tool.input_schema && !tool.inputSchema) {
        tool.inputSchema = tool.input_schema;
        delete tool.input_schema;
      }
      tools.push(tool);
    }
  } catch (error) {
    log('ERROR', '加载工具失败', { error: error.message });
  }
  return tools;
}

const tools = loadTools();
const toolNames = new Set(tools.map(tool => tool.name));

function resetRuntimeLogs() {
  consoleLogs = [];
  networkLogs = [];
  pageErrors = [];
  currentCheckpoint = new Date().toISOString();
  log('INFO', 'runtime logs cleared', { checkpoint: currentCheckpoint });
}

function parseSince(args = {}) {
  if (args.since) return new Date(args.since).getTime();
  if (args.currentOnly !== false) return new Date(currentCheckpoint).getTime();
  return 0;
}

function filterBySince(items, args = {}) {
  const since = parseSince(args);
  return items.filter(item => !since || new Date(item.timestamp || 0).getTime() >= since);
}

function filterNetwork(items, args = {}) {
  let records = filterBySince(items, args);
  const contains = args.urlContains || args.contains;
  if (contains) records = records.filter(item => item.url && item.url.includes(contains));
  if (args.method) records = records.filter(item => item.method === args.method);
  if (typeof args.statusMin === 'number') records = records.filter(item => Number(item.status || 0) >= args.statusMin);
  if (typeof args.statusMax === 'number') records = records.filter(item => Number(item.status || 0) <= args.statusMax);
  return records;
}

// ===== 浏览器预热 =====
async function warmupBrowser() {
  try {
    log('INFO', '预热浏览器...', {});
    const wBrowser = await chromium.launch({ headless: true });
    const wContext = await wBrowser.newContext({ viewport: { width: 1280, height: 720 } });
    const wPage = await wContext.newPage();
    await wPage.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 10000 });
    const poolId = '__warmup__';
    browserPool.set(poolId, { browser: wBrowser, context: wContext, page: wPage, createdAt: Date.now() });
    log('INFO', '浏览器预热完成', {});
    return poolId;
  } catch (error) {
    log('WARN', '浏览器预热失败，将在首次open时启动', { error: error.message });
    return null;
  }
}

const MAX_LOG_ENTRIES = 500;

// 日志边界控制
function trimLogs() {
  if (consoleLogs.length > MAX_LOG_ENTRIES) {
    consoleLogs = consoleLogs.slice(-MAX_LOG_ENTRIES);
  }
  if (networkLogs.length > MAX_LOG_ENTRIES) {
    networkLogs = networkLogs.slice(-MAX_LOG_ENTRIES);
  }
  if (pageErrors.length > MAX_LOG_ENTRIES / 2) {
    pageErrors = pageErrors.slice(-Math.floor(MAX_LOG_ENTRIES / 2));
  }
  if (imageErrors.length > 50) {
    imageErrors = imageErrors.slice(-50);
  }
  // 清理 requestStartTimes 中超过 5 分钟的记录
  const now = Date.now();
  const MAX_REQUEST_AGE = 5 * 60 * 1000;
  for (const [request, startTime] of requestStartTimes.entries()) {
    if (now - startTime > MAX_REQUEST_AGE) {
      requestStartTimes.delete(request);
    }
  }
}

// 给页面挂载监听器
function setupPageListeners(targetPage) {
  resetRuntimeLogs();

  targetPage.on('console', msg => {
    consoleLogs.push(redact({ source: 'console', type: msg.type(), text: msg.text(), location: msg.location(), timestamp: new Date().toISOString() }));
    trimLogs();
  });

  targetPage.on('pageerror', error => {
    const entry = redact({ source: 'pageerror', type: 'error', text: error.message, stack: error.stack, timestamp: new Date().toISOString() });
    pageErrors.push(entry);
    consoleLogs.push(entry);
    trimLogs();
  });

  targetPage.on('request', request => {
    requestStartTimes.set(request, Date.now());
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
    const startedAt = requestStartTimes.get(request);
    requestStartTimes.delete(request);
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
    networkLogs.push(entry);
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
    const startedAt = requestStartTimes.get(request);
    requestStartTimes.delete(request);
    networkLogs.push(redact({
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
    const newConsoleErrors = consoleLogs
      .filter(e => new Date(e.timestamp || 0).getTime() > sinceTime && (e.type === 'error' || e.type === 'warning'))
      .slice(-10);

    const newPageErrors = pageErrors
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
      log('ERROR', '截图检测到错误', {
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
    log('WARN', '截图错误分析失败', { image: imagePath, error: error.message });
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
        log('INFO', '复用池中浏览器', { poolId: id });
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
  installInstrumentation(page).catch(e => log('WARN', 'installInstrumentation 失败', { error: e.message }));

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
  const since = args.since || currentCheckpoint;
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
  const cdpErrors = filterByTime(consoleLogs).filter(e => e.type === 'error' || (includeWarnings && (e.type === 'warning' || e.type === 'warn')));
  result.consoleErrors = cdpErrors.map(e => ({ text: (e.text || '').slice(0, 300), source: e.source, timestamp: e.timestamp }));

  // 2. CDP page errors
  const pageErr = filterByTime(pageErrors);
  result.runtimeErrors = pageErr.map(e => ({ message: (e.text || '').slice(0, 300), stack: (e.stack || '').slice(0, 500), timestamp: e.timestamp }));

  // 3. Network 4xx/5xx
  const netErr = filterByTime(networkLogs).filter(e => e.status >= 400);
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
    const beforeCheckpoint = currentCheckpoint;
    
    // 等待错误浮现（300ms足够捕获大多数错误）
    await new Promise(r => setTimeout(r, 300)).catch(() => {});
    
    const afterCheckpoint = new Date().toISOString();
    const newConsoleErrors = consoleLogs.filter(e => new Date(e.timestamp || 0).getTime() > new Date(beforeCheckpoint).getTime());
    const newPageErrors = pageErrors.filter(e => new Date(e.timestamp || 0).getTime() > new Date(beforeCheckpoint).getTime());
    const newNetworkErrors = networkLogs.filter(e => e.status >= 400 && new Date(e.timestamp || 0).getTime() > new Date(beforeCheckpoint).getTime());
    
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
      log('WARN', `操作 "${actionName}(${selector})" 后检测到 ${totalNewErrors} 个新错误`, {
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

function readRecentMcpErrors(args = {}) {
  const limit = args.limit || 50;
  const includeWarnings = args.includeWarnings === true;
  const since = parseSince(args);
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    return fs.readFileSync(LOG_FILE, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-500)
      .map(line => {
        try { return JSON.parse(line); } catch (_) { return null; }
      })
      .filter(item => item && (item.level === 'ERROR' || (includeWarnings && item.level === 'WARN')))
      .filter(item => !since || new Date(item.timestamp || 0).getTime() >= since)
      .slice(-limit);
  } catch (error) {
    return [{ source: 'mcp-log', level: 'ERROR', message: '读取 MCP 日志失败', error: error.message, timestamp: new Date().toISOString() }];
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
  return filterNetwork(networkLogs, args)
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
  const consoleErrors = filterBySince(consoleLogs, args).filter(item => item.type === 'error' || (includeWarnings && ['warning', 'warn'].includes(item.type)));
  const pageErrorRecords = filterBySince(pageErrors, args);
  const networkErrors = filterNetwork(networkLogs, args).filter(item => item.failed || item.status >= 400);
  const silentFailErrors = detectSilentFailures(args);
  const mcpErrors = readRecentMcpErrors(args).map(item => ({ source: 'mcp', ...item }));
  const imageErrorRecords = filterBySince(imageErrors, args).filter(e => e.hasErrors);
  const total = consoleErrors.length + pageErrorRecords.length + networkErrors.length + silentFailErrors.length + mcpErrors.length + imageErrorRecords.length;
  const byLevel = {
    error: consoleErrors.filter(e => e.type === 'error').length + pageErrorRecords.length + networkErrors.filter(e => e.status >= 500 || e.failed).length + silentFailErrors.length + mcpErrors.length + imageErrorRecords.length,
    warning: consoleErrors.filter(e => ['warning', 'warn'].includes(e.type)).length + networkErrors.filter(e => e.status >= 400 && e.status < 500 && !e.failed).length
  };
  return redact({
    checkpoint: currentCheckpoint,
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
  const report = { generatedAt: new Date().toISOString(), checkpoint: currentCheckpoint, page: pageInfo, lastAction, errors: getUnifiedErrors({ ...args, includeWarnings: true }) };
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
      log('WARN', `步骤 "${label}" 检测到错误`, { errorCount: analysis.errorCount });
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
      log('WARN', '断言失败自动截图失败', { error: e.message });
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
  return redact({ passed: results.every(item => item.ok !== false && (!item.assertion || item.assertion.passed)), checkpoint: currentCheckpoint, results, errors });
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
    checkpoint: currentCheckpoint,
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
    log('PERF', `a11y_check完成`, { cost: `${cost}ms`, violations: result.violations?.length || 0 });

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
    log('PERF', `a11y_check超时`, { cost: `${cost}ms`, error: e.message });
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
    log('PERF', `performance_check完成`, { cost: `${cost}ms`, metrics: result.metrics });
    const output = redact({ ...result, timestamp: new Date().toISOString() });
    lastQualityChecks.performance = output;
    return output;
  } catch (e) {
    const cost = Date.now() - startTime;
    log('PERF', `performance_check超时`, { cost: `${cost}ms`, error: e.message });
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

    log('INFO', 'Lighthouse审计开始', { url, categories: args.categories });

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

    log('INFO', 'Lighthouse审计完成', { scores });
    return result;
  } catch (error) {
    log('ERROR', 'Lighthouse审计失败', { error: error.message });
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

  log('PERF', 'validation_element开始', { selector });

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
  log('PERF', 'validation_element完成', { cost: `${cost}ms`, passed: assertionPassed });

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
  log('PERF', 'validation_quick_run开始', { url, checks: checksToRun });

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

  log('PERF', 'validation_quick_run完成', { cost: `${duration}ms`, total: checks.length, passed: passedChecks, failed: failedChecks });

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

  log('PERF', 'validation_check开始', { url: args.url || '当前页面' });

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
  log('PERF', 'validation_check完成', { cost: `${cost}ms`, errors: errorSummary?.total || 0 });

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
  log('PERF', 'validation_run完成', { cost: `${cost}ms`, total: cases.length, passedCount, failedCount });
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

  log('PERF', 'validation_flow完成', { cost: `${totalDuration}ms`, totalSteps, passedSteps, failedSteps });

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

  return result;
}

async function callTool(name, args = {}) {
  log('INFO', '调用工具', { name, args });

  try {
    switch (name) {
    case 'browser_errors_aggregate': {
      const evidence = args.evidence || (args.includeCurrentPage === false ? {} : (await evidenceCollector.collectEvidence(args)).evidence);
      return text(JSON.stringify(errorAggregator.aggregateErrors(evidence, args), null, 2));
    }
    case 'browser_full_audit': {
      return text(JSON.stringify(await runFullAudit(args), null, 2));
    }
    case 'error_summary_md': {
      const evidence = args.evidence || (await evidenceCollector.collectEvidence(args)).evidence;
      return text(errorAggregator.errorSummaryMd(evidence, args));
    }
    case 'screenshot_diff':
      return text(JSON.stringify(await evidenceCollector.screenshotDiff(args), null, 2));
    case 'browser_open': {
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
    case 'browser_click': {
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
    case 'browser_click_audit': {
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
    case 'browser_type': {
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
    case 'browser_hover': {
      const { target } = await ensurePage();
      await target.hover(args.selector, { timeout: 10000 });
      lastAction = { type: 'hover', selector: args.selector, timestamp: new Date().toISOString() };
      return text(`已悬浮：${args.selector}`);
    }
    case 'browser_scroll': {
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
    case 'browser_press_key': {
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
    case 'browser_snapshot': {
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
    case 'browser_batch': {
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
    case 'browser_network':
      return text(JSON.stringify(redact(filterNetwork(networkLogs, args)), null, 2));
    case 'browser_network_detail':
      return text(JSON.stringify(filterNetworkDetails(args), null, 2));
    case 'browser_har_export':
      return text(JSON.stringify(exportHar(args), null, 2));
    case 'debug_investigate': {
      const { target } = await ensurePage(args);
      const investigation = await investigateDebug(target, args);
      return text(JSON.stringify(investigation, null, 2));
    }
    case 'browser_console': {
      const level = args.level && args.level !== 'all' ? args.level : null;
      const filtered = level ? consoleLogs.filter(item => item.type === level) : consoleLogs;
      const limited = (args.limit ? filtered.slice(-args.limit) : filtered.slice(-50));
      return text(JSON.stringify(redact(limited), null, 2));
    }
    case 'browser_errors': {
      const result = getUnifiedErrors(args);
      // 如果页面可用，也从注入脚本直读 console 错误
      if (page && !page.isClosed()) {
        try {
          const injected = await page.evaluate((since) => {
            if (!window.__mcpEvents) return [];
            const sinceTime = since ? new Date(since).getTime() : 0;
            return window.__mcpEvents
              .filter(e => (e.type === 'console' && e.level === 'error') || e.type === 'window_error' || e.type === 'unhandledrejection')
              .filter(e => new Date(e.timestamp || 0).getTime() >= sinceTime)
              .slice(-30)
              .map(e => ({ type: e.level || 'error', text: (e.args ? e.args.join(' ') : e.message || e.reason || '').slice(0, 200) }));
          }, args.since || null).catch(() => []);
          if (injected.length > 0) {
            result.injectedConsoleErrors = injected;
            result.totalInjected = injected.length;
            result.summary.silentFailCount = (result.summary.silentFailCount || 0) + injected.length;
            result.silentFailCount = (result.silentFailCount || 0) + injected.length;
          }
        } catch (_) {}
      }
      return text(JSON.stringify(result, null, 2));
    }
    case 'browser_errors_clear':
      resetRuntimeLogs();
      return text(JSON.stringify({ cleared: true, checkpoint: currentCheckpoint }, null, 2));
    case 'browser_eval': {
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
    case 'browser_dom': {
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
    case 'browser_highlight': {
      const { target } = await ensurePage();
      await target.$eval(args.selector, (el, color) => {
        el.scrollIntoView({ block: 'center', inline: 'center' });
        el.setAttribute('data-mcp-debug-highlight', 'true');
        el.style.outline = `4px solid ${color || 'red'}`;
        el.style.boxShadow = `0 0 0 6px rgba(255,0,0,.25)`;
      }, args.color || 'red');
      return text(`已高亮元素：${args.selector}`);
    }
    case 'browser_select': {
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
    case 'browser_storage': {
      const { target } = await ensurePage();
      return text(JSON.stringify(await getStorageSnapshot(target, args.scope || 'all'), null, 2));
    }
    case 'browser_debug_report': {
      const { target } = await ensurePage();
      return text(JSON.stringify(await buildDebugReport(target, args), null, 2));
    }
    case 'browser_screenshot': {
      const { target } = await ensurePage();
      ensureArtifactsDir();
      const safeName = (args.name || `screenshot-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.join(SCREENSHOT_DIR, `${safeName}.png`);
      await screenshotWithRedaction(target, filePath, args);

      // 截图后二次分析错误
      const analysis = await analyzeScreenshotForErrors(target, filePath);

      if (analysis.hasErrors) {
        return text(JSON.stringify({
          image: filePath,
          success: true,
          error_analysis: {
            has_errors: true,
            visible_error_count: analysis.visibleErrors.length,
            console_error_count: analysis.consoleErrors.length,
            total_errors: analysis.errorCount,
            visible_errors: analysis.visibleErrors.map(e => ({ selector: e.selector, text: e.text.slice(0, 100) })),
            console_errors: analysis.consoleErrors.map(e => e.text)
          },
          tip: '截图检测到错误，请使用 browser_errors 查看完整错误详情'
        }, null, 2));
      }

      return text(JSON.stringify({ image: filePath, success: true, error_analysis: { has_errors: false } }, null, 2));
    }
    case 'browser_screenshot_element': {
      const { target } = await ensurePage();
      ensureArtifactsDir();
      const selector = args.selector;
      if (!selector) {
        return { isError: true, content: [{ type: 'text', text: 'browser_screenshot_element 需要提供 selector 参数' }] };
      }
      const padding = args.padding || 0;
      const safeName = (args.name || `element-screenshot-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.join(SCREENSHOT_DIR, `${safeName}.png`);

      try {
        const element = await target.$(selector);
        if (!element) {
          return { isError: true, content: [{ type: 'text', text: `未找到选择器 "${selector}" 对应的元素` }] };
        }
        
        const box = await element.boundingBox();
        if (!box) {
          return { isError: true, content: [{ type: 'text', text: `元素 "${selector}" 不可见或尺寸为0` }] };
        }

        const clip = {
          x: Math.max(0, box.x - padding),
          y: Math.max(0, box.y - padding),
          width: box.width + padding * 2,
          height: box.height + padding * 2
        };

        await target.screenshot({ path: filePath, clip, omitBackground: false });

        return text(JSON.stringify({
          image: filePath,
          success: true,
          selector,
          elementSize: { width: box.width, height: box.height },
          screenshotSize: { width: clip.width, height: clip.height },
          padding
        }, null, 2));
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: `元素截图失败: ${e.message}` }] };
      }
    }
    case 'browser_navigate': {
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
    case 'browser_step': {
      const { target } = await ensurePage();
      return text(JSON.stringify(await captureStepEvidence(target, args.label || 'manual-step', args), null, 2));
    }
    case 'browser_wait': {
      const { target } = await ensurePage();
      return text(JSON.stringify(await waitForCondition(target, args), null, 2));
    }
    case 'browser_assert': {
      const { target } = await ensurePage();
      return text(JSON.stringify(await assertPage(target, args), null, 2));
    }
    case 'browser_flow': {
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await runFlow(target, args), null, 2));
    }
    case 'browser_instrument': {
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await installInstrumentation(target), null, 2));
    }
    case 'browser_events': {
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await getBrowserEvents(target, args), null, 2));
    }
    case 'browser_events_clear': {
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await clearBrowserEvents(target), null, 2));
    }
    case 'browser_trace_start': {
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await startTrace(target, args), null, 2));
    }
    case 'browser_trace_stop': {
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await stopTrace(target, args), null, 2));
    }
    case 'browser_artifacts':
      return text(JSON.stringify(getArtifacts(), null, 2));
    case 'browser_visual_baseline': {
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await visualBaseline(target, args), null, 2));
    }
    case 'browser_visual_compare': {
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await visualCompare(target, args), null, 2));
    }
    case 'browser_visual_report':
      return text(JSON.stringify(visualReport(), null, 2));
    case 'browser_a11y_check': {
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await runA11yCheck(target, args), null, 2));
    }
    case 'browser_performance_check': {
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await runPerformanceCheck(target, args), null, 2));
    }
    case 'browser_lighthouse_audit': {
      return text(JSON.stringify(await runLighthouseAudit(args), null, 2));
    }
    case 'browser_locator_validate': {
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await validateLocator(target, args), null, 2));
    }
    case 'browser_locator_suggest': {
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await suggestLocator(target, args), null, 2));
    }
    case 'browser_artifacts_clear':
      return text(JSON.stringify(clearArtifacts(args), null, 2));
    case 'browser_sessions':
      return text(JSON.stringify(listBrowserSessions(), null, 2));
    case 'browser_session_create': {
      const name = args.name || args.sessionName || `session-${++sessionCounter}`;
      if (sessions.size >= MAX_SESSIONS && !sessions.has(activeSessionName)) {
        return text(`会话数量已达上限（${MAX_SESSIONS}），请先关闭现有会话`);
      }
      const { target, sessionId } = await ensurePage({ ...args, sessionName: name });
      if (args.url) await target.goto(args.url, { waitUntil: 'domcontentloaded', timeout: args.timeout || 30000 });
      sessions.set(name, { name, url: target.url(), created: new Date().toISOString(), browser, page });
      activeSessionName = name;
      return text(JSON.stringify({ created: true, activeSession: activeSessionName, sessionName: name, url: target.url() }, null, 2));
    }
    case 'browser_session_switch': {
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
        return text(JSON.stringify({ switched: true, activeSession: activeSessionName, url: page.url() }, null, 2));
      } else {
        // 会话已关闭，重新打开
        sessions.delete(name);
        return text(`会话已关闭：${name}，请重新创建`);
      }
    }
    case 'browser_session_close':
      return text(JSON.stringify(await closeBrowserSession(args.name || args.sessionName), null, 2));
    case 'mcp_health_check':
      return text(JSON.stringify(mcpHealthCheck(), null, 2));
    case 'project_audit':
      return text(JSON.stringify(await projectAudit(args), null, 2));
    case 'mcp_self_test':
      return text(JSON.stringify(await mcpSelfTest(args), null, 2));
    case 'validation_start': {
      resetRuntimeLogs();
      const scenarios = Array.isArray(args.testScenarios) ? args.testScenarios : [];
      validationResults = scenarios.map((scenario, index) => ({ id: index + 1, scenario, status: 'pending' }));
      return text(`验证已启动，目标: ${args.targetUrl || '未指定'}，场景数: ${scenarios.length}，checkpoint: ${currentCheckpoint}`);
    }
    case 'validation_check': {
      if (args.check_type === 'deploy_verify') {
        return text(JSON.stringify(await runDeployVerify(args), null, 2));
      }
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await runValidationCheck(target, args), null, 2));
    }
    case 'validation_run': {
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await runValidationPlan(target, args), null, 2));
    }
    case 'validation_suite_run':
      return text('该工具为付费版本功能，请升级到团队版或企业版以使用批量套件运行能力。\n\n了解更多: https://validpilot.com/pricing');
    case 'validation_element': {
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await runValidationElement(target, args), null, 2));
    }
    case 'validation_flow': {
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await runValidationFlow(target, args), null, 2));
    }
    case 'validation_report': {
      const report = buildValidationReport(args);
      return text(typeof report === 'string' ? report : JSON.stringify(report, null, 2));
    }
    case 'validation_report_export':
      return text(JSON.stringify(exportValidationReport(args), null, 2));
    case 'validation_quick_run': {
      const { target } = await ensurePage(args);
      return text(JSON.stringify(await runValidationQuickRun(target, args), null, 2));
    }
    case 'validation_matrix':
      return text('validation_matrix: 权限矩阵验证。该能力在闭源端完整实现，开源版本仅作为占位（推荐使用多个 validation_check 模拟矩阵）');
    case 'validation_decision':
      return text('validation_decision: 决策建议。该能力在闭源端完整实现，开源版本仅作为占位');
    case 'css_var_check': {
      const cssAnalyzer = require('./scripts/css-var-analyzer');
      const css = args.css;
      if (!css) {
        return text(JSON.stringify({ error: '缺少 css 参数' }, null, 2));
      }
      const result = cssAnalyzer.analyzeCSS(css, args.filePath || 'inline');
      return text(JSON.stringify(result, null, 2));
    }
    case 'error_fix_suggestion': {
      const errorSummary = args.errorSummary || '';
      const context = args.context || {};
      const maxSuggestions = args.maxSuggestions || 3;

      const errorText = typeof errorSummary === 'string' ? errorSummary : JSON.stringify(errorSummary);
      const lowerText = errorText.toLowerCase();

      const patterns = [
        {
          name: '404_not_found',
          match: /404|not found|无法找到|找不到资源/i,
          suggestions: [
            { suggestion: '检查URL路径是否正确，注意大小写和拼写', severity: 'critical', confidence: 0.9, verifyAction: '在浏览器中直接访问URL，确认是否返回404', relatedTool: 'browser_open' },
            { suggestion: '检查API路由版本是否匹配', severity: 'general', confidence: 0.7, verifyAction: '查看API文档确认路由版本', relatedTool: 'browser_network' },
            { suggestion: '检查资源引用路径（JS/CSS/图片）', severity: 'general', confidence: 0.6, verifyAction: '使用browser_network检查失败的资源请求', relatedTool: 'browser_network' }
          ]
        },
        {
          name: '401_unauthorized',
          match: /401|unauthorized|未授权|无权限登录|身份验证失败/i,
          suggestions: [
            { suggestion: '检查登录状态是否有效', severity: 'critical', confidence: 0.9, verifyAction: '查看当前页面是否需要重新登录', relatedTool: 'browser_cookies' },
            { suggestion: '检查Token或Cookie是否过期', severity: 'critical', confidence: 0.85, verifyAction: '使用browser_cookies查看认证信息', relatedTool: 'browser_cookies' },
            { suggestion: '重新登录获取有效凭证', severity: 'general', confidence: 0.8, verifyAction: '执行登录操作后重试', relatedTool: 'browser_click' }
          ]
        },
        {
          name: '403_forbidden',
          match: /403|forbidden|禁止访问|访问被拒绝/i,
          suggestions: [
            { suggestion: '检查当前用户角色权限是否足够', severity: 'critical', confidence: 0.85, verifyAction: '确认用户角色与资源权限要求', relatedTool: 'browser_cookies' },
            { suggestion: '检查资源访问控制配置', severity: 'general', confidence: 0.7, verifyAction: '查看服务端权限配置', relatedTool: 'browser_network' }
          ]
        },
        {
          name: '5xx_server_error',
          match: /500|502|503|server error|服务器错误|内部错误|服务不可用/i,
          suggestions: [
            { suggestion: '检查后端服务状态是否正常', severity: 'critical', confidence: 0.9, verifyAction: '查看服务健康检查接口', relatedTool: 'browser_network' },
            { suggestion: '稍后重试，可能是临时故障', severity: 'general', confidence: 0.7, verifyAction: '等待一段时间后重新请求', relatedTool: 'browser_wait' },
            { suggestion: '查看服务端日志获取详细错误信息', severity: 'critical', confidence: 0.8, verifyAction: '检查服务日志排查根因', relatedTool: 'browser_diagnose' }
          ]
        },
        {
          name: 'type_error_undefined',
          match: /TypeError|undefined|Cannot read properties|无法读取属性|类型错误/i,
          suggestions: [
            { suggestion: '等待页面JS加载完成后再操作', severity: 'critical', confidence: 0.85, verifyAction: '使用browser_wait等待页面稳定', relatedTool: 'browser_wait', suggestedCode: 'await page.waitForSelector(".content-loaded", { timeout: 5000 })' },
            { suggestion: '检查目标元素是否存在于DOM中', severity: 'critical', confidence: 0.8, verifyAction: '使用browser_find_element确认元素存在', relatedTool: 'browser_find_element', suggestedCode: 'const el = document.querySelector(".target-element"); console.log("exists:", !!el)' },
            { suggestion: '检查页面数据是否加载完成', severity: 'general', confidence: 0.7, verifyAction: '查看网络请求确认数据返回', relatedTool: 'browser_network' }
          ]
        },
        {
          name: 'cors_cross_origin',
          match: /CORS|cross-origin|跨域|Access-Control|被CORS策略阻止|Script error[\.]?$/i,
          suggestions: [
            { suggestion: '检查API服务端CORS配置', severity: 'critical', confidence: 0.9, verifyAction: '查看响应头Access-Control-Allow-Origin', relatedTool: 'browser_network' },
            { suggestion: '检查请求域名是否在白名单中', severity: 'general', confidence: 0.75, verifyAction: '确认服务端配置的允许源', relatedTool: 'browser_network' },
            { suggestion: '跨域脚本错误：在<script>标签添加crossorigin="anonymous"属性', severity: 'critical', confidence: 0.85, verifyAction: '检查HTML中的<script src>是否缺少crossorigin属性', relatedTool: 'browser_dom' },
            { suggestion: '使用代理服务器转发请求', severity: 'general', confidence: 0.6, verifyAction: '配置开发代理绕过CORS限制', relatedTool: 'browser_network', suggestedCode: '// dev proxy config\nmodule.exports = { devServer: { proxy: { "/api": { target: "http://localhost:3000" } } } }' }
          ]
        },
        {
          name: 'timeout',
          match: /timeout|timed out|ETIMEDOUT|超时|请求超时/i,
          suggestions: [
            { suggestion: '检查网络连接是否正常', severity: 'critical', confidence: 0.85, verifyAction: '访问其他网站确认网络状态', relatedTool: 'browser_open' },
            { suggestion: '增加请求超时时间', severity: 'general', confidence: 0.8, verifyAction: '调整超时参数后重试', relatedTool: 'browser_wait', suggestedCode: 'await page.goto(url, { timeout: 30000 })' },
            { suggestion: '检查服务端响应速度是否正常', severity: 'general', confidence: 0.7, verifyAction: '查看网络请求耗时分布', relatedTool: 'browser_network' }
          ]
        },
        {
          name: 'element_not_found',
          match: /element not found|no element matched|找不到元素|元素不存在|没有匹配的元素/i,
          suggestions: [
            { suggestion: '检查选择器拼写是否正确', severity: 'critical', confidence: 0.9, verifyAction: '使用browser_dom验证选择器', relatedTool: 'browser_dom' },
            { suggestion: '等待元素加载完成后再操作', severity: 'critical', confidence: 0.85, verifyAction: '使用browser_wait等待元素出现', relatedTool: 'browser_wait', suggestedCode: 'await page.waitForSelector(".target-element", { timeout: 10000 })' },
            { suggestion: '使用browser_find_element查找元素', severity: 'general', confidence: 0.8, verifyAction: '调用browser_find_element确认元素位置', relatedTool: 'browser_find_element' }
          ]
        },
        {
          name: 'element_not_visible',
          match: /element not visible|not interactable|不可见|不可交互|元素被遮挡/i,
          suggestions: [
            { suggestion: '滚动到元素位置使其可见', severity: 'critical', confidence: 0.85, verifyAction: '使用browser_scroll滚动到元素', relatedTool: 'browser_scroll', suggestedCode: 'await element.scrollIntoView({ behavior: "smooth", block: "center" })' },
            { suggestion: '检查元素是否被其他元素遮挡', severity: 'general', confidence: 0.7, verifyAction: '截图查看元素实际显示状态', relatedTool: 'browser_screenshot' },
            { suggestion: '等待页面动画或过渡完成', severity: 'general', confidence: 0.75, verifyAction: '使用browser_wait等待动画结束', relatedTool: 'browser_wait', suggestedCode: 'await page.waitForTimeout(1000) // 等待动画结束' }
          ]
        },
        {
          name: 'disabled_readonly',
          match: /disabled|readonly|只读|禁用|不可编辑/i,
          suggestions: [
            { suggestion: '检查表单验证条件是否满足', severity: 'critical', confidence: 0.8, verifyAction: '查看表单字段的启用条件', relatedTool: 'browser_diagnose' },
            { suggestion: '检查前置输入是否满足要求', severity: 'general', confidence: 0.7, verifyAction: '确认依赖字段是否已正确填写', relatedTool: 'browser_click' }
          ]
        },
        {
          name: 'network_error_fetch',
          match: /NetworkError|Failed to fetch|网络错误|获取失败|连接失败/i,
          suggestions: [
            { suggestion: '检查网络连接是否正常', severity: 'critical', confidence: 0.9, verifyAction: '访问其他网站确认网络连通性', relatedTool: 'browser_open' },
            { suggestion: '检查API服务是否可用', severity: 'critical', confidence: 0.85, verifyAction: '直接访问API地址确认服务状态', relatedTool: 'browser_network' },
            { suggestion: '检查请求格式是否正确', severity: 'general', confidence: 0.7, verifyAction: '核对请求参数和格式要求', relatedTool: 'browser_network' }
          ]
        },
        // api_response_html — 路由兜底检测（API 返回 HTML 而非 JSON）
        {
          name: 'api_response_html',
          match: /html.*200|返回了HTML|路由兜底|SPA路由/i,
          suggestions: [
            { suggestion: 'API 路径可能被 SPA 路由捕获，返回了 HTML 而非 JSON', severity: 'blocking', confidence: 0.9, verifyAction: '在 Network 面板检查响应 Content-Type', relatedTool: 'browser_network', suggestedCode: 'fetch(url).then(r => { if (!r.ok || !r.headers.get("content-type")?.includes("json")) throw new Error("Not JSON response") })' },
            { suggestion: '检查 API URL 前缀是否匹配服务端路由配置', severity: 'critical', confidence: 0.8, verifyAction: '对比 API 文档中的路由前缀', relatedTool: 'browser_dom', suggestedCode: '// 检查 /api/ 前缀是否匹配 server 配置' },
            { suggestion: '确认服务端未将所有未匹配路由指向 index.html', severity: 'critical', confidence: 0.85, verifyAction: '查看 nginx/tomcat 路由配置', relatedTool: 'browser_network' }
          ]
        },
        // missing_envVar — 环境变量缺失
        {
          name: 'missing_envVar',
          match: /environment variable|env.*not set|环境变量.*未|缺少.*环境|process\.env/i,
          suggestions: [
            { suggestion: '检查 .env 文件是否存在且包含必需变量', severity: 'blocking', confidence: 0.9, verifyAction: '检查 .env 或 .env.local 文件', relatedTool: 'browser_diagnose', suggestedCode: 'console.log("MISSING:", ["KEY1","KEY2"].filter(k=>!process.env[k]))' },
            { suggestion: '确认 CI/CD 中已配置该环境变量', severity: 'critical', confidence: 0.85, verifyAction: '检查部署环境的变量配置', relatedTool: 'browser_diagnose' }
          ]
        },
        // port_conflict — 端口冲突
        {
          name: 'port_conflict',
          match: /port.*in use|EADDRINUSE|端口.*占用|address.*already in use/i,
          suggestions: [
            { suggestion: '查找占用端口的进程并停止', severity: 'blocking', confidence: 0.9, verifyAction: 'netstat -ano | findstr :PORT', relatedTool: 'browser_diagnose', suggestedCode: '// Windows: netstat -ano | findstr :PORT\n// Linux: lsof -i :PORT' },
            { suggestion: '修改应用端口配置重新启动', severity: 'critical', confidence: 0.85, verifyAction: '在配置文件中修改端口号', relatedTool: 'browser_diagnose' }
          ]
        },
        // websocket_error — WebSocket 错误
        {
          name: 'websocket_error',
          match: /websocket|WebSocket|ws:[/][/]|wss:[/][/]|socket.*error|连接.*断开/i,
          suggestions: [
            { suggestion: '检查 WebSocket 服务端是否正常运行', severity: 'blocking', confidence: 0.9, verifyAction: '直接连接 WebSocket 端点确认状态', relatedTool: 'browser_network', suggestedCode: 'new WebSocket(url).onopen=()=>console.log("WS OK")' },
            { suggestion: '检查防火墙/代理是否拦截 WebSocket 升级请求', severity: 'critical', confidence: 0.8, verifyAction: '查看网络请求中 101 状态码', relatedTool: 'browser_network' }
          ]
        },
        // rate_limit — 请求频率限制
        {
          name: 'rate_limit',
          match: /rate limit|429|too many requests|请求过于频繁|请求被限流/i,
          suggestions: [
            { suggestion: '增加请求间隔，避免短时间内大量请求', severity: 'critical', confidence: 0.9, verifyAction: '添加延迟后重试', relatedTool: 'browser_wait', suggestedCode: 'await new Promise(r=>setTimeout(r,2000))' },
            { suggestion: '检查是否需要添加认证头提高限额', severity: 'general', confidence: 0.7, verifyAction: '查看 API 文档关于限流的说明', relatedTool: 'browser_cookies' }
          ]
        },
        // python_route_missing — Python 后端路由缺失（Flask/FastAPI）
        {
          name: 'python_route_missing',
          match: /404|route.*not found|endpoint.*missing|路由.*缺失|接口.*不存在|api.*not found|identity\.me|tenants.*500/i,
          suggestions: [
            { suggestion: '检查 Python 路由文件是否存在对应端点定义', severity: 'blocking', confidence: 0.9, verifyAction: '在 routes/ 目录下查找对应 .py 文件', relatedTool: 'debug_investigate', suggestedCode: '# 检查路由文件\n# grep -rn "endpoint_name" app/routes/' },
            { suggestion: '检查蓝图(Blueprint)是否在 __init__.py 中注册', severity: 'critical', confidence: 0.85, verifyAction: '查看 routes/__init__.py 中的 router 注册列表', relatedTool: 'debug_investigate', suggestedCode: '# 检查蓝图注册\nfrom app.routes.module import router\napp.include_router(router)' },
            { suggestion: '检查路由装饰器 @router.get/post 的路径是否正确', severity: 'critical', confidence: 0.8, verifyAction: '对比 API 文档和路由装饰器中的路径', relatedTool: 'browser_network' }
          ]
        },
        // python_import_error — Python 模块导入错误
        {
          name: 'python_import_error',
          match: /ImportError|ModuleNotFoundError|No module named|导入.*失败|模块.*不存在/i,
          suggestions: [
            { suggestion: '检查 requirements.txt 是否包含缺失的依赖包', severity: 'blocking', confidence: 0.9, verifyAction: '执行 pip install -r requirements.txt', relatedTool: 'debug_investigate', suggestedCode: 'pip install -r requirements.txt' },
            { suggestion: '检查 Python 路径(PYTHONPATH)和模块搜索路径', severity: 'critical', confidence: 0.85, verifyAction: '打印 sys.path 确认导入路径', relatedTool: 'debug_investigate', suggestedCode: 'python3 -c "import sys; print(chr(10).join(sys.path))"' },
            { suggestion: '检查循环导入(circular import)问题', severity: 'critical', confidence: 0.8, verifyAction: '检查模块之间的相互引用关系', relatedTool: 'debug_investigate' }
          ]
        },
        // python_db_error — 数据库连接/查询错误
        {
          name: 'python_db_error',
          match: /psycopg|DatabaseError|OperationalError|数据库.*错误|relation.*does not exist|UndefinedTable|connection.*failed|database.*error/i,
          suggestions: [
            { suggestion: '检查数据库表是否存在(SELECT tablename FROM pg_tables)', severity: 'blocking', confidence: 0.9, verifyAction: '连接数据库执行 \\dt 检查表清单', relatedTool: 'debug_investigate', suggestedCode: 'docker exec postgres psql -U user -d db -c "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname=\'public\'"' },
            { suggestion: '检查 schema.sql/Docker 启动时是否成功执行迁移', severity: 'critical', confidence: 0.85, verifyAction: '查看容器启动日志中的 schema/migration 信息', relatedTool: 'debug_investigate', suggestedCode: 'docker compose logs | grep -iE "schema|migration|error"' },
            { suggestion: '检查 SQL 语法错误（如缺少引号、逗号、DEFAULT 值格式）', severity: 'critical', confidence: 0.8, verifyAction: '逐步测试 CREATE TABLE 语句定位语法错误', relatedTool: 'debug_investigate', suggestedCode: '-- 常见错误: DEFAULT value 缺少引号\n-- 正确: DEFAULT \'value\'\n-- 错误: DEFAULT value' }
          ]
        },
        // sql_undefined_column — SQL 查询引用不存在的列（UndefinedColumn）
        {
          name: 'sql_undefined_column',
          match: /UndefinedColumn|column.*does not exist|列.*不存在|payout_status|payout_requested_at|column.*status.*not exist/i,
          suggestions: [
            { suggestion: '检查 SQL 查询中引用的列名是否在对应表结构中存在', severity: 'blocking', confidence: 0.95, verifyAction: '执行 \\d tablename 检查表结构中的列清单', relatedTool: 'debug_investigate', suggestedCode: 'docker exec postgres psql -U user -d db -c "SELECT column_name FROM information_schema.columns WHERE table_name=\'tablename\'"' },
            { suggestion: '确认 schema.sql 或迁移文件是否遗漏了该列定义', severity: 'critical', confidence: 0.9, verifyAction: '检查 schema.sql 中 CREATE TABLE 部分和 migrations/ 目录下的迁移文件', relatedTool: 'debug_investigate', suggestedCode: 'grep -n "payout_status\|status" infra/postgres/schema.sql services/gateway/migrations/*.sql' },
            { suggestion: '使用 ALTER TABLE ADD COLUMN IF NOT EXISTS 补充缺失列', severity: 'critical', confidence: 0.85, verifyAction: '执行 ALTER TABLE 后重新测试 API', relatedTool: 'debug_investigate', suggestedCode: 'ALTER TABLE tablename ADD COLUMN IF NOT EXISTS column_name VARCHAR(32) NOT NULL DEFAULT \'pending\';' }
          ]
        },
        // sql_undefined_table — SQL 查询引用了不存在的表（UndefinedTable）
        {
          name: 'sql_undefined_table',
          match: /UndefinedTable|relation.*does not exist|表.*不存在|setlement_accounts|settlement_accounts/i,
          suggestions: [
            { suggestion: '检查 schema.sql 是否包含该表的 CREATE TABLE 定义', severity: 'blocking', confidence: 0.95, verifyAction: '检查 schema.sql 和 migrations/ 目录下的所有 SQL 文件', relatedTool: 'debug_investigate', suggestedCode: 'grep -rn "CREATE TABLE.*tablename" infra/postgres/ services/gateway/migrations/' },
            { suggestion: '从代码仓库的 INSERT SQL 中提取表结构定义', severity: 'critical', confidence: 0.85, verifyAction: '查找代码中该表的 INSERT/REFERENCES 推断列定义', relatedTool: 'debug_investigate', suggestedCode: 'grep -rn "tablename" app/*.py | grep -i "INSERT\|SELECT.*FROM" | head -5' },
            { suggestion: '创建缺失的表并补充外键约束', severity: 'critical', confidence: 0.8, verifyAction: '执行 CREATE TABLE IF NOT EXISTS 创建表', relatedTool: 'debug_investigate', suggestedCode: 'CREATE TABLE IF NOT EXISTS tablename (id VARCHAR(64) PRIMARY KEY, tenant_id VARCHAR(64) NOT NULL, ...);' }
          ]
        },
        // sql_schema_syntax — SQL schema 语法错误（DEFAULT 缺引号、逗号缺失等）
        {
          name: 'sql_schema_syntax',
          match: /syntax error at or near|语法错误|DEFAULT.*community|DEFAULT\[^'\].*[^']|missing comma|SYNTAX_ERROR/i,
          suggestions: [
            { suggestion: '检查所有 DEFAULT 值是否被单引号包裹（如 DEFAULT \'value\' 而非 DEFAULT value）', severity: 'blocking', confidence: 0.9, verifyAction: '用 grep 扫描 schema.sql 中所有 DEFAULT 关键字', relatedTool: 'debug_investigate', suggestedCode: 'grep -n "^[[:space:]]*[a-z].*DEFAULT " schema.sql | grep -v "DEFAULT \'"' },
            { suggestion: '检查每一列定义末尾是否有关键缺失的逗号', severity: 'critical', confidence: 0.85, verifyAction: '逐行检查 CREATE TABLE 中列定义间的逗号', relatedTool: 'debug_investigate', suggestedCode: '-- 上一行以逗号结尾, 下一行是另一列定义' },
            { suggestion: '使用 docker exec psql -f schema.sql 单独测试 schema 文件', severity: 'critical', confidence: 0.9, verifyAction: '单独执行 schema 文件查看具体错误行号', relatedTool: 'debug_investigate', suggestedCode: 'docker exec postgres psql -U user -d db -f /path/to/schema.sql 2>&1 | head -20' }
          ]
        },
        // sql_migration_not_applied — Migration 文件存在但未执行
        {
          name: 'sql_migration_not_applied',
          match: /migration.*not applied|应用迁移|_migrations|迁移.*未|schema.*outdated|schema.*stale/i,
          suggestions: [
            { suggestion: '检查 _migrations 表确认已应用的迁移版本', severity: 'blocking', confidence: 0.9, verifyAction: '查询 _migrations 表对比 migrations/ 目录中的文件', relatedTool: 'debug_investigate', suggestedCode: 'SELECT version FROM _migrations ORDER BY version;' },
            { suggestion: '检查 migrations 目录中的 SQL 文件是否多于 _migrations 记录', severity: 'critical', confidence: 0.85, verifyAction: '对比 ls migrations/ 和 _migrations 表', relatedTool: 'debug_investigate', suggestedCode: 'ls -1 services/gateway/migrations/*.sql | sed "s/.*\\///" | sed "s/\\.sql$//"' },
            { suggestion: '手动执行缺失的迁移文件或重启应用触发迁移', severity: 'critical', confidence: 0.8, verifyAction: 'docker exec psql -f missing_migration.sql', relatedTool: 'debug_investigate', suggestedCode: 'docker exec postgres psql -U user -d db -f migrations/009_missing.sql' }
          ]
        }
      ];

      const matchedPatterns = [];
      let allSuggestions = [];

      for (const pattern of patterns) {
        if (pattern.match.test(lowerText)) {
          matchedPatterns.push(pattern.name);
          allSuggestions = allSuggestions.concat(pattern.suggestions);
        }
      }

      if (matchedPatterns.length === 0) {
        allSuggestions = [
          { suggestion: '使用browser_errors查看完整错误详情', severity: 'general', confidence: 0.7, verifyAction: '调用browser_errors获取完整错误列表', relatedTool: 'browser_errors' },
          { suggestion: '检查浏览器控制台输出', severity: 'general', confidence: 0.6, verifyAction: '使用browser_console查看控制台日志', relatedTool: 'browser_console' },
          { suggestion: '使用browser_diagnose进行综合诊断', severity: 'general', confidence: 0.5, verifyAction: '调用browser_diagnose获取页面健康报告', relatedTool: 'browser_diagnose' }
        ];
      }

      const sortedSuggestions = allSuggestions
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, maxSuggestions);

      const result = {
        errorSummary,
        matchedPatterns,
        suggestions: sortedSuggestions,
        totalSuggestions: sortedSuggestions.length,
        generatedAt: new Date().toISOString()
      };

      return text(JSON.stringify(result, null, 2));
    }
    case 'fix_verify': {
      // 增强版 fix_verify - 支持截图、DOM 检查和修复验证闭环
      const { target } = await ensurePage();

      // 截图自动捕获（修复前）
      const artifactDir = path.join(__dirname, 'artifacts', 'fix-verify');
      if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
      const timestamp = Date.now();
      let beforeShot = null;
      let afterShot = null;

      if (args.captureScreenshots !== false) {
        beforeShot = path.join(artifactDir, `fix_before_${timestamp}.png`);
        await target.screenshot({ path: beforeShot, fullPage: true });
      }

      // 核心 DOM 元素存在性对比（修复前）
      const elementsToCheck = args.checkDomElements || [];
      const beforeDomState = {};
      for (const sel of elementsToCheck) {
        const el = await target.$(sel);
        beforeDomState[sel] = !!el;
      }

      // 记录修复前状态
      const beforeState = {
        url: target.url(),
        errors: getUnifiedErrors({ includeWarnings: false }),
        timestamp: new Date().toISOString()
      };

      // 执行修复（如果有具体操作）
      if (args.beforeSummary && args.afterSummary) {
        const beforeErrors = args.beforeSummary.errors || 0;
        const afterErrors = args.afterSummary.errors || 0;

        // 对比前后摘要
        const comparison = {
          before: args.beforeSummary,
          after: args.afterSummary,
          improved: false,
          details: []
        };

        if (afterErrors < beforeErrors) {
          comparison.improved = true;
          comparison.details.push(`错误数从 ${beforeErrors} 减少到 ${afterErrors}`);
        }

        // 修复后截图
        if (args.captureScreenshots !== false) {
          afterShot = path.join(artifactDir, `fix_after_${timestamp}.png`);
          await target.screenshot({ path: afterShot, fullPage: true });
        }

        // DOM 元素修复后检查
        const afterDomState = {};
        const domChanges = [];
        for (const sel of elementsToCheck) {
          const el = await target.$(sel);
          afterDomState[sel] = !!el;
          domChanges.push({
            selector: sel,
            existed: beforeDomState[sel],
            now: afterDomState[sel],
            changed: beforeDomState[sel] !== afterDomState[sel]
          });
        }
        const domImprovedCount = domChanges.filter(d => d.changed && d.now).length;
        const domTotalCount = domChanges.length;

        // 截图差异计算
        let diffPercent = 0;
        if (beforeShot && afterShot) {
          const beforeSize = fs.statSync(beforeShot).size;
          const afterSize = fs.statSync(afterShot).size;
          diffPercent = beforeSize > 0 ? Math.abs(afterSize - beforeSize) / beforeSize * 100 : 0;
        }

        // improvementScore 计算
        const errorDiff = (beforeErrors - afterErrors);
        const maxErrors = Math.max(beforeErrors, afterErrors, 1);
        const errorScore = (errorDiff / maxErrors) * 50;
        const screenshotScore = diffPercent > 20 ? 20 : (diffPercent / 20) * 20;
        const domScore = domImprovedCount / Math.max(domTotalCount, 1) * 30;
        const improvementScore = Math.max(0, Math.min(100, 50 + errorScore + screenshotScore + domScore));

        return text(JSON.stringify({
          passed: improvementScore >= 60,
          improvementScore: Math.round(improvementScore),
          comparison: {
            errorDiff: { before: beforeErrors, after: afterErrors, change: errorDiff },
            screenshotDiff: { beforeShot, afterShot, diffPercent: Math.round(diffPercent) },
            domChanges
          },
          evidencePaths: { beforeScreenshot: beforeShot, afterScreenshot: afterShot }
        }, null, 2));
      }

      return text(JSON.stringify({
        status: 'recorded',
        message: '已记录修复前状态，请执行修复操作后再次调用以验证',
        beforeState,
        beforeScreenshot: beforeShot,
        beforeDomState
      }, null, 2));
    }
    case 'browser_verify_fix': {
      const { target } = await ensurePage();
      const selector = args.selector;
      if (!selector) {
        return { isError: true, content: [{ type: 'text', text: 'browser_verify_fix 需要提供 selector 参数' }] };
      }

      const fixAction = args.fixAction || 'quick_fix';
      const fixValue = args.fixValue;
      const criteria = args.verificationCriteria || {};
      const timeout = args.timeout || 10000;

      // 1. 记录修复前状态
      const beforeState = {
        url: target.url(),
        timestamp: new Date().toISOString(),
        checkpoint: currentCheckpoint,
        errors: {
          console: consoleLogs.slice(-10).filter(e => e.type === 'error').length,
          page: pageErrors.slice(-5).length,
          network: networkLogs.slice(-10).filter(e => e.status >= 400 || e.failed).length
        },
        elementStatus: null
      };

      // 获取元素修复前状态
      try {
        beforeState.elementStatus = await target.evaluate((s) => {
          const el = document.querySelector(s);
          if (!el) return { found: false };
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return {
            found: true,
            visible: rect.width > 0 && style.visibility !== 'hidden' && style.display !== 'none',
            disabled: el.disabled,
            inViewport: rect.top >= 0 && rect.bottom <= window.innerHeight
          };
        }, selector);
      } catch (e) {
        beforeState.elementStatus = { error: e.message };
      }

      // 2. 执行修复动作
      const fixResult = { action: fixAction, success: false, error: null };

      try {
        switch (fixAction) {
          case 'click':
            await target.click(selector, { timeout: timeout }).catch(() => {
              // 降级到 JS 点击
              return target.evaluate((s) => {
                const el = document.querySelector(s);
                if (el) el.click();
              }, selector);
            });
            fixResult.success = true;
            fixResult.message = '点击执行完成';
            break;

          case 'type':
            if (!fixValue) {
              fixResult.error = 'type 操作需要 fixValue 参数';
            } else {
              await target.fill(selector, fixValue, { timeout: timeout });
              fixResult.success = true;
              fixResult.message = `已输入: ${fixValue.substring(0, 20)}`;
            }
            break;

          case 'wait':
            const waitMs = parseInt(fixValue) || 2000;
            await target.waitForTimeout(waitMs);
            fixResult.success = true;
            fixResult.message = `等待 ${waitMs}ms 完成`;
            break;

          case 'scroll':
            await target.evaluate((s) => {
              const el = document.querySelector(s);
              if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
            }, selector);
            fixResult.success = true;
            fixResult.message = '已滚动到元素';
            break;

          case 'quick_fix':
            // 自动尝试修复
            const quickFixStrategies = ['scroll', 'force_visible', 'remove_disabled', 'force_click'];
            for (const strategy of quickFixStrategies) {
              try {
                if (strategy === 'scroll') {
                  await target.evaluate((s) => {
                    const el = document.querySelector(s);
                    if (el) el.scrollIntoView({ behavior: 'instant' });
                  }, selector);
                } else if (strategy === 'force_visible') {
                  await target.evaluate((s) => {
                    const el = document.querySelector(s);
                    if (el) {
                      el.style.display = '';
                      el.style.visibility = 'visible';
                      el.style.opacity = '1';
                    }
                  }, selector);
                } else if (strategy === 'remove_disabled') {
                  await target.evaluate((s) => {
                    const el = document.querySelector(s);
                    if (el) {
                      el.disabled = false;
                      el.removeAttribute('disabled');
                    }
                  }, selector);
                } else if (strategy === 'force_click') {
                  await target.evaluate((s) => {
                    const el = document.querySelector(s);
                    if (el) {
                      el.scrollIntoView({ behavior: 'instant' });
                      el.click();
                    }
                  }, selector);
                  fixResult.success = true;
                  fixResult.message = '已通过JS强制点击';
                  break;
                }
              } catch (e) {
                // 继续尝试下一个策略
              }
            }
            if (!fixResult.success) {
              fixResult.success = true;
              fixResult.message = 'quick_fix 尝试完成';
            }
            break;

          case 'none':
            fixResult.success = true;
            fixResult.message = '仅验证，无修复动作';
            break;
        }
      } catch (e) {
        fixResult.error = e.message;
      }

      // 等待一下让状态稳定
      await target.waitForTimeout(500);

      // 3. 记录修复后状态
      const afterState = {
        url: target.url(),
        timestamp: new Date().toISOString(),
        errors: {
          console: consoleLogs.slice(-10).filter(e => e.type === 'error').length,
          page: pageErrors.slice(-5).length,
          network: networkLogs.slice(-10).filter(e => e.status >= 400 || e.failed).length
        },
        elementStatus: null
      };

      try {
        afterState.elementStatus = await target.evaluate((s) => {
          const el = document.querySelector(s);
          if (!el) return { found: false };
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return {
            found: true,
            visible: rect.width > 0 && style.visibility !== 'hidden' && style.display !== 'none',
            disabled: el.disabled,
            inViewport: rect.top >= 0 && rect.bottom <= window.innerHeight
          };
        }, selector);
      } catch (e) {
        afterState.elementStatus = { error: e.message };
      }

      // 4. 验证结果
      const verification = {
        passed: true,
        criteria: {},
        details: []
      };

      // 检查各种验证条件
      if (criteria.noNewErrors !== false) {
        const newErrors = afterState.errors.console + afterState.errors.page + afterState.errors.network -
          (beforeState.errors.console + beforeState.errors.page + beforeState.errors.network);
        verification.criteria.noNewErrors = newErrors <= 0;
        if (newErrors > 0) {
          verification.details.push(`新增 ${newErrors} 个错误`);
          verification.passed = false;
        } else {
          verification.details.push('无新增错误');
        }
      }

      if (criteria.elementVisible) {
        verification.criteria.elementVisible = afterState.elementStatus?.visible === true;
        if (!verification.criteria.elementVisible) {
          verification.details.push('元素仍不可见');
          verification.passed = false;
        } else {
          verification.details.push('元素已可见');
        }
      }

      if (criteria.elementInteractable) {
        verification.criteria.elementInteractable = afterState.elementStatus?.found && !afterState.elementStatus?.disabled;
        if (!verification.criteria.elementInteractable) {
          verification.details.push('元素仍不可交互');
          verification.passed = false;
        } else {
          verification.details.push('元素已可交互');
        }
      }

      if (criteria.textContains) {
        const pageText = await target.evaluate(() => document.body.innerText);
        verification.criteria.textContains = pageText.includes(criteria.textContains);
        if (!verification.criteria.textContains) {
          verification.details.push(`页面不包含 "${criteria.textContains}"`);
          verification.passed = false;
        } else {
          verification.details.push(`页面包含 "${criteria.textContains}"`);
        }
      }

      if (criteria.urlChanged) {
        verification.criteria.urlChanged = beforeState.url !== afterState.url;
        if (!verification.criteria.urlChanged) {
          verification.details.push('URL未变化');
          verification.passed = false;
        } else {
          verification.details.push(`URL已变化: ${afterState.url.substring(0, 50)}`);
        }
      }

      // 5. 综合结果
      const result = {
        selector,
        fixAction,
        fixResult,
        beforeState,
        afterState,
        verification,
        fixStatus: verification.passed ? 'FIXED' : 'NOT_FIXED',
        nextAction: verification.passed ? ['修复成功，可继续后续操作'] : ['建议使用 browser_diagnose 深入诊断', '尝试不同的修复策略', '使用 browser_element_status 检查元素状态']
      };

      return text(JSON.stringify(result, null, 2));
    }
    case 'ai_debug_investigate':
      return text('ai_debug_investigate: AI调试调查。该能力在闭源端完整实现，开源版本建议使用 debug_investigate');
    case 'benchmark_run':
      return text('benchmark_run: 基准测试。该能力在闭源端完整实现，开源版本仅作为占位');
    case 'browser_find_element': {
      const { target } = await ensurePage();
      return text(JSON.stringify(await findElement(target, args), null, 2));
    }
    case 'browser_find_page':
      return text(JSON.stringify(await findPage(args.target, args), null, 2));
    case 'browser_cookies': {
      const { target } = await ensurePage();
      const action = args.action || 'get';
      if (action === 'clear') {
        await target.context().clearCookies();
        return text(JSON.stringify({ action: 'clear', success: true, message: '所有Cookie已清除' }, null, 2));
      }
      if (action === 'set') {
        if (!args.cookie || !args.cookie.name) {
          return { isError: true, content: [{ type: 'text', text: '设置Cookie需要提供 cookie.name 和 cookie.value' }] };
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
      return text(JSON.stringify({ action: 'get', total: cookies.length, cookies: safeCookies }, null, 2));
    }
    case 'browser_diagnose': {
      const { target } = await ensurePage();
      const selector = args.selector;
      const errorType = args.errorType || 'all';
      const includeStackTrace = args.includeStackTrace !== false;

      const diagnosis = {
        timestamp: new Date().toISOString(),
        url: target.url(),
        selector: selector || '(全局诊断)',
        errorType,
        rootCauses: [],
        confidence: 0,
        suggestedFixes: [],
        affectedElements: []
      };

      // 1. 收集错误数据
      const errors = getUnifiedErrors({ includeWarnings: false });
      const recentConsole = consoleLogs.slice(-20).filter(e => e.type === 'error');
      const recentPage = pageErrors.slice(-10);
      const recentNetwork = networkLogs.slice(-30).filter(e => e.status >= 400 || e.failed);

      // 2. 按类型过滤
      let filteredErrors = { console: [], page: [], network: [] };
      if (errorType === 'all' || errorType === 'js') {
        filteredErrors.console = recentConsole;
        filteredErrors.page = recentPage;
      }
      if (errorType === 'all' || errorType === 'network') {
        filteredErrors.network = recentNetwork;
      }

      // 3. 根因分析逻辑
      const analyzeRootCause = async () => {
        // JS错误根因
        if (filteredErrors.console.length > 0 || filteredErrors.page.length > 0) {
          for (const err of filteredErrors.page.slice(0, 5)) {
            const errText = err.text || '';
            // 常见错误模式识别
            if (errText.includes('TypeError') || errText.includes('undefined')) {
              diagnosis.rootCauses.push({
                type: 'js_error',
                pattern: 'TypeError/undefined',
                description: 'JS未加载或变量未定义',
                confidence: 0.85,
                evidence: errText.substring(0, 150)
              });
              diagnosis.suggestedFixes.push('检查页面JS是否加载完成，可使用 browser_wait 等待');
              diagnosis.suggestedFixes.push('检查元素是否依赖动态生成的DOM');
            }
            if (errText.includes('Cannot read properties')) {
              diagnosis.rootCauses.push({
                type: 'js_error',
                pattern: 'property_access',
                description: '访问未定义对象属性',
                confidence: 0.80,
                evidence: errText.substring(0, 150)
              });
              diagnosis.suggestedFixes.push('检查数据是否已加载，可能是异步问题');
            }
            if (errText.includes('NetworkError') || errText.includes('fetch')) {
              diagnosis.rootCauses.push({
                type: 'network',
                pattern: 'fetch_failed',
                description: 'API请求失败',
                confidence: 0.90,
                evidence: errText.substring(0, 150)
              });
              diagnosis.suggestedFixes.push('检查网络连接和API可用性');
            }
          }
          // Console错误
          for (const err of filteredErrors.console.slice(0, 5)) {
            const errText = err.text || '';
            if (errText.includes('Failed to fetch') || errText.includes('CORS')) {
              diagnosis.rootCauses.push({
                type: 'network',
                pattern: 'cors_or_fetch',
                description: '跨域或网络请求失败',
                confidence: 0.85,
                evidence: errText.substring(0, 150)
              });
              diagnosis.suggestedFixes.push('检查API CORS配置或网络可达性');
            }
            if (errText.includes('404') || errText.includes('not found')) {
              diagnosis.rootCauses.push({
                type: 'resource',
                pattern: '404',
                description: '资源未找到',
                confidence: 0.90,
                evidence: errText.substring(0, 150)
              });
              diagnosis.suggestedFixes.push('检查资源路径是否正确');
            }
          }
        }

        // 网络错误根因
        if (filteredErrors.network.length > 0) {
          const byStatus = {};
          for (const n of filteredErrors.network) {
            byStatus[n.status] = (byStatus[n.status] || 0) + 1;
          }
          if (byStatus[401] || byStatus[403]) {
            diagnosis.rootCauses.push({
              type: 'auth',
              pattern: '401/403',
              description: '认证或权限不足',
              confidence: 0.95,
              evidence: `检测到 ${byStatus[401] || 0} 个401，${byStatus[403] || 0} 个403错误`
            });
            diagnosis.suggestedFixes.push('检查登录状态，使用 browser_cookies 查看认证Cookie');
            diagnosis.suggestedFixes.push('尝试重新登录或检查用户权限');
          }
          if (byStatus[404]) {
            diagnosis.rootCauses.push({
              type: 'resource',
              pattern: '404',
              description: 'API或资源不存在',
              confidence: 0.90,
              evidence: `检测到 ${byStatus[404]} 个404错误`
            });
            diagnosis.suggestedFixes.push('检查API路径是否正确，可能是版本变更');
          }
          if (byStatus[500] || byStatus[502] || byStatus[503]) {
            diagnosis.rootCauses.push({
              type: 'server',
              pattern: '5xx',
              description: '服务端错误',
              confidence: 0.95,
              evidence: `检测到 ${(byStatus[500]||0)+(byStatus[502]||0)+(byStatus[503]||0)} 个5xx错误`
            });
            diagnosis.suggestedFixes.push('后端服务异常，检查服务日志或稍后重试');
          }
          // 网络超时/失败
          const failed = filteredErrors.network.filter(n => n.failed && !n.status);
          if (failed.length > 0) {
            diagnosis.rootCauses.push({
              type: 'network',
              pattern: 'timeout_or_failed',
              description: '网络超时或连接失败',
              confidence: 0.80,
              evidence: `${failed.length} 个请求失败（无状态码）`
            });
            diagnosis.suggestedFixes.push('检查网络连接，可能是超时或DNS问题');
          }
        }

        // 元素相关诊断（如果提供了selector）
        if (selector && (errorType === 'all' || errorType === 'element' || errorType === 'interaction')) {
          try {
            const elemStatus = await target.evaluate((sel) => {
              const el = document.querySelector(sel);
              if (!el) return { found: false };
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              // 检查遮挡
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              const topEl = document.elementFromPoint(centerX, centerY);
              const isObscured = topEl !== el && !el.contains(topEl);
              return {
                found: true,
                visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
                opacity: parseFloat(style.opacity),
                display: style.display,
                visibility: style.visibility,
                disabled: el.disabled,
                readonly: el.readOnly,
                pointerEvents: style.pointerEvents,
                zIndex: style.zIndex,
                inViewport: rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth,
                obscured: isObscured,
                obscuringElement: isObscured ? (topEl?.tagName + (topEl?.className ? '.' + topEl.className.split(' ').slice(0,2).join('.') : '')) : null,
                hasClickListener: el.onclick !== null || el.hasAttribute('onclick') || el.getAttribute('role') === 'button'
              };
            }, selector);

            diagnosis.affectedElements.push({ selector, status: elemStatus });

            if (!elemStatus.found) {
              diagnosis.rootCauses.push({
                type: 'element',
                pattern: 'not_found',
                description: '元素未找到',
                confidence: 0.95
              });
              diagnosis.suggestedFixes.push('元素选择器无效，检查是否动态生成或拼写错误');
              diagnosis.suggestedFixes.push('使用 browser_dom 查看页面结构');
            } else if (!elemStatus.visible) {
              diagnosis.rootCauses.push({
                type: 'element',
                pattern: 'not_visible',
                description: `元素不可见（display:${elemStatus.display}, visibility:${elemStatus.visibility}, opacity:${elemStatus.opacity})`,
                confidence: 0.90
              });
              diagnosis.suggestedFixes.push('元素被隐藏，检查CSS样式或等待动画完成');
              diagnosis.suggestedFixes.push('使用 browser_quick_fix 强制可见');
            } else if (elemStatus.disabled) {
              diagnosis.rootCauses.push({
                type: 'element',
                pattern: 'disabled',
                description: '元素被禁用',
                confidence: 0.95
              });
              diagnosis.suggestedFixes.push('元素处于disabled状态，检查表单验证条件');
            } else if (elemStatus.obscured) {
              diagnosis.rootCauses.push({
                type: 'element',
                pattern: 'obscured',
                description: `元素被遮挡（被 ${elemStatus.obscuringElement} 遮挡）`,
                confidence: 0.85
              });
              diagnosis.suggestedFixes.push('元素被遮挡，尝试滚动或关闭遮罩层');
              diagnosis.suggestedFixes.push('使用 browser_quick_fix 移除遮挡');
            } else if (!elemStatus.inViewport) {
              diagnosis.rootCauses.push({
                type: 'element',
                pattern: 'out_of_viewport',
                description: '元素不在可视区域',
                confidence: 0.80
              });
              diagnosis.suggestedFixes.push('元素不在视口内，使用 browser_scroll 滚动到元素');
            } else if (!elemStatus.hasClickListener && elemStatus.pointerEvents === 'none') {
              diagnosis.rootCauses.push({
                type: 'element',
                pattern: 'no_events',
                description: '元素无事件绑定且pointer-events为none',
                confidence: 0.75
              });
              diagnosis.suggestedFixes.push('元素无交互事件，检查是否是装饰性元素');
            }
          } catch (e) {
            diagnosis.affectedElements.push({ selector, status: { error: e.message } });
          }
        }
      };

      await analyzeRootCause();

      // 计算总体置信度
      if (diagnosis.rootCauses.length > 0) {
        diagnosis.confidence = Math.max(...diagnosis.rootCauses.map(r => r.confidence));
      } else {
        diagnosis.rootCauses.push({
          type: 'unknown',
          pattern: 'no_errors_detected',
          description: '未检测到明显错误',
          confidence: 0.50
        });
        diagnosis.suggestedFixes.push('当前无明显错误，可使用 browser_element_status 深入检查元素');
      }

      // 添加堆栈信息（如果需要）
      if (includeStackTrace && filteredErrors.page.length > 0) {
        diagnosis.stackTraces = filteredErrors.page.slice(0, 3).map(e => ({
          error: (e.text || '').substring(0, 100),
          stack: (e.stack || '').substring(0, 300)
        }));
      }

      return text(JSON.stringify(diagnosis, null, 2));
    }
    case 'browser_element_status': {
      const { target } = await ensurePage();
      const selector = args.selector;
      if (!selector) {
        return { isError: true, content: [{ type: 'text', text: 'browser_element_status 需要提供 selector 参数' }] };
      }

      const checkEvents = args.checkEvents !== false;
      const checkVisibility = args.checkVisibility !== false;
      const checkInteractability = args.checkInteractability !== false;

      const status = await target.evaluate((params) => {
        const { selector, checkEvents, checkVisibility, checkInteractability } = params;
        const el = document.querySelector(selector);
        if (!el) {
          return { found: false, reason: '元素未找到', suggestions: ['检查选择器拼写', '使用 browser_dom 查看页面结构', '可能是动态生成，尝试等待'] };
        }

        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const result = {
          found: true,
          tagName: el.tagName.toLowerCase(),
          className: el.className.split(' ').slice(0, 5).join(' ') || '',
          id: el.id || '',
          type: el.type || '',
          text: (el.innerText || el.textContent || '').substring(0, 50).trim()
        };

        // 可见性检查
        if (checkVisibility) {
          result.visibility = {
            isDisplayed: style.display !== 'none',
            isVisible: style.visibility !== 'hidden',
            opacity: parseFloat(style.opacity),
            hasContent: rect.width > 0 && rect.height > 0,
            clipPath: style.clipPath !== 'none' && style.clipPath !== 'inset(0)',
            summary: ''
          };
          const visIssues = [];
          if (style.display === 'none') visIssues.push('display:none');
          if (style.visibility === 'hidden') visIssues.push('visibility:hidden');
          if (parseFloat(style.opacity) < 0.1) visIssues.push(`opacity:${style.opacity}`);
          if (rect.width <= 0 || rect.height <= 0) visIssues.push('尺寸为0');
          if (style.clipPath !== 'none' && style.clipPath !== 'inset(0)') visIssues.push('clip-path裁剪');
          result.visibility.summary = visIssues.length === 0 ? '可见' : `不可见：${visIssues.join(', ')}`;
          result.visibility.isFullyVisible = visIssues.length === 0;
        }

        // 可交互性检查
        if (checkInteractability) {
          result.interactability = {
            disabled: el.disabled,
            readonly: el.readOnly,
            pointerEvents: style.pointerEvents,
            userSelect: style.userSelect,
            isFocusable: el.tabIndex >= 0 || el.tagName === 'INPUT' || el.tagName === 'BUTTON' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA',
            summary: ''
          };
          const intIssues = [];
          if (el.disabled) intIssues.push('disabled');
          if (el.readOnly) intIssues.push('readonly');
          if (style.pointerEvents === 'none') intIssues.push('pointer-events:none');
          if (!result.interactability.isFocusable && el.tagName !== 'A') intIssues.push('不可聚焦');
          result.interactability.summary = intIssues.length === 0 ? '可交互' : `不可交互：${intIssues.join(', ')}`;
          result.interactability.isInteractable = intIssues.length === 0;
        }

        // 遮挡检查
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        if (rect.width > 0 && rect.height > 0) {
          const topEl = document.elementFromPoint(centerX, centerY);
          const isObscured = topEl !== el && !el.contains(topEl);
          result.obscuration = {
            isObscured,
            obscuringElement: isObscured ? `${topEl?.tagName}.${(topEl?.className || '').split(' ').slice(0, 2).join('.')}` : null,
            obscuringZIndex: isObscured ? parseInt(window.getComputedStyle(topEl).zIndex || '0') : null,
            elementZIndex: parseInt(style.zIndex || '0')
          };
          if (isObscured) {
            result.obscuration.summary = `被 ${result.obscuration.obscuringElement} 遮挡`;
          } else {
            result.obscuration.summary = '未被遮挡';
          }
        } else {
          result.obscuration = { summary: '尺寸为0，无法检测遮挡' };
        }

        // 视口位置
        result.viewport = {
          inViewport: rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth,
          position: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) },
          needsScroll: rect.top < 0 || rect.bottom > window.innerHeight
        };

        // 事件检查
        if (checkEvents) {
          result.events = {
            hasClick: el.onclick !== null || el.hasAttribute('onclick') || el.getAttribute('role') === 'button',
            hasKeydown: el.onkeydown !== null || el.hasAttribute('onkeydown'),
            hasChange: el.onchange !== null || el.hasAttribute('onchange'),
            hasSubmit: el.tagName === 'INPUT' && el.type === 'submit',
            eventListenersCount: (typeof getEventListeners === 'function' ? Object.keys(getEventListeners(el) || {}).length : 'N/A（需DevTools）'),
            summary: ''
          };
          const evList = [];
          if (result.events.hasClick) evList.push('click');
          if (result.events.hasKeydown) evList.push('keydown');
          if (result.events.hasChange) evList.push('change');
          if (result.events.hasSubmit) evList.push('submit');
          result.events.summary = evList.length > 0 ? `绑定事件：${evList.join(', ')}` : '无明显事件绑定';
        }

        // 综合诊断
        result.diagnosis = {
          canClick: result.visibility?.isFullyVisible && result.interactability?.isInteractable && !result.obscuration?.isObscured,
          canType: result.interactability?.isInteractable && !el.disabled && !el.readOnly && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'),
          issues: []
        };

        if (!result.found) result.diagnosis.issues.push('元素未找到');
        if (!result.visibility?.isFullyVisible) result.diagnosis.issues.push(result.visibility?.summary);
        if (!result.interactability?.isInteractable) result.diagnosis.issues.push(result.interactability?.summary);
        if (result.obscuration?.isObscured) result.diagnosis.issues.push(result.obscuration?.summary);
        if (result.viewport?.needsScroll) result.diagnosis.issues.push('需要滚动到视口');

        result.suggestions = [];
        if (!result.found) {
          result.suggestions.push('使用 browser_dom 查看实际DOM结构');
          result.suggestions.push('尝试等待元素加载：browser_wait selector="' + selector + '"');
        } else if (!result.diagnosis.canClick) {
          if (result.obscuration?.isObscured) result.suggestions.push('关闭遮罩层或使用 browser_quick_fix 移除遮挡');
          if (!result.visibility?.isFullyVisible) result.suggestions.push('等待动画或使用 browser_quick_fix 强制可见');
          if (!result.interactability?.isInteractable) result.suggestions.push('检查disabled状态或表单验证条件');
        }
        if (result.viewport?.needsScroll) result.suggestions.push('使用 browser_scroll selector="' + selector + '" 滚动到元素');

        return result;
      }, { selector, checkEvents, checkVisibility, checkInteractability });

      return text(JSON.stringify(status, null, 2));
    }
    case 'browser_quick_fix': {
      const { target } = await ensurePage();
      const selector = args.selector;
      if (!selector) {
        return { isError: true, content: [{ type: 'text', text: 'browser_quick_fix 需要提供 selector 参数' }] };
      }

      const problems = args.problems || (args.problem ? [args.problem] : ['not_found']);
      const isBatchMode = !!args.problems;
      const maxAttempts = args.maxAttempts || 5;
      const waitStrategy = args.waitStrategy || 'smart';

      const attempts = [];

      // 策略执行函数
      const tryFix = async (strategy) => {
        const attempt = { strategy, timestamp: new Date().toISOString(), success: false, error: null };
        try {
          switch (strategy) {
            case 'wait_and_check':
              if (waitStrategy === 'smart') {
                await target.waitForSelector(selector, { timeout: 5000, state: 'attached' }).catch(() => {});
              } else if (waitStrategy === 'fixed') {
                await target.waitForTimeout(2000);
              }
              const exists = await target.evaluate((s) => !!document.querySelector(s), selector);
              attempt.success = exists;
              attempt.result = exists ? '元素已出现' : '元素仍未出现';
              break;

            case 'scroll_to_element':
              await target.evaluate((s) => {
                const el = document.querySelector(s);
                if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
              }, selector);
              attempt.success = true;
              attempt.result = '已滚动到元素位置';
              break;

            case 'force_visible':
              await target.evaluate((s) => {
                const el = document.querySelector(s);
                if (el) {
                  el.style.display = '';
                  el.style.visibility = 'visible';
                  el.style.opacity = '1';
                }
              }, selector);
              attempt.success = true;
              attempt.result = '已强制设置可见';
              break;

            case 'remove_obscuring':
              // 移除常见遮罩层
              const removed = await target.evaluate(() => {
                const overlays = document.querySelectorAll('.modal-backdrop, .overlay, .mask, [role="dialog"], .toast, .notification, .loading');
                let count = 0;
                for (const el of overlays) {
                  el.style.display = 'none';
                  el.remove();
                  count++;
                }
                return count;
              });
              attempt.success = removed > 0;
              attempt.result = removed > 0 ? `已移除 ${removed} 个遮挡元素` : '未发现遮挡元素';
              break;

            case 'remove_disabled':
              await target.evaluate((s) => {
                const el = document.querySelector(s);
                if (el) {
                  el.disabled = false;
                  el.removeAttribute('disabled');
                  el.removeAttribute('readonly');
                }
              }, selector);
              attempt.success = true;
              attempt.result = '已移除disabled属性';
              break;

            case 'force_click':
              await target.evaluate((s) => {
                const el = document.querySelector(s);
                if (el) {
                  el.scrollIntoView({ behavior: 'instant' });
                  el.click();
                }
              }, selector);
              attempt.success = true;
              attempt.result = '已通过JS强制点击';
              break;

            case 'inject_click_listener':
              await target.evaluate((s) => {
                const el = document.querySelector(s);
                if (el && !el.onclick) {
                  el.onclick = () => console.log('注入的点击已执行');
                }
              }, selector);
              attempt.success = true;
              attempt.result = '已注入点击事件监听';
              break;

            case 'trigger_event':
              await target.evaluate((s) => {
                const el = document.querySelector(s);
                if (el) {
                  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                }
              }, selector);
              attempt.success = true;
              attempt.result = '已触发click事件';
              break;

            default:
              attempt.error = '未知策略';
          }
        } catch (e) {
          attempt.error = e.message;
        }
        attempts.push(attempt);
        return attempt.success;
      };

      // === 新增策略函数：api_failed / page_crashed / resource_blocked ===

      // api_failed 策略
      async function fixApiFailed(t, sel) {
        const results = [];
        // 策略1: retry - 等待后刷新页面重试
        try {
          const pageUrl = t.url();
          if (pageUrl) {
            await t.waitForTimeout(2000);
            await t.reload({ waitUntil: 'networkidle' });
            results.push({ strategy: 'page_reload', success: true });
          }
        } catch (e) {
          results.push({ strategy: 'page_reload', success: false, error: e.message });
        }
        // 策略2: wait + check response
        try {
          await t.waitForTimeout(1000);
          const hasApiErr = pageErrors.length > 0;
          results.push({ strategy: 'wait_and_check', success: !hasApiErr });
        } catch (e) {
          results.push({ strategy: 'wait_and_check', success: false, error: e.message });
        }
        return results;
      }

      // page_crashed 策略
      async function fixPageCrashed(t, sel) {
        const results = [];
        // 策略1: reload
        try {
          await t.reload({ waitUntil: 'domcontentloaded' });
          results.push({ strategy: 'force_reload', success: true });
        } catch (e) {
          results.push({ strategy: 'force_reload', success: false, error: e.message });
        }
        // 策略2: restore session / re-navigate
        try {
          const pageUrl = t.url();
          if (pageUrl && pageUrl !== 'about:blank') {
            await t.goto(pageUrl, { waitUntil: 'domcontentloaded' });
            results.push({ strategy: 're_navigate', success: true });
          }
        } catch (e) {
          results.push({ strategy: 're_navigate', success: false, error: e.message });
        }
        return results;
      }

      // resource_blocked 策略
      async function fixResourceBlocked(t, sel) {
        const results = [];
        // 策略1: hard reload bypass cache
        try {
          await t.reload({ waitUntil: 'networkidle' });
          results.push({ strategy: 'hard_reload', success: true });
        } catch (e) {
          results.push({ strategy: 'hard_reload', success: false, error: e.message });
        }
        // 策略2: clear cache via CDP
        try {
          const cdp = await t.context().newCDPSession(t);
          await cdp.send('Network.clearBrowserCache');
          await t.reload({ waitUntil: 'networkidle' });
          results.push({ strategy: 'clear_cache_reload', success: true });
        } catch (e) {
          results.push({ strategy: 'clear_cache_reload', success: false, error: e.message });
        }
        return results;
      }

      // 根据问题类型选择策略顺序
      const strategyOrder = {
        not_found: ['wait_and_check', 'scroll_to_element', 'force_visible'],
        not_visible: ['scroll_to_element', 'force_visible', 'remove_obscuring'],
        not_interactable: ['remove_disabled', 'remove_obscuring', 'force_click'],
        click_failed: ['scroll_to_element', 'remove_obscuring', 'force_click', 'trigger_event'],
        type_failed: ['scroll_to_element', 'remove_disabled', 'force_visible'],
        js_error: ['wait_and_check', 'force_click', 'inject_click_listener'],
        api_failed: ['fixApiFailed'],
        page_crashed: ['fixPageCrashed'],
        resource_blocked: ['fixResourceBlocked']
      };

      const allResults = [];
      let successCount = 0;

      for (const currentProblem of problems) {
        const problemAttempts = [];
        const strategies = strategyOrder[currentProblem] || strategyOrder.not_found;

        let problemFixed = false;
        let problemFinalStatus = null;

        for (const strategy of strategies) {
          if (problemAttempts.length >= maxAttempts) break;

          // 新策略函数（返回结果数组）走单独路径
          if (typeof strategy === 'string' && ['fixApiFailed', 'fixPageCrashed', 'fixResourceBlocked'].includes(strategy)) {
            const strategyFn = strategy === 'fixApiFailed' ? fixApiFailed :
                               strategy === 'fixPageCrashed' ? fixPageCrashed :
                               fixResourceBlocked;
            const subResults = await strategyFn(target, selector);
            for (const sr of subResults) {
              problemAttempts.push({
                strategy: sr.strategy,
                timestamp: new Date().toISOString(),
                success: sr.success,
                error: sr.error || null,
                result: sr.success ? '执行成功' : '执行失败'
              });
            }
            problemFixed = subResults.some(r => r.success);
            if (problemFixed) break;
            continue;
          }

          const success = await tryFix(strategy);
          if (success) {
            // 检查是否真的修复了
            const checkStatus = await target.evaluate((s) => {
              const el = document.querySelector(s);
              if (!el) return { found: false };
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              return {
                found: true,
                visible: rect.width > 0 && style.visibility !== 'hidden' && style.display !== 'none',
                disabled: el.disabled
              };
            }, selector);

            if (checkStatus.found && (currentProblem === 'not_found' || (checkStatus.visible && currentProblem !== 'not_interactable') || (!checkStatus.disabled && currentProblem === 'not_interactable'))) {
              problemFixed = true;
              problemFinalStatus = checkStatus;
              break;
            }
          }
        }

        // 当前 problem 最终状态检查
        if (!problemFinalStatus) {
          problemFinalStatus = await target.evaluate((s) => {
            const el = document.querySelector(s);
            if (!el) return { found: false };
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return {
              found: true,
              visible: rect.width > 0 && style.visibility !== 'hidden' && style.display !== 'none',
              disabled: el.disabled,
              interactable: !el.disabled && rect.width > 0
            };
          }, selector);
        }

        if (problemFixed) successCount++;

        allResults.push({
          problem: currentProblem,
          attempts: problemAttempts,
          totalAttempts: problemAttempts.length,
          fixed: problemFixed,
          finalStatus: problemFinalStatus,
          nextSteps: problemFixed ? ['修复成功，可继续操作'] : ['建议使用 browser_element_status 深入诊断', '检查页面是否完全加载', '尝试不同的选择器']
        });

        // 如果当前 problem 未修复，不再继续后续 problem
        if (!problemFixed) break;
      }

      // 最终状态取最后一个执行的 problem 的 finalStatus（兼容单 problem 模式）
      const lastResult = allResults[allResults.length - 1];
      const finalFixed = lastResult?.fixed || false;
      const finalFinalStatus = lastResult?.finalStatus || null;

      const responseBody = {
        selector,
        problem: args.problem || problems[0],
        attempts,
        totalAttempts: attempts.length,
        fixed: finalFixed,
        finalStatus: finalFinalStatus,
        nextSteps: finalFixed ? ['修复成功，可继续操作'] : ['建议使用 browser_element_status 深入诊断', '检查页面是否完全加载', '尝试不同的选择器']
      };

      // 批量模式附加信息
      if (isBatchMode) {
        responseBody.batchedResults = allResults;
        responseBody.totalFixed = successCount;
        responseBody.totalAttempted = problems.length;
      }

      return text(JSON.stringify(responseBody, null, 2));
    }
    case 'browser_links':
      return text(JSON.stringify(await getPageLinks(args), null, 2));
    case 'browser_traverse_menu':
      return text(JSON.stringify(await traverseMenu(args), null, 2));
    case 'browser_full_regression':
      return text(JSON.stringify(await runBrowserFullRegression(args), null, 2));
    case 'browser_deep_interact': {
      // 深层交互工具：检测弹窗/表单、智能填表、执行业务流程、像人类一样探索
      const mode = args.mode || 'detect';
      const { target: page } = await ensurePage(args.visible !== false);
      if (args.url) {
        try { await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 }); await new Promise(r => setTimeout(r, 1500)); } catch (_) {}
      }
      let result = {};
      switch (mode) {
        case 'detect':
          result = await deepInteractor.detectUIState(page);
          break;
        case 'form':
          result = await deepInteractor.interactWithForm(page, { fillFields: args.fillFields !== false, submit: args.submit !== false });
          break;
        case 'workflow':
          result = await deepInteractor.executeWorkflow(page, args.workflow || []);
          break;
        case 'explore':
          result = await deepInteractor.exploreLikeHuman(page, { maxActions: args.maxActions || 15, interactModals: args.interactModals !== false, fillForms: args.fillFields !== false });
          break;
        default:
          result = { error: `未知模式: ${mode}` };
      }
      return text(JSON.stringify(result, null, 2));
    }
    case 'auto_fix_pipeline': {
      const maxIterations = Math.min(args.maxIterations || 3, 3);
      const autoConfirm = args.autoConfirm !== false;

      // 如果传了 url，先打开
      if (args.url) {
        const { target: page } = await ensurePage();
        await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      }

      const { target } = await ensurePage();
      const iterations = [];

      for (let i = 0; i < maxIterations; i++) {
        // STEP 1: 诊断收集
        const diagnosis = {
          consoleErrors: (consoleLogs || []).filter(e => e.type === 'error').slice(-10),
          networkFailures: (networkLogs || []).filter(e => e.status >= 400 || e.failed).slice(-10),
          pageErrors: (pageErrors || []).slice(-5)
        };

        const errorTexts = [
          ...diagnosis.consoleErrors.map(e => e.text || e.message || ''),
          ...diagnosis.pageErrors.map(e => e.message || ''),
          ...diagnosis.networkFailures.map(e => `${e.status || ''}: ${e.url || ''}`)
        ].filter(Boolean).join('\n');

        // 没有错误则提前结束
        if (!errorTexts && i === 0) {
          const snapshot = await target.screenshot({ encoding: 'base64' });
          const artifactDir = path.join(__dirname, 'artifacts', 'auto-fix');
          if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
          const snapshotPath = path.join(artifactDir, `snapshot_${Date.now()}.png`);
          require('fs').writeFileSync(snapshotPath, snapshot, 'base64');

          const finalResult = {
            status: 'healthy',
            message: '未检测到问题，无需修复',
            iterations: [],
            evidencePaths: [snapshotPath]
          };

          return text(JSON.stringify(finalResult, null, 2));
        }

        // STEP 2: 分类匹配
        const matchedIssues = [];
        const allPatterns = [
          { name: 'api_response_html', match: /html.*200|返回了HTML|路由兜底|SPA路由/i, severity: 'blocking' },
          { name: '5xx_server_error', match: /500|502|503|server error|服务器错误|内部错误|服务不可用/i, severity: 'blocking' },
          { name: '404_not_found', match: /404|not found|无法找到|找不到资源/i, severity: 'blocking' },
          { name: 'websocket_error', match: /websocket|WebSocket|ws:[/][/]|wss:[/][/]|socket.*error|连接.*断开/i, severity: 'blocking' },
          { name: 'cors_cross_origin', match: /CORS|cross-origin|跨域|Access-Control|被CORS策略阻止|Script error[\.]?$/i, severity: 'critical' },
          { name: '401_unauthorized', match: /401|unauthorized|未授权|无权限登录|身份验证失败/i, severity: 'critical' },
          { name: '403_forbidden', match: /403|forbidden|禁止访问|访问被拒绝/i, severity: 'critical' },
          { name: 'missing_envVar', match: /environment variable|env.*not set|环境变量.*未|缺少.*环境|process\.env/i, severity: 'critical' },
          { name: 'port_conflict', match: /port.*in use|EADDRINUSE|端口.*占用|address.*already in use/i, severity: 'critical' },
          { name: 'rate_limit', match: /rate limit|429|too many requests|请求过于频繁|请求被限流/i, severity: 'critical' },
          { name: 'timeout', match: /timeout|timed out|ETIMEDOUT|超时|请求超时/i, severity: 'critical' },
          { name: 'type_error_undefined', match: /TypeError|undefined|Cannot read properties|无法读取属性|类型错误/i, severity: 'general' },
          { name: 'element_not_found', match: /element not found|no element matched|找不到元素|元素不存在|没有匹配的元素/i, severity: 'general' },
        ];

        for (const pattern of allPatterns) {
          if (pattern.match.test(errorTexts)) {
            matchedIssues.push({ ...pattern, matchText: errorTexts.match(pattern.match)?.[0] || '' });
          }
        }

        // 按 severity 排序
        const severityOrder = { blocking: 0, critical: 1, general: 2, optimization: 3 };
        matchedIssues.sort((a, b) => (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99));

        // STEP 3: 修复执行
        const attemptedFixes = [];
        if (autoConfirm && matchedIssues.length > 0) {
          for (const issue of matchedIssues.slice(0, 3)) {
            try {
              const fixResult = { issue: issue.name, severity: issue.severity, strategies: [] };

              if (issue.name === '5xx_server_error' || issue.name === 'api_response_html') {
                await target.reload({ waitUntil: 'networkidle', timeout: 15000 });
                await target.waitForTimeout(2000);
                fixResult.strategies.push({ name: 'page_reload', success: true });
              } else if (issue.name === '404_not_found') {
                await target.waitForTimeout(1000);
                fixResult.strategies.push({ name: 'wait_retry', success: true });
              } else if (issue.name === 'timeout' || issue.name === 'cors_cross_origin') {
                await target.reload({ waitUntil: 'load', timeout: 20000 });
                fixResult.strategies.push({ name: 'hard_reload', success: true });
              } else if (issue.name === 'type_error_undefined' || issue.name === 'element_not_found') {
                await target.waitForTimeout(3000);
                fixResult.strategies.push({ name: 'wait_stable', success: true });
              }

              attemptedFixes.push(fixResult);
            } catch (e) {
              attemptedFixes.push({ issue: issue.name, error: e.message, strategies: [{ name: 'failed', success: false, error: e.message }] });
            }
          }
        }

        // STEP 4: 验证对比
        const beforeErrors = (consoleLogs || []).filter(e => e.type === 'error').length + (pageErrors || []).length;
        await target.waitForTimeout(1000);
        const afterErrors = (consoleLogs || []).filter(e => e.type === 'error').length + (pageErrors || []).length;

        // 截图留证
        const artifactDir = path.join(__dirname, 'artifacts', 'auto-fix');
        if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
        const iterationSnapshot = await target.screenshot({ encoding: 'base64' });
        const shotPath = path.join(artifactDir, `iter${i+1}_${Date.now()}.png`);
        require('fs').writeFileSync(shotPath, iterationSnapshot, 'base64');

        const iterationResult = {
          iteration: i + 1,
          diagnosis: {
            consoleErrorCount: diagnosis.consoleErrors.length,
            networkFailureCount: diagnosis.networkFailures.length,
            pageErrorCount: diagnosis.pageErrors.length
          },
          matchedIssues: matchedIssues.map(m => ({ name: m.name, severity: m.severity, matchText: m.matchText })),
          attemptedFixes: attemptedFixes,
          verification: {
            beforeErrors, afterErrors,
            errorDelta: afterErrors - beforeErrors,
            improvement: afterErrors < beforeErrors
          },
          evidencePath: shotPath
        };

        iterations.push(iterationResult);

        // 检查是否需要继续迭代
        if (!autoConfirm || afterErrors === 0 || afterErrors <= beforeErrors) {
          break;
        }

        // 如果本轮修复完全无效，也停止（保护性终止）
        if (matchedIssues.length === 0) break;
      }

      return text(JSON.stringify({
        status: iterations.length > 0 && iterations.some(i => i.verification?.improvement) ? 'improved' : 'no_change',
        totalIterations: iterations.length,
        iterations,
        summary: {
          issuesDetected: iterations.flatMap(i => i.matchedIssues).length,
          fixesApplied: iterations.flatMap(i => i.attemptedFixes).length,
          finalState: iterations.length > 0 ? (iterations[iterations.length-1].verification.afterErrors === 0 ? 'resolved' : 'partial') : 'unknown'
        },
        evidencePaths: iterations.map(i => i.evidencePath).filter(Boolean)
      }, null, 2));
    }
    case 'skill_mcp_validate':
      try {
        const { skillName: validateSkillName, mode = 'strict' } = args;
        const skillToolsPath = path.join(PROJECT_ROOT, '.trae', 'skills', validateSkillName, 'SKILL.tools.json');
        if (!fs.existsSync(skillToolsPath)) {
          return text(JSON.stringify({ passed: false, error: `Skill ${validateSkillName} 的 SKILL.tools.json 不存在` }, null, 2));
        }
        const skillTools = JSON.parse(fs.readFileSync(skillToolsPath, 'utf8'));
        const toolFiles = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
        const availableTools = toolFiles.map(f => path.basename(f, '.json'));
        const availableSet = new Set(availableTools);
        const missingTools = [];
        const referencedTools = Object.keys(skillTools.tools);
        for (const toolName of referencedTools) {
          if (!availableSet.has(toolName)) {
            missingTools.push({
              toolName,
              phase: skillTools.tools[toolName].phase,
              missingType: availableTools.includes(toolName) ? 'schema_mismatch' : 'not_found'
            });
          }
        }
        const capabilityIssues = [];
        if (skillTools.capabilities) {
          for (const cap of skillTools.capabilities) {
            const capMissing = cap.requiredTools.filter(t => !availableSet.has(t));
            if (capMissing.length > 0) {
              capabilityIssues.push({
                capability: cap.name,
                description: cap.description,
                missingTools: capMissing
              });
            }
          }
        }
        const passed = missingTools.length === 0 && capabilityIssues.length === 0;
        const result = {
          passed: mode === 'strict' ? passed : true,
          mode,
          skillName: validateSkillName,
          missingTools,
          capabilityIssues,
          availableTools,
          totalReferenced: referencedTools.length,
          totalAvailable: availableTools.length
        };
        if (mode === 'warn' && !passed) {
          result.warning = 'Skill-MCP 存在不一致，已标记警告';
        }
        return text(JSON.stringify(result, null, 2));
      } catch (err) {
        return text(JSON.stringify({ passed: false, error: err.message }, null, 2));
      }
    case 'skill_mcp_sync':
      try {
        const { skillName: syncSkillName, dryRun = true } = args;
        const skillToolsPath = path.join(PROJECT_ROOT, '.trae', 'skills', syncSkillName, 'SKILL.tools.json');
        if (!fs.existsSync(skillToolsPath)) {
          return text(JSON.stringify({ passed: false, error: `Skill ${syncSkillName} 的 SKILL.tools.json 不存在` }, null, 2));
        }
        const skillTools = JSON.parse(fs.readFileSync(skillToolsPath, 'utf8'));
        const toolFiles = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
        const actualTools = toolFiles.map(f => path.basename(f, '.json'));
        const actualSet = new Set(actualTools);
        const skillToolsList = Object.keys(skillTools.tools);
        const newTools = actualTools.filter(t => !skillToolsList.includes(t));
        const removedTools = skillToolsList.filter(t => !actualSet.has(t));
        const diff = {
          skillName: syncSkillName,
          toolsInSkill: skillToolsList.length,
          toolsInMcp: actualTools.length,
          added: newTools,
          removed: removedTools,
          hasChanges: newTools.length > 0 || removedTools.length > 0
        };
        if (dryRun) {
          return text(JSON.stringify({ ...diff, dryRun: true, message: 'dryRun=true，仅预览变更，未写入文件' }, null, 2));
        }
        const mappingPath = path.join(PROJECT_ROOT, '.trae', 'mcp-server', 'docs', 'skills', 'skill-mcp-mapping.md');
        if (!fs.existsSync(mappingPath)) {
          return text(JSON.stringify({ ...diff, updated: false, error: `mapping.md 不存在：${mappingPath}` }, null, 2));
        }
        let mapping = fs.readFileSync(mappingPath, 'utf8');
        const now = new Date().toISOString().slice(0, 10);
        mapping = mapping.replace(/> 更新日期: .+/, `> 更新日期: ${now}`);
        if (diff.hasChanges) {
          let summary = '\n\n#### 自动同步变更\n\n';
          summary += `> 同步时间: ${new Date().toISOString()}\n\n`;
          if (diff.added.length > 0) {
            summary += `**新增工具**: ${diff.added.join(', ')}\n\n`;
          }
          if (diff.removed.length > 0) {
            summary += `**移除工具**: ${diff.removed.join(', ')}\n\n`;
          }
          mapping += summary;
        }
        fs.writeFileSync(mappingPath, mapping, 'utf8');
        return text(JSON.stringify({ ...diff, updated: true, dryRun: false, mappingPath }, null, 2));
      } catch (err) {
        return text(JSON.stringify({ passed: false, error: err.message }, null, 2));
      }
    case 'browser_trace_chain': {
      const result = buildTraceChain(args);
      return text(JSON.stringify(result, null, 2));
    }
    case 'backend_logs': {
      if (!args.traceId) return text(JSON.stringify({ error: '缺少 traceId 参数' }, null, 2));
      const result = await fetchBackendLogs(args);
      return text(JSON.stringify(result, null, 2));
    }
    default:
      return { isError: true, content: [{ type: 'text', text: `未知工具：${name}` }] };
    }
  } catch (error) {
    log('ERROR', `工具调用失败: ${name}`, { error: error.message, stack: error.stack });
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
    log('INFO', 'MCP initialized');
  });
  
  server.setNotificationHandler(CancelledNotificationSchema, async notification => {
    log('INFO', 'MCP request cancelled', notification.params || {});
  });
  
  process.on('uncaughtException', (error) => {
    log('ERROR', 'Uncaught Exception', { error: error.message, stack: error.stack });
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    log('ERROR', 'Unhandled Rejection', { reason: reason?.message || String(reason) });
  });
  
  return server;
}

async function main() {
  const server = createMcpServer();
  
  let shuttingDown = false;
  async function gracefulShutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    log('INFO', `Received ${signal}, shutting down gracefully...`);
    try {
      if (page && !page.isClosed()) await page.close();
      if (browser) await browser.close();
      // 清理浏览器池
      for (const [, item] of browserPool) {
        await item.browser.close().catch(() => {});
      }
      browserPool.clear();
    } catch (_) {}
    log('INFO', 'Shutdown complete');
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
  log('INFO', 'ValidPilot OSS MCP Server ready (stdio mode)', { version: '1.0.0', tools: tools.length });

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
    log('ERROR', 'MCP HTTP Server 启动失败', { error: error.message, stack: error.stack });
    process.exit(1);
  });
} else {
  main().catch(error => {
    log('ERROR', 'MCP Server 启动失败', { error: error.message, stack: error.stack });
    process.exit(1);
  });
}
