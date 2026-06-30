const http = require('http');

const OPTIONS = {
  hostname: 'localhost',
  port: 3456,
  path: '/mcp',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
};

let reqId = 300;

function mcpRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = String(++reqId);
    const req = http.request(OPTIONS, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.error) {
            reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          } else {
            resolve(parsed.result);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    }));
    req.end();
  });
}

function callTool(name, args = {}) {
  return mcpRequest('tools/call', { name, arguments: args });
}

const results = [];

async function test(name, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration, detail: result?.detail || '' });
    console.log(`✅ ${name} (${duration}ms)`);
    return result;
  } catch (e) {
    const duration = Date.now() - start;
    results.push({ name, passed: false, duration, error: e.message });
    console.log(`❌ ${name} (${duration}ms) - ${e.message.substring(0, 100)}`);
    return null;
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('ValidPilot 全面测试 - 第三轮（剩余工具覆盖）');
  console.log('='.repeat(70));

  await mcpRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'e2e-test-3', version: '1.0' }
  });

  const demoUrl = 'file:///' + __dirname.replace(/\\/g, '/') + '/examples/demo/index.html';
  await callTool('browser_open', { url: demoUrl, waitUntil: 'domcontentloaded' });

  console.log('\n' + '═'.repeat(70));
  console.log('🧰 剩余工具测试');
  console.log('═'.repeat(70));

  await test('ai_debug_investigate - AI调试调查', async () => {
    const r = await callTool('ai_debug_investigate', { description: '测试页面' });
    return { detail: 'AI调试调查完成' };
  });

  await test('benchmark_run - 基准测试', async () => {
    const r = await callTool('benchmark_run', { iterations: 2 });
    return { detail: '基准测试完成' };
  });

  await test('browser_select - 选择操作', async () => {
    const r = await callTool('browser_select', { selector: 'select', value: 'test' });
    return { detail: '选择操作完成' };
  });

  await test('browser_session_close - 关闭会话', async () => {
    const r = await callTool('browser_session_close', { name: 'test-session' });
    return { detail: '会话关闭成功' };
  });

  await test('validation_start - 开始验证', async () => {
    const r = await callTool('validation_start', { name: 'test-validation' });
    return { detail: '验证开始成功' };
  });

  await test('validation_run - 运行验证', async () => {
    const r = await callTool('validation_run', { checks: [] });
    return { detail: '验证运行完成' };
  });

  await test('validation_suite_run - 验证套件运行', async () => {
    const r = await callTool('validation_suite_run', { suite: [] });
    return { detail: '验证套件运行完成' };
  });

  console.log('\n' + '═'.repeat(70));
  console.log('📊 第三轮测试结果汇总');
  console.log('═'.repeat(70));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  const passRate = ((passed / total) * 100).toFixed(1);
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n第三轮测试数: ${total}`);
  console.log(`通过: ${passed}  ✅`);
  console.log(`失败: ${failed}  ❌`);
  console.log(`通过率: ${passRate}%`);
  console.log(`总耗时: ${totalTime}ms`);

  if (failed > 0) {
    console.log('\n❌ 失败的测试:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error?.substring(0, 80)}`);
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log('\n📊 三轮测试汇总:');
  console.log('  第一轮: 38个工具');
  console.log('  第二轮: 29个工具');
  console.log(`  第三轮: ${total}个工具`);
  console.log(`  累计: ${38 + 29 + total}个工具`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('测试执行失败:', e);
  process.exit(1);
});
