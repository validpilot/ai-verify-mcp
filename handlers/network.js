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
  return text(JSON.stringify(redact(filterNetwork(networkLogs, args)), null, 2));
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
