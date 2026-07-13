'use strict';

const { mcpError, mcpParamMissing } = require('../core/mcp-error');

const tools = [
  "correlate_triple_check",
  "bypass_login",
  "asset_endpoint_probe"
];

async function handle(name, args, deps) {
  const { text, detectSilentFailures, log, resetRuntimeLogs, ensurePage } = deps;

    if (name === 'correlate_triple_check') {
      return await correlateTripleCheck(args, deps);
    }
    if (name === 'bypass_login') {
      return await bypassLogin(args, deps);
    }
    if (name === 'asset_endpoint_probe') {
      return await assetEndpointProbe(args, deps);
    }
    return mcpError('UNKNOWN_TOOL', `未知工具：${name}`);}

async function correlateTripleCheck(args, deps) {
  const { ensurePage, text } = deps;
  const { target } = await ensurePage(args);
  const { mode, apiEndpoint, apiMethod = 'GET', apiPayload, tableSelector = 'table, .table, [role="grid"]', rowSelector = 'tr, [role="row"]', fieldMappings = [], maxRows = 10, identifierField = 'id', strictMode = false } = args;

  const result = {
    success: true,
    mode: mode || 'auto',
    apiEndpoint,
    findings: [],
    discrepancies: [],
    matchedCount: 0,
    unmatchedCount: 0,
    pageStructure: {}
  };

  try {
    const pageContext = await target.evaluate(() => {
      const origin = window.location.origin;
      const pathname = window.location.pathname;
      const nextData = window.__NEXT_DATA__;
      const nuxtData = window.__NUXT__;
      const vueApp = window.__VUE_APP__ || window.__vue_app__;
      const axiosDefaults = window.axios && window.axios.defaults ? window.axios.defaults.baseURL : null;
      const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src).filter(s => s.includes('/api/') || s.includes('graphql'));
      const metaApiBase = document.querySelector('meta[name="api-base"], meta[name="api-url"], meta[property="api-base"]')?.content || null;
      return { origin, pathname, nextData, nuxtData, hasVue: !!vueApp, axiosBaseURL: axiosDefaults, metaApiBase, scripts };
    });

    const deriveResource = () => {
      if (mode && mode !== 'list' && mode !== 'detail') return mode;
      const pathSegments = pageContext.pathname.split('/').filter(s => s && !s.startsWith('#') && !s.startsWith('?'));
      const adminIdx = pathSegments.findIndex(s => s === 'admin' || s === 'manage' || s === 'dashboard');
      const resourceSegment = adminIdx >= 0 && pathSegments[adminIdx + 1] ? pathSegments[adminIdx + 1] : (pathSegments[pathSegments.length - 1] || 'users');
      if (/^\d+$/.test(resourceSegment) && pathSegments.length >= 2) return pathSegments[pathSegments.length - 2];
      return resourceSegment.replace(/[^a-zA-Z0-9_-]/g, '');
    };

    const resource = deriveResource();
    const baseUrls = [];
    if (pageContext.metaApiBase) baseUrls.push(pageContext.metaApiBase);
    if (pageContext.axiosBaseURL) baseUrls.push(pageContext.axiosBaseURL);
    baseUrls.push(pageContext.origin);

    const apiPatterns = [
      `${baseUrls[0]}/api/${resource}`,
      `${baseUrls[0]}/api/v1/${resource}`,
      `${baseUrls[0]}/api/v2/${resource}`,
      `${baseUrls[0]}/v1/${resource}`,
      `${baseUrls[0]}/${resource}`
    ];

    if (apiEndpoint) {
      apiPatterns.length = 0;
      apiPatterns.push(apiEndpoint);
    }

    result.apiDerivation = { resource, patterns: apiPatterns, source: apiEndpoint ? 'manual' : 'auto', spaFramework: pageContext.nextData ? 'nextjs' : pageContext.nuxtData ? 'nuxt' : pageContext.hasVue ? 'vue' : 'unknown' };

    let apiResult = null;
    let triedPattern = null;

    for (const pattern of apiPatterns) {
      apiResult = await target.evaluate(async ({ url, method, payload }) => {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (payload) opts.body = JSON.stringify(payload);
        const res = await fetch(url, opts).catch(() => null);
        if (!res) return { ok: false, status: 0, data: null, error: 'fetch failed' };
        let data;
        try { data = await res.json(); } catch (e) { data = null; }
        return { ok: res.ok, status: res.status, data };
      }, { url: pattern, method: apiMethod, payload: apiPayload });
      triedPattern = pattern;
      if (apiResult.ok && apiResult.data) break;
    }

    if ((!apiResult || !apiResult.ok) && !apiEndpoint) {
      const graphqlResult = await target.evaluate(async ({ origin }) => {
        const query = '{ __schema { queryType { name } mutationType { name } } }';
        const res = await fetch(`${origin}/graphql`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        }).catch(() => null);
        if (!res) return { ok: false };
        let data;
        try { data = await res.json(); } catch (e) { return { ok: false, status: res.status }; }
        return { ok: res.ok && !!data?.data?.__schema, status: res.status, isGraphQL: true, data };
      }, { origin: pageContext.origin });
      if (graphqlResult.ok) {
        apiResult = { ok: true, status: 200, data: graphqlResult.data, isGraphQL: true };
        triedPattern = `${pageContext.origin}/graphql`;
        result.apiDerivation.graphql = true;
      }
    }

    if (pageContext.nextData) {
      const nextPageData = pageContext.nextData;
      const props = nextPageData.props?.pageProps || nextPageData.props || {};
      const apiFromNext = props.initialData || props.data || props.items || props.list;
      if (apiFromNext && Array.isArray(apiFromNext)) {
        apiResult = { ok: true, status: 200, data: apiFromNext, source: 'nextjs-ssr' };
        triedPattern = '__NEXT_DATA__.props.pageProps';
        result.apiDerivation.spaSource = 'nextjs-ssr';
      }
    }

    result.apiDerivation.tried = triedPattern;
    result.apiDerivation.resolved = apiResult?.ok || false;
    result.apiResponse = { status: apiResult?.status || 0, hasData: !!(apiResult?.data), source: apiResult?.source || (apiResult?.isGraphQL ? 'graphql' : 'fetch') };

    const pageStructure = await target.evaluate(() => {
      const tables = document.querySelectorAll('table, .table, [role="grid"]');
      const lists = document.querySelectorAll('ul, ol, [class*="list"], [role="list"]');
      const cards = document.querySelectorAll('[class*="card"], [class*="Card"], .ant-card');
      const charts = document.querySelectorAll('canvas, svg, [class*="chart"]');
      return { tables: tables.length, lists: lists.length, cards: cards.length, charts: charts.length };
    });
    result.pageStructure = pageStructure;

    if (apiResult?.ok && apiResult?.data) {
      const apiData = apiResult.data;
      const rows = Array.isArray(apiData) ? apiData : (apiData.data || apiData.items || []);
      result.totalApiRecords = rows.length;

      if (mode === 'list' || (!mode && pageStructure.tables > 0)) {
        const domRows = await target.evaluate(({ tableSelector, rowSelector }) => {
          const tables = document.querySelectorAll(tableSelector);
          if (tables.length === 0) return { headers: [], rows: [], hasTable: false };
          const table = tables[0];
          const rows = table.querySelectorAll(rowSelector);
          const data = [];
          let headers = [];
          const headerRow = table.querySelector('thead tr, tr:first-child');
          if (headerRow) {
            headers = Array.from(headerRow.querySelectorAll('th, td')).map(h => h.innerText.trim());
          }
          rows.forEach((row, idx) => {
            if (idx === 0 && headerRow) return;
            const cells = Array.from(row.querySelectorAll('td'));
            const rowData = {};
            cells.forEach((cell, i) => {
              if (headers[i]) rowData[headers[i]] = cell.innerText.trim();
              else rowData[`col_${i}`] = cell.innerText.trim();
            });
            data.push(rowData);
          });
          return { headers, rows: data.slice(0, 10), hasTable: true };
        }, { tableSelector, rowSelector });

        result.domHeaders = domRows.headers;
        result.totalDomRows = domRows.rows.length;

        for (let i = 0; i < Math.min(maxRows, rows.length, domRows.rows.length); i++) {
          const apiRow = rows[i];
          const domRow = domRows.rows[i];
          const rowFindings = { rowIndex: i, apiId: apiRow[identifierField], domData: domRow, matches: [], mismatches: [] };

          if (fieldMappings.length > 0) {
            for (const mapping of fieldMappings) {
              const domValue = domRow[mapping.name] || domRow[mapping.domSelector] || '';
              const apiValue = apiRow[mapping.apiField];
              if (String(domValue) === String(apiValue)) {
                rowFindings.matches.push({ field: mapping.name, domValue, apiValue });
              } else {
                rowFindings.mismatches.push({ field: mapping.name, domValue, apiValue });
              }
            }
          } else {
            for (const header of domRows.headers) {
              const domValue = domRow[header] || '';
              const apiKey = Object.keys(apiRow).find(k => k.toLowerCase() === header.toLowerCase() || k === header);
              const apiValue = apiKey ? apiRow[apiKey] : undefined;
              if (apiValue !== undefined && String(domValue) === String(apiValue)) {
                rowFindings.matches.push({ field: header, domValue, apiValue });
              } else if (apiValue !== undefined) {
                rowFindings.mismatches.push({ field: header, domValue, apiValue });
              }
            }
          }

          if (rowFindings.mismatches.length === 0) {
            result.matchedCount++;
          } else {
            result.unmatchedCount++;
            result.discrepancies.push(rowFindings);
          }
          result.findings.push(rowFindings);
        }

        if (strictMode) {
          for (const apiRow of rows.slice(0, maxRows)) {
            for (const key of Object.keys(apiRow)) {
              const headerExists = domRows.headers.some(h => h.toLowerCase() === key.toLowerCase());
              if (!headerExists) {
                result.discrepancies.push({ type: 'api_field_not_in_dom', field: key, value: apiRow[key] });
                result.unmatchedCount++;
              }
            }
          }
        }
      } else if (mode === 'detail' || (!mode && pageStructure.cards > 0)) {
        const domData = await target.evaluate(() => {
          const data = {};
          const inputs = document.querySelectorAll('input, textarea, select');
          inputs.forEach(el => {
            const name = el.name || el.id || el.getAttribute('data-field') || '';
            if (name) data[name] = el.value || '';
          });
          const displayFields = document.querySelectorAll('[data-field], .field-value, .ant-card');
          displayFields.forEach(el => {
            const name = el.getAttribute('data-field') || '';
            if (name) data[name] = el.innerText.trim();
          });
          const cards = document.querySelectorAll('[class*="card"], [class*="Card"], .ant-card');
          cards.forEach(card => {
            const title = card.querySelector('h3, h4, p, span')?.innerText?.trim() || '';
            if (title) data[title] = card.innerText.trim();
          });
          return data;
        });

        result.domFields = Object.keys(domData);
        result.apiFields = Object.keys(apiData);

        for (const [domKey, domValue] of Object.entries(domData)) {
          const apiKey = Object.keys(apiData).find(k => k.toLowerCase() === domKey.toLowerCase() || k === domKey);
          if (apiKey) {
            const apiValue = apiData[apiKey];
            if (String(domValue) === String(apiValue)) {
              result.findings.push({ field: domKey, type: 'match', domValue, apiValue });
              result.matchedCount++;
            } else {
              result.findings.push({ field: domKey, type: 'mismatch', domValue, apiValue });
              result.discrepancies.push({ field: domKey, domValue, apiValue });
              result.unmatchedCount++;
            }
          } else {
            result.findings.push({ field: domKey, type: 'dom_only', domValue });
          }
        }

        if (strictMode) {
          for (const apiKey of Object.keys(apiData)) {
            const domExists = Object.keys(domData).some(k => k.toLowerCase() === apiKey.toLowerCase());
            if (!domExists && typeof apiData[apiKey] !== 'object') {
              result.discrepancies.push({ type: 'api_field_not_in_dom', field: apiKey, value: apiData[apiKey] });
              result.unmatchedCount++;
            }
          }
        }
      } else {
        result.message = '未检测到表格或卡片结构，跳过数据比对';
      }
    } else {
      if (!apiResult?.ok) {
        result.message = `API 请求失败：${apiResult?.status || 'N/A'}（尝试 ${result.apiDerivation?.tried || '未知'}），使用 DOM 结构分析`;
      } else {
        result.message = 'API 返回为空，使用 DOM 结构分析';
      }
    }

    result.status = result.discrepancies.length === 0 ? 'consistent' : 'inconsistent';
    result.summary = {
      totalFields: result.matchedCount + result.unmatchedCount,
      matchedFields: result.matchedCount,
      unmatchedFields: result.unmatchedCount,
      consistencyRate: result.matchedCount + result.unmatchedCount > 0
        ? ((result.matchedCount / (result.matchedCount + result.unmatchedCount)) * 100).toFixed(1) + '%'
        : 'N/A'
    };

  } catch (err) {
    result.success = false;
    result.error = err.message;
  }

  return text(JSON.stringify(result, null, 2));
}

async function bypassLogin(args, deps) {
  const { ensurePage, text } = deps;
  const { target } = await ensurePage(args);
  const { targetUrl, authApiPath, testCases = ['no_cookie', 'no_auth_header', 'fake_user_id', 'direct_api_access', 'backdoor_paths'], userIdToTest, backdoorPaths, maxTestCount = 20 } = args;

  if (!targetUrl) {
    return mcpParamMissing('targetUrl', 'bypass_login', '请提供目标受保护页面的 URL');
  }

  const result = {
    success: true,
    targetUrl,
    vulnerabilities: [],
    testResults: [],
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    notes: []
  };

  const defaultBackdoorPaths = [
    '/admin', '/admin/login', '/admin/index', '/admin/dashboard',
    '/api/admin', '/api/v1/admin', '/api/admin/users',
    '/manage', '/management', '/manager',
    '/backend', '/api/backend',
    '/system', '/api/system', '/api/config',
    '/debug', '/api/debug',
    '/test', '/api/test', '/api/health',
    '/.env', '/.git/config', '/config/env', '/config/database'
  ];

  const pathsToTest = backdoorPaths || defaultBackdoorPaths;
  let origin = '';
  try {
    origin = await target.evaluate(() => window.location.origin);
  } catch (e) {
    result.notes.push(`无法获取页面 origin: ${e.message}`);
  }

  try {
  for (const testCase of testCases) {
    if (result.totalTests >= maxTestCount) break;

    let testResult;

    try {
    switch (testCase) {
      case 'no_cookie': {
        const res = await target.evaluate(async (url) => {
          const res = await fetch(url, { credentials: 'omit' });
          let isHtml = false;
          try {
            const text = await res.text();
            isHtml = text.includes('<!DOCTYPE') || text.includes('<html');
          } catch (_) { /* res.text() failed, keep default isHtml=false */ }
          return { ok: res.ok, status: res.status, redirected: res.redirected, isHtml };
        }, targetUrl);
        testResult = { test: 'no_cookie', status: res.status, bypassed: res.ok && !res.redirected, isHtml: res.isHtml };
        if (res.ok && !res.redirected) {
          if (res.isHtml) {
            result.vulnerabilities.push({ type: 'no_cookie_bypass', severity: 'warning', description: `无 Cookie 情况下可访问受保护页面: ${targetUrl}（可能是 SPA 路由）` });
          } else {
            result.vulnerabilities.push({ type: 'no_cookie_bypass', severity: 'blocking', description: `无 Cookie 情况下可访问受保护 API: ${targetUrl}` });
          }
        }
        break;
      }

      case 'no_auth_header': {
        const res = await target.evaluate(async (url) => {
          const res = await fetch(url, { headers: {} });
          let isHtml = false;
          try {
            const text = await res.text();
            isHtml = text.includes('<!DOCTYPE') || text.includes('<html');
          } catch (_) { /* res.text() failed, keep default isHtml=false */ }
          return { ok: res.ok, status: res.status, isHtml };
        }, targetUrl);
        testResult = { test: 'no_auth_header', status: res.status, bypassed: res.ok, isHtml: res.isHtml };
        if (res.ok) {
          if (res.isHtml) {
            result.notes.push(`无 Authorization 头情况下返回 200: ${targetUrl}（可能是 SPA 路由）`);
          } else {
            result.vulnerabilities.push({ type: 'no_auth_header_bypass', severity: 'blocking', description: `无 Authorization 头情况下可访问受保护 API: ${targetUrl}` });
          }
        }
        break;
      }

      case 'fake_user_id': {
        if (!authApiPath) {
          testResult = { test: 'fake_user_id', skipped: true, reason: '缺少 authApiPath 参数' };
          break;
        }
        const testId = userIdToTest || 'test-user-999';
        const res = await target.evaluate(async ({ apiPath, userId }) => {
          const res = await fetch(apiPath, {
            headers: { 'X-User-ID': userId }
          });
          let isHtml = false;
          try {
            const text = await res.text();
            isHtml = text.includes('<!DOCTYPE') || text.includes('<html');
          } catch (_) { /* res.text() failed, keep default isHtml=false */ }
          return { ok: res.ok, status: res.status, isHtml };
        }, { apiPath: `${origin}${authApiPath}`, userId: testId });
        testResult = { test: 'fake_user_id', userId: testId, status: res.status, bypassed: res.ok && !res.isHtml, isHtml: res.isHtml };
        if (res.ok && !res.isHtml) {
          result.vulnerabilities.push({ type: 'fake_user_id_bypass', severity: 'blocking', description: `伪造用户 ID (${testId}) 可访问受保护 API: ${authApiPath}` });
        }
        break;
      }

      case 'direct_api_access': {
        if (!authApiPath) {
          testResult = { test: 'direct_api_access', skipped: true, reason: '缺少 authApiPath 参数' };
          break;
        }
        const res = await target.evaluate(async (apiPath) => {
          const res = await fetch(apiPath);
          let isHtml = false;
          try {
            const text = await res.text();
            isHtml = text.includes('<!DOCTYPE') || text.includes('<html');
          } catch (_) { /* res.text() failed, keep default isHtml=false */ }
          return { ok: res.ok, status: res.status, isHtml };
        }, `${origin}${authApiPath}`);
        testResult = { test: 'direct_api_access', apiPath: authApiPath, status: res.status, bypassed: res.ok && !res.isHtml, isHtml: res.isHtml };
        if (res.ok && !res.isHtml) {
          result.vulnerabilities.push({ type: 'direct_api_access', severity: 'blocking', description: `直接访问认证 API 返回成功: ${authApiPath}` });
        }
        break;
      }

      case 'backdoor_paths': {
        const backdoorResults = [];
        let testCount = 0;
        for (const path of pathsToTest) {
          if (testCount >= 10) break;
          const fullUrl = path.startsWith('http') ? path : `${origin}${path}`;
          const res = await target.evaluate(async (url) => {
            try {
              const res = await fetch(url, { method: 'GET' });
              let isHtml = false;
              let bodyPreview = '';
              try {
                bodyPreview = await res.text();
                isHtml = bodyPreview.includes('<!DOCTYPE') || bodyPreview.includes('<html');
              } catch (_) { /* res.text() failed, keep default isHtml=false */ }
              return { ok: res.ok, status: res.status, isHtml, bodyPreview: bodyPreview.slice(0, 200) };
            } catch (e) {
              return { ok: false, status: 0, isHtml: false, error: e.message };
            }
          }, fullUrl);
          if (res.status !== 0 && res.status !== 404 && res.status !== 403) {
            if (res.isHtml) {
              backdoorResults.push({ path, status: res.status, accessible: true, isHtml: true });
              result.notes.push(`发现可访问的路径: ${path} (${res.status}, HTML响应)`);
            } else {
              backdoorResults.push({ path, status: res.status, accessible: true, isHtml: false });
              result.vulnerabilities.push({ type: 'backdoor_path', severity: 'major', description: `发现可访问的后门路径: ${path} (${res.status})` });
            }
          }
          testCount++;
          result.totalTests++;
        }
        testResult = { test: 'backdoor_paths', testedCount: testCount, found: backdoorResults };
        break;
      }

      case 'idor_test': {
        if (!authApiPath || !userIdToTest) {
          testResult = { test: 'idor_test', skipped: true, reason: '缺少 authApiPath 或 userIdToTest 参数' };
          break;
        }
        const res = await target.evaluate(async ({ apiPath, userId }) => {
          const res = await fetch(`${apiPath}/${userId}`);
          let isHtml = false;
          try {
            const text = await res.text();
            isHtml = text.includes('<!DOCTYPE') || text.includes('<html');
          } catch (_) { /* res.text() failed, keep default isHtml=false */ }
          return { ok: res.ok, status: res.status, isHtml };
        }, { apiPath: `${origin}${authApiPath}`, userId: userIdToTest });
        testResult = { test: 'idor_test', userId: userIdToTest, status: res.status, vulnerable: res.ok && !res.isHtml, isHtml: res.isHtml };
        if (res.ok && !res.isHtml) {
          result.vulnerabilities.push({ type: 'idor', severity: 'blocking', description: `IDOR 漏洞：可访问其他用户 (${userIdToTest}) 的数据` });
        }
        break;
      }

      case 'unauthorized_access': {
        const res = await target.evaluate(async (url) => {
          const res = await fetch(url, { headers: { 'Authorization': 'Bearer fake-token-123' } });
          let isHtml = false;
          try {
            const text = await res.text();
            isHtml = text.includes('<!DOCTYPE') || text.includes('<html');
          } catch (_) { /* res.text() failed, keep default isHtml=false */ }
          return { ok: res.ok, status: res.status, isHtml };
        }, targetUrl);
        testResult = { test: 'unauthorized_access', status: res.status, bypassed: res.ok && !res.isHtml, isHtml: res.isHtml };
        if (res.ok && !res.isHtml) {
          result.vulnerabilities.push({ type: 'fake_token_bypass', severity: 'blocking', description: `伪造 Token 可访问受保护 API: ${targetUrl}` });
        }
        break;
      }
    }
    } catch (e) {
      testResult = { test: testCase, error: e.message, skipped: true };
    }

    if (testResult) {
      result.testResults.push(testResult);
      if (!testResult.skipped) {
        result.totalTests++;
        if (testResult.bypassed || testResult.vulnerable || (testResult.found && testResult.found.filter(f => !f.isHtml).length > 0)) {
          result.failedTests++;
        } else {
          result.passedTests++;
        }
      }
    }
  }
  } catch (e) {
    result.notes.push(`测试中断: ${e.message}`);
  }

  result.status = result.vulnerabilities.length === 0 ? 'secure' : 'vulnerable';
  result.summary = {
    totalTests: result.totalTests,
    passedTests: result.passedTests,
    failedTests: result.failedTests,
    vulnerabilityCount: result.vulnerabilities.length,
    noteCount: result.notes.length
  };

  return text(JSON.stringify(result, null, 2));
}

async function assetEndpointProbe(args, deps) {
  const { ensurePage, text } = deps;
  const { target } = await ensurePage(args);
  const { basePath = '/api', probeCategories = ['all'], customEndpoints = [], method = 'HEAD', timeout = 5000, maxConcurrent = 5, includeHidden = false } = args;

  const probeLists = {
    auth: [
      '/auth/login', '/auth/register', '/auth/me', '/auth/refresh', '/auth/logout',
      '/login', '/register', '/logout',
      '/oauth/callback', '/oauth/github', '/oauth/wechat'
    ],
    user: [
      '/users/me', '/users/profile', '/users', '/users/:id',
      '/user/profile', '/user/settings', '/user/preferences'
    ],
    order: [
      '/orders', '/orders/:id', '/orders/history', '/orders/cart',
      '/order/create', '/order/pay', '/order/confirm', '/order/cancel'
    ],
    config: [
      '/config', '/config/app', '/config/env', '/config/database',
      '/settings', '/system/settings'
    ],
    admin: [
      '/admin', '/admin/users', '/admin/orders', '/admin/config',
      '/admin/dashboard', '/admin/roles', '/admin/permissions'
    ],
    system: [
      '/health', '/healthz', '/ready', '/metrics', '/version',
      '/api/health', '/api/version', '/api/status',
      '/docs', '/swagger', '/openapi.json', '/api-docs'
    ]
  };

  const hiddenEndpoints = [
    '/.env', '/.git/config', '/config/env', '/config/database',
    '/backup', '/api/backup', '/export', '/api/export',
    '/debug', '/api/debug', '/test', '/api/test'
  ];

  let endpointsToProbe = [];
  if (probeCategories.includes('all')) {
    for (const cat of Object.keys(probeLists)) {
      endpointsToProbe = endpointsToProbe.concat(probeLists[cat]);
    }
  } else {
    for (const cat of probeCategories) {
      if (probeLists[cat]) {
        endpointsToProbe = endpointsToProbe.concat(probeLists[cat]);
      }
    }
  }

  if (includeHidden) {
    endpointsToProbe = endpointsToProbe.concat(hiddenEndpoints);
  }

  if (customEndpoints.length > 0) {
    endpointsToProbe = endpointsToProbe.concat(customEndpoints);
  }

  endpointsToProbe = [...new Set(endpointsToProbe)];

  const origin = await target.evaluate(() => window.location.origin);
  const results = [];
  let successCount = 0;
  let failureCount = 0;
  let timeoutCount = 0;
  let htmlCount = 0;

  const chunks = [];
  for (let i = 0; i < endpointsToProbe.length; i += maxConcurrent) {
    chunks.push(endpointsToProbe.slice(i, i + maxConcurrent));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (endpoint) => {
      const fullUrl = endpoint.startsWith('http') ? endpoint : `${origin}${basePath}${endpoint}`;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        const res = await target.evaluate(async ({ url, method }) => {
          const res = await fetch(url, { method });
          let isHtml = false;
          let bodyPreview = '';
          if (method !== 'HEAD') {
            try {
              bodyPreview = await res.text();
              isHtml = bodyPreview.includes('<!DOCTYPE') || bodyPreview.includes('<html');
            } catch (_) { /* res.text() failed, keep default isHtml=false */ }
          }
          return { ok: res.ok, status: res.status, statusText: res.statusText, isHtml, bodyPreview: bodyPreview.slice(0, 200) };
        }, { url: fullUrl, method });
        clearTimeout(timer);
        return { endpoint, url: fullUrl, status: res.status, ok: res.ok, statusText: res.statusText, error: null, isHtml: res.isHtml, bodyPreview: res.bodyPreview };
      } catch (e) {
        if (e.name === 'AbortError') {
          return { endpoint, url: fullUrl, status: 0, ok: false, statusText: 'TIMEOUT', error: 'timeout', isHtml: false };
        }
        return { endpoint, url: fullUrl, status: 0, ok: false, statusText: 'ERROR', error: e.message, isHtml: false };
      }
    });

    const chunkResults = await Promise.all(promises);
    for (const r of chunkResults) {
      results.push(r);
      if (r.status === 0 && r.error === 'timeout') {
        timeoutCount++;
      } else if (r.status >= 200 && r.status < 400) {
        if (r.isHtml) {
          htmlCount++;
        }
        successCount++;
      } else {
        failureCount++;
      }
    }
  }

  const categorized = {
    accessible: results.filter(r => r.status >= 200 && r.status < 400 && !r.isHtml),
    accessibleHtml: results.filter(r => r.status >= 200 && r.status < 400 && r.isHtml),
    redirect: results.filter(r => r.status >= 300 && r.status < 400),
    unauthorized: results.filter(r => r.status === 401),
    forbidden: results.filter(r => r.status === 403),
    notFound: results.filter(r => r.status === 404),
    error: results.filter(r => r.status >= 500),
    timeout: results.filter(r => r.error === 'timeout')
  };

  const result = {
    success: true,
    basePath,
    method,
    totalProbed: endpointsToProbe.length,
    isSpa: htmlCount > successCount * 0.5,
    notes: htmlCount > 0 ? ['检测到大量 HTML 响应，可能是 SPA 应用，建议使用 GET 方法探测以获取更准确结果'] : [],
    categorized,
    summary: {
      accessible: categorized.accessible.length,
      accessibleHtml: categorized.accessibleHtml.length,
      redirect: categorized.redirect.length,
      unauthorized: categorized.unauthorized.length,
      forbidden: categorized.forbidden.length,
      notFound: categorized.notFound.length,
      error: categorized.error.length,
      timeout: categorized.timeout.length
    },
    topFindings: categorized.accessible.slice(0, 10).map(r => ({ endpoint: r.endpoint, status: r.status }))
  };

  return text(JSON.stringify(result, null, 2));
}

module.exports = { tools, handle };
