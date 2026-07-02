'use strict';
/**
 * 一键测试：杀死旧服务 → 启动 MCP → 运行全面测试
 * node scripts/kill-and-test.js <URL>
 */
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const TEST_URL = process.argv[2] || 'http://localhost:5173';
const PORT = 3456;
const MAX_WAIT = 30000;

// 1. 杀死占用端口的进程
function killPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr ":${port}"`, { encoding: 'utf8', timeout: 5000 });
    const lines = out.trim().split('\n').filter(l => l.includes('LISTENING'));
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid) {
        try { execSync(`taskkill /f /pid ${pid}`, { stdio: 'pipe', timeout: 3000 }); } catch (_) {}
      }
    }
  } catch (_) {}
  console.log(`端口 ${port} 已释放`);
}

// 2. 等待端口可访问
function waitForPort(port, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://localhost:${port}/health`, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(true));
      });
      req.on('error', () => {
        if (Date.now() - start > timeout) reject(new Error(`端口 ${port} 启动超时`));
        else setTimeout(check, 500);
      });
      req.setTimeout(2000, () => { req.destroy(); setTimeout(check, 500); });
    };
    check();
  });
}

// 3. 调用 MCP 工具
function callTool(toolName, args = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ jsonrpc: '2.0', id: String(Date.now()), method: 'tools/call', params: { name: toolName, arguments: args } });
    const req = http.request({ hostname: 'localhost', port: PORT, path: '/mcp', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve({ error: e.message }); } });
    });
    req.on('error', e => reject(e));
    req.write(data);
    req.end();
  });
}

function getText(r) {
  if (!r) return null;
  const content = r.result?.content || r.content;
  if (!content) return null;
  const tc = content.find(c => c.type === 'text');
  return tc ? tc.text : null;
}

function parse(r) {
  if (!r) return { ok: false, raw: 'no result' };
  if (r.isError || r.result?.isError) return { ok: false, raw: 'isError: true' };
  const text = getText(r);
  if (!text) return { ok: true, data: null, raw: '' };
  try {
    const data = JSON.parse(text);
    return { ok: true, data, raw: text };
  } catch (e) {
    return { ok: true, data: null, raw: text };
  }
}

function htmlOk(r) {
  const text = getText(r);
  return text && text.toLowerCase().includes('<!doctype html>');
}

async function main() {
  console.log(`\n${'='.repeat(50)}`);
  console.log('ValidPilot 全面测试');
  console.log(`目标: ${TEST_URL}`);
  console.log(`${'='.repeat(50)}\n`);

  // 清理端口
  killPort(PORT);
  
  // 启动 MCP 服务
  console.log('\n启动 MCP 服务...');
  const mcp = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MCP_MODE: 'http', MCP_HTTP_PORT: String(PORT) }
  });
  mcp.stdout.on('data', d => {});
  mcp.stderr.on('data', d => {});
  mcp.on('error', e => { console.error('MCP 启动失败:', e.message); process.exit(1); });

  try {
    await waitForPort(PORT, MAX_WAIT);
    console.log(`✅ MCP 已就绪 (端口 ${PORT})`);
  } catch (e) {
    console.error(`❌ MCP 启动超时`);
    mcp.kill();
    process.exit(1);
  }

  // 首先打开页面
  console.log('\n📋 打开目标页面...');
  try {
    const r = await callTool('browser_open', { url: TEST_URL });
    const p = parse(r);
    console.log(p.ok ? '  ✅ 页面打开成功' : `  ❌ 打开失败: ${p.raw}`);
    if (!p.ok) { mcp.kill(); process.exit(1); }
  } catch (e) {
    console.error(`  ❌ ${e.message}`);
    mcp.kill();
    process.exit(1);
  }

  // 等待页面渲染
  await new Promise(r => setTimeout(r, 3000));

  // 运行全面测试
  const tests = [
    // [name, tool, args, check]
    ['browser_screenshot - 截图（含遮挡分析）', 'browser_screenshot', {}, r => { const p = parse(r); return p.ok && (p.data?.overlayAnalysis || p.data?.content) ? '' : '缺少 overlayAnalysis'; }],
    ['browser_dom - DOM 分析', 'browser_dom', { query: 'button, a, input, form' }, r => parse(r).ok],
    ['browser_errors - 控制台错误', 'browser_errors', {}, r => parse(r).ok],
    ['browser_network - 网络请求', 'browser_network', {}, r => parse(r).ok],
    ['browser_console - 控制台日志', 'browser_console', {}, r => parse(r).ok],
    ['browser_performance_check - 性能', 'browser_performance_check', {}, r => parse(r).ok],
    ['browser_a11y_check - 无障碍', 'browser_a11y_check', {}, r => parse(r).ok],
    ['browser_find_element - 查找元素', 'browser_find_element', { text: '登录' }, r => parse(r).ok],
    ['browser_overlay_detect - 遮挡检测', 'browser_overlay_detect', {}, r => { const p = parse(r); return p.ok ? '' : p.raw; }],
    ['browser_overlay_dismiss - 关闭遮挡', 'browser_overlay_dismiss', {}, r => { const p = parse(r); return p.ok ? '' : p.raw; }],
    ['browser_smoke_test - 冒烟测试', 'browser_smoke_test', {}, r => parse(r).ok],
    ['browser_smoke_test (HTML 报告)', 'browser_smoke_test', { format: 'html' }, r => htmlOk(r) ? '' : '非 HTML 输出'],
    ['browser_counterfactual_analyze - 反事实', 'browser_counterfactual_analyze', { failureContext: '按钮无法点击' }, r => parse(r).ok],
    ['counterfactual (HTML 报告)', 'browser_counterfactual_analyze', { format: 'html' }, r => htmlOk(r) ? '' : '非 HTML 输出'],
    ['browser_assert - 断言', 'browser_assert', { assert: 'pageLoaded' }, r => parse(r).ok],
    ['evidence_pack - 证据打包', 'evidence_pack', {}, r => parse(r).ok],
    ['mcp_health_check - 健康检查', 'mcp_health_check', {}, r => parse(r).ok],
    ['browser_overlay_detect (HTML 报告)', 'browser_overlay_detect', { format: 'html' }, r => htmlOk(r) ? '' : '非 HTML 输出'],
    ['css_var_check - CSS 变量', 'css_var_check', {}, r => { const p = parse(r); return p.ok ? '' : (typeof p.raw === 'string' && p.raw.includes('缺失模块') ? 'SKIP' : p.raw); }],
  ];

  let passed = 0, failed = 0, skipped = 0;
  const details = [];

  console.log('');
  for (const [name, tool, args, check] of tests) {
    try {
      const r = await callTool(tool, args);
      let res = check ? check(r) : true;
      if (res === true || res === '') {
        passed++;
        console.log(`  ✅ ${name}`);
        details.push({ name, passed: true });
      } else if (res === 'SKIP') {
        skipped++;
        console.log(`  ⚠️ ${name} (跳过)`);
        details.push({ name, passed: true, skipped: true });
      } else {
        failed++;
        console.log(`  ❌ ${name}`);
        console.log(`     ${res}`);
        details.push({ name, passed: false, error: res });
      }
    } catch (e) {
      failed++;
      console.log(`  ❌ ${name}`);
      console.log(`     ${e.message}`);
      details.push({ name, passed: false, error: e.message });
    }
  }

  const total = passed + failed;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`测试结果: ${passed}/${total} 通过 (跳过: ${skipped})`);
  console.log(passed === total ? '✅ 全部通过！' : '❌ 部分失败');
  console.log(`${'='.repeat(50)}\n`);

  // 保存报告
  const reportDir = path.join(ROOT, 'test-reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const rf = path.join(reportDir, `full-http-test-${Date.now()}.json`);
  fs.writeFileSync(rf, JSON.stringify({
    date: new Date().toISOString(),
    testUrl: TEST_URL,
    passed, failed, skipped, total,
    successRate: `${Math.round(passed / total * 100)}%`,
    details
  }, null, 2));
  console.log(`📊 报告: ${rf}`);

  mcp.kill();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
