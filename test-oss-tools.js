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
      console.log('Server stdout:', output.trim().slice(0, 200));
    });

    serverProcess.stderr.on('data', (data) => {
      const error = data.toString();
      console.error('Server stderr:', error.trim());
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
    logTest('tools/list', {
      pass: toolsResult.pass && toolsResult.result?.tools?.length > 0,
      message: toolsResult.result?.tools?.length ? `${toolsResult.result.tools.length} tools available` : 'No tools',
      error: toolsResult.error
    });
    return toolsResult.result?.tools || [];
  }
  return [];
}

async function callTool(toolName, args = {}) {
  return sendRequest('tools/call', { name: toolName, arguments: args });
}

async function testBrowserTools() {
  console.log('\n=== Testing Browser Tools ===');

  const result = await callTool('browser_open', { url: 'https://example.com', timeout: 30000 });
  logTest('browser_open (example.com)', result);
  if (!result.pass) return;

  await delay(5000);

  const snapshotResult = await callTool('browser_snapshot');
  const snapshotData = parseToolResult(snapshotResult);
  logTest('browser_snapshot', {
    pass: snapshotResult.pass && snapshotData?.stateDetail?.visibleCount > 0,
    message: snapshotData?.stateDetail?.visibleCount ? `Visible: ${snapshotData.stateDetail.visibleCount}, URL: ${snapshotData.url}` : 'No elements found',
    error: snapshotResult.error
  });

  const domResult = await callTool('browser_dom', { selector: 'body' });
  const domData = parseToolResult(domResult);
  logTest('browser_dom (body selector)', {
    pass: domResult.pass && domData?.count > 0,
    message: domData?.count ? `Found ${domData.count} nodes` : 'No nodes found',
    error: domResult.error
  });

  const findElementResult = await callTool('browser_find_element', { selector: '*', onlyVisible: false });
  const findElementData = parseToolResult(findElementResult);
  const elementCount = findElementData?.total || findElementData?.results?.length || 0;
  logTest('browser_find_element (all selector)', {
    pass: findElementResult.pass && elementCount > 0,
    message: elementCount ? `Found ${elementCount} elements` : 'No elements found',
    error: findElementResult.error
  });

  const screenshotResult = await callTool('browser_screenshot');
  const screenshotData = parseToolResult(screenshotResult);
  logTest('browser_screenshot', {
    pass: screenshotResult.pass && screenshotData?.status === 'success',
    message: screenshotData?.status === 'success' ? `File: ${screenshotData.fileName}` : 'Empty screenshot',
    error: screenshotResult.error
  });

  const networkResult = await callTool('browser_network');
  const networkData = parseToolResult(networkResult);
  logTest('browser_network', {
    pass: networkResult.pass,
    message: networkData?.total ? `${networkData.total} requests, ${networkData.errors} errors` : 'No requests',
    error: networkResult.error
  });

  const consoleResult = await callTool('browser_console');
  const consoleData = parseToolResult(consoleResult);
  logTest('browser_console', {
    pass: consoleResult.pass,
    message: consoleData?.count ? `${consoleData.count} logs` : 'No logs',
    error: consoleResult.error
  });

  const errorsResult = await callTool('browser_errors');
  logTest('browser_errors', {
    pass: errorsResult.pass,
    message: errorsResult.result?.errors?.length ? `${errorsResult.result.errors.length} errors` : 'No errors',
    error: errorsResult.error
  });

  const navigateResult = await callTool('browser_navigate', { url: 'https://httpbin.org/html', timeout: 30000 });
  const navigateData = parseToolResult(navigateResult);
  logTest('browser_navigate (with url)', {
    pass: navigateResult.pass && navigateData?.action === 'goto' && navigateData?.currentUrl?.includes('httpbin.org'),
    message: navigateData?.currentUrl ? `Navigated to: ${navigateData.currentUrl}` : 'Navigation failed',
    error: navigateResult.error
  });

  const reloadResult = await callTool('browser_navigate', { action: 'refresh', timeout: 10000 });
  const reloadData = parseToolResult(reloadResult);
  logTest('browser_navigate (refresh)', {
    pass: reloadResult.pass && reloadData?.action === 'refresh',
    message: reloadData?.currentUrl ? `Refreshed: ${reloadData.currentUrl}` : 'Refresh failed',
    error: reloadResult.error
  });
}

async function testValidationTools() {
  console.log('\n=== Testing Validation Tools ===');

  const result = await callTool('validation_check', {
    url: 'https://example.com',
    checks: ['page_load', 'console_errors', 'network_errors']
  });
  const validationData = parseToolResult(result);
  logTest('validation_check', {
    pass: result.pass && validationData?.passed !== undefined,
    message: validationData?.passed !== undefined ? `Passed: ${validationData.passed ? 'Yes' : 'No'}, Duration: ${validationData.duration}ms` : 'No summary',
    error: result.error
  });
}

async function testEvidenceTools() {
  console.log('\n=== Testing Evidence Tools ===');

  const indexResult = await callTool('evidence_index');
  const indexData = parseToolResult(indexResult);
  logTest('evidence_index', {
    pass: indexResult.pass,
    message: indexData?.timeline?.length ? `${indexData.timeline.length} items indexed` : 'No items',
    error: indexResult.error
  });

  const packResult = await callTool('evidence_pack', { include: ['screenshots', 'network'] });
  const packData = parseToolResult(packResult);
  logTest('evidence_pack', {
    pass: packResult.pass && packData?.success === true,
    message: packData?.success === true ? `File: ${packData.filePath}` : 'No pack path',
    error: packResult.error
  });
}

async function testAssetTools() {
  console.log('\n=== Testing Asset Discovery Tools ===');

  const enumResult = await callTool('asset_endpoint_enum', { url: 'https://example.com' });
  logTest('asset_endpoint_enum', {
    pass: enumResult.pass,
    message: enumResult.result?.endpoints?.length ? `${enumResult.result.endpoints.length} endpoints found` : 'No endpoints',
    error: enumResult.error
  });

  const routesResult = await callTool('asset_routes_discover', { url: 'https://example.com' });
  logTest('asset_routes_discover', {
    pass: routesResult.pass,
    message: routesResult.result?.routes?.length ? `${routesResult.result.routes.length} routes found` : 'No routes',
    error: routesResult.error
  });
}

async function testLocatorTools() {
  console.log('\n=== Testing Locator Tools ===');

  const suggestResult = await callTool('browser_locator_suggest', { text: 'More information...' });
  logTest('browser_locator_suggest', {
    pass: suggestResult.pass,
    message: suggestResult.result?.locators?.length ? `${suggestResult.result.locators.length} locators suggested` : 'No locators',
    error: suggestResult.error
  });
}

async function testCaptchaTools() {
  console.log('\n=== Testing Captcha Tools ===');

  const detectResult = await callTool('browser_captcha_detect');
  logTest('browser_captcha_detect', {
    pass: detectResult.pass,
    message: detectResult.result?.hasCaptcha ? 'Captcha detected' : 'No captcha',
    error: detectResult.error
  });
}

async function testAtlTools() {
  console.log('\n=== Testing ATL Tools ===');

  const learnResult = await callTool('atl_learn', {
    errorPattern: 'Test error pattern',
    rootCause: 'Test root cause',
    fixSuggestion: 'Test fix suggestion',
    tags: ['test', 'demo']
  });
  const learnData = parseToolResult(learnResult);
  logTest('atl_learn', {
    pass: learnResult.pass && learnData?.success === true,
    message: learnData?.success === true ? `Total groups: ${learnData.totalErrorGroups}` : 'Learning failed',
    error: learnResult.error
  });

  const fixResult = await callTool('atl_fix', {
    errorPattern: 'Test error pattern',
    context: { url: 'https://example.com' }
  });
  const fixData = parseToolResult(fixResult);
  logTest('atl_fix', {
    pass: fixResult.pass,
    message: fixData?.message ? fixData.message : 'No suggestions',
    error: fixResult.error
  });
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

async function testSystemTools() {
  console.log('\n=== Testing System Tools ===');

  const healthResult = await callTool('mcp_health_check');
  const healthData = parseToolResult(healthResult);
  logTest('mcp_health_check', {
    pass: healthResult.pass && healthData?.ok === true,
    message: healthData?.ok ? `Version: ${healthData.version}, Sessions: ${healthData.activeSession}` : 'Unknown status',
    error: healthResult.error
  });
}

async function testComplexWebsite() {
  console.log('\n=== Testing Complex Websites ===');

  const testSites = [
    { name: 'baidu.com', url: 'https://www.baidu.com', expectedVisible: 10 },
    { name: 'bing.com', url: 'https://www.bing.com', expectedVisible: 10 },
    { name: 'jd.com', url: 'https://www.jd.com', expectedVisible: 10 },
    { name: 'zhihu.com', url: 'https://www.zhihu.com', expectedVisible: 10 },
    { name: 'douban.com', url: 'https://www.douban.com', expectedVisible: 10 },
    { name: 'taobao.com', url: 'https://www.taobao.com', expectedVisible: 10 },
    { name: 'weibo.com', url: 'https://www.weibo.com', expectedVisible: 10 },
    { name: 'bilibili.com', url: 'https://www.bilibili.com', expectedVisible: 10 },
    { name: 'csdn.net', url: 'https://www.csdn.net', expectedVisible: 10 },
    { name: 'github.com', url: 'https://github.com', expectedVisible: 10 },
  ];

  for (const site of testSites) {
    console.log(`\n--- Testing ${site.name} ---`);
    
    const openResult = await callTool('browser_open', { url: site.url, timeout: 30000 });
    logTest(`browser_open (${site.name})`, openResult);
    if (!openResult.pass) continue;

    await delay(3000);

    const snapshotResult = await callTool('browser_snapshot');
    const snapshotData = parseToolResult(snapshotResult);
    const visibleCount = snapshotData?.stateDetail?.visibleCount || 0;
    const inputCount = snapshotData?.inputs?.length || 0;
    const buttonCount = snapshotData?.buttons?.length || 0;
    logTest(`browser_snapshot (${site.name})`, {
      pass: snapshotResult.pass && visibleCount >= site.expectedVisible,
      message: snapshotData?.url ? `URL: ${snapshotData.url}, Visible: ${visibleCount}, Inputs: ${inputCount}, Buttons: ${buttonCount}` : 'No data',
      error: snapshotResult.error
    });

    const screenshotResult = await callTool('browser_screenshot');
    const screenshotData = parseToolResult(screenshotResult);
    logTest(`browser_screenshot (${site.name})`, {
      pass: screenshotResult.pass && screenshotData?.status === 'success',
      message: screenshotData?.status === 'success' ? `File: ${screenshotData.fileName}` : 'Failed',
      error: screenshotResult.error
    });
  }
}

async function testDataCompare() {
  console.log('\n=== Testing Data Compare Tool ===');

  await callTool('browser_open', { url: 'https://example.com' });
  await delay(2000);

  const compareResult = await callTool('browser_data_compare', {
    mode: 'dom_vs_dom',
    extractMode: 'list',
    sourceSelector: 'body',
    targetSelector: 'body'
  });
  logTest('browser_data_compare', {
    pass: compareResult.pass,
    message: compareResult.result?.match ? 'Data match' : 'Data mismatch',
    error: compareResult.error
  });
}

async function testDualChainExplore() {
  console.log('\n=== Testing Dual Chain Explore ===');

  const result = await callTool('dual_chain_explore', {
    target: 'https://example.com',
    chains: ['functional', 'technical'],
    explorationMode: 'normal',
    autoFix: false
  });

  let parsed = null;
  if (result.pass && result.result?.content?.[0]?.text) {
    try { parsed = JSON.parse(result.result.content[0].text); } catch (_) {}
  }

  logTest('dual_chain_explore', {
    pass: result.pass && parsed?.sessionId,
    message: parsed?.sessionId
      ? `Session: ${parsed.sessionId}, Verdict: ${parsed.crossValidation?.verdict?.label || 'N/A'}`
      : 'No session ID returned',
    error: result.error
  });

  if (parsed) {
    const chains = parsed.chains || {};
    if (chains.functional) {
      logTest('dual_chain_explore - functional chain', {
        pass: chains.functional.status === 'completed',
        message: chains.functional.status === 'completed'
          ? `Features: ${chains.functional.features}, Findings: ${chains.functional.findings}`
          : `Status: ${chains.functional.status}`,
        error: null
      });
    }
    if (chains.technical) {
      logTest('dual_chain_explore - technical chain', {
        pass: chains.technical.status === 'completed',
        message: chains.technical.status === 'completed'
          ? `Features: ${chains.technical.features}, Findings: ${chains.technical.findings}`
          : `Status: ${chains.technical.status}`,
        error: null
      });
    }
  }
}

async function testRegistrationFlow() {
  console.log('\n=== Testing Registration Flow ===');

  const testSites = [
    { name: 'guerrillamail.com', url: 'https://www.guerrillamail.com', description: '临时邮箱，自动生成', emailInput: '#email', passwordInput: '', submitBtn: '' },
    { name: 'mail.com', url: 'https://www.mail.com', description: '个性后缀邮箱，免手机号', emailInput: 'input[name="login"]', passwordInput: 'input[name="password"]', submitBtn: 'button[type="submit"]' },
    { name: 'tutanota.com', url: 'https://tutanota.com', description: '德国开源加密邮箱', emailInput: 'input[type="email"]', passwordInput: 'input[type="password"]', submitBtn: 'button' },
    { name: 'outlook.live.com', url: 'https://outlook.live.com/owa/', description: '微软Outlook国际版', emailInput: 'input[name="loginfmt"]', passwordInput: 'input[name="passwd"]', submitBtn: 'input[type="submit"]' },
    { name: 'yandex.com', url: 'https://360.yandex.com/mail/', description: '俄罗斯邮箱', emailInput: 'input[name="login"]', passwordInput: 'input[name="passwd"]', submitBtn: 'button' },
  ];

  for (const site of testSites) {
    console.log(`\n--- Testing ${site.name} (${site.description}) ---`);
    
    const openResult = await callTool('browser_open', { url: site.url, timeout: 60000 });
    logTest(`browser_open (${site.name})`, openResult);
    if (!openResult.pass) continue;

    await delay(5000);

    const snapshotResult = await callTool('browser_snapshot');
    const snapshotData = parseToolResult(snapshotResult);
    const visibleCount = snapshotData?.stateDetail?.visibleCount || 0;
    const inputCount = snapshotData?.inputs?.length || 0;
    const buttonCount = snapshotData?.buttons?.length || 0;
    logTest(`browser_snapshot (${site.name})`, {
      pass: snapshotResult.pass && visibleCount >= 5,
      message: snapshotData?.url ? `URL: ${snapshotData.url}, Visible: ${visibleCount}, Inputs: ${inputCount}, Buttons: ${buttonCount}` : 'No data',
      error: snapshotResult.error
    });

    if (inputCount > 0) {
      const domResult = await callTool('browser_dom', { selector: 'input' });
      const domData = parseToolResult(domResult);
      logTest(`browser_dom (${site.name} - inputs)`, {
        pass: domResult.pass && (domData?.count || 0) > 0,
        message: domData?.count ? `Found ${domData.count} input elements` : 'No input elements found',
        error: domResult.error
      });

      if (site.emailInput) {
        const typeResult = await callTool('browser_type', { selector: site.emailInput, text: 'test@example.com' });
        logTest(`browser_type (${site.name} - email)`, {
          pass: typeResult.pass,
          message: 'Email entered',
          error: typeResult.error
        });
      }

      if (site.passwordInput) {
        const pwdResult = await callTool('browser_type', { selector: site.passwordInput, text: 'test123456' });
        logTest(`browser_type (${site.name} - password)`, {
          pass: pwdResult.pass,
          message: 'Password entered',
          error: pwdResult.error
        });
      }
    }

    await delay(2000);

    const screenshotResult = await callTool('browser_screenshot');
    const screenshotData = parseToolResult(screenshotResult);
    logTest(`browser_screenshot (${site.name})`, {
      pass: screenshotResult.pass && (screenshotData?.status === 'success' || screenshotData?.status === 'warning'),
      message: screenshotData?.fileName ? `File: ${screenshotData.fileName}` : 'Failed',
      error: screenshotResult.error
    });
  }
}

async function main() {
  console.log('========================================');
  console.log('AI-Verify MCP OSS Tools Validation Test');
  console.log('========================================\n');

  try {
    await startServer();
    await testInitialize();
    
    await testSystemTools();
    await testBrowserTools();
    await testValidationTools();
    await testEvidenceTools();
    await testAssetTools();
    await testLocatorTools();
    await testCaptchaTools();
    await testAtlTools();
    await testComplexWebsite();
    await testRegistrationFlow();
    await testDataCompare();
    await testDualChainExplore();

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
        console.log(`  - ${r.name}: ${r.error?.message || r.message}`);
      });
    }

    const resultsDir = path.join(__dirname, 'test-results');
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(
      path.join(resultsDir, `oss-tools-test-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`),
      JSON.stringify(TEST_RESULTS, null, 2)
    );
    console.log(`\nResults saved to: ${resultsDir}`);

    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
