const http = require('http');

const OPTIONS = {
  hostname: 'localhost',
  port: 3456,
  path: '/mcp',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
};

let reqId = 200;

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
  console.log('ValidPilot 全面测试 - 第二轮（更多工具覆盖）');
  console.log('='.repeat(70));

  await mcpRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'e2e-test-2', version: '1.0' }
  });

  const demoUrl = 'file:///' + __dirname.replace(/\\/g, '/') + '/examples/demo/index.html';
  await callTool('browser_open', { url: demoUrl, waitUntil: 'domcontentloaded' });

  console.log('\n' + '═'.repeat(70));
  console.log('🎨 视觉对比工具组');
  console.log('═'.repeat(70));

  await test('browser_visual_baseline - 视觉基线', async () => {
    const r = await callTool('browser_visual_baseline', { name: 'test-baseline' });
    return { detail: '基线创建成功' };
  });

  await test('browser_visual_compare - 视觉对比', async () => {
    const r = await callTool('browser_visual_compare', { baselineName: 'test-baseline' });
    return { detail: '视觉对比完成' };
  });

  await test('browser_visual_report - 视觉报告', async () => {
    const r = await callTool('browser_visual_report', {});
    return { detail: '视觉报告生成成功' };
  });

  console.log('\n' + '═'.repeat(70));
  console.log('🪟 会话管理工具组');
  console.log('═'.repeat(70));

  await test('browser_sessions - 会话列表', async () => {
    const r = await callTool('browser_sessions', {});
    return { detail: '会话列表获取成功' };
  });

  await test('browser_session_create - 创建会话', async () => {
    const r = await callTool('browser_session_create', { name: 'test-session' });
    return { detail: '会话创建成功' };
  });

  await test('browser_session_switch - 切换会话', async () => {
    const r = await callTool('browser_session_switch', { name: 'default' });
    return { detail: '会话切换成功' };
  });

  console.log('\n' + '═'.repeat(70));
  console.log('🪟 会话管理工具组');
  console.log('═'.repeat(70));

  await test('browser_events - 事件列表', async () => {
    const r = await callTool('browser_events', { limit: 10 });
    return { detail: '事件获取成功' };
  });

  await test('browser_trace_start - 开始追踪', async () => {
    const r = await callTool('browser_trace_start', { name: 'test-trace' });
    return { detail: '追踪开始成功' };
  });

  await test('browser_trace_stop - 停止追踪', async () => {
    const r = await callTool('browser_trace_stop', {});
    return { detail: '追踪停止成功' };
  });

  await test('browser_har_export - HAR导出', async () => {
    const r = await callTool('browser_har_export', {});
    return { detail: 'HAR导出成功' };
  });

  console.log('\n' + '═'.repeat(70));
  console.log('🔍 高级诊断工具组');
  console.log('═'.repeat(70));

  await test('browser_find_page - 页面类型识别', async () => {
    const r = await callTool('browser_find_page', { target: 'home' });
    return { detail: '页面识别完成' };
  });

  await test('browser_traverse_menu - 菜单遍历', async () => {
    const r = await callTool('browser_traverse_menu', { selector: 'nav' });
    return { detail: '菜单遍历完成' };
  });

  await test('browser_quick_fix - 快速修复', async () => {
    const r = await callTool('browser_quick_fix', { selector: 'body', problem: 'not_found' });
    return { detail: '快速修复完成' };
  });

  await test('browser_verify_fix - 修复验证', async () => {
    const r = await callTool('browser_verify_fix', { selector: 'body' });
    return { detail: '修复验证完成' };
  });

  await test('browser_network_detail - 网络详情', async () => {
    const r = await callTool('browser_network_detail', { limit: 5 });
    return { detail: '网络详情获取成功' };
  });

  console.log('\n' + '═'.repeat(70));
  console.log('📝 验证框架工具组');
  console.log('═'.repeat(70));

  await test('validation_flow - 流程验证', async () => {
    const r = await callTool('validation_flow', { flowType: 'basic' });
    return { detail: '流程验证完成' };
  });

  await test('validation_matrix - 矩阵验证', async () => {
    const r = await callTool('validation_matrix', { checks: ['urlContains:demo'] });
    return { detail: '矩阵验证完成' };
  });

  await test('validation_decision - 验证决策', async () => {
    const r = await callTool('validation_decision', { checks: [] });
    return { detail: '验证决策完成' };
  });

  await test('validation_report_export - 报告导出', async () => {
    const r = await callTool('validation_report_export', { format: 'markdown' });
    return { detail: '报告导出成功' };
  });

  await test('error_summary_md - 错误MD摘要', async () => {
    const r = await callTool('error_summary_md', {});
    return { detail: '错误摘要生成成功' };
  });

  console.log('\n' + '═'.repeat(70));
  console.log('🧪 其他工具组');
  console.log('═'.repeat(70));

  await test('browser_batch - 批量操作', async () => {
    const r = await callTool('browser_batch', { actions: [
      { type: 'scroll', direction: 'bottom' },
      { type: 'scroll', direction: 'top' }
    ]});
    return { detail: '批量操作完成' };
  });

  await test('browser_highlight - 元素高亮', async () => {
    const r = await callTool('browser_highlight', { selector: 'h1' });
    return { detail: '元素高亮成功' };
  });

  await test('browser_step - 步骤记录', async () => {
    const r = await callTool('browser_step', { label: 'test-step' });
    return { detail: '步骤记录成功' };
  });

  await test('browser_instrument - 代码注入', async () => {
    const r = await callTool('browser_instrument', {});
    return { detail: '代码注入成功' };
  });

  await test('browser_artifacts_clear - 清空工件', async () => {
    const r = await callTool('browser_artifacts_clear', {});
    return { detail: '工件清空成功' };
  });

  await test('browser_errors_clear - 清空错误', async () => {
    const r = await callTool('browser_errors_clear', {});
    return { detail: '错误清空成功' };
  });

  await test('browser_events_clear - 清空事件', async () => {
    const r = await callTool('browser_events_clear', {});
    return { detail: '事件清空成功' };
  });

  await test('fix_verify - 修复验证', async () => {
    const r = await callTool('fix_verify', { selector: 'body' });
    return { detail: '修复验证完成' };
  });

  await test('debug_investigate - 调试调查', async () => {
    const r = await callTool('debug_investigate', {});
    return { detail: '调试调查完成' };
  });

  console.log('\n' + '═'.repeat(70));
  console.log('📊 第二轮测试结果汇总');
  console.log('═'.repeat(70));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  const passRate = ((passed / total) * 100).toFixed(1);
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n总测试数: ${total}`);
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
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('测试执行失败:', e);
  process.exit(1);
});
