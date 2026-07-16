'use strict';

// ===== 浏览器全量回归测试（v1.8.9 从 server.js 提取） =====
// 原位置：server.js line 4440-5801（1362 行）
//
// 包含 8 个内部辅助函数：
//   - isApiUrl(url)：过滤静态资源，只保留 API 请求
//   - installListeners()：Playwright + CDP + JS 拦截器 + Performance API 多层监听
//   - snapshotLocalLogs()：本地日志快照
//   - deltaAndClear(sinceTime)：增量日志（保留供未来扩展）
//   - captureErrors(sinceTs)：合并多层数据源捕获错误
//   - resetLogs()：清空 localLogs（permanentErrors 永不清除）
//   - tryClick(selOrText, isSelector)：三级点击策略
//   - resolveUrl(href) / isSameOriginNav(href)：URL 解析辅助
//
// 测试阶段：
//   1. BFS 遍历首页导航链接（阶段 1-2）
//   2. 首页非导航功能点击（阶段 3，含 SPA 检测）
//   3. select 状态变更独立测试（阶段 3.5，含深度探索）
//   4. Performance API + permanentErrors 最终扫描
//   5. 假阳性过滤（429 限流、IP 中假 5xx、去重）
//
// 依赖（通过函数参数注入）：
//   - ensurePage({ headless }): 获取浏览器 target
//   - deepInteractor: 深度交互模块（detectUIState / interactWithForm）

async function runBrowserFullRegression(args = {}, ensurePage, deepInteractor) {
  const useHeadless = args.visible === false;
  let target = null;
  try {
    const ensured = await ensurePage({ headless: useHeadless });
    target = ensured.target;
  } catch (e) {
    return {
      passed: false, executed: true,
      error: `获取浏览器失败: ${e.message}`,
      summary: { totalFunctions: 0, clicked: 0, passed: 0, failed: 0, skipped: 0, pagesVisited: 0 },
      closedLoop: { navigableFunctions: 0, returnableFunctions: 0, loopScore: 0, loopComplete: false },
      blockingIssues: [], details: []
    };
  }

  const targetUrl = args.url || 'http://localhost:5173';
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
        } catch (_) { /* console listener: non-critical */ }
      });
      target.on('pageerror', (err) => {
        try {
          const entry = { message: err.message, ts: Date.now(), source: 'pw' };
          localLogs.page.push(entry);
          permanentErrors.page.push(entry);
        } catch (_) { /* non-critical */ }
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
        } catch (_) { /* non-critical */ }
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
        } catch (_) { /* non-critical */ }
      });
      result.captureEvidence.consoleListeners = true;
      result.captureEvidence.pageListeners = true;
      result.captureEvidence.networkListeners = true;
    } catch (_) { /* console listener: non-critical */ }

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
          } catch (_) { /* console listener: non-critical */ }
        });
      } catch (_) { /* console listener: non-critical */ }

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
          } catch (_) { /* non-critical */ }
        });
      } catch (_) { /* non-critical */ }

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
        } catch (_) { /* non-critical */ }
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
        } catch (_) { /* non-critical */ }
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
        } catch (_) { /* console listener: non-critical */ }
      });

    } catch (e) {
      // CDP setup failed (non-fatal)
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
          try { if (clone) bodyText = (await clone.text()).slice(0,200); } catch (e) { /* best-effort text extraction */ }
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
      }
    } catch (e) {
      // JS interceptor setup failed (non-fatal)
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
    } catch (_) { /* browser DOM query: non-critical */ }
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
    } catch (_) { /* non-critical */ }

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
    } catch (_) { /* browser perf API: non-critical */ }

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
      try { await target.evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, selOrText); return true; } catch (_) { /* fallback action */ }
    }
    if (!isSelector && selOrText && selOrText.length > 0 && selOrText.length < 100) {
      try { const el = await target.locator('text="' + selOrText.replace(/"/g, '\\"') + '"').first(); await el.click({ timeout: 3000 }); return true; } catch (_) { /* fallback action */ }
    }
    if (isSelector && selOrText) {
      try { await target.click(selOrText, { timeout: 3000 }); return true; } catch (_) { /* fallback action */ }
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
    try { const buf = await target.screenshot({ type: 'png', fullPage: false }); result.captureEvidence.screenshots.push({ stage: 'home', label: '首页', data: buf.toString('base64').slice(0, 500) }); } catch (_) { /* best-effort screenshot */ }

    // 验证页面前提：确实加载了内容，不是空白页
    let pageTitle = '';
    try { pageTitle = await target.title(); } catch (_) { /* best-effort screenshot */ }
    if (!pageTitle || pageTitle === '') {
      // 尝试再等待并检查 body
      await new Promise(r => setTimeout(r, 2000));
      try { pageTitle = await target.title(); } catch (_) { /* best-effort screenshot */ }
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
    } catch (_) { /* browser perf API: non-critical */ }
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
    } catch (_) { /* browser DOM query: non-critical */ }

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
        // 📸 页面导航截图
        try { const buf = await target.screenshot({ type: 'png', fullPage: false }); result.captureEvidence.screenshots.push({ stage: 'nav', label: nav.text || nav.resolvedUrl, data: buf.toString('base64').slice(0, 500) }); } catch (_) { /* best-effort screenshot */ }
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
        } catch (_) { /* non-critical */ }

        // 过滤掉同源导航链接（避免再次导航到其他页面），保留动作按钮
        // [重要] 限制每页最多 2 个子功能，保留 API 配额给 select 角色切换测试（阶段 3.5）
        const uniqueActions = subFunctions.filter(f => {
          if (f.href) { try { const u = new URL(f.href, target.url()); if (u.origin === new URL(target.url()).origin && u.pathname !== new URL(target.url()).pathname) return false; } catch (_) { /* URL parse fallback */ } }
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
                try { await target.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 300)); } catch (_) { /* fallback action */ }
              }
            } catch (_) { /* fallback action */ }

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
      try { await target.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }); await new Promise(r => setTimeout(r, 1500)); } catch (_) { /* fallback action */ }
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
          try { const s = window.getComputedStyle(el); if (s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null) visibleCount++; } catch (_) { /* best-effort visibility check */ }
        }
        const mainText = (document.body.innerText || '').trim().slice(0, 2000);
        const hash = mainText.length + '_' + mainText.slice(0, 100);
        return { visibleCount, textHash: hash };
      });
    } catch (_) { /* best-effort visibility check */ }

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
          } catch (_) { /* fallback action */ }
          // 使用 selectOption 而非点击
          try {
            await target.selectOption(fn.selector, fn.value, { timeout: 5000 });
            clicked = true;
          } catch (_) {
            try { await target.selectOption(fn.selector, { value: fn.value }, { timeout: 3000 }); clicked = true; } catch (_) { /* fallback action */ }
          }
        } else {
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
                try { const s = window.getComputedStyle(el); if (s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null) visibleCount++; } catch (_) { /* best-effort visibility check */ }
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
                  } catch (_) { /* best-effort visibility check */ }
                }
                return items;
              }).catch(() => null);
            }
          } catch (_) { /* best-effort visibility check */ }
        }
        detail.navigated = (detail.urlAfter !== detail.urlBefore) || spaNavigated;
        if (spaNavigated) {
          detail._spa = true;
          result.summary.pagesVisited = (result.summary.pagesVisited || 0) + 1;
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
            try { await target.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.click(); }, targetEl.selector); } catch (_) { /* fallback action */ }
            try { await target.waitForLoadState('networkidle', { timeout: 5000 }); } catch (_) { await new Promise(r => setTimeout(r, 1500)); }
            await new Promise(r => setTimeout(r, 500));
          } catch (_) { /* load state timeout */ }
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
        await new Promise(r => setTimeout(r, 30000));
      }
    } catch (_) { /* non-critical */ }

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
          try {
            await target.selectOption(selInfo.selector, opt.value, { timeout: 5000 });
            selected = true;
          } catch (_) {
            try { await target.selectOption(selInfo.selector, { value: opt.value }, { timeout: 3000 }); selected = true; } catch (_) { /* fallback action */ }
          }
          if (!selected) continue;

          try { await target.waitForLoadState('networkidle', { timeout: 8000 }); } catch (_) { await new Promise(r => setTimeout(r, 2000)); }
          await new Promise(r => setTimeout(r, 500));
          const urlAfter = target.url();
          const navigated = urlAfter !== urlBefore;

          // 📸 select 选项测试截图
          try { const buf = await target.screenshot({ type: 'png', fullPage: false }); result.captureEvidence.screenshots.push({ stage: 'select', label: `${selInfo.selector} → ${opt.text || opt.value}`, data: buf.toString('base64').slice(0, 500) }); } catch (_) { /* best-effort screenshot */ }

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
                } catch (_) { /* non-critical */ }
              }
            }
          } catch (_) { /* non-critical */ }

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
              } catch (_) { /* non-critical */ }
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
    } catch (_) { /* non-critical */ }

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
    } catch (_) { /* non-critical */ }

  } catch (err) {
    result.passed = false;
    result.error = err.message;
  }
  // CDP session 清理
  if (cdpSession) { try { cdpSession.detach(); } catch (_) { /* cleanup: ignore */ } cdpSession = null; }

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
  } catch (_) { /* non-critical */ }

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
  } catch (_) { /* browser perf API: non-critical */ }
  if (performanceSnapshot) {
    result.performanceSnapshot = performanceSnapshot;
  }

  return result;
}

// ===== 工厂函数：通过闭包绑定依赖，返回可直接调用的函数 =====
// 与 v1.8.7 (locator_helpers) / v1.8.8 (menu_traverser) 保持一致的工厂注入模式
function createFullRegression({ ensurePage, deepInteractor }) {
  const boundRunBrowserFullRegression = (args = {}) => runBrowserFullRegression(args, ensurePage, deepInteractor);
  return { runBrowserFullRegression: boundRunBrowserFullRegression };
}

module.exports = { runBrowserFullRegression, createFullRegression };
