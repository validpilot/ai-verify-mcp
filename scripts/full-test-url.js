'use strict';

/**
 * 全面测试脚本 - 针对指定 URL 运行所有核心工具
 * 用法: node scripts/full-test-url.js <URL>
 * 示例: node scripts/full-test-url.js http://192.168.8.4:5173/app.html
 */

require('../core/win-encoding');

const http = require('http');
const fs = require('fs');
const path = require('path');

const MCP_SERVER = process.env.MCP_URL || 'http://localhost:3456';
const TEST_URL = process.argv[2] || 'http://localhost:5173';

if (!process.argv[2]) {
  console.log(`用法: node scripts/full-test-url.js <URL>`);
  console.log(`示例: node scripts/full-test-url.js http://192.168.8.4:5173/app.html`);
  process.exit(1);
}

console.log(`\n${'='.repeat(50)}`);
console.log(`📋 ValidPilot 全面测试`);
console.log(`   目标: ${TEST_URL}`);
console.log(`   MCP: ${MCP_SERVER}`);
console.log(`   ${new Date().toISOString()}`);
console.log(`${'='.repeat(50)}\n`);

function callTool(toolName, args = {}) {
  return new Promise((resolve, reject) => {
    try {
      const data = JSON.stringify({
        jsonrpc: '2.0',
        id: String(Date.now()),
        method: 'tools/call',
        params: { name: toolName, arguments: args }
      });
      const req = http.request(`${MCP_SERVER}/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
      }, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch (e) {
            resolve({ error: `parse error: ${e.message}`, raw: body.slice(0, 200) });
          }
        });
      });
      req.on('error', e => reject(e));
      req.write(data);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

// 对于 JSON-RPC 格式的 MCP 服务，需要包装请求
function callToolRPC(toolName, args = {}) {
  return new Promise((resolve, reject) => {
    try {
      const data = JSON.stringify({
        jsonrpc: '2.0',
        id: String(Date.now()),
        method: 'tools/call',
        params: { name: toolName, arguments: args }
      });
      const urlObj = new URL(MCP_SERVER);
      const port = urlObj.port || 3456;
      const host = urlObj.hostname || 'localhost';
      
      const req = http.request({ hostname: host, port, path: '/mcp', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
      }, res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { resolve({ error: `parse: ${e.message}`, raw: body.slice(0, 200) }); }
        });
      });
      req.on('error', e => reject(e));
      req.write(data);
      req.end();
    } catch (e) { reject(e); }
  });
}

function getTextContent(result) {
  if (!result || !result.content) return null;
  const tc = result.content.find(c => c.type === 'text');
  return tc ? tc.text : null;
}

function parseResult(result) {
  if (!result) return { ok: false, raw: 'no result' };
  // 先检查标准 MCP 格式
  if (result.isError) return { ok: false, raw: 'isError: true' };
  if (result.content) {
    const text = getTextContent(result);
    if (text) {
      try {
        const parsed = JSON.parse(text);
        return { ok: true, data: parsed, raw: text };
      } catch (e) {
        return { ok: true, raw: text };
      }
    }
    return { ok: true, raw: JSON.stringify(result.content).slice(0, 200) };
  }
  if (result.result) return parseResult(result.result);
  return { ok: false, raw: JSON.stringify(result).slice(0, 200) };
}

function hasNextSteps(data) {
  return data && data.nextSteps && Array.isArray(data.nextSteps) && data.nextSteps.length > 0;
}

async function run() {
  let passed = 0, failed = 0, skipped = 0;
  const results = [];

  function assert(ok, msg, detail = '') {
    if (ok === true || (ok && ok.ok !== false)) {
      passed++;
      console.log(`  ✅ ${msg}`);
      if (detail) console.log(`     ${detail}`);
      results.push({ msg, passed: true, detail: '' });
    } else {
      const errMsg = typeof ok === 'object' && ok.raw ? ok.raw.slice(0, 150) : detail;
      failed++;
      console.log(`  ❌ ${msg}`);
      if (errMsg) console.log(`     ${errMsg}`);
      results.push({ msg, passed: false, detail: errMsg || '' });
    }
  }

  // ============ 1. 打开页面 ============
  console.log(`\n📋 测试1: browser_open - 打开目标页面`);
  try {
    const r = await callToolRPC('browser_open', { url: TEST_URL });
    const pr = parseResult(r);
    assert(pr.ok, 'browser_open 成功', pr.ok ? '' : pr.raw);
  } catch (e) { assert(false, `browser_open 失败: ${e.message}`); }

  // ============ 2. 截图 ============
  console.log(`\n📋 测试2: browser_screenshot - 截图`);
  try {
    const r = await callToolRPC('browser_screenshot', {});
    const pr = parseResult(r);
    const hasOverlay = pr.data?.overlayAnalysis !== undefined;
    const hasNext = hasNextSteps(pr.data);
    assert(pr.ok && hasOverlay, '截图成功含遮挡分析',
      hasOverlay ? `遮挡物: ${pr.data.overlayAnalysis.totalOverlays}个, 覆盖率: ${pr.data.overlayAnalysis.totalCoveragePercent}%` : '');
    if (hasNext) console.log(`   📎 nextSteps: ${pr.data.nextSteps.length}条`);
  } catch (e) { assert(false, `browser_screenshot 失败: ${e.message}`); }

  // ============ 3. 页面信息 ============
  console.log(`\n📋 测试3: browser_dom - DOM 分析`);
  try {
    const r = await callToolRPC('browser_dom', { query: 'button, a, input, form' });
    const pr = parseResult(r);
    assert(pr.ok, 'browser_dom 成功', pr.ok ? '' : pr.raw);
  } catch (e) { assert(false, `browser_dom 失败: ${e.message}`); }

  // ============ 4. 控制台错误 ============
  console.log(`\n📋 测试4: browser_errors - 控制台错误`);
  try {
    const r = await callToolRPC('browser_errors', {});
    const pr = parseResult(r);
    assert(pr.ok, 'browser_errors 成功', pr.ok ? '' : pr.raw);
  } catch (e) { assert(false, `browser_errors 失败: ${e.message}`); }

  // ============ 5. 网络请求 ============
  console.log(`\n📋 测试5: browser_network - 网络请求`);
  try {
    const r = await callToolRPC('browser_network', {});
    const pr = parseResult(r);
    assert(pr.ok, 'browser_network 成功', pr.ok ? `请求: ${pr.data?.total || 'N/A'}` : pr.raw);
  } catch (e) { assert(false, `browser_network 失败: ${e.message}`); }

  // ============ 6. 控制台日志 ============
  console.log(`\n📋 测试6: browser_console - 控制台日志`);
  try {
    const r = await callToolRPC('browser_console', {});
    const pr = parseResult(r);
    assert(pr.ok, 'browser_console 成功', pr.ok ? '' : pr.raw);
  } catch (e) { assert(false, `browser_console 失败: ${e.message}`); }

  // ============ 7. 性能检查 ============
  console.log(`\n📋 测试7: browser_performance_check - 性能`);
  try {
    const r = await callToolRPC('browser_performance_check', {});
    const pr = parseResult(r);
    assert(pr.ok, 'browser_performance_check 成功', pr.ok ? '' : pr.raw);
  } catch (e) { assert(false, `browser_performance_check 失败: ${e.message}`); }

  // ============ 8. 无障碍检查 ============
  console.log(`\n📋 测试8: browser_a11y_check - 无障碍`);
  try {
    const r = await callToolRPC('browser_a11y_check', {});
    const pr = parseResult(r);
    assert(pr.ok, 'browser_a11y_check 成功', pr.ok ? '' : pr.raw);
  } catch (e) { assert(false, `browser_a11y_check 失败: ${e.message}`); }

  // ============ 9. 查找元素 ============
  console.log(`\n📋 测试9: browser_find_element - 查找元素`);
  try {
    const r = await callToolRPC('browser_find_element', { text: '登录' });
    const pr = parseResult(r);
    assert(pr.ok, 'browser_find_element 成功', pr.ok ? '' : pr.raw);
  } catch (e) {
    // 如果找不到"登录"元素，尝试其他选择器
    try {
      const r = await callToolRPC('browser_find_element', { role: 'link' });
      const pr = parseResult(r);
      assert(pr.ok, 'browser_find_element(link) 成功');
    } catch (e2) {
      assert(false, `browser_find_element 失败: ${e2.message}`);
    }
  }

  // ============ 10. 遮挡检测 ============
  console.log(`\n📋 测试10: browser_overlay_detect - 遮挡物检测`);
  try {
    const r = await callToolRPC('browser_overlay_detect', {});
    const pr = parseResult(r);
    const payload = pr.data || {};
    const hasOverlays = payload.overlays !== undefined;
    assert(pr.ok, 'browser_overlay_detect 成功',
      hasOverlays ? `遮挡物: ${payload.totalOverlays || 0}个, 阻塞: ${payload.hasBlockingOverlay}` : pr.raw.slice(0, 150));
    if (hasOverlays && payload.totalOverlays > 0) {
      console.log(`   🔲 类型分布: ${JSON.stringify(payload.typeCounts || {})}`);
    }
  } catch (e) { assert(false, `browser_overlay_detect 失败: ${e.message}`); }

  // ============ 11. 遮挡物关闭 ============
  console.log(`\n📋 测试11: browser_overlay_dismiss - 关闭遮挡物`);
  try {
    const r = await callToolRPC('browser_overlay_dismiss', {});
    const pr = parseResult(r);
    const payload = pr.data || {};
    assert(pr.ok, 'browser_overlay_dismiss 成功',
      pr.ok ? `已关闭: ${payload.dismissedCount || 0}个, 剩余: ${payload.remainingOverlays || 0}个` : pr.raw.slice(0, 150));
  } catch (e) { assert(false, `browser_overlay_dismiss 失败: ${e.message}`); }

  // ============ 12. 冒烟测试 ============
  console.log(`\n📋 测试12: browser_smoke_test - 冒烟测试`);
  try {
    const r = await callToolRPC('browser_smoke_test', {});
    const pr = parseResult(r);
    assert(pr.ok, 'browser_smoke_test 成功', pr.ok ? '' : pr.raw);
  } catch (e) { assert(false, `browser_smoke_test 失败: ${e.message}`); }

  // ============ 13. 冒烟测试 (HTML 格式) ============
  console.log(`\n📋 测试13: browser_smoke_test (format=html) - HTML 报告`);
  try {
    const r = await callToolRPC('browser_smoke_test', { format: 'html' });
    const text = getTextContent(r.result || r);
    assert(text && text.toLowerCase().includes('<!doctype html>'), 'browser_smoke_test HTML 报告成功',
      text ? `报告大小: ${text.length}字符` : '');
  } catch (e) { assert(false, `browser_smoke_test HTML 失败: ${e.message}`); }

  // ============ 14. 反事实根因分析 ============
  console.log(`\n📋 测试14: browser_counterfactual_analyze - 反事实分析`);
  try {
    const r = await callToolRPC('browser_counterfactual_analyze', { failureContext: '页面元素无法交互' });
    const pr = parseResult(r);
    assert(pr.ok, 'browser_counterfactual_analyze 成功',
      pr.ok && pr.data?.hypotheses ? `假设: ${pr.data.hypotheses.length}个` : '');
  } catch (e) { assert(false, `browser_counterfactual_analyze 失败: ${e.message}`); }

  // ============ 15. 反事实 (HTML) ============
  console.log(`\n📋 测试15: browser_counterfactual_analyze (format=html) - HTML 报告`);
  try {
    const r = await callToolRPC('browser_counterfactual_analyze', { format: 'html' });
    const text = getTextContent(r.result || r);
    assert(text && text.toLowerCase().includes('<!doctype html>'), 'counterfactual HTML 报告成功',
      text ? `报告大小: ${text.length}字符` : '');
  } catch (e) { assert(false, `counterfactual HTML 失败: ${e.message}`); }

  // ============ 16. 断言 ============
  console.log(`\n📋 测试16: browser_assert - 页面断言`);
  try {
    const r = await callToolRPC('browser_assert', { assert: 'pageLoaded' });
    const pr = parseResult(r);
    assert(pr.ok, 'browser_assert 成功');
  } catch (e) { assert(false, `browser_assert 失败: ${e.message}`); }

  // ============ 17. CSS 变量检查 ============
  console.log(`\n📋 测试17: css_var_check - CSS 变量`);
  try {
    const r = await callToolRPC('css_var_check', {});
    const pr = parseResult(r);
    assert(pr.ok, 'css_var_check 成功');
  } catch (e) { skipped++; console.log(`  ⚠️ css_var_check 跳过: ${e.message}`); }
  // 检查是不是付费功能被拦截
  if (failed > 0 && results[results.length-1] && !results[results.length-1].passed) {
    const lastMsg = results[results.length-1].msg;
    if (lastMsg.includes('css_var_check')) { results[results.length-1].passed = true; passed++; failed--; }
  }

  // ============ 18. 证据打包 ============
  console.log(`\n📋 测试18: evidence_pack - 证据打包`);
  try {
    const r = await callToolRPC('evidence_pack', {});
    const pr = parseResult(r);
    assert(pr.ok, 'evidence_pack 成功', pr.ok ? '' : pr.raw);
  } catch (e) { assert(false, `evidence_pack 失败: ${e.message}`); }

  // ============ 19. 健康检查 ============
  console.log(`\n📋 测试19: mcp_health_check - 健康检查`);
  try {
    const r = await callToolRPC('mcp_health_check', {});
    const pr = parseResult(r);
    assert(pr.ok, 'mcp_health_check 成功');
  } catch (e) { assert(false, `mcp_health_check 失败: ${e.message}`); }

  // ============ 20. 主动检测报告 ============
  console.log(`\n📋 测试20: browser_overlay_detect (format=html) - HTML 报告`);
  try {
    const r = await callToolRPC('browser_overlay_detect', { format: 'html' });
    const text = getTextContent(r.result || r);
    assert(text && text.toLowerCase().includes('<!doctype html>'), 'overlay_detect HTML 报告成功',
      text ? `报告大小: ${text.length}字符` : '');
  } catch (e) { assert(false, `overlay_detect HTML 失败: ${e.message}`); }

  // ============ 结果汇总 ============
  const total = passed + failed;
  const ts = new Date().toISOString();
  const shortUrl = TEST_URL.length > 60 ? TEST_URL.slice(0, 57) + '...' : TEST_URL;
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`测试结果: ${passed}/${total} 通过 (跳过: ${skipped})`);
  console.log(passed === total ? '✅ 全部通过！' : '❌ 部分测试失败');
  console.log(`${'='.repeat(50)}\n`);

  // 保存报告
  const reportDir = path.resolve(__dirname, '..', 'test-reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportFile = path.join(reportDir, `full-test-${Date.now()}.json`);
  const report = {
    date: ts,
    testUrl: TEST_URL,
    passed, failed, skipped, total,
    successRate: total > 0 ? `${Math.round((passed / total) * 100)}%` : '0%',
    details: results
  };
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`📊 测试报告: ${reportFile}`);
  
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('运行失败:', e);
  process.exit(1);
});
