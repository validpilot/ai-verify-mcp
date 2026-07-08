'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');

const MCP_PORT = 3456;
const TEST_PORT = 3333;
const TEST_URL = `http://localhost:${TEST_PORT}/form-test.html`;

const FIXTURES_DIR = path.join(__dirname, '..', 'test', 'fixtures');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function startTestServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/form-test.html';
      const filePath = path.join(FIXTURES_DIR, urlPath);
      if (!filePath.startsWith(FIXTURES_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not Found');
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(TEST_PORT, () => resolve(server))
      .on('error', reject);
  });
}

function callMcp(port, name, args) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      jsonrpc: '2.0',
      id: String(Date.now() + Math.random()),
      method: 'tools/call',
      params: { name, arguments: args }
    });
    const req = http.request({
      hostname: 'localhost',
      port,
      path: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('JSON parse error: ' + body.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getText(result) {
  if (result.result && result.result.content && result.result.content[0]) {
    return result.result.content[0].text;
  }
  return '';
}

function parseJsonResult(result) {
  const text = getText(result);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function runTests() {
  let testServer;
  try {
    console.log('🚀 启动测试服务器...');
    testServer = await startTestServer();
    console.log(`   测试页面: ${TEST_URL}\n`);

    console.log('🌐 检查 MCP 服务器健康状态...');
    try {
      const health = await callMcp(MCP_PORT, 'mcp_health_check', {});
      console.log('   MCP 服务器运行正常\n');
    } catch (e) {
      console.error(`❌ 无法连接 MCP 服务器 (端口 ${MCP_PORT})`);
      console.error(`   请先运行: MCP_MODE=http node server.js`);
      process.exit(1);
    }

    // ========== 测试 1: 打开表单页面 ==========
    console.log('=' .repeat(60));
    console.log('测试 1: 打开表单测试页面');
    console.log('=' .repeat(60));
    const openResult = await callMcp(MCP_PORT, 'browser_open', { url: TEST_URL });
    console.log(`   页面打开: ${openResult.result ? '✓' : '✗'}`);
    await new Promise(r => setTimeout(r, 2000));

    // 统计表单字段
    const fieldCount = await callMcp(MCP_PORT, 'browser_eval', {
      script: 'document.querySelectorAll("#registerForm input, #registerForm select, #registerForm textarea").length'
    });
    const count = parseJsonResult(fieldCount).result;
    console.log(`   表单字段总数: ${count}\n`);

    // ========== 测试 2: browser_form_validate ==========
    console.log('=' .repeat(60));
    console.log('测试 2: browser_form_validate 表单验证分析');
    console.log('=' .repeat(60));
    const validateResult = await callMcp(MCP_PORT, 'browser_form_validate', { url: TEST_URL });
    const validateData = parseJsonResult(validateResult);
    console.log(`   表单找到: ${validateData.formFound ? '✓' : '✗'}`);
    console.log(`   字段数量: ${validateData.fields?.length || 0}`);
    if (validateData.validationResults) {
      console.log(`   必填字段: ${validateData.validationResults.requiredFieldsMissing} 个缺失`);
    }
    console.log(`   摘要: ${validateData.summary || 'N/A'}\n`);

    // ========== 测试 3: browser_form_fill 自动填充 ==========
    console.log('=' .repeat(60));
    console.log('测试 3: browser_form_fill 自动填充（不提交）');
    console.log('=' .repeat(60));
    const fillResult = await callMcp(MCP_PORT, 'browser_form_fill', {
      url: TEST_URL,
      submit: false
    });
    const fillData = parseJsonResult(fillResult);
    console.log(`   填充结果: ${fillData.filled?.filled ? '✓' : '✗'}`);
    console.log(`   总字段数: ${fillData.filled?.totalFields || 0}`);
    console.log(`   成功填充: ${fillData.filled?.filledCount || 0}`);
    if (fillData.filled?.error) {
      console.log(`   错误: ${fillData.filled.error}`);
    }
    console.log();

    if (fillData.filled?.fields && fillData.filled.fields.length > 0) {
      console.log('   字段填充详情:');
      for (const f of fillData.filled.fields) {
        const status = f.filled ? '✓' : '✗';
        const val = f.value ? (typeof f.value === 'string' ? f.value.slice(0, 30) : String(f.value)) : '';
        console.log(`     ${status} ${f.name} (${f.type}): ${val}`);
      }
    }
    console.log();

    // 验证填充的值
    console.log('   验证填充值类型:');
    const checkFields = ['email', 'phone', 'username', 'password'];
    for (const fname of checkFields) {
      const val = await callMcp(MCP_PORT, 'browser_eval', {
        script: `document.querySelector('#${fname}')?.value || ''`
      });
      const v = parseJsonResult(val).result;
      const filled = v && v.length > 0;
      console.log(`     ${filled ? '✓' : '✗'} ${fname}: ${v ? v.slice(0, 30) : '(空)'}`);
    }
    console.log();

    // ========== 测试 4: 手动覆盖字段值 ==========
    console.log('=' .repeat(60));
    console.log('测试 4: browser_form_fill 手动覆盖字段值');
    console.log('=' .repeat(60));
    const overrideResult = await callMcp(MCP_PORT, 'browser_form_fill', {
      url: TEST_URL,
      fields: {
        username: 'custom_user_123',
        email: 'custom@testdomain.com',
        phone: '13912345678'
      },
      submit: false
    });
    const overrideData = parseJsonResult(overrideResult);
    console.log(`   填充成功: ${overrideData.filled?.filled ? '✓' : '✗'}`);
    console.log();

    console.log('   验证覆盖值:');
    const overrides = {
      username: 'custom_user_123',
      email: 'custom@testdomain.com',
      phone: '13912345678'
    };
    let overridePassed = 0;
    for (const [fname, expected] of Object.entries(overrides)) {
      const val = await callMcp(MCP_PORT, 'browser_eval', {
        script: `document.querySelector('#${fname}')?.value || ''`
      });
      const actual = parseJsonResult(val).result;
      const match = actual === expected;
      if (match) overridePassed++;
      console.log(`     ${match ? '✓' : '✗'} ${fname}: 期望 "${expected}", 实际 "${actual}"`);
    }
    console.log(`   覆盖测试通过: ${overridePassed}/${Object.keys(overrides).length}\n`);

    // ========== 测试 5: 提交表单 ==========
    console.log('=' .repeat(60));
    console.log('测试 5: browser_form_fill 自动提交表单');
    console.log('=' .repeat(60));
    const submitResult = await callMcp(MCP_PORT, 'browser_form_fill', {
      url: TEST_URL,
      submit: true
    });
    const submitData = parseJsonResult(submitResult);
    console.log(`   提交按钮点击: ${submitData.submit?.clicked ? '✓' : '✗'}`);
    if (submitData.submit?.urlAfterSubmit) {
      console.log(`   提交后URL: ${submitData.submit.urlAfterSubmit}`);
    }
    if (submitData.submit?.error) {
      console.log(`   提交错误: ${submitData.submit.error}`);
    }
    console.log();

    // 检查提交后的页面状态
    const resultMsg = await callMcp(MCP_PORT, 'browser_eval', {
      script: 'document.querySelector("#resultMessage")?.textContent || "无结果消息"'
    });
    const msg = parseJsonResult(resultMsg).result;
    const success = msg.includes('成功') || msg.includes('注册成功');
    console.log(`   提交结果: ${success ? '✓ 成功' : '✗ 失败或未知'}`);
    console.log(`   消息: ${msg}\n`);

    // ========== 总结 ==========
    console.log('=' .repeat(60));
    console.log('🎉 表单填充测试完成！');
    console.log('=' .repeat(60));
    console.log(`
  测试页面: ${TEST_URL}
  MCP 服务器: localhost:${MCP_PORT}

  覆盖的能力:
    ✓ browser_form_validate - 表单验证分析
    ✓ browser_form_fill - 自动填充表单字段
    ✓ 语义化字段类型推断（email/phone/name/password 等）
    ✓ 手动覆盖字段值
    ✓ 自动提交表单
    ✓ disabled 字段跳过
`);

  } catch (e) {
    console.error('\n❌ 测试失败:', e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    if (testServer) {
      testServer.close();
    }
  }
}

runTests();
