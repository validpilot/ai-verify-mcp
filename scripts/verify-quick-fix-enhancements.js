#!/usr/bin/env node
// Quick-fix enhancements verification script
// Tests all fix-related tools (4 enhanced + 4 original)
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const BASE = path.resolve(__dirname, '..');
const ARTIFACTS = path.join(BASE, 'artifacts', 'verify-fix');
if (!fs.existsSync(ARTIFACTS)) fs.mkdirSync(ARTIFACTS, { recursive: true });

let passed = 0;
let failed = 0;

function assert(ok, msg) {
  if (ok) { passed++; console.log('  ✅ ' + msg); }
  else { failed++; console.log('  ❌ ' + msg); }
}

async function testErrorFixSuggestion() {
  console.log('\n📋 Test: error_fix_suggestion');
  
  const server = spawn('node', ['server.js'], { stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = '';
  const send = (msg) => server.stdin.write(JSON.stringify(msg) + '\n');
  
  await new Promise(r => setTimeout(r, 1500));
  
  // Test 1: 404 pattern match with new fields
  send({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'error_fix_suggestion', arguments: {
      errorSummary: 'HTTP 404 Not Found - /api/v1/identity/me'
    }}
  });
  
  // Test 2: new pattern api_response_html
  send({
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: 'error_fix_suggestion', arguments: {
      errorSummary: 'API returned HTML instead of JSON - SPA 路由兜底'
    }}
  });
  
  // Test 3: new pattern rate_limit
  send({
    jsonrpc: '2.0', id: 3, method: 'tools/call',
    params: { name: 'error_fix_suggestion', arguments: {
      errorSummary: '429 too many requests rate limit exceeded'
    }}
  });
  
  await new Promise(r => setTimeout(r, 3000));
  server.kill();
  
  const lines = buf.split('\n').filter(l => l.trim().startsWith('{"jsonrpc'));
  let got1 = false, got2 = false, got3 = false;
  
  for (const l of lines) {
    try {
      const o = JSON.parse(l);
      if (o.id === 1 && o.result) {
        got1 = true;
        const sug = o.result.suggestions || [];
        assert(sug.length > 0, '404 pattern returns suggestions');
        assert(sug.every(s => s.severity !== undefined), 'suggestion has severity field');
        // suggestedCode is optional
        const hasCode = sug.some(s => s.suggestedCode !== undefined);
        console.log('    has suggestedCode:', hasCode ? '✅ yes' : '⚠️ no');
      }
      if (o.id === 2 && o.result) {
        got2 = true;
        const sug = o.result.suggestions || [];
        assert(sug.some(s => s.relatedTool), 'api_response_html has relatedTool');
        assert(sug.some(s => s.severity === 'blocking'), 'api_response_html severity is blocking');
      }
      if (o.id === 3 && o.result) {
        got3 = true;
        const sug = o.result.suggestions || [];
        assert(sug.some(s => s.suggestedCode), 'rate_limit has suggestedCode');
      }
    } catch(e) {}
  }
  
  assert(got1, '404 pattern match response received');
  assert(got2, 'api_response_html new pattern match received');
  assert(got3, 'rate_limit new pattern match received');
}

async function testQuickFix() {
  console.log('\n📋 Test: browser_quick_fix schema');
  const tools = JSON.parse(fs.readFileSync(path.join(BASE, 'tools', 'browser_quick_fix.json'), 'utf8'));
  const props = tools.inputSchema.properties;
  assert(props.problem !== undefined, 'problem field exists (backward compat)');
  assert(props.problems !== undefined, 'problems array field exists (new)');
  assert(props.problem.enum.includes('api_failed'), 'api_failed in problem enum');
  assert(props.problem.enum.includes('page_crashed'), 'page_crashed in problem enum');
  assert(props.problem.enum.includes('resource_blocked'), 'resource_blocked in problem enum');
}

async function testFixVerify() {
  console.log('\n📋 Test: fix_verify schema');
  const tools = JSON.parse(fs.readFileSync(path.join(BASE, 'tools', 'fix_verify.json'), 'utf8'));
  const props = tools.inputSchema.properties;
  assert(props.captureScreenshots !== undefined, 'captureScreenshots field exists');
  assert(props.checkDomElements !== undefined, 'checkDomElements field exists');
}

async function testAutoFixPipeline() {
  console.log('\n📋 Test: auto_fix_pipeline');
  assert(fs.existsSync(path.join(BASE, 'tools', 'auto_fix_pipeline.json')), 'schema file exists');
  const tools = JSON.parse(fs.readFileSync(path.join(BASE, 'tools', 'auto_fix_pipeline.json'), 'utf8'));
  assert(tools.name === 'auto_fix_pipeline', 'tool name correct');
  const props = tools.inputSchema.properties;
  assert(props.url !== undefined, 'url param exists');
  assert(props.maxIterations !== undefined, 'maxIterations param exists');
  assert(props.autoConfirm !== undefined, 'autoConfirm param exists');
}

async function testOriginalTools() {
  console.log('\n📋 Test: original fix tools still exist');
  const toolFiles = fs.readdirSync(path.join(BASE, 'tools')).filter(f => f.endsWith('.json'));
  const toolNames = toolFiles.map(f => JSON.parse(fs.readFileSync(path.join(BASE, 'tools', f))).name);
  assert(toolNames.includes('browser_verify_fix'), 'browser_verify_fix exists');
  assert(toolNames.includes('mcp_health_check'), 'mcp_health_check exists');
  assert(toolNames.includes('mcp_self_test'), 'mcp_self_test exists');
}

async function testServerJS() {
  console.log('\n📋 Test: server.js includes all fix handlers');
  const src = fs.readFileSync(path.join(BASE, 'server.js'), 'utf8');
  assert(src.includes("case 'auto_fix_pipeline'"), 'auto_fix_pipeline handler exists');
  assert(src.includes("case 'error_fix_suggestion'"), 'error_fix_suggestion handler exists');
  assert(src.includes("case 'browser_quick_fix'"), 'browser_quick_fix handler exists');
  assert(src.includes("case 'fix_verify'"), 'fix_verify handler exists');
  assert(src.includes("case 'browser_verify_fix'"), 'browser_verify_fix handler exists');
  
  // Check new strategies in browser_quick_fix
  assert(src.includes('fixApiFailed') || src.includes('api_failed'), 'api_failed strategy handler exists');
  assert(src.includes('fixPageCrashed') || src.includes('page_crashed'), 'page_crashed strategy exists');
  assert(src.includes('fixResourceBlocked') || src.includes('resource_blocked'), 'resource_blocked strategy exists');
}

async function testPackageVersion() {
  console.log('\n📋 Test: package version patched');
  const pkg = JSON.parse(fs.readFileSync(path.join(BASE, 'package.json'), 'utf8'));
  assert(pkg.version === '1.0.1', `version is 1.0.1 (got ${pkg.version})`);
}

async function main() {
  console.log('🔧 Quick-Fix Enhancements Verification');
  console.log('======================================');
  
  await testServerJS();
  await testErrorFixSuggestion();
  await testQuickFix();
  await testFixVerify();
  await testAutoFixPipeline();
  await testOriginalTools();
  await testPackageVersion();
  
  console.log(`\n======================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
