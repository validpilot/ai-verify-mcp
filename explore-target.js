const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVER_PATH = path.join(__dirname, 'server.js');
const TARGET_URL = 'http://192.168.8.4:8081/';
const TEST_RESULTS = [];
const EXPLORATION_DATA = {};

let serverProcess = null;
let toolCallId = 0;
let serverReady = false;

function logTest(name, result) {
  TEST_RESULTS.push({ name, ...result });
  const status = result.pass ? '✅' : '❌';
  console.log(`${status} ${name}: ${result.message || (result.error ? result.error.message : 'OK')}`);
}

function saveData(key, data) {
  EXPLORATION_DATA[key] = data;
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

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
    });

    serverProcess.stderr.on('data', (data) => {
      const error = data.toString();
      console.error('Server stderr:', error.trim().slice(0, 150));
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
          clientInfo: { name: 'explorer-client', version: '1.0.0' }
        });
        
        if (initResult.pass) {
          serverReady = true;
          console.log('✅ Server started and initialized');
          resolve();
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

async function exploreHomepage() {
  console.log('\n📍 Phase 1: Opening Target Site');
  
  const openResult = await callTool('browser_open', { url: TARGET_URL, timeout: 30000 });
  logTest('browser_open', openResult);
  if (!openResult.pass) return false;

  await delay(5000);

  console.log('\n📍 Phase 2: Page Snapshot & Basic Info');
  
  const snapshotResult = await callTool('browser_snapshot');
  const snapshotData = parseToolResult(snapshotResult);
  saveData('snapshot', snapshotData);
  logTest('browser_snapshot', {
    pass: snapshotResult.pass,
    message: snapshotData?.url ? `URL: ${snapshotData.url}, Title: ${snapshotData.title}, Visible: ${snapshotData.stateDetail?.visibleCount}` : 'No data',
    error: snapshotResult.error
  });

  const domResult = await callTool('browser_dom', { selector: 'body' });
  const domData = parseToolResult(domResult);
  saveData('dom', domData);
  logTest('browser_dom', {
    pass: domResult.pass,
    message: domData?.count ? `Found ${domData.count} nodes` : 'No nodes',
    error: domResult.error
  });

  const consoleResult = await callTool('browser_console');
  const consoleData = parseToolResult(consoleResult);
  saveData('console', consoleData);
  logTest('browser_console', {
    pass: consoleResult.pass,
    message: consoleData?.count ? `${consoleData.count} logs` : 'No logs',
    error: consoleResult.error
  });

  const errorsResult = await callTool('browser_errors');
  saveData('errors', parseToolResult(errorsResult));
  logTest('browser_errors', {
    pass: errorsResult.pass,
    message: errorsResult.result?.errors?.length ? `${errorsResult.result.errors.length} errors` : 'No errors',
    error: errorsResult.error
  });

  return true;
}

async function exploreLinksAndNavigation() {
  console.log('\n📍 Phase 3: Links & Navigation');
  
  const linksResult = await callTool('browser_links');
  const linksData = parseToolResult(linksResult);
  saveData('links', linksData);
  logTest('browser_links', {
    pass: linksResult.pass,
    message: linksData?.total ? `${linksData.total} links found` : 'No links',
    error: linksResult.error
  });

  const traverseResult = await callTool('browser_traverse_menu');
  saveData('menu_traverse', parseToolResult(traverseResult));
  logTest('browser_traverse_menu', {
    pass: traverseResult.pass,
    message: 'Menu traversal completed',
    error: traverseResult.error
  });
}

async function exploreFormsAndInputs() {
  console.log('\n📍 Phase 4: Forms & Inputs');
  
  const domResult = await callTool('browser_dom', { selector: 'form' });
  const formData = parseToolResult(domResult);
  saveData('forms', formData);
  logTest('browser_dom (forms)', {
    pass: domResult.pass,
    message: formData?.count ? `${formData.count} forms found` : 'No forms',
    error: domResult.error
  });

  const inputsResult = await callTool('browser_dom', { selector: 'input, textarea, select' });
  const inputsData = parseToolResult(inputsResult);
  saveData('inputs', inputsData);
  logTest('browser_dom (inputs)', {
    pass: inputsResult.pass,
    message: inputsData?.count ? `${inputsData.count} input elements found` : 'No inputs',
    error: inputsResult.error
  });

  const findElementResult = await callTool('browser_find_element', { selector: 'button, [role="button"], input[type="submit"]', onlyVisible: false });
  const buttonData = parseToolResult(findElementResult);
  saveData('buttons', buttonData);
  logTest('browser_find_element (buttons)', {
    pass: findElementResult.pass,
    message: buttonData?.total || buttonData?.results?.length ? `${buttonData.total || buttonData.results.length} buttons found` : 'No buttons',
    error: findElementResult.error
  });

  const formValidateResult = await callTool('browser_form_validate');
  saveData('form_validation', parseToolResult(formValidateResult));
  logTest('browser_form_validate', {
    pass: formValidateResult.pass,
    message: 'Form validation completed',
    error: formValidateResult.error
  });
}

async function exploreNetworkAndStorage() {
  console.log('\n📍 Phase 5: Network & Storage');
  
  const networkResult = await callTool('browser_network');
  const networkData = parseToolResult(networkResult);
  saveData('network', networkData);
  logTest('browser_network', {
    pass: networkResult.pass,
    message: networkData?.total ? `${networkData.total} requests, ${networkData.errors} errors` : 'No requests',
    error: networkResult.error
  });

  const networkDetailResult = await callTool('browser_network_detail');
  saveData('network_detail', parseToolResult(networkDetailResult));
  logTest('browser_network_detail', {
    pass: networkDetailResult.pass,
    message: 'Network details retrieved',
    error: networkDetailResult.error
  });

  const harResult = await callTool('browser_har_export');
  saveData('har', parseToolResult(harResult));
  logTest('browser_har_export', {
    pass: harResult.pass,
    message: 'HAR exported',
    error: harResult.error
  });

  const storageResult = await callTool('browser_storage');
  saveData('storage', parseToolResult(storageResult));
  logTest('browser_storage', {
    pass: storageResult.pass,
    message: 'Storage info retrieved',
    error: storageResult.error
  });

  const cookiesResult = await callTool('browser_cookies');
  saveData('cookies', parseToolResult(cookiesResult));
  logTest('browser_cookies', {
    pass: cookiesResult.pass,
    message: 'Cookies retrieved',
    error: cookiesResult.error
  });
}

async function exploreArchitecture() {
  console.log('\n📍 Phase 6: Architecture & Technology');
  
  const archResult = await callTool('arch_reverse_probe', { url: TARGET_URL });
  const archData = parseToolResult(archResult);
  saveData('architecture', archData);
  logTest('arch_reverse_probe', {
    pass: archResult.pass,
    message: archData?.techStack ? `Tech: ${archData.techStack}` : 'No tech info',
    error: archResult.error
  });

  const routesResult = await callTool('asset_routes_discover', { url: TARGET_URL });
  const routesData = parseToolResult(routesResult);
  saveData('routes', routesData);
  logTest('asset_routes_discover', {
    pass: routesResult.pass,
    message: routesData?.routes?.length ? `${routesData.routes.length} routes discovered` : 'No routes',
    error: routesResult.error
  });

  const endpointsResult = await callTool('asset_endpoint_enum', { url: TARGET_URL });
  const endpointsData = parseToolResult(endpointsResult);
  saveData('endpoints', endpointsData);
  logTest('asset_endpoint_enum', {
    pass: endpointsResult.pass,
    message: endpointsData?.endpoints?.length ? `${endpointsData.endpoints.length} endpoints found` : 'No endpoints',
    error: endpointsResult.error
  });
}

async function exploreAccessibilityAndVisual() {
  console.log('\n📍 Phase 7: Accessibility & Visual');
  
  const a11yResult = await callTool('browser_a11y_check');
  saveData('a11y', parseToolResult(a11yResult));
  logTest('browser_a11y_check', {
    pass: a11yResult.pass,
    message: 'Accessibility check completed',
    error: a11yResult.error
  });

  const visualSnapshotResult = await callTool('browser_visual_snapshot');
  saveData('visual_snapshot', parseToolResult(visualSnapshotResult));
  logTest('browser_visual_snapshot', {
    pass: visualSnapshotResult.pass,
    message: 'Visual snapshot completed',
    error: visualSnapshotResult.error
  });

  const responsiveResult = await callTool('browser_responsive_test');
  saveData('responsive', parseToolResult(responsiveResult));
  logTest('browser_responsive_test', {
    pass: responsiveResult.pass,
    message: 'Responsive test completed',
    error: responsiveResult.error
  });
}

async function exploreDiagnosticsAndValidation() {
  console.log('\n📍 Phase 8: Diagnostics & Validation');
  
  const diagnoseResult = await callTool('browser_diagnose');
  saveData('diagnose', parseToolResult(diagnoseResult));
  logTest('browser_diagnose', {
    pass: diagnoseResult.pass,
    message: 'Diagnostics completed',
    error: diagnoseResult.error
  });

  const antiBotResult = await callTool('browser_anti_bot_detect');
  saveData('anti_bot', parseToolResult(antiBotResult));
  logTest('browser_anti_bot_detect', {
    pass: antiBotResult.pass,
    message: 'Anti-bot detection completed',
    error: antiBotResult.error
  });

  const validationResult = await callTool('validation_check', { url: TARGET_URL });
  saveData('validation', parseToolResult(validationResult));
  logTest('validation_check', {
    pass: validationResult.pass,
    message: 'Validation check completed',
    error: validationResult.error
  });

  const smokeTestResult = await callTool('browser_smoke_test');
  saveData('smoke_test', parseToolResult(smokeTestResult));
  logTest('browser_smoke_test', {
    pass: smokeTestResult.pass,
    message: 'Smoke test completed',
    error: smokeTestResult.error
  });
}

async function exploreExplorationEngine() {
  console.log('\n📍 Phase 9: Exploration Engine');
  
  const quickResult = await callTool('exploration_quick', { url: TARGET_URL });
  const quickData = parseToolResult(quickResult);
  saveData('exploration_quick', quickData);
  logTest('exploration_quick', {
    pass: quickResult.pass,
    message: quickData?.summary ? `Phases: ${quickData.summary.length}` : 'No summary',
    error: quickResult.error
  });

  const dualChainResult = await callTool('dual_chain_explore', { target: TARGET_URL });
  const dualChainData = parseToolResult(dualChainResult);
  saveData('dual_chain', dualChainData);
  logTest('dual_chain_explore', {
    pass: dualChainResult.pass,
    message: dualChainData?.sessionId ? `Session: ${dualChainData.sessionId}` : 'No session',
    error: dualChainResult.error
  });
}

async function captureEvidence() {
  console.log('\n📍 Phase 10: Evidence Capture');
  
  const screenshotResult = await callTool('browser_screenshot');
  const screenshotData = parseToolResult(screenshotResult);
  saveData('screenshot', screenshotData);
  logTest('browser_screenshot', {
    pass: screenshotResult.pass && screenshotData?.status === 'success',
    message: screenshotData?.fileName ? `File: ${screenshotData.fileName}` : 'Failed',
    error: screenshotResult.error
  });

  const artifactsResult = await callTool('browser_artifacts');
  saveData('artifacts', parseToolResult(artifactsResult));
  logTest('browser_artifacts', {
    pass: artifactsResult.pass,
    message: 'Artifacts retrieved',
    error: artifactsResult.error
  });

  const packResult = await callTool('evidence_pack', { include: ['screenshots', 'network'] });
  const packData = parseToolResult(packResult);
  saveData('evidence_pack', packData);
  logTest('evidence_pack', {
    pass: packResult.pass && packData?.success === true,
    message: packData?.filePath ? `Packed: ${packData.filePath}` : 'Failed',
    error: packResult.error
  });
}

function generateReport() {
  console.log('\n📊 Generating Exploration Report...');
  
  const report = {
    target: TARGET_URL,
    timestamp: new Date().toISOString(),
    summary: {
      totalTests: TEST_RESULTS.length,
      passed: TEST_RESULTS.filter(r => r.pass).length,
      failed: TEST_RESULTS.filter(r => !r.pass).length
    },
    data: EXPLORATION_DATA,
    testResults: TEST_RESULTS
  };

  const reportDir = path.join(__dirname, 'exploration-reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  
  const reportFileName = `exploration-${TARGET_URL.replace(/[^a-zA-Z0-9]/g, '_')}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
  const reportPath = path.join(reportDir, reportFileName);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n📄 Report saved to: ${reportPath}`);

  console.log('\n========================================');
  console.log('Exploration Summary');
  console.log('========================================');
  console.log(`\nTarget: ${TARGET_URL}`);
  console.log(`Total Tests: ${report.summary.totalTests}`);
  console.log(`✅ Passed: ${report.summary.passed}`);
  console.log(`❌ Failed: ${report.summary.failed}`);

  if (EXPLORATION_DATA.snapshot) {
    console.log(`\n📄 Page Info:`);
    console.log(`   URL: ${EXPLORATION_DATA.snapshot.url}`);
    console.log(`   Title: ${EXPLORATION_DATA.snapshot.title}`);
    console.log(`   Visible Elements: ${EXPLORATION_DATA.snapshot.stateDetail?.visibleCount}`);
    console.log(`   Inputs: ${EXPLORATION_DATA.snapshot.inputs?.length}`);
    console.log(`   Buttons: ${EXPLORATION_DATA.snapshot.buttons?.length}`);
  }

  if (EXPLORATION_DATA.links) {
    console.log(`\n🔗 Links:`);
    console.log(`   Total: ${EXPLORATION_DATA.links.total}`);
    if (EXPLORATION_DATA.links.categories && EXPLORATION_DATA.links.categories.length > 0) {
      console.log(`   Categories: ${EXPLORATION_DATA.links.categories.join(', ')}`);
    }
  }

  if (EXPLORATION_DATA.forms) {
    console.log(`\n📝 Forms:`);
    console.log(`   Total: ${EXPLORATION_DATA.forms.count}`);
  }

  if (EXPLORATION_DATA.network) {
    console.log(`\n🌐 Network:`);
    console.log(`   Total Requests: ${EXPLORATION_DATA.network.total}`);
    console.log(`   Errors: ${EXPLORATION_DATA.network.errors}`);
    console.log(`   Slow Requests: ${EXPLORATION_DATA.network.slowRequests}`);
  }

  if (EXPLORATION_DATA.architecture) {
    console.log(`\n🏗️ Architecture:`);
    if (EXPLORATION_DATA.architecture.techStack) {
      console.log(`   Tech Stack: ${JSON.stringify(EXPLORATION_DATA.architecture.techStack)}`);
    }
    if (EXPLORATION_DATA.architecture.middleware) {
      console.log(`   Middleware: ${EXPLORATION_DATA.architecture.middleware}`);
    }
  }

  if (EXPLORATION_DATA.routes) {
    console.log(`\n🛣️ Routes Discovered:`);
    console.log(`   Total: ${EXPLORATION_DATA.routes.routes?.length || 0}`);
  }

  if (EXPLORATION_DATA.endpoints) {
    console.log(`\n📍 Endpoints Found:`);
    console.log(`   Total: ${EXPLORATION_DATA.endpoints.endpoints?.length || 0}`);
  }

  if (report.summary.failed > 0) {
    console.log('\n❌ Failed Tests:');
    TEST_RESULTS.filter(r => !r.pass).forEach(r => {
      console.log(`   - ${r.name}: ${r.error?.message || r.message}`);
    });
  }

  return reportPath;
}

async function main() {
  console.log('========================================');
  console.log(`Exploring: ${TARGET_URL}`);
  console.log('========================================\n');

  try {
    await startServer();

    const canContinue = await exploreHomepage();
    if (!canContinue) {
      console.log('\n❌ Failed to open target site');
      return;
    }

    await exploreLinksAndNavigation();
    await exploreFormsAndInputs();
    await exploreNetworkAndStorage();
    await exploreArchitecture();
    await exploreAccessibilityAndVisual();
    await exploreDiagnosticsAndValidation();
    await exploreExplorationEngine();
    await captureEvidence();

    generateReport();

  } catch (err) {
    console.error('❌ Exploration failed:', err.message);
    logTest('Exploration Runner', { pass: false, error: err });
    generateReport();
  } finally {
    stopServer();
    process.exit(TEST_RESULTS.filter(r => !r.pass).length > 0 ? 1 : 0);
  }
}

main();