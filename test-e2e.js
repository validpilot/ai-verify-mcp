const http = require('http');

const OPTIONS = {
  hostname: 'localhost',
  port: 3456,
  path: '/mcp',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
};

let reqId = 100;

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
  console.log('ValidPilot 全面端到端测试');
  console.log('='.repeat(70));

  console.log('\n📡 初始化 MCP 连接...');
  await mcpRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'e2e-test', version: '1.0' }
  });

  const toolsResp = await mcpRequest('tools/list', {});
  const totalTools = toolsResp.tools?.length || 0;
  console.log(`📦 注册工具总数: ${totalTools}`);

  const demoUrl = 'file:///' + __dirname.replace(/\\/g, '/') + '/examples/demo/index.html';

  console.log('\n' + '═'.repeat(70));
  console.log('🌐 第一组：浏览器操作类工具');
  console.log('═'.repeat(70));

  await test('browser_open - 打开测试页面', async () => {
    const r = await callTool('browser_open', { url: demoUrl, waitUntil: 'domcontentloaded' });
    return { detail: '页面打开成功' };
  });

  await test('browser_snapshot - 页面快照', async () => {
    const r = await callTool('browser_snapshot', {});
    return { detail: '快照获取成功' };
  });

  await test('browser_dom - 获取DOM', async () => {
    const r = await callTool('browser_dom', {});
    return { detail: 'DOM获取成功' };
  });

  await test('browser_console - 控制台日志', async () => {
    const r = await callTool('browser_console', { limit: 10 });
    return { detail: '控制台日志获取成功' };
  });

  await test('browser_errors - 页面错误', async () => {
    const r = await callTool('browser_errors', { limit: 10 });
    return { detail: '错误获取成功' };
  });

  await test('browser_network - 网络请求', async () => {
    const r = await callTool('browser_network', { limit: 10 });
    return { detail: '网络请求获取成功' };
  });

  await test('browser_screenshot - 全屏截图', async () => {
    const r = await callTool('browser_screenshot', { name: 'test-fullpage' });
    return { detail: '截图成功' };
  });

  await test('browser_screenshot_element - 元素截图', async () => {
    const r = await callTool('browser_screenshot_element', { selector: 'h1', name: 'test-element' });
    return { detail: '元素截图成功' };
  });

  await test('browser_cookies - 获取Cookie', async () => {
    const r = await callTool('browser_cookies', { action: 'get' });
    return { detail: 'Cookie获取成功' };
  });

  await test('browser_storage - 存储操作', async () => {
    const r = await callTool('browser_storage', { action: 'list', type: 'localStorage' });
    return { detail: '存储操作成功' };
  });

  await test('browser_links - 获取链接', async () => {
    const r = await callTool('browser_links', { limit: 10 });
    return { detail: '链接获取成功' };
  });

  console.log('\n' + '═'.repeat(70));
  console.log('🎯 第二组：智能定位类工具');
  console.log('═'.repeat(70));

  await test('browser_find_element - 按文本查找元素', async () => {
    const r = await callTool('browser_find_element', { text: '演示', limit: 3 });
    return { detail: '元素查找成功' };
  });

  await test('browser_locator_suggest - 选择器建议', async () => {
    const r = await callTool('browser_locator_suggest', { selector: 'button' });
    return { detail: '选择器建议生成成功' };
  });

  await test('browser_locator_validate - 选择器验证', async () => {
    const r = await callTool('browser_locator_validate', { selector: 'body' });
    return { detail: '选择器验证成功' };
  });

  console.log('\n' + '═'.repeat(70));
  console.log('🔍 第三组：调试诊断类工具');
  console.log('═'.repeat(70));

  await test('browser_diagnose - 页面健康诊断', async () => {
    const r = await callTool('browser_diagnose', { errorType: 'all' });
    return { detail: '诊断完成' };
  });

  await test('browser_element_status - 元素状态检查', async () => {
    const r = await callTool('browser_element_status', { selector: 'body' });
    return { detail: '元素状态检查完成' };
  });

  await test('browser_errors_aggregate - 错误聚合', async () => {
    const r = await callTool('browser_errors_aggregate', {});
    return { detail: '错误聚合完成' };
  });

  await test('browser_debug_report - 调试报告', async () => {
    const r = await callTool('browser_debug_report', {});
    return { detail: '调试报告生成成功' };
  });

  await test('error_fix_suggestion - 修复建议', async () => {
    const r = await callTool('error_fix_suggestion', { errorType: 'element_not_found', context: '测试' });
    return { detail: '修复建议生成成功' };
  });

  console.log('\n' + '═'.repeat(70));
  console.log('✅ 第四组：验证类工具');
  console.log('═'.repeat(70));

  await test('validation_quick_run - 快速验证', async () => {
    const r = await callTool('validation_quick_run', { url: demoUrl, headless: true });
    return { detail: '快速验证完成' };
  });

  await test('validation_check - 自定义验证', async () => {
    const r = await callTool('validation_check', {
      checks: [{ type: 'urlContains', value: 'demo' }]
    });
    return { detail: '自定义验证完成' };
  });

  await test('browser_assert - 页面断言', async () => {
    const r = await callTool('browser_assert', {
      type: 'title_contains',
      value: '演示'
    });
    return { detail: '断言完成' };
  });

  await test('validation_element - 元素验证', async () => {
    const r = await callTool('validation_element', {
      targetUrl: demoUrl,
      elementSelector: 'body'
    });
    return { detail: '元素验证完成' };
  });

  await test('screenshot_diff - 截图对比', async () => {
    const r = await callTool('screenshot_diff', {
      baselinePath: 'screenshots/test-fullpage.png',
      currentPath: 'screenshots/test-fullpage.png'
    });
    return { detail: '截图对比完成' };
  });

  console.log('\n' + '═'.repeat(70));
  console.log('📝 第五组：报告与工件');
  console.log('═'.repeat(70));

  await test('browser_artifacts - 工件列表', async () => {
    const r = await callTool('browser_artifacts', {});
    return { detail: '工件列表获取成功' };
  });

  await test('validation_report - 验证报告', async () => {
    const r = await callTool('validation_report', { format: 'json' });
    return { detail: '报告生成成功' };
  });

  console.log('\n' + '═'.repeat(70));
  console.log('🔧 第六组：交互类工具');
  console.log('═'.repeat(70));

  await test('browser_type - 文本输入', async () => {
    const r = await callTool('browser_type', { selector: 'input[type="text"]', text: 'test input' });
    return { detail: '文本输入成功' };
  });

  await test('browser_click - 点击操作', async () => {
    const r = await callTool('browser_click', { selector: 'button' });
    return { detail: '点击成功' };
  });

  await test('browser_scroll - 滚动操作', async () => {
    const r = await callTool('browser_scroll', { direction: 'bottom' });
    return { detail: '滚动成功' };
  });

  await test('browser_press_key - 键盘操作', async () => {
    const r = await callTool('browser_press_key', { key: 'Enter' });
    return { detail: '键盘操作成功' };
  });

  await test('browser_navigate - 导航操作(刷新)', async () => {
    const r = await callTool('browser_navigate', { action: 'refresh' });
    return { detail: '刷新成功' };
  });

  await test('browser_hover - 悬停操作', async () => {
    const r = await callTool('browser_hover', { selector: 'body' });
    return { detail: '悬停成功' };
  });

  console.log('\n' + '═'.repeat(70));
  console.log('🧪 第七组：其他工具');
  console.log('═'.repeat(70));

  await test('browser_eval - JS执行', async () => {
    const r = await callTool('browser_eval', { expression: 'document.title' });
    return { detail: 'JS执行成功' };
  });

  await test('browser_wait - 等待机制', async () => {
    const r = await callTool('browser_wait', { type: 'timeout', ms: 100 });
    return { detail: '等待成功' };
  });

  await test('mcp_health_check - 健康检查', async () => {
    const r = await callTool('mcp_health_check', {});
    return { detail: '健康检查通过' };
  });

  await test('mcp_self_test - 自检', async () => {
    const r = await callTool('mcp_self_test', {});
    return { detail: '自检完成' };
  });

  await test('browser_a11y_check - 无障碍检查', async () => {
    const r = await callTool('browser_a11y_check', {});
    return { detail: '无障碍检查完成' };
  });

  await test('browser_performance_check - 性能检查', async () => {
    const r = await callTool('browser_performance_check', {});
    return { detail: '性能检查完成' };
  });

  console.log('\n' + '═'.repeat(70));
  console.log('📊 测试结果汇总');
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
