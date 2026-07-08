'use strict';

require('../core/win-encoding');

const http = require('http');
const fs = require('fs');
const path = require('path');

const MCP_SERVER = 'http://localhost:3456';
const TEST_URL = 'http://localhost:3001';

function callTool(toolName, args = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      jsonrpc: '2.0',
      id: String(Date.now()),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    });

    const options = {
      hostname: 'localhost',
      port: 3456,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(result);
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}, body: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function parseResult(result) {
  if (!result || result.error) return { success: false, parsed: null, error: result?.error };
  const toolResult = result.result;
  if (!toolResult || toolResult.isError === true) return { success: false, parsed: null, error: toolResult?.isError };
  
  let parsed = null;
  if (toolResult.structuredContent) {
    parsed = toolResult.structuredContent;
  } else if (toolResult.content) {
    const textContent = toolResult.content.find(c => c.type === 'text');
    if (textContent && textContent.text) {
      try {
        parsed = JSON.parse(textContent.text);
      } catch (_) {
        parsed = { text: textContent.text };
      }
    }
  }
  
  return { success: true, parsed, error: null };
}

async function runValidation() {
  console.log('========================================');
  console.log('  开源探索闭环 - 真实项目验证');
  console.log('========================================');
  console.log(`测试目标: ${TEST_URL}`);
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;
  const testResults = [];

  function assert(ok, msg, detail = '') {
    if (ok) {
      passed++;
      console.log(`  ✅ ${msg}`);
    } else {
      failed++;
      console.log(`  ❌ ${msg}`);
      if (detail) console.log(`     ${detail}`);
    }
    testResults.push({ msg, passed: ok, detail });
    return ok;
  }

  console.log('\n📋 === 阶段1: 页面打开与基础信息 ===');

  console.log('\n📋 测试1.1: browser_open - 打开页面');
  try {
    const result = await callTool('browser_open', { url: TEST_URL });
    const { success, parsed, error } = parseResult(result);
    assert(success, 'browser_open 成功', error ? JSON.stringify(error).slice(0, 150) : '');
  } catch (e) {
    assert(false, `browser_open 失败: ${e.message}`);
  }

  console.log('\n📋 测试1.2: browser_snapshot - 获取页面快照');
  try {
    const result = await callTool('browser_snapshot', {});
    const { success, parsed } = parseResult(result);
    const hasData = parsed && (parsed.title || parsed.url || parsed.elements);
    assert(success && hasData, 'browser_snapshot 成功返回页面信息', hasData ? '' : '返回数据为空');
  } catch (e) {
    assert(false, `browser_snapshot 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段2: 资产发现与端点探测 ===');

  console.log('\n📋 测试2.1: asset_endpoint_probe - 主动端点探测');
  try {
    const result = await callTool('asset_endpoint_probe', { probeCategories: ['system', 'auth'], method: 'HEAD' });
    const { success, parsed } = parseResult(result);
    const hasSummary = parsed && parsed.summary && typeof parsed.totalProbed === 'number';
    assert(success && hasSummary, 'asset_endpoint_probe 成功返回探测结果', hasSummary ? `探测了 ${parsed.totalProbed} 个端点` : '返回数据异常');
  } catch (e) {
    assert(false, `asset_endpoint_probe 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段3: 认证安全检测 ===');

  console.log('\n📋 测试3.1: bypass_login - 认证绕过检测');
  try {
    const result = await callTool('bypass_login', { 
      targetUrl: TEST_URL,
      testCases: ['no_cookie', 'no_auth_header', 'backdoor_paths']
    });
    const { success, parsed } = parseResult(result);
    const hasVulnerabilities = parsed && Array.isArray(parsed.vulnerabilities);
    const hasStatus = parsed && (parsed.status === 'secure' || parsed.status === 'vulnerable');
    assert(success && hasVulnerabilities && hasStatus, 'bypass_login 成功返回安全检测结果', hasStatus ? `状态: ${parsed.status}` : '返回数据异常');
  } catch (e) {
    assert(false, `bypass_login 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段4: 数据一致性比对 ===');

  console.log('\n📋 测试4.1: correlate_triple_check - UI-API数据比对');
  try {
    const result = await callTool('correlate_triple_check', { 
      mode: 'list',
      apiEndpoint: '/api/users',
      maxRows: 5
    });
    const { success, parsed } = parseResult(result);
    const hasStatus = parsed && (parsed.status === 'consistent' || parsed.status === 'inconsistent');
    const hasSummary = parsed && parsed.summary;
    assert(success && hasStatus && hasSummary, 'correlate_triple_check 成功返回比对结果', hasStatus ? `一致性状态: ${parsed.status}` : '返回数据异常');
  } catch (e) {
    assert(false, `correlate_triple_check 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段5: 错误分析与修复建议 ===');

  console.log('\n📋 测试5.1: atl_learn - ATL似然比学习');
  try {
    const result = await callTool('atl_learn', { 
      errorText: 'Failed to fetch /api/data',
      errorUrl: TEST_URL
    });
    const { success, parsed } = parseResult(result);
    const hasResults = parsed && Array.isArray(parsed.results);
    assert(success && hasResults, 'atl_learn 成功返回学习结果', hasResults ? `分析了 ${parsed.totalErrorGroups} 个错误分组` : '返回数据异常');
  } catch (e) {
    assert(false, `atl_learn 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段6: 一键探索引擎 ===');

  console.log('\n📋 测试6.1: exploration_quick - 一键探索');
  try {
    const result = await callTool('exploration_quick', { url: TEST_URL });
    const { success, parsed } = parseResult(result);
    const hasPhases = parsed && parsed.phases;
    assert(success && hasPhases, 'exploration_quick 成功返回探索结果', hasPhases ? `完成了 ${Object.keys(parsed.phases).length} 个阶段` : '返回数据异常');
  } catch (e) {
    assert(false, `exploration_quick 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段7: 健康检查 ===');

  console.log('\n📋 测试7.1: mcp_health_check - 健康检查');
  try {
    const result = await callTool('mcp_health_check', {});
    const { success, parsed } = parseResult(result);
    const healthOk = parsed && parsed.ok === true;
    assert(success && healthOk, 'mcp_health_check 成功且健康', healthOk ? '' : '健康检查返回 ok=false');
  } catch (e) {
    assert(false, `mcp_health_check 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段8: 证据打包 ===');

  console.log('\n📋 测试8.1: evidence_pack - 证据打包');
  try {
    const result = await callTool('evidence_pack', {});
    const { success } = parseResult(result);
    assert(success, 'evidence_pack 成功');
  } catch (e) {
    assert(false, `evidence_pack 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段9: 付费功能拦截验证 ===');

  console.log('\n📋 测试9.1: auto_fix_pipeline - 付费功能拦截');
  try {
    const result = await callTool('auto_fix_pipeline', {});
    assert(result && result.error, 'auto_fix_pipeline 被成功拦截');
  } catch (e) {
    assert(false, `付费功能拦截测试失败: ${e.message}`);
  }

  console.log('\n========================================');
  console.log(`测试结果: ${passed}/${passed + failed} 通过`);
  console.log('========================================');

  if (passed === passed + failed) {
    console.log('\n🎉 开源探索闭环验证通过！所有工具正常工作');
  } else {
    console.log('\n⚠️ 部分测试失败，请检查失败的工具');
  }

  const report = {
    date: new Date().toISOString(),
    testUrl: TEST_URL,
    passed,
    failed,
    total: passed + failed,
    successRate: ((passed / (passed + failed)) * 100).toFixed(1) + '%',
    details: testResults,
    phases: {
      '阶段1: 页面打开与基础信息': { passed: testResults.slice(0, 2).filter(r => r.passed).length, total: 2 },
      '阶段2: 资产发现与端点探测': { passed: testResults.slice(2, 3).filter(r => r.passed).length, total: 1 },
      '阶段3: 认证安全检测': { passed: testResults.slice(3, 4).filter(r => r.passed).length, total: 1 },
      '阶段4: 数据一致性比对': { passed: testResults.slice(4, 5).filter(r => r.passed).length, total: 1 },
      '阶段5: 错误分析与修复建议': { passed: testResults.slice(5, 6).filter(r => r.passed).length, total: 1 },
      '阶段6: 一键探索引擎': { passed: testResults.slice(6, 7).filter(r => r.passed).length, total: 1 },
      '阶段7: 健康检查': { passed: testResults.slice(7, 8).filter(r => r.passed).length, total: 1 },
      '阶段8: 证据打包': { passed: testResults.slice(8, 9).filter(r => r.passed).length, total: 1 },
      '阶段9: 付费功能拦截验证': { passed: testResults.slice(9, 10).filter(r => r.passed).length, total: 1 }
    }
  };

  const reportDir = path.join(__dirname, '../test-reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `oss-validation-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📊 测试报告已保存: ${reportPath}`);

  return passed === passed + failed;
}

runValidation().then(success => {
  process.exit(success ? 0 : 1);
}).catch(e => {
  console.error('测试执行异常:', e.message);
  process.exit(1);
});