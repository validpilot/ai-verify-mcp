'use strict';

/**
 * 测试 v1.7.0 增强功能：captcha_detect/screenshot/read, correlate_triple_check, mcp_self_test
 * 通过 HTTP 模式启动本地 MCP 服务器进行测试
 */

const { spawn } = require('child_process');
const path = require('path');

const PORT = 3460;
const SERVER_PATH = path.join(__dirname, '..', 'server.js');
const TEST_URL = 'https://panjiachen.github.io/vue-element-admin/';

let serverProc = null;
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  PASS ${msg}`);
    passed++;
  } else {
    console.log(`  FAIL ${msg}`);
    failed++;
  }
}

async function fetchMcp(method, params) {
  const body = { jsonrpc: '2.0', id: String(Date.now()), method, params: params || {} };
  const res = await fetch(`http://localhost:${PORT}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (json.error) throw new Error(`MCP error: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function callTool(name, args) {
  const result = await fetchMcp('tools/call', { name, arguments: args });
  if (result.content && result.content[0] && result.content[0].text) {
    try { return JSON.parse(result.content[0].text); } catch (_) { return result.content[0].text; }
  }
  return result;
}

async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${PORT}/health`);
      if (res.ok) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  console.log('Starting local MCP server (HTTP mode)...');
  serverProc = spawn(process.execPath, [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, MCP_MODE: 'http', MCP_HTTP_PORT: String(PORT), NODE_ENV: 'test' }
  });

  serverProc.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) process.stderr.write(`[server] ${msg}\n`);
  });
  serverProc.stdout.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) process.stderr.write(`[server:out] ${msg}\n`);
  });

  const ready = await waitForServer();
  if (!ready) {
    console.error('Server failed to start within 20s');
    process.exit(1);
  }
  console.log('Server ready.\n');

  // Test 1: mcp_health_check
  console.log('=== Test 1: mcp_health_check ===');
  try {
    const health = await callTool('mcp_health_check', {});
    assert(health.ok === true, 'health check ok');
    assert(health.schema && health.schema.registeredCount === 128, '128 tools registered');
    assert(health.version === '1.6.9', `version is ${health.version}`);
  } catch (e) {
    assert(false, `health check failed: ${e.message}`);
  }

  // Test 2: browser_captcha_detect (enhanced — should detect scripts, providers)
  console.log('\n=== Test 2: browser_captcha_detect (enhanced) ===');
  try {
    const result = await callTool('browser_captcha_detect', { url: TEST_URL, detectMode: 'auto' });
    assert(result.found === false, 'no captcha on vue-element-admin (expected)');
    assert(Array.isArray(result.scripts), `scripts field exists (${result.scripts?.length || 0} scripts)`);
    assert(result.provider !== undefined, `provider field exists: ${result.provider}`);
    assert(Array.isArray(result.suggestions), 'suggestions field exists');
    assert(result.suggestions.length >= 3, `suggestions has >= 3 items (${result.suggestions.length})`);
  } catch (e) {
    assert(false, `captcha_detect failed: ${e.message}`);
  }

  // Test 3: browser_captcha_screenshot (enhanced — autoRefresh implemented)
  console.log('\n=== Test 3: browser_captcha_screenshot (autoRefresh) ===');
  try {
    const result = await callTool('browser_captcha_screenshot', { url: TEST_URL, autoRefresh: true, minSize: 100 });
    assert(result.success === false, 'no captcha found (expected)');
    assert(result.error === '未找到验证码元素', 'correct error message');
    assert(Array.isArray(result.suggestions), 'suggestions field exists');
  } catch (e) {
    assert(false, `captcha_screenshot failed: ${e.message}`);
  }

  // Test 4: browser_captcha_read (enhanced — iframe + preprocessing)
  console.log('\n=== Test 4: browser_captcha_read (iframe + preprocessing) ===');
  try {
    const result = await callTool('browser_captcha_read', { url: TEST_URL });
    assert(result.success === false, 'no captcha found (expected)');
    assert(result.error === '未找到验证码元素', 'correct error message');
    assert(result.suggestions && result.suggestions.length >= 3, `suggestions has >= 3 items (${result.suggestions?.length})`);
    assert(result.suggestions.some(s => s.includes('iframe')), 'mentions iframe in suggestions');
  } catch (e) {
    assert(false, `captcha_read failed: ${e.message}`);
  }

  // Test 5: correlate_triple_check (enhanced — multi-pattern API derivation)
  console.log('\n=== Test 5: correlate_triple_check (enhanced API derivation) ===');
  try {
    const result = await callTool('correlate_triple_check', { mode: 'list', maxRows: 5 });
    assert(result.success === true, 'correlate_triple_check ran successfully');
    assert(result.apiDerivation !== undefined, 'apiDerivation field exists (NEW)');
    assert(result.apiDerivation && result.apiDerivation.resource !== undefined, `resource derived: ${result.apiDerivation?.resource}`);
    assert(result.apiDerivation && Array.isArray(result.apiDerivation.patterns), `patterns array exists (${result.apiDerivation?.patterns?.length || 0} patterns)`);
    assert(result.apiDerivation && result.apiDerivation.tried !== undefined, `tried pattern recorded: ${result.apiDerivation?.tried}`);
    assert(result.apiDerivation && result.apiDerivation.spaFramework !== undefined, `SPA framework detected: ${result.apiDerivation?.spaFramework}`);
    assert(result.apiResponse && result.apiResponse.source !== undefined, `API response source: ${result.apiResponse?.source}`);
  } catch (e) {
    assert(false, `correlate_triple_check failed: ${e.message}`);
  }

  // Test 6: mcp_self_test (enhanced — toolTests + perf metrics)
  console.log('\n=== Test 6: mcp_self_test (enhanced with toolTests + perf) ===');
  try {
    const result = await callTool('mcp_self_test', {});
    assert(result.ok === true || result.ok === false, `self_test returned ok: ${result.ok}`);
    assert(result.toolTests !== undefined, 'toolTests field exists (NEW)');
    if (result.toolTests) {
      assert(result.toolTests.total >= 9, `toolTests total >= 9: ${result.toolTests.total}`);
      assert(result.toolTests.passed >= 7, `toolTests passed >= 7: ${result.toolTests.passed}`);
      assert(result.toolTests.summary !== undefined, 'toolTests summary exists');
      console.log(`    toolTests: ${result.toolTests.passed}/${result.toolTests.total} passed (${result.toolTests.summary?.passRate})`);
      if (result.toolTests.results) {
        for (const t of result.toolTests.results) {
          console.log(`    - ${t.name}: ${t.passed ? 'PASS' : 'FAIL'} (${t.duration}ms)`);
        }
      }
    }
    assert(result.perf !== undefined, 'perf field exists (NEW)');
    if (result.perf) {
      assert(result.perf.phases !== undefined, 'perf phases exist');
      assert(result.perf.total && result.perf.total.duration !== undefined, `total duration: ${result.perf.total?.duration}ms`);
      console.log(`    perf phases: setup=${result.perf.phases.setup}ms, navigate=${result.perf.phases.navigate}ms, flow=${result.perf.phases.flow}ms, toolTests=${result.perf.phases.toolTests}ms`);
    }
    assert(result.flow && result.flow.passed === true, 'browser flow passed');
    assert(result.health && result.health.ok === true, 'health check ok');
  } catch (e) {
    assert(false, `mcp_self_test failed: ${e.message}`);
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  // Shutdown
  if (serverProc) {
    serverProc.kill('SIGTERM');
    setTimeout(() => { if (serverProc) serverProc.kill('SIGKILL'); }, 2000);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  if (serverProc) serverProc.kill('SIGKILL');
  process.exit(1);
});
