'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { tools: securityTools, handle: securityHandle } = require('../handlers/security');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');

// 构造 mock deps：text 函数直接返回字符串，ensurePage 返回 mock target
function makeMockDeps(mockTarget) {
  return {
    text: (t) => t,
    ensurePage: async () => ({ target: mockTarget }),
    page: mockTarget,
  };
}

// 构造 mock target（Playwright page 的极简 mock）
function makeMockTarget(responseOverrides = {}) {
  return {
    evaluate: async (script) => {
      // 解析 script 中的 URL 和 options，返回预设响应
      for (const [urlPattern, resp] of Object.entries(responseOverrides)) {
        if (script.includes(urlPattern)) {
          return JSON.stringify(resp);
        }
      }
      // 默认响应
      return JSON.stringify({
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
        body: '<html><body>OK</body></html>',
        bodyLength: 30,
      });
    },
  };
}

describe('security handler - 结构与 schema', () => {
  test('handler 导出 tools 数组和 handle 函数', () => {
    assert.ok(Array.isArray(securityTools), 'tools 应为数组');
    assert.equal(typeof securityHandle, 'function', 'handle 应为函数');
  });

  test('tools 数组包含 2 个工具', () => {
    assert.equal(securityTools.length, 2, '应有 2 个工具');
  });

  test('tools 包含所有预期的工具名', () => {
    const expected = [
      'security_scan',
      'api_probe',
    ];
    for (const name of expected) {
      assert.ok(securityTools.includes(name), `应包含 ${name}`);
    }
  });

  test('每个工具都有对应的 schema JSON 文件', () => {
    for (const toolName of securityTools) {
      const filePath = path.join(TOOLS_DIR, `${toolName}.json`);
      assert.ok(fs.existsSync(filePath), `${toolName}.json 应存在`);
    }
  });

  test('schema 文件都是合法 JSON 且有 name/description/inputSchema', () => {
    for (const toolName of securityTools) {
      const filePath = path.join(TOOLS_DIR, `${toolName}.json`);
      const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.equal(schema.name, toolName, `${toolName}.json name 应匹配`);
      assert.ok(schema.description && schema.description.length > 10, `${toolName}.json description 应有效`);
      assert.ok(schema.inputSchema, `${toolName}.json 应有 inputSchema`);
      assert.equal(schema.inputSchema.type, 'object', `${toolName}.json inputSchema.type 应为 object`);
    }
  });

  test('schema 无 outputSchema（MCP 协议要求）', () => {
    for (const toolName of securityTools) {
      const filePath = path.join(TOOLS_DIR, `${toolName}.json`);
      const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.equal(schema.outputSchema, undefined, `${toolName}.json 不应有 outputSchema`);
    }
  });

  test('所有 schema 都要求 url 参数', () => {
    for (const toolName of securityTools) {
      const filePath = path.join(TOOLS_DIR, `${toolName}.json`);
      const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.ok(
        schema.inputSchema.required && schema.inputSchema.required.includes('url'),
        `${toolName}.json 应要求 url 参数`
      );
    }
  });
});

// 解析 MCP 响应：支持纯字符串（text 函数返回）和 MCP 对象（{ isError, content }）两种格式
function parseMcpResult(result) {
  if (typeof result === 'string') return JSON.parse(result);
  if (result && result.isError && result.content && result.content[0]) {
    return JSON.parse(result.content[0].text);
  }
  if (result && result.content && result.content[0]) {
    return JSON.parse(result.content[0].text);
  }
  return result;
}

describe('security handler - 参数校验', () => {
  test('security_headers_check 缺少 url 返回 PARAM_MISSING', async () => {
    const deps = makeMockDeps(makeMockTarget());
    const result = await securityHandle('security_headers_check', {}, deps);
    const parsed = parseMcpResult(result);
    assert.equal(parsed.error, 'PARAM_MISSING');
    assert.ok(parsed.message.includes('url'));
  });

  test('security_csp_analyze 缺少 url 返回 PARAM_MISSING', async () => {
    const deps = makeMockDeps(makeMockTarget());
    const result = await securityHandle('security_csp_analyze', {}, deps);
    const parsed = parseMcpResult(result);
    assert.equal(parsed.error, 'PARAM_MISSING');
  });

  test('security_sql_injection_scan 缺少 url 返回 PARAM_MISSING', async () => {
    const deps = makeMockDeps(makeMockTarget());
    const result = await securityHandle('security_sql_injection_scan', {}, deps);
    const parsed = parseMcpResult(result);
    assert.equal(parsed.error, 'PARAM_MISSING');
  });

  test('security_xss_scan 缺少 url 返回 PARAM_MISSING', async () => {
    const deps = makeMockDeps(makeMockTarget());
    const result = await securityHandle('security_xss_scan', {}, deps);
    const parsed = parseMcpResult(result);
    assert.equal(parsed.error, 'PARAM_MISSING');
  });

  test('security_owasp_top10 缺少 url 返回 PARAM_MISSING', async () => {
    const deps = makeMockDeps(makeMockTarget());
    const result = await securityHandle('security_owasp_top10', {}, deps);
    const parsed = parseMcpResult(result);
    assert.equal(parsed.error, 'PARAM_MISSING');
  });

  test('api_probe 缺少 url 返回 PARAM_MISSING', async () => {
    const deps = makeMockDeps(makeMockTarget());
    const result = await securityHandle('api_probe', {}, deps);
    const parsed = parseMcpResult(result);
    assert.equal(parsed.error, 'PARAM_MISSING');
  });

  test('未知工具名返回 UNKNOWN_TOOL', async () => {
    const deps = makeMockDeps(makeMockTarget());
    const result = await securityHandle('nonexistent_tool', { url: 'http://example.com' }, deps);
    const parsed = parseMcpResult(result);
    assert.equal(parsed.error, 'UNKNOWN_TOOL');
  });
});

describe('security_headers_check - 逻辑测试', () => {
  test('检测到所有安全头部时评分为满分', async () => {
    const mockTarget = makeMockTarget({
      'http://safe.test': {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-security-policy': "default-src 'self'",
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'DENY',
          'strict-transport-security': 'max-age=31536000',
          'referrer-policy': 'no-referrer',
          'x-xss-protection': '1; mode=block',
          'permissions-policy': 'geolocation=()',
        },
        body: '<html>OK</html>',
        bodyLength: 13,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('security_headers_check', { url: 'http://safe.test' }, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.score, '7/7');
    assert.equal(parsed.risk, 'low');
    assert.equal(parsed.present.length, 7);
    assert.equal(parsed.missing.length, 0);
    assert.ok(!parsed.infoLeak, '不应有信息泄露');
  });

  test('缺失所有安全头部时评分为 0 且风险为 high', async () => {
    const mockTarget = makeMockTarget({
      'http://unsafe.test': {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
        body: '<html>OK</html>',
        bodyLength: 13,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('security_headers_check', { url: 'http://unsafe.test' }, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.score, '0/7');
    assert.equal(parsed.risk, 'high');
    assert.equal(parsed.missing.length, 7);
  });

  test('检测到 X-Powered-By 和 Server 头时标记为信息泄露', async () => {
    const mockTarget = makeMockTarget({
      'http://leak.test': {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'text/html',
          'x-powered-by': 'Express',
          'server': 'nginx/1.18.0',
        },
        body: '<html>OK</html>',
        bodyLength: 13,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('security_headers_check', { url: 'http://leak.test' }, deps);
    const parsed = JSON.parse(result);
    assert.ok(parsed.infoLeak, '应有信息泄露警告');
    assert.ok(parsed.infoLeak.some(i => i.header === 'x-powered-by'));
    assert.ok(parsed.infoLeak.some(i => i.header === 'server'));
  });
});

describe('security_csp_analyze - 逻辑测试', () => {
  test('无 CSP 头时返回评分 0 和 high 级别发现', async () => {
    const mockTarget = makeMockTarget({
      'http://nocsp.test': {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
        body: '<html>OK</html>',
        bodyLength: 13,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('security_csp_analyze', { url: 'http://nocsp.test' }, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.csp, null);
    assert.equal(parsed.score, 0);
    assert.ok(parsed.findings.some(f => f.severity === 'high'));
  });

  test('CSP 包含 unsafe-inline 时扣分并报告 high 级别', async () => {
    const mockTarget = makeMockTarget({
      'http://unsafe.test': {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-security-policy': "default-src 'self'; script-src 'unsafe-inline' 'unsafe-eval'",
        },
        body: '<html>OK</html>',
        bodyLength: 13,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('security_csp_analyze', { url: 'http://unsafe.test' }, deps);
    const parsed = JSON.parse(result);
    assert.ok(parsed.findings.some(f => f.evidence.includes('unsafe-inline')), '应检测到 unsafe-inline');
    assert.ok(parsed.findings.some(f => f.evidence.includes('unsafe-eval')), '应检测到 unsafe-eval');
    assert.ok(parsed.score < 100, '评分应被扣减');
  });

  test('安全的 CSP 策略获得高评分', async () => {
    const mockTarget = makeMockTarget({
      'http://safecsp.test': {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'",
        },
        body: '<html>OK</html>',
        bodyLength: 13,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('security_csp_analyze', { url: 'http://safecsp.test' }, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.score, 100, '安全 CSP 应得满分');
    assert.equal(parsed.findings.length, 0, '不应有不安全发现');
  });
});

describe('security_sql_injection_scan - 逻辑测试', () => {
  test('测试 20 个 SQL 注入 payload', async () => {
    const mockTarget = makeMockTarget({
      'http://sqli.test': {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
        body: '<html>OK</html>',
        bodyLength: 13,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('security_sql_injection_scan', { url: 'http://sqli.test' }, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.totalPayloads, 20, '应有 20 个 SQL 注入 payload');
    assert.equal(parsed.testedCount, 20, '应测试全部 20 个 payload');
    assert.ok(Array.isArray(parsed.findings));
  });

  test('检测到 SQL 错误信息时报告 critical 级别漏洞', async () => {
    const mockTarget = makeMockTarget({
      'http://vuln-sqli.test': {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'content-type': 'text/html' },
        body: '<html>you have an error in your sql syntax near SELECT</html>',
        bodyLength: 60,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('security_sql_injection_scan', { url: 'http://vuln-sqli.test' }, deps);
    const parsed = JSON.parse(result);
    assert.ok(parsed.findings.length > 0, '应检测到 SQL 注入漏洞');
    assert.ok(parsed.findings.some(f => f.severity === 'critical'), '应有 critical 级别发现');
    assert.ok(parsed.findings.some(f => f.type === 'sql_injection'));
  });
});

describe('security_xss_scan - 逻辑测试', () => {
  test('测试 26 个 XSS payload', async () => {
    const mockTarget = makeMockTarget({
      'http://xss.test': {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
        body: '<html>OK</html>',
        bodyLength: 13,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('security_xss_scan', { url: 'http://xss.test' }, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.totalPayloads, 26, '应有 26 个 XSS payload');
    assert.equal(parsed.testedCount, 26, '应测试全部 26 个 payload');
    assert.ok(Array.isArray(parsed.findings));
  });

  test('检测到未转义的 XSS payload 时报告 high 级别漏洞', async () => {
    const xssPayload = '<script>alert(1)</script>';
    const mockTarget = makeMockTarget({
      'http://vuln-xss.test': {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
        body: `<html>Search: ${xssPayload}</html>`,
        bodyLength: 40,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('security_xss_scan', { url: 'http://vuln-xss.test' }, deps);
    const parsed = JSON.parse(result);
    assert.ok(parsed.findings.length > 0, '应检测到 XSS 漏洞');
    assert.ok(parsed.findings.some(f => f.severity === 'high'), '应有 high 级别发现');
    assert.ok(parsed.findings.some(f => f.type === 'xss'));
  });
});

describe('security_owasp_top10 - 逻辑测试', () => {
  test('返回 A1-A10 共 10 项检查', async () => {
    const mockTarget = makeMockTarget({
      'http://owasp.test': {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
        body: '<html>OK</html>',
        bodyLength: 13,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('security_owasp_top10', { url: 'http://owasp.test' }, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.checks.length, 10, '应有 10 项 OWASP 检查');
    const ids = parsed.checks.map(c => c.id);
    for (let i = 1; i <= 10; i++) {
      assert.ok(ids.includes(`A${i}`), `应包含 A${i}`);
    }
    assert.ok(typeof parsed.passed === 'number');
    assert.ok(typeof parsed.failed === 'number');
    assert.ok(typeof parsed.warned === 'number');
  });

  test('HTTP 站点（非 HTTPS）A2 检查为 fail', async () => {
    const mockTarget = makeMockTarget({
      'http://insecure.test': {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
        body: '<html>OK</html>',
        bodyLength: 13,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('security_owasp_top10', { url: 'http://insecure.test' }, deps);
    const parsed = JSON.parse(result);
    const a2 = parsed.checks.find(c => c.id === 'A2');
    assert.equal(a2.status, 'fail', 'HTTP 站点 A2 应为 fail');
  });

  test('检测到 X-Powered-By 时 A5 报告配置错误', async () => {
    const mockTarget = makeMockTarget({
      'http://misconfig.test': {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'text/html',
          'x-powered-by': 'Express',
          'server': 'nginx',
        },
        body: '<html>OK</html>',
        bodyLength: 13,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('security_owasp_top10', { url: 'http://misconfig.test' }, deps);
    const parsed = JSON.parse(result);
    const a5 = parsed.checks.find(c => c.id === 'A5');
    assert.ok(a5.status !== 'pass', '存在信息泄露时 A5 不应为 pass');
    assert.ok(a5.evidence.includes('X-Powered-By') || a5.evidence.includes('Server'), '应报告信息泄露');
  });
});

describe('api_probe - 逻辑测试', () => {
  test('默认测试 6 种 HTTP 方法', async () => {
    const mockTarget = makeMockTarget({
      'http://api.test': {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: '{"ok":true}',
        bodyLength: 11,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('api_probe', { url: 'http://api.test' }, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.results.length, 6, '应测试 6 种方法');
    const methods = parsed.results.map(r => r.method);
    assert.ok(methods.includes('GET'));
    assert.ok(methods.includes('POST'));
    assert.ok(methods.includes('PUT'));
    assert.ok(methods.includes('DELETE'));
    assert.ok(methods.includes('PATCH'));
    assert.ok(methods.includes('OPTIONS'));
  });

  test('自定义 methods 参数生效', async () => {
    const mockTarget = makeMockTarget({
      'http://api2.test': {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: '{"ok":true}',
        bodyLength: 11,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('api_probe', { url: 'http://api2.test', methods: ['GET', 'POST'] }, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.results.length, 2, '应只测试指定的 2 种方法');
  });

  test('CORS 完全开放时标记为 high 风险', async () => {
    const mockTarget = makeMockTarget({
      'http://cors-open.test': {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
        },
        body: '{"ok":true}',
        bodyLength: 11,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('api_probe', { url: 'http://cors-open.test' }, deps);
    const parsed = JSON.parse(result);
    assert.ok(parsed.corsAnalysis, '应有 CORS 分析');
    assert.equal(parsed.corsAnalysis.allowOrigin, '*');
    assert.equal(parsed.corsAnalysis.risk, 'high', 'CORS * 应为 high 风险');
  });

  test('checkCors=false 时跳过 CORS 分析', async () => {
    const mockTarget = makeMockTarget({
      'http://no-cors.test': {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        body: '{"ok":true}',
        bodyLength: 11,
      },
    });
    const deps = makeMockDeps(mockTarget);
    const result = await securityHandle('api_probe', { url: 'http://no-cors.test', checkCors: false }, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.corsAnalysis, null, 'checkCors=false 时不应有 CORS 分析');
  });
});

describe('security handler - 回退到 Node.js fetch', () => {
  test('无 target 时 fetch 失败返回 EXECUTION_ERROR 而非崩溃', async () => {
    // 当 ensurePage 失败时，target 为 null，smartFetch 回退到 Node.js fetch
    const deps = {
      text: (t) => t,
      ensurePage: async () => { throw new Error('no browser'); },
      page: null,
    };
    // 使用一个无效端口，fetch 会失败，handler 应捕获并返回错误
    const result = await securityHandle('security_headers_check', { url: 'http://localhost:1/test' }, deps);
    const parsed = parseMcpResult(result);
    assert.equal(parsed.error, 'EXECUTION_ERROR');
    assert.ok(parsed.message.includes('安全扫描执行失败'));
  });
});
