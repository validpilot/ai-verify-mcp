const fs = require('fs');
const path = require('path');

const validationPath = path.join(__dirname, '..', 'handlers', 'validation.js');
const evidencePath = path.join(__dirname, '..', 'handlers', 'evidence.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log('  PASS:', msg); }
  else { failed++; console.log('  FAIL:', msg); }
}

console.log('\n=== Test 1: Template system via chain_list_templates handler ===');
try {
  const valCode = fs.readFileSync(validationPath, 'utf8');
  
  const hasTemplates = valCode.includes("'marketplace-purchase'") && valCode.includes("'login-basic'") && valCode.includes("'credits-balance'");
  assert(hasTemplates, 'BUILTIN_TEMPLATES has 3+ templates');
  
  const hasLoadFn = valCode.includes('function loadChainTemplate');
  assert(hasLoadFn, 'loadChainTemplate function exists');
  
  const hasListTool = valCode.includes("name === 'chain_list_templates'");
  assert(hasListTool, 'chain_list_templates tool handler registered');
  
  const hasTemplateParam = valCode.includes("args.template");
  assert(hasTemplateParam, 'runChainSpecRun supports template param');
} catch(e) {
  console.log('  ERROR:', e.message);
  failed++;
}

console.log('\n=== Test 2: Contract guard schema inference ===');
try {
  const valCode = fs.readFileSync(validationPath, 'utf8');
  
  const hasInferType = valCode.includes('function inferType');
  assert(hasInferType, 'inferType function exists');
  
  const hasExtractSchema = valCode.includes('function extractSchema');
  assert(hasExtractSchema, 'extractSchema function exists');
  
  const hasContractGuard = valCode.includes("name === 'contract_guard'") || valCode.includes("name==='contract_guard'");
  assert(hasContractGuard, 'contract_guard tool handler registered');
  
  const hasRunContractGuard = valCode.includes('function runContractGuard') || valCode.includes('async function runContractGuard');
  assert(hasRunContractGuard, 'runContractGuard function exists');
} catch(e) {
  console.log('  ERROR:', e.message);
  failed++;
}

console.log('\n=== Test 3: Evidence pack enhancements ===');
try {
  const evCode = fs.readFileSync(evidencePath, 'utf8');
  
  const hasApiResp = evCode.includes('function extractApiResponses');
  assert(hasApiResp, 'extractApiResponses function exists');
  
  const hasDataDiff = evCode.includes('function computeDataDiff');
  assert(hasDataDiff, 'computeDataDiff function exists');
  
  const hasApiResponses = evCode.includes('apiResponses');
  assert(hasApiResponses, 'evidence pack includes apiResponses');
  
  const hasDataDiffField = evCode.includes('dataDiff');
  assert(hasDataDiffField, 'evidence pack includes dataDiff');
  
  const hasTraceIds = evCode.includes('traceIds');
  assert(hasTraceIds, 'evidence pack includes traceIds array');
  
  const hasV2 = evCode.includes("version: '2.1'") || evCode.includes("version: '2.0'");
  assert(hasV2, 'evidence pack version 2.x');
} catch(e) {
  console.log('  ERROR:', e.message);
  failed++;
}

console.log('\n=== Test 4: Schema files ===');
try {
  const toolsDir = path.join(__dirname, '..', 'tools');
  const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.json'));
  
  for (const name of ['chain_list_templates.json', 'contract_guard.json']) {
    const f = path.join(toolsDir, name);
    assert(fs.existsSync(f), name + ' exists');
    if (fs.existsSync(f)) {
      const s = JSON.parse(fs.readFileSync(f, 'utf8'));
      assert(s.name && s.inputSchema, name + ' has valid schema');
    }
  }
  
  const chainSpec = JSON.parse(fs.readFileSync(path.join(toolsDir, 'chain_spec_run.json'), 'utf8'));
  assert(chainSpec.inputSchema.properties.template, 'chain_spec_run has template param');
  
  const evPack = JSON.parse(fs.readFileSync(path.join(toolsDir, 'evidence_pack.json'), 'utf8'));
  assert(evPack.inputSchema.properties.beforeData, 'evidence_pack has beforeData');
  assert(evPack.inputSchema.properties.afterData, 'evidence_pack has afterData');
  assert(evPack.inputSchema.properties.apiResponseLimit, 'evidence_pack has apiResponseLimit');
} catch(e) {
  console.log('  ERROR:', e.message);
  failed++;
}

console.log('\n=== Test 5: Syntax check all modified files ===');
try {
  const { execSync } = require('child_process');
  execSync('node --check ' + validationPath, { stdio: 'pipe' });
  assert(true, 'validation.js syntax OK');
  execSync('node --check ' + evidencePath, { stdio: 'pipe' });
  assert(true, 'evidence.js syntax OK');
} catch(e) {
  console.log('  ERROR:', e.stderr ? e.stderr.toString() : e.message);
  failed++;
}

console.log('\n========================================');
console.log(`Total: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

process.exit(failed > 0 ? 1 : 0);
