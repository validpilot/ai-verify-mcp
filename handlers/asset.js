'use strict';

// Handler: asset (open-source lightweight asset discovery)
// 提供浅层资产发现能力：路由发现 + API 端点枚举。
// 仅做静态/浅层被动分析（DOM + 已加载 JS + network log），不做主动 Fuzz / 越权探测。
const { mcpError } = require('../core/mcp-error');

const tools = [
  "asset_discovery"
];

// 从字符串中提取候选路由（SPA / hash / REST 路径）
function extractRoutesFromText(str, limit = 500) {
  const routes = new Set();
  if (!str) return routes;
  const slice = str.slice(0, 500000); // 防止超大 bundle 拖垮正则
  // hash 路由： #/dashboard, #/leads/:id
  const hashRe = /["'`]#(\/[A-Za-z0-9_\-/:]*)["'`]/g;
  // 普通前端路由： "/dashboard", "/login"（排除静态资源和协议）
  const pathRe = /["'`](\/[A-Za-z0-9_\-/:]{1,80})["'`]/g;
  let m;
  while ((m = hashRe.exec(slice)) && routes.size < limit) routes.add('#' + m[1]);
  while ((m = pathRe.exec(slice)) && routes.size < limit) {
    const p = m[1];
    if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|map|json|webp|mp4)$/i.test(p)) continue;
    if (p.startsWith('//')) continue;
    routes.add(p);
  }
  return routes;
}

// 从字符串中提取候选 API 端点
function extractEndpointsFromText(str, limit = 500) {
  const eps = new Map(); // path -> methodGuess
  if (!str) return eps;
  const slice = str.slice(0, 500000);
  // fetch('/api/...') / axios.get('/v1/...') / url: '/api/...'
  const patterns = [
    /\bfetch\s*\(\s*["'`]([^"'`]+)["'`]/g,
    /axios\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    /\$http\.(get|post|put|delete|patch)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    /["'`](\/(?:api|v\d+|rest|graphql)\/[A-Za-z0-9_\-/:.]{1,120})["'`]/g,
    /url\s*:\s*["'`](\/[A-Za-z0-9_\-/:.]{1,120})["'`]/g
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(slice)) && eps.size < limit) {
      let methodGuess = 'GET';
      let pathVal;
      if (m.length === 3) { methodGuess = (m[1] || 'GET').toUpperCase(); pathVal = m[2]; }
      else { pathVal = m[1]; }
      if (!pathVal || !pathVal.startsWith('/')) continue;
      if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|map)$/i.test(pathVal)) continue;
      if (!eps.has(pathVal)) eps.set(pathVal, methodGuess);
    }
  }
  return eps;
}

async function handle(name, args, deps) {
  const { text, log, resetRuntimeLogs, path, fs, ensurePage, callTool, networkLogs } = deps;

    // ====== asset_discovery ======
    // v1.9.5 起合并 asset_discovery mode=routes/enum/probe
    if (name === 'asset_discovery') {
      const mode = args.mode || 'enum';
      if (mode === 'routes') return handle('asset_routes_discover', args, deps);
      if (mode === 'enum') return handle('asset_endpoint_enum', args, deps);
      if (mode === 'probe') {
        // asset_discovery mode=probe 在 correlate.js 中，直接 require 调用避免 callTool 别名循环
        const handlerCorrelate = require('./correlate');
        return handlerCorrelate.handle('asset_endpoint_probe', args, deps);
      }
      return text(JSON.stringify({ error: `未知 mode: ${mode}，可选 routes / enum / probe` }, null, 2));
    }

    // ====== asset_discovery mode=routes ======
    if (name === 'asset_routes_discover') {
      const { target } = await ensurePage(args);
      const maxScripts = Math.min(args.maxScripts || 10, 30);

      // 1) DOM 链接 + hash 路由 + 内联脚本
      const domData = await target.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.getAttribute('href') || '')
          .filter(Boolean);
        const inlineScripts = Array.from(document.querySelectorAll('script:not([src])'))
          .map(s => s.textContent || '').join('\n').slice(0, 200000);
        const scriptSrcs = Array.from(document.querySelectorAll('script[src]'))
          .map(s => s.src).filter(Boolean);
        return { anchors, inlineScripts, scriptSrcs, currentHash: location.hash, origin: location.origin };
      });

      const routes = new Set();
      const sources = {};
      const addRoute = (r, src) => {
        if (!r) return;
        routes.add(r);
        (sources[src] = sources[src] || new Set()).add(r);
      };

      // DOM 锚点
      for (const href of domData.anchors) {
        if (href.startsWith('#/')) addRoute(href, 'dom-anchor');
        else if (href.startsWith('/') && !href.startsWith('//')) addRoute(href.split('?')[0], 'dom-anchor');
        else if (href.startsWith(domData.origin)) addRoute(href.slice(domData.origin.length).split('?')[0], 'dom-anchor');
      }
      // 内联脚本
      for (const r of extractRoutesFromText(domData.inlineScripts)) addRoute(r, 'inline-script');

      // 2) 抓取外部 JS bundle 内容做静态提取
      const fetchedScripts = domData.scriptSrcs
        .filter(s => s.startsWith(domData.origin) || s.startsWith('/'))
        .slice(0, maxScripts);
      for (const src of fetchedScripts) {
        try {
          const content = await target.evaluate(async (url) => {
            try { const r = await fetch(url); return (await r.text()).slice(0, 500000); } catch (e) { return ''; }
          }, src);
          for (const r of extractRoutesFromText(content)) addRoute(r, 'js-bundle');
        } catch (e) { /* 单个脚本抓取失败忽略 */ }
      }

      // 3) 从 network log 的 JS 文件名间接推断（模块名 → 路由）
      try {
        const netRoutes = (networkLogs || [])
          .map(n => { try { return new URL(n.url).pathname; } catch (e) { return ''; } })
          .filter(p => /\.js$/.test(p))
          .map(p => (p.match(/\/([A-Za-z][A-Za-z0-9]+)\.[\w-]+\.js$/) || p.match(/\/([A-Za-z][A-Za-z0-9]+)\.js$/) || [])[1])
          .filter(Boolean);
        for (const modName of netRoutes) {
          const guessed = '/' + modName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
          addRoute(guessed, 'network-js-inferred');
        }
      } catch (e) { /* ignore */ }

      const routeList = Array.from(routes).sort();
      const bySource = {};
      for (const [k, v] of Object.entries(sources)) bySource[k] = Array.from(v).sort();

      return text(JSON.stringify({
        success: true,
        tier: 'open-source',
        url: target.url(),
        total: routeList.length,
        routes: routeList,
        bySource,
        note: '开源版浅层路由发现（DOM + 内联脚本 + JS bundle + network 推断），不做主动探测',
        nextSteps: [
          '调用 asset_endpoint_enum 提取 API 端点',
          '调用 browser_snapshot 查看页面结构与技术栈'
        ]
      }, null, 2));
    }

    // ====== asset_discovery mode=enum ======
    if (name === 'asset_endpoint_enum') {
      const { target } = await ensurePage(args);
      const maxScripts = Math.min(args.maxScripts || 10, 30);

      const endpoints = new Map(); // path -> { methodGuess, sources:Set }
      const addEp = (path, method, src) => {
        if (!path) return;
        const existing = endpoints.get(path);
        if (existing) { existing.sources.add(src); if (method && method !== 'GET') existing.methodGuess = method; }
        else endpoints.set(path, { methodGuess: method || 'GET', sources: new Set([src]) });
      };

      // 1) 从 network log 直接提取真实调用过的端点
      try {
        for (const n of (networkLogs || [])) {
          let pathname;
          try { pathname = new URL(n.url).pathname; } catch (e) { continue; }
          if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|map)$/i.test(pathname)) continue;
          if (/^\/(api|v\d+|rest|graphql)\//.test(pathname) || (n.method && n.method !== 'GET')) {
            addEp(pathname, (n.method || 'GET').toUpperCase(), 'network-log');
          }
        }
      } catch (e) { /* ignore */ }

      // 2) 从 DOM/内联脚本 + 外部 JS bundle 静态提取
      const domData = await target.evaluate(() => {
        const inlineScripts = Array.from(document.querySelectorAll('script:not([src])'))
          .map(s => s.textContent || '').join('\n').slice(0, 200000);
        const scriptSrcs = Array.from(document.querySelectorAll('script[src]')).map(s => s.src).filter(Boolean);
        return { inlineScripts, scriptSrcs, origin: location.origin };
      });

      for (const [p, method] of extractEndpointsFromText(domData.inlineScripts)) addEp(p, method, 'inline-script');

      const fetchedScripts = domData.scriptSrcs
        .filter(s => s.startsWith(domData.origin) || s.startsWith('/'))
        .slice(0, maxScripts);
      for (const src of fetchedScripts) {
        try {
          const content = await target.evaluate(async (url) => {
            try { const r = await fetch(url); return (await r.text()).slice(0, 500000); } catch (e) { return ''; }
          }, src);
          for (const [p, method] of extractEndpointsFromText(content)) addEp(p, method, 'js-bundle');
        } catch (e) { /* ignore */ }
      }

      const list = Array.from(endpoints.entries())
        .map(([path, v]) => ({
          path,
          methodGuess: v.methodGuess,
          sources: Array.from(v.sources),
          confidence: v.sources.has('network-log') ? 0.95 : (v.sources.has('js-bundle') ? 0.7 : 0.6)
        }))
        .sort((a, b) => a.path.localeCompare(b.path));

      return text(JSON.stringify({
        success: true,
        tier: 'open-source',
        url: target.url(),
        total: list.length,
        endpoints: list,
        note: '开源版浅层端点发现（network log + JS 静态解析），不做参数 Fuzz / 越权探测',
        nextSteps: [
          '调用 browser_network 查看请求详情',
          '调用 asset_discovery { mode: \'routes\' } 补充前端路由'
        ]
      }, null, 2));
    }

    return mcpError('UNKNOWN_TOOL', `未知工具：${name}`);}

module.exports = { tools, handle };
