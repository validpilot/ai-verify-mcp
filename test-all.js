const http = require('http');

const OPTIONS = {
  hostname: 'localhost',
  port: 3456,
  path: '/mcp',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
};

let reqId = 400;

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

const allResults = [];

async function test(name, category, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;
    allResults.push({ name, category, passed: true, duration });
    return result;
  } catch (e) {
    const duration = Date.now() - start;
    allResults.push({ name, category, passed: false, duration, error: e.message });
    return null;
  }
}

async function main() {
  await mcpRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'final-test', version: '1.0' }
  });

  const toolsResp = await mcpRequest('tools/list', {});
  const totalTools = toolsResp.tools?.length || 0;
  const toolNames = toolsResp.tools?.map(t => t.name) || [];

  const demoUrl = 'file:///' + __dirname.replace(/\\/g, '/') + '/examples/demo/index.html';
  await callTool('browser_open', { url: demoUrl, waitUntil: 'domcontentloaded' });

  const categories = {
    '浏览器操作': [
      'browser_open', 'browser_click', 'browser_type', 'browser_hover', 'browser_press_key',
      'browser_scroll', 'browser_screenshot', 'browser_screenshot_element', 'browser_cookies',
      'browser_storage', 'browser_network', 'browser_eval', 'browser_wait', 'browser_dom',
      'browser_snapshot', 'browser_console', 'browser_errors', 'browser_links',
      'browser_batch', 'browser_navigate', 'browser_select'
    ],
    '智能定位': [
      'browser_find_element', 'browser_locator_suggest', 'browser_locator_validate', 'browser_find_page'
    ],
    '调试诊断': [
      'browser_diagnose', 'browser_element_status', 'browser_quick_fix', 'browser_verify_fix',
      'browser_debug_report', 'browser_errors_aggregate', 'error_fix_suggestion', 'error_summary_md',
      'debug_investigate', 'ai_debug_investigate', 'browser_network_detail', 'browser_instrument'
    ],
    '验证框架': [
      'validation_element', 'validation_flow', 'validation_quick_run', 'validation_check',
      'validation_run', 'validation_start', 'validation_suite_run', 'validation_matrix',
      'validation_decision', 'validation_report', 'validation_report_export',
      'browser_assert', 'screenshot_diff', 'fix_verify'
    ],
    '视觉对比': [
      'browser_visual_baseline', 'browser_visual_compare', 'browser_visual_report'
    ],
    '会话管理': [
      'browser_sessions', 'browser_session_create', 'browser_session_switch', 'browser_session_close'
    ],
    '事件追踪': [
      'browser_events', 'browser_events_clear', 'browser_trace_start', 'browser_trace_stop',
      'browser_har_export'
    ],
    '工件管理': [
      'browser_artifacts', 'browser_artifacts_clear', 'browser_step', 'browser_highlight'
    ],
    '性能安全': [
      'browser_performance_check', 'browser_a11y_check', 'benchmark_run'
    ],
    '系统工具': [
      'mcp_health_check', 'mcp_self_test', 'browser_errors_clear', 'browser_traverse_menu',
      'browser_flow'
    ]
  };

  const skipTools = new Set();

  for (const [category, toolList] of Object.entries(categories)) {
    for (const toolName of toolList) {
      if (skipTools.has(toolName)) continue;
      if (!toolNames.includes(toolName)) continue;

      try {
        const start = Date.now();
        let args = {};

        switch (toolName) {
          case 'browser_open':
            args = { url: demoUrl, waitUntil: 'domcontentloaded' };
            break;
          case 'browser_click':
            args = { selector: 'button' };
            break;
          case 'browser_type':
            args = { selector: 'input[type="text"]', text: 'test' };
            break;
          case 'browser_hover':
            args = { selector: 'body' };
            break;
          case 'browser_press_key':
            args = { key: 'Tab' };
            break;
          case 'browser_scroll':
            args = { direction: 'bottom' };
            break;
          case 'browser_screenshot':
            args = { name: 'final-test' };
            break;
          case 'browser_screenshot_element':
            args = { selector: 'h1', name: 'final-element' };
            break;
          case 'browser_cookies':
            args = { action: 'get' };
            break;
          case 'browser_storage':
            args = { action: 'list', type: 'localStorage' };
            break;
          case 'browser_eval':
            args = { expression: 'document.title' };
            break;
          case 'browser_wait':
            args = { type: 'timeout', ms: 50 };
            break;
          case 'browser_find_element':
            args = { text: '演示', limit: 3 };
            break;
          case 'browser_locator_suggest':
            args = { selector: 'button' };
            break;
          case 'browser_locator_validate':
            args = { selector: 'body' };
            break;
          case 'browser_diagnose':
            args = { errorType: 'all' };
            break;
          case 'browser_element_status':
            args = { selector: 'body' };
            break;
          case 'browser_quick_fix':
            args = { selector: 'body', problem: 'not_found' };
            break;
          case 'browser_verify_fix':
            args = { selector: 'body' };
            break;
          case 'browser_errors_aggregate':
            args = {};
            break;
          case 'error_fix_suggestion':
            args = { errorType: 'element_not_found', context: 'test' };
            break;
          case 'validation_quick_run':
            args = { url: demoUrl, headless: true };
            break;
          case 'validation_check':
            args = { checks: [{ type: 'urlContains', value: 'demo' }] };
            break;
          case 'browser_assert':
            args = { type: 'title_contains', value: '演示' };
            break;
          case 'validation_element':
            args = { targetUrl: demoUrl, elementSelector: 'body' };
            break;
          case 'screenshot_diff':
            args = { baselinePath: 'screenshots/final-test.png', currentPath: 'screenshots/final-test.png' };
            break;
          case 'browser_visual_baseline':
            args = { name: 'final-baseline' };
            break;
          case 'browser_visual_compare':
            args = { baselineName: 'final-baseline' };
            break;
          case 'browser_session_create':
            args = { name: 'final-test' };
            break;
          case 'browser_session_switch':
            args = { name: 'default' };
            break;
          case 'validation_start':
            args = { name: 'final-validation' };
            break;
          case 'validation_run':
            args = { checks: [] };
            break;
          case 'benchmark_run':
            args = { iterations: 1 };
            break;
          default:
            args = {};
        }

        await callTool(toolName, args);
        const duration = Date.now() - start;
        allResults.push({ name: toolName, category, passed: true, duration });
      } catch (e) {
        allResults.push({ name: toolName, category, passed: false, duration: 0, error: e.message });
      }
    }
  }

  const passed = allResults.filter(r => r.passed).length;
  const failed = allResults.filter(r => !r.passed).length;
  const total = allResults.length;
  const passRate = ((passed / total) * 100).toFixed(1);

  console.log('\n' + '═'.repeat(70));
  console.log('📊 ValidPilot 全面测试报告');
  console.log('═'.repeat(70));

  console.log(`\n📦 注册工具总数: ${totalTools}`);
  console.log(`🧪 测试工具数量: ${total}`);
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`📈 通过率: ${passRate}%`);
  console.log(`⏱️  总耗时: ${allResults.reduce((s, r) => s + r.duration, 0)}ms`);

  console.log('\n' + '─'.repeat(70));
  console.log('📂 按分类统计:');
  console.log('─'.repeat(70));

  for (const [category, toolList] of Object.entries(categories)) {
    const catResults = allResults.filter(r => r.category === category);
    if (catResults.length === 0) continue;
    const catPassed = catResults.filter(r => r.passed).length;
    const catTotal = catResults.length;
    const catRate = ((catPassed / catTotal) * 100).toFixed(0);
    console.log(`  ${category.padEnd(12)}: ${catPassed}/${catTotal} (${catRate}%)`);
  }

  if (failed > 0) {
    console.log('\n' + '─'.repeat(70));
    console.log('❌ 失败的工具:');
    console.log('─'.repeat(70));
    allResults.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name} [${r.category}]: ${r.error?.substring(0, 60)}`);
    });
  }

  console.log('\n' + '═'.repeat(70));

  const untested = toolNames.filter(n => !allResults.find(r => r.name === n));
  if (untested.length > 0) {
    console.log(`\n⚠️  未测试的工具 (${untested.length}个):`);
    untested.forEach(n => console.log(`  - ${n}`));
  }

  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('测试执行失败:', e.message);
  process.exit(1);
});
