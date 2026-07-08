const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVER_PATH = path.join(__dirname, 'server.js');
const TEST_RESULTS = [];

let serverProcess = null;
let toolCallId = 0;
let serverReady = false;

function logTest(name, result) {
  TEST_RESULTS.push({ name, ...result });
  const status = result.pass ? '✅' : '❌';
  console.log(`${status} ${name}: ${result.message || (result.error ? result.error.message : 'OK')}`);
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startServer() {
  return new Promise((resolve, reject) => {
    console.log('\n🚀 Starting MCP Server...');
    serverProcess = spawn('node', [SERVER_PATH], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'development', MCP_MODE: 'stdio' }
    });

    let outputBuffer = '';

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      outputBuffer += output;
    });

    serverProcess.stderr.on('data', (data) => {
      const error = data.toString();
      console.error('Server stderr:', error.trim().slice(0, 100));
    });

    serverProcess.on('error', (err) => {
      reject(err);
    });

    serverProcess.on('close', (code) => {
      if (!serverReady) {
        reject(new Error(`Server exited with code ${code}`));
      }
    });

    setTimeout(async () => {
      try {
        const initResult = await sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          clientInfo: { name: 'test-client', version: '1.0.0' }
        });
        
        if (initResult.pass) {
          serverReady = true;
          console.log('✅ Server started and initialized');
          resolve(outputBuffer);
        } else {
          reject(new Error('Server started but initialization failed'));
        }
      } catch (e) {
        reject(new Error('Server failed to respond: ' + e.message));
      }
    }, 15000);
  });
}

function stopServer() {
  if (serverProcess) {
    console.log('\n🛑 Stopping MCP Server...');
    try {
      serverProcess.stdin.end();
      serverProcess.kill('SIGINT');
    } catch (e) {}
    serverProcess = null;
  }
}

async function sendRequest(method, params = {}) {
  return new Promise((resolve) => {
    toolCallId++;
    const request = JSON.stringify({
      jsonrpc: '2.0',
      method,
      id: toolCallId,
      params
    }) + '\n';

    let responseData = '';
    const timeout = setTimeout(() => {
      resolve({ pass: false, error: new Error('Timeout') });
    }, 120000);

    const onData = (data) => {
      responseData += data.toString();
      try {
        const jsonStr = responseData.trim().split('\n').pop();
        if (jsonStr) {
          const json = JSON.parse(jsonStr);
          if (json.id === toolCallId) {
            clearTimeout(timeout);
            serverProcess.stdout.removeListener('data', onData);
            resolve({
              pass: !json.error,
              result: json.result,
              error: json.error
            });
            return;
          }
        }
      } catch (e) {
      }
    };

    serverProcess.stdout.on('data', onData);
    serverProcess.stdin.write(request);
  });
}

async function callTool(toolName, args = {}) {
  return sendRequest('tools/call', { name: toolName, arguments: args });
}

function parseToolResult(result) {
  if (result.pass && result.result?.content?.[0]?.text) {
    try {
      return JSON.parse(result.result.content[0].text);
    } catch (_) {
      return result.result.content[0].text;
    }
  }
  return result.result;
}

async function testInitialize() {
  console.log('\n=== Initializing MCP Server ===');
  
  const initResult = await sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    clientInfo: { name: 'test-client', version: '1.0.0' }
  });
  logTest('mcp_initialize', initResult);
  
  if (initResult.pass) {
    const toolsResult = await sendRequest('tools/list');
    const toolList = toolsResult.result?.tools || [];
    logTest('tools/list', {
      pass: toolsResult.pass && toolList.length > 0,
      message: toolList.length ? `${toolList.length} tools available` : 'No tools',
      error: toolsResult.error
    });
    return toolList;
  }
  return [];
}

async function testSystemTools() {
  console.log('\n=== Testing System Tools ===');

  const healthResult = await callTool('mcp_health_check');
  const healthData = parseToolResult(healthResult);
  logTest('mcp_health_check', {
    pass: healthResult.pass && healthData?.ok === true,
    message: healthData?.ok ? `Version: ${healthData.version}, Sessions: ${healthData.activeSession}` : 'Unknown status',
    error: healthResult.error
  });

  const selfTestResult = await callTool('mcp_self_test');
  logTest('mcp_self_test', {
    pass: selfTestResult.pass,
    message: 'Self test completed',
    error: selfTestResult.error
  });

  const projectAuditResult = await callTool('project_audit');
  logTest('project_audit', {
    pass: projectAuditResult.pass,
    message: 'Project audit completed',
    error: projectAuditResult.error
  });

  const cssResult = await callTool('css_var_check', { css: ':root { --primary: #333; }' });
  logTest('css_var_check', {
    pass: cssResult.pass,
    message: 'CSS var check completed',
    error: cssResult.error
  });

  const linksResult = await callTool('browser_links');
  logTest('browser_links', {
    pass: linksResult.pass,
    message: 'Browser links completed',
    error: linksResult.error
  });
}

async function testBrowserTools() {
  console.log('\n=== Testing Browser Tools ===');

  const openResult = await callTool('browser_open', { url: 'https://example.com', timeout: 30000 });
  logTest('browser_open', openResult);
  if (!openResult.pass) return;

  await delay(3000);

  const toolsToTest = [
    { name: 'browser_snapshot', args: {} },
    { name: 'browser_dom', args: { selector: 'body' } },
    { name: 'browser_find_element', args: { selector: 'h1', onlyVisible: false } },
    { name: 'browser_find_page', args: {} },
    { name: 'browser_screenshot', args: {} },
    { name: 'browser_screenshot_element', args: { selector: 'body' } },
    { name: 'browser_network', args: {} },
    { name: 'browser_network_detail', args: {} },
    { name: 'browser_console', args: {} },
    { name: 'browser_errors', args: {} },
    { name: 'browser_errors_clear', args: {} },
    { name: 'browser_storage', args: {} },
    { name: 'browser_cookies', args: {} },
    { name: 'browser_navigate', args: { url: 'https://example.com' } },
    { name: 'browser_wait', args: { timeout: 1000 } },
    { name: 'browser_eval', args: { script: 'document.title' } },
    { name: 'browser_type', args: { selector: 'body', text: 'test' } },
    { name: 'browser_hover', args: { selector: 'body' } },
    { name: 'browser_scroll', args: { selector: 'body', direction: 'down' } },
    { name: 'browser_press_key', args: { key: 'Enter' } },
    { name: 'browser_select', args: { selector: 'body', value: '' } },
    { name: 'browser_highlight', args: { selector: 'body' } },
    { name: 'browser_assert', args: { type: 'title', value: 'Example Domain' } },
    { name: 'browser_batch', args: { steps: [{ type: 'wait', timeout: 500 }] } },
    { name: 'browser_instrument', args: {} },
    { name: 'browser_events', args: {} },
    { name: 'browser_events_clear', args: {} },
    { name: 'browser_form_validate', args: {} },
    { name: 'browser_chain', args: { steps: [{ type: 'wait', timeout: 500 }] } },
    { name: 'browser_aria_snapshot', args: {} },
    { name: 'browser_aria_click', args: { selector: '' } },
    { name: 'browser_aria_type', args: { selector: '', text: 'test' } },
    { name: 'browser_smart_fill', args: {} },
    { name: 'browser_matrix_test', args: {} },
    { name: 'browser_overlay_detect', args: {} },
    { name: 'browser_overlay_dismiss', args: {} },
    { name: 'browser_trace_chain', args: {} },
    { name: 'browser_full_regression', args: {} },
    { name: 'browser_form_fill', args: {} },
    { name: 'browser_traverse_menu', args: {} },
    { name: 'browser_click_audit', args: { selector: 'body' } },
    { name: 'browser_click', args: { selector: 'body' } },
    { name: 'browser_emulate_device', args: { device: 'iPhone 12' } },
    { name: 'browser_full_audit', args: {} },
    { name: 'browser_lighthouse_audit', args: {} },
    { name: 'browser_memory_check', args: {} },
    { name: 'browser_performance_check', args: {} },
    { name: 'browser_performance_trace', args: { duration: 2000 } },
    { name: 'browser_responsive_test', args: {} },
    { name: 'browser_a11y_check', args: {} },
    { name: 'browser_sessions', args: {} },
    { name: 'browser_session_create', args: {} },
    { name: 'browser_session_switch', args: {} },
    { name: 'browser_session_close', args: {} },
    { name: 'browser_visual_baseline', args: { name: 'test' } },
    { name: 'browser_visual_check', args: {} },
    { name: 'browser_visual_compare', args: {} },
    { name: 'browser_visual_component', args: { name: 'test', selector: 'body' } },
    { name: 'browser_visual_report', args: {} },
    { name: 'browser_visual_snapshot', args: {} },
    { name: 'screenshot_diff', args: {} },
  ];

  for (const tool of toolsToTest) {
    const result = await callTool(tool.name, tool.args);
    logTest(tool.name, {
      pass: result.pass,
      message: result.pass ? 'OK' : 'Failed',
      error: result.error
    });
  }
}

async function testValidationTools() {
  console.log('\n=== Testing Validation Tools ===');

  const toolsToTest = [
    { name: 'validation_check', args: { url: 'https://example.com', checks: ['page_load'] } },
    { name: 'validation_quick_run', args: {} },
    { name: 'validation_start', args: {} },
    { name: 'validation_run', args: {} },
    { name: 'validation_element', args: { selector: 'body' } },
    { name: 'validation_flow', args: {} },
    { name: 'validation_chain', args: {} },
    { name: 'validation_report', args: {} },
    { name: 'validation_report_export', args: {} },
    { name: 'browser_smoke_test', args: {} },
    { name: 'browser_counterfactual_analyze', args: {} },
    { name: 'validation_matrix', args: {} },
    { name: 'validation_decision', args: {} },
    { name: 'validation_compliance', args: {} },
    { name: 'validation_data_integrity', args: {} },
    { name: 'validation_permission', args: {} },
    { name: 'state_diff_assert', args: {} },
    { name: 'chain_spec_run', args: {} },
    { name: 'chain_list_templates', args: {} },
    { name: 'trace_correlation_check', args: {} },
  ];

  for (const tool of toolsToTest) {
    const result = await callTool(tool.name, tool.args);
    logTest(tool.name, {
      pass: result.pass,
      message: result.pass ? 'OK' : 'Failed',
      error: result.error
    });
  }
}

async function testEvidenceTools() {
  console.log('\n=== Testing Evidence Tools ===');

  const toolsToTest = [
    { name: 'evidence_index', args: {} },
    { name: 'evidence_pack', args: { include: ['screenshots'] } },
    { name: 'browser_artifacts', args: {} },
    { name: 'browser_artifacts_clear', args: {} },
    { name: 'browser_har_export', args: {} },
    { name: 'browser_step', args: { name: 'test-step' } },
    { name: 'browser_trace_start', args: {} },
    { name: 'browser_trace_stop', args: {} },
    { name: 'trace_correlate', args: {} },
  ];

  for (const tool of toolsToTest) {
    const result = await callTool(tool.name, tool.args);
    logTest(tool.name, {
      pass: result.pass,
      message: result.pass ? 'OK' : 'Failed',
      error: result.error
    });
  }
}

async function testAssetTools() {
  console.log('\n=== Testing Asset Discovery Tools ===');

  const toolsToTest = [
    { name: 'asset_routes_discover', args: { url: 'https://example.com' } },
    { name: 'asset_endpoint_enum', args: { url: 'https://example.com' } },
    { name: 'asset_endpoint_probe', args: { url: 'https://example.com' } },
  ];

  for (const tool of toolsToTest) {
    const result = await callTool(tool.name, tool.args);
    logTest(tool.name, {
      pass: result.pass,
      message: result.pass ? 'OK' : 'Failed',
      error: result.error
    });
  }
}

async function testLocatorTools() {
  console.log('\n=== Testing Locator Tools ===');

  const toolsToTest = [
    { name: 'browser_locator_suggest', args: { text: 'Example' } },
    { name: 'browser_locator_validate', args: { selector: 'body' } },
  ];

  for (const tool of toolsToTest) {
    const result = await callTool(tool.name, tool.args);
    logTest(tool.name, {
      pass: result.pass,
      message: result.pass ? 'OK' : 'Failed',
      error: result.error
    });
  }
}

async function testDiagnoseTools() {
  console.log('\n=== Testing Diagnose Tools ===');

  const toolsToTest = [
    { name: 'browser_diagnose', args: {} },
    { name: 'browser_anti_bot_detect', args: {} },
    { name: 'browser_debug_report', args: {} },
    { name: 'browser_element_status', args: { selector: 'body' } },
    { name: 'browser_quick_fix', args: {} },
    { name: 'browser_verify_fix', args: {} },
    { name: 'browser_errors_aggregate', args: {} },
    { name: 'error_fix_suggestion', args: {} },
    { name: 'error_summary_md', args: {} },
    { name: 'debug_investigate', args: {} },
  ];

  for (const tool of toolsToTest) {
    const result = await callTool(tool.name, tool.args);
    logTest(tool.name, {
      pass: result.pass,
      message: result.pass ? 'OK' : 'Failed',
      error: result.error
    });
  }
}

async function testArchReverseTools() {
  console.log('\n=== Testing Architecture Reverse Tools ===');

  const result = await callTool('arch_reverse_probe', { url: 'https://example.com' });
  logTest('arch_reverse_probe', {
    pass: result.pass,
    message: result.pass ? 'OK' : 'Failed',
    error: result.error
  });
}

async function testAtlTools() {
  console.log('\n=== Testing ATL Tools ===');

  const toolsToTest = [
    { name: 'atl_learn', args: { errorText: 'test error', errorType: 'test' } },
    { name: 'atl_fix', args: { errorPattern: 'test' } },
  ];

  for (const tool of toolsToTest) {
    const result = await callTool(tool.name, tool.args);
    logTest(tool.name, {
      pass: result.pass,
      message: result.pass ? 'OK' : 'Failed',
      error: result.error
    });
  }
}

async function testCorrelateTools() {
  console.log('\n=== Testing Correlate Tools ===');

  const toolsToTest = [
    { name: 'correlate_triple_check', args: {} },
    { name: 'bypass_login', args: {} },
  ];

  for (const tool of toolsToTest) {
    const result = await callTool(tool.name, tool.args);
    logTest(tool.name, {
      pass: result.pass,
      message: result.pass ? 'OK' : 'Failed',
      error: result.error
    });
  }
}

async function testExplorationTools() {
  console.log('\n=== Testing Exploration Tools ===');

  const toolsToTest = [
    { name: 'exploration_quick', args: { url: 'https://example.com' } },
    { name: 'business_loop_validate', args: {} },
  ];

  for (const tool of toolsToTest) {
    const result = await callTool(tool.name, tool.args);
    logTest(tool.name, {
      pass: result.pass,
      message: result.pass ? 'OK' : 'Failed',
      error: result.error
    });
  }
}

async function testOtherTools() {
  console.log('\n=== Testing Other Tools ===');

  const toolsToTest = [
    { name: 'browser_data_compare', args: {} },
    { name: 'dual_chain_explore', args: { target: 'https://example.com' } },
    { name: 'memory_recall', args: {} },
    { name: 'skill_mcp_validate', args: {} },
    { name: 'chain_score_report', args: {} },
    { name: 'contract_baseline', args: {} },
    { name: 'contract_guard', args: {} },
  ];

  for (const tool of toolsToTest) {
    const result = await callTool(tool.name, tool.args);
    logTest(tool.name, {
      pass: result.pass,
      message: result.pass ? 'OK' : 'Failed',
      error: result.error
    });
  }
}

async function main() {
  console.log('========================================');
  console.log('AI-Verify MCP OSS Full Tool Test Suite');
  console.log('========================================\n');

  try {
    await startServer();
    const allTools = await testInitialize();
    
    await testSystemTools();
    await testBrowserTools();
    await testValidationTools();
    await testEvidenceTools();
    await testAssetTools();
    await testLocatorTools();
    await testDiagnoseTools();
    await testArchReverseTools();
    await testAtlTools();
    await testCorrelateTools();
    await testExplorationTools();
    await testOtherTools();

    console.log(`\n📊 Total registered tools: ${allTools.length}`);

  } catch (err) {
    console.error('❌ Test failed:', err.message);
    logTest('Test Runner', { pass: false, error: err });
  } finally {
    stopServer();

    console.log('\n========================================');
    console.log('Test Summary');
    console.log('========================================');

    const passed = TEST_RESULTS.filter(r => r.pass).length;
    const failed = TEST_RESULTS.filter(r => !r.pass).length;

    console.log(`\nTotal: ${TEST_RESULTS.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);

    if (failed > 0) {
      console.log('\nFailed tests:');
      TEST_RESULTS.filter(r => !r.pass).forEach(r => {
        console.log(`  - ${r.name}: ${r.error?.message || r.message || 'Unknown error'}`);
      });
    }

    const resultsDir = path.join(__dirname, 'test-results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(
      path.join(resultsDir, `full-tool-test-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`),
      JSON.stringify(TEST_RESULTS, null, 2)
    );
    console.log(`\nResults saved to: ${resultsDir}`);

    process.exit(failed > 0 ? 1 : 0);
  }
}

main();