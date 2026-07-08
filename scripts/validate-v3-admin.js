'use strict';

require('../core/win-encoding');

const http = require('http');
const fs = require('fs');
const path = require('path');

const MCP_SERVER = 'http://localhost:3456';
const TEST_URL = 'http://localhost:3333';

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
  console.log('  v3-admin-vite 真实项目验证');
  console.log('========================================');
  console.log(`测试目标: ${TEST_URL}`);
  console.log('项目类型: Vue3 + Element Plus + Pinia + Vue Router');
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

  console.log('\n📋 测试1.1: browser_open - 打开登录页面');
  try {
    const result = await callTool('browser_open', { url: TEST_URL });
    const { success } = parseResult(result);
    assert(success, 'browser_open 成功');
  } catch (e) {
    assert(false, `browser_open 失败: ${e.message}`);
  }

  console.log('\n📋 测试1.2: browser_snapshot - 获取页面快照');
  try {
    const result = await callTool('browser_snapshot', {});
    const { success, parsed } = parseResult(result);
    const hasData = parsed && (parsed.title || parsed.url || parsed.elements);
    assert(success && hasData, 'browser_snapshot 成功', hasData ? `标题: ${parsed.title}` : '返回数据为空');
  } catch (e) {
    assert(false, `browser_snapshot 失败: ${e.message}`);
  }

  console.log('\n📋 测试1.3: exploration_quick - 技术栈识别（通过一键探索）');
  try {
    const result = await callTool('exploration_quick', { url: TEST_URL });
    const { success, parsed } = parseResult(result);
    const hasTechStack = parsed && parsed.phases && parsed.phases.techStack;
    assert(success && hasTechStack, 'exploration_quick 技术栈识别成功', hasTechStack ? `框架: ${parsed.phases.techStack.frameworks?.join(', ') || '未识别'}` : '未识别到框架');
  } catch (e) {
    assert(false, `exploration_quick 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段2: 资产发现 ===');

  console.log('\n📋 测试2.1: asset_endpoint_probe - 主动端点探测');
  try {
    const result = await callTool('asset_endpoint_probe', { probeCategories: ['auth', 'system', 'admin'], method: 'HEAD' });
    const { success, parsed } = parseResult(result);
    const hasSummary = parsed && parsed.summary && typeof parsed.totalProbed === 'number';
    assert(success && hasSummary, 'asset_endpoint_probe 成功', hasSummary ? `探测了 ${parsed.totalProbed} 个端点` : '返回数据异常');
  } catch (e) {
    assert(false, `asset_endpoint_probe 失败: ${e.message}`);
  }

  console.log('\n📋 测试2.2: asset_routes_discover - 路由发现');
  try {
    const result = await callTool('asset_routes_discover', {});
    const { success, parsed } = parseResult(result);
    assert(success, 'asset_routes_discover 成功');
  } catch (e) {
    assert(false, `asset_routes_discover 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段3: 表单与交互 ===');

  console.log('\n📋 测试3.1: browser_form_validate - 表单验证');
  try {
    const result = await callTool('browser_form_validate', { url: TEST_URL });
    const { success, parsed } = parseResult(result);
    const hasForms = parsed && parsed.forms && parsed.forms.length > 0;
    assert(success && hasForms, 'browser_form_validate 成功', hasForms ? `发现 ${parsed.forms.length} 个表单` : '未发现表单');
  } catch (e) {
    assert(false, `browser_form_validate 失败: ${e.message}`);
  }

  console.log('\n📋 测试3.2: browser_form_fill - 表单填充');
  try {
    const result = await callTool('browser_form_fill', { 
      url: TEST_URL,
      fields: [{ selector: 'input[type="text"]', value: 'admin' }, { selector: 'input[type="password"]', value: '123456' }],
      submit: false
    });
    const { success } = parseResult(result);
    assert(success, 'browser_form_fill 成功');
  } catch (e) {
    assert(false, `browser_form_fill 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段4: 认证安全 ===');

  console.log('\n📋 测试4.1: bypass_login - 认证绕过检测');
  try {
    const result = await callTool('bypass_login', { 
      targetUrl: TEST_URL,
      testCases: ['no_cookie', 'no_auth_header', 'backdoor_paths']
    });
    const { success, parsed } = parseResult(result);
    const hasVulnerabilities = parsed && Array.isArray(parsed.vulnerabilities);
    const hasStatus = parsed && (parsed.status === 'secure' || parsed.status === 'vulnerable');
    assert(success && hasVulnerabilities && hasStatus, 'bypass_login 成功', hasStatus ? `状态: ${parsed.status}` : '返回数据异常');
  } catch (e) {
    assert(false, `bypass_login 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段5: 数据一致性比对 ===');

  console.log('\n📋 测试5.1: correlate_triple_check - UI-API数据比对');
  try {
    const result = await callTool('correlate_triple_check', { 
      mode: 'list',
      apiEndpoint: '/api/users',
      maxRows: 5
    });
    const { success, parsed } = parseResult(result);
    const hasStatus = parsed && (parsed.status === 'consistent' || parsed.status === 'inconsistent');
    assert(success && hasStatus, 'correlate_triple_check 成功', hasStatus ? `一致性: ${parsed.status}` : '返回数据异常');
  } catch (e) {
    assert(false, `correlate_triple_check 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段6: 一键探索 ===');

  console.log('\n📋 测试6.1: exploration_quick - 一键探索');
  try {
    const result = await callTool('exploration_quick', { url: TEST_URL });
    const { success, parsed } = parseResult(result);
    const hasPhases = parsed && parsed.phases;
    assert(success && hasPhases, 'exploration_quick 成功', hasPhases ? `完成 ${Object.keys(parsed.phases).length} 阶段` : '返回数据异常');
  } catch (e) {
    assert(false, `exploration_quick 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段7: 错误分析 ===');

  console.log('\n📋 测试7.1: atl_learn - ATL似然比学习');
  try {
    const result = await callTool('atl_learn', { errorText: 'API request failed', errorUrl: TEST_URL });
    const { success, parsed } = parseResult(result);
    const hasResults = parsed && Array.isArray(parsed.results);
    assert(success && hasResults, 'atl_learn 成功', hasResults ? `分析 ${parsed.totalErrorGroups} 个错误分组` : '返回数据异常');
  } catch (e) {
    assert(false, `atl_learn 失败: ${e.message}`);
  }

  console.log('\n📋 测试7.2: browser_errors - 页面错误检测');
  try {
    const result = await callTool('browser_errors', {});
    const { success } = parseResult(result);
    assert(success, 'browser_errors 成功');
  } catch (e) {
    assert(false, `browser_errors 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段8: 性能与无障碍 ===');

  console.log('\n📋 测试8.1: browser_performance_check - 性能检查');
  try {
    const result = await callTool('browser_performance_check', {});
    const { success } = parseResult(result);
    assert(success, 'browser_performance_check 成功');
  } catch (e) {
    assert(false, `browser_performance_check 失败: ${e.message}`);
  }

  console.log('\n📋 测试8.2: browser_a11y_check - 无障碍检查');
  try {
    const result = await callTool('browser_a11y_check', {});
    const { success } = parseResult(result);
    assert(success, 'browser_a11y_check 成功');
  } catch (e) {
    assert(false, `browser_a11y_check 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段9: 证据打包 ===');

  console.log('\n📋 测试9.1: evidence_pack - 证据打包');
  try {
    const result = await callTool('evidence_pack', {});
    const { success } = parseResult(result);
    assert(success, 'evidence_pack 成功');
  } catch (e) {
    assert(false, `evidence_pack 失败: ${e.message}`);
  }

  console.log('\n📋 === 阶段10: 健康检查 ===');

  console.log('\n📋 测试10.1: mcp_health_check - 健康检查');
  try {
    const result = await callTool('mcp_health_check', {});
    const { success, parsed } = parseResult(result);
    const healthOk = parsed && parsed.ok === true;
    assert(success && healthOk, 'mcp_health_check 成功', healthOk ? '' : '健康检查失败');
  } catch (e) {
    assert(false, `mcp_health_check 失败: ${e.message}`);
  }

  console.log('\n========================================');
  console.log(`测试结果: ${passed}/${passed + failed} 通过`);
  console.log('========================================');

  if (passed === passed + failed) {
    console.log('\n🎉 v3-admin-vite 真实项目验证通过！');
  } else {
    console.log('\n⚠️ 部分测试失败');
  }

  const report = {
    date: new Date().toISOString(),
    testUrl: TEST_URL,
    projectName: 'v3-admin-vite',
    projectType: 'Vue3 + Element Plus + Pinia + Vue Router',
    passed,
    failed,
    total: passed + failed,
    successRate: ((passed / (passed + failed)) * 100).toFixed(1) + '%',
    details: testResults
  };

  const reportDir = path.join(__dirname, '../test-reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `v3-admin-vite-validation-${Date.now()}.json`);
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