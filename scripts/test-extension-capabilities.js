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

console.log('\n=== Test 1: 模板生态扩展 ===');
try {
  const valCode = fs.readFileSync(validationPath, 'utf8');
  for (const tpl of ['marketplace-purchase', 'login-basic', 'credits-balance', 'shopping-cart', 'register-flow', 'checkout-payment']) {
    assert(valCode.includes(`'${tpl}':`), `模板 ${tpl} 存在`);
  }
  const tplCount = (valCode.match(/'([a-z-]+)':\s*\{\s*description:/g) || []).length;
  assert(tplCount >= 6, `BUILTIN_TEMPLATES 至少 6 个模板（实际 ${tplCount}）`);
} catch(e) {
  console.log('  ERROR:', e.message);
  failed++;
}

console.log('\n=== Test 2: 契约版本化（基线存储 + 漂移检测）===');
try {
  const valCode = fs.readFileSync(validationPath, 'utf8');
  assert(valCode.includes('function saveContractBaseline'), 'saveContractBaseline 函数存在');
  assert(valCode.includes('function loadContractBaseline'), 'loadContractBaseline 函数存在');
  assert(valCode.includes('function listContractBaselines'), 'listContractBaselines 函数存在');
  assert(valCode.includes('function compareSchemas'), 'compareSchemas 函数存在');
  assert(valCode.includes('function compareContractsWithBaseline'), 'compareContractsWithBaseline 函数存在');
  assert(valCode.includes('function runContractBaseline'), 'runContractBaseline 函数存在');
  assert(valCode.includes("name === 'contract_baseline'"), 'contract_baseline 路由注册');
  assert(valCode.includes('saveBaseline'), 'contract_guard 支持 saveBaseline 参数');
  assert(valCode.includes('compareBaseline'), 'contract_guard 支持 compareBaseline 参数');
  assert(valCode.includes('drift'), 'contract_guard 返回 drift 字段');
} catch(e) {
  console.log('  ERROR:', e.message);
  failed++;
}

console.log('\n=== Test 3: evidence_pack 索引 ===');
try {
  const evCode = fs.readFileSync(evidencePath, 'utf8');
  assert(evCode.includes('function buildEvidenceIndex'), 'buildEvidenceIndex 函数存在');
  assert(evCode.includes("name === 'evidence_index'"), 'evidence_index 路由注册');
  assert(evCode.includes('timeline'), 'evidence_index 返回 timeline');
  assert(evCode.includes('totalPacks'), 'evidence_index 返回 totalPacks');
  assert(evCode.includes('totalRuns'), 'evidence_index 返回 totalRuns');
  assert(evCode.includes('hasDriftEvidence'), 'evidence_index 检测 drift 证据');
} catch(e) {
  console.log('  ERROR:', e.message);
  failed++;
}

console.log('\n=== Test 4: traceId 深度关联 ===');
try {
  const evCode = fs.readFileSync(evidencePath, 'utf8');
  assert(evCode.includes('async function traceCorrelate'), 'traceCorrelate 函数存在');
  assert(evCode.includes("name === 'trace_correlate'"), 'trace_correlate 路由注册');
  assert(evCode.includes('frontendEvidence'), 'trace_correlate 返回 frontendEvidence');
  assert(evCode.includes('backendCorrelation'), 'trace_correlate 返回 backendCorrelation');
  assert(evCode.includes('hasFullChain'), 'trace_correlate 返回 hasFullChain');
  assert(evCode.includes('servicesInvolved'), 'trace_correlate 返回 servicesInvolved');
} catch(e) {
  console.log('  ERROR:', e.message);
  failed++;
}

console.log('\n=== Test 5: Schema 文件 ===');
try {
  const toolsDir = path.join(__dirname, '..', 'tools');
  for (const name of ['contract_baseline.json', 'evidence_index.json', 'trace_correlate.json']) {
    const f = path.join(toolsDir, name);
    assert(fs.existsSync(f), name + ' 存在');
    if (fs.existsSync(f)) {
      const s = JSON.parse(fs.readFileSync(f, 'utf8'));
      assert(s.name && s.inputSchema, name + ' schema 合法');
    }
  }
  const cgSchema = JSON.parse(fs.readFileSync(path.join(toolsDir, 'contract_guard.json'), 'utf8'));
  assert(cgSchema.inputSchema.properties.saveBaseline, 'contract_guard 有 saveBaseline 参数');
  assert(cgSchema.inputSchema.properties.compareBaseline, 'contract_guard 有 compareBaseline 参数');
} catch(e) {
  console.log('  ERROR:', e.message);
  failed++;
}

console.log('\n=== Test 6: 模板步骤数量验证（文本检查）===');
try {
  const valCode = fs.readFileSync(validationPath, 'utf8');
  
  // 提取 shopping-cart 段落（从模板名到下一个模板名）
  function extractTemplateSection(code, tplName, nextTplName) {
    const startIdx = code.indexOf(`'${tplName}':`);
    if (startIdx === -1) return null;
    const endIdx = nextTplName ? code.indexOf(`'${nextTplName}':`, startIdx) : code.indexOf('\n};', startIdx);
    if (endIdx === -1) return null;
    return code.slice(startIdx, endIdx);
  }
  
  const cartSection = extractTemplateSection(valCode, 'shopping-cart', 'register-flow');
  if (cartSection) {
    const stepCount = (cartSection.match(/\{\s*type:/g) || []).length;
    assert(stepCount >= 10, `shopping-cart 至少 10 步（实际 ${stepCount}）`);
  } else {
    assert(false, '无法提取 shopping-cart 段落');
  }
  
  const regSection = extractTemplateSection(valCode, 'register-flow', 'checkout-payment');
  if (regSection) {
    const stepCount = (regSection.match(/\{\s*type:/g) || []).length;
    assert(stepCount >= 10, `register-flow 至少 10 步（实际 ${stepCount}）`);
  } else {
    assert(false, '无法提取 register-flow 段落');
  }
  
  const checkoutSection = extractTemplateSection(valCode, 'checkout-payment', null);
  if (checkoutSection) {
    assert(checkoutSection.includes('stateSources'), 'checkout-payment 有 stateSources');
    const stepCount = (checkoutSection.match(/\{\s*type:/g) || []).length;
    assert(stepCount >= 8, `checkout-payment 至少 8 步（实际 ${stepCount}）`);
  } else {
    assert(false, '无法提取 checkout-payment 段落');
  }
  
  // 模板描述检查
  assert(valCode.includes('购物车添加/查看/删除完整流程验证'), 'shopping-cart 描述正确');
  assert(valCode.includes('用户注册完整流程验证'), 'register-flow 描述正确');
  assert(valCode.includes('结账支付流程验证'), 'checkout-payment 描述正确');
} catch(e) {
  console.log('  ERROR:', e.message, e.stack);
  failed++;
}

console.log('\n=== Test 7: 语法检查 ===');
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
