'use strict';

// Handler: network
// Extracted from server.js callTool switch statements

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

  // === Bridge deps into scope via globalThis ===
  const _depsKeys = Object.keys(deps);
  const _depsPrev = {};
  for (const k of _depsKeys) { _depsPrev[k] = globalThis[k]; globalThis[k] = deps[k]; }
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
    return text(JSON.stringify(processed, null, 2));
  }

  // ====== browser_network_detail ======
  if (name === 'browser_network_detail') {
  return text(JSON.stringify(filterNetworkDetails(args), null, 2));
  }

  // ====== browser_console ======
  if (name === 'browser_console') {
const level = args.level && args.level !== 'all' ? args.level : null;
    const filtered = level ? consoleLogs.filter(item => item.type === level) : consoleLogs;
    const limited = (args.limit ? filtered.slice(-args.limit) : filtered.slice(-50));
    return text(JSON.stringify(redact(limited), null, 2));
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

    return text(JSON.stringify(result, null, 2));
  }

  // ====== browser_errors_clear ======
  if (name === 'browser_errors_clear') {
  resetRuntimeLogs();
    return text(JSON.stringify({ cleared: true, checkpoint: currentCheckpoint }, null, 2));
  }

  // ====== browser_storage ======
  if (name === 'browser_storage') {
const { target } = await ensurePage();
    return text(JSON.stringify(await getStorageSnapshot(target, args.scope || 'all'), null, 2));
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

  return { isError: true, content: [{ type: 'text', text: `未知工具（network）: ${name}` }] };
  } finally {
    for (const k of _depsKeys) { deps[k] = globalThis[k]; }
    for (const k of _depsKeys) { if (k in _depsPrev) globalThis[k] = _depsPrev[k]; else delete globalThis[k]; }
  }

}

module.exports = { tools, handle };
