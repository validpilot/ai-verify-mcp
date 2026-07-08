'use strict';

const http = require('http');

const MCP_PORT = 3456;
const TEST_URL = 'http://localhost:3333/form-test.html';

async function callTool(port, name, args) {
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

async function run() {
  try {
    console.log('='.repeat(60));
    console.log('表单检测与填充测试');
    console.log('='.repeat(60));
    console.log(`测试页面: ${TEST_URL}`);
    console.log(`MCP 端口: ${MCP_PORT}\n`);

    console.log('▶ 打开测试页面...');
    await callTool(MCP_PORT, 'browser_open', { url: TEST_URL });
    await new Promise(r => setTimeout(r, 2000));
    console.log('  ✓ 页面已打开\n');

    console.log('=== 表单元素检测 ===\n');

    const formCount = await callTool(MCP_PORT, 'browser_eval', {
      script: 'document.querySelectorAll("form").length'
    });
    console.log(`  form 标签数量: ${parseJsonResult(formCount).result}`);

    const inputCount = await callTool(MCP_PORT, 'browser_eval', {
      script: 'document.querySelectorAll("input").length'
    });
    console.log(`  input 元素数量: ${parseJsonResult(inputCount).result}`);

    const selectCount = await callTool(MCP_PORT, 'browser_eval', {
      script: 'document.querySelectorAll("select").length'
    });
    console.log(`  select 元素数量: ${parseJsonResult(selectCount).result}`);

    const textareaCount = await callTool(MCP_PORT, 'browser_eval', {
      script: 'document.querySelectorAll("textarea").length'
    });
    console.log(`  textarea 元素数量: ${parseJsonResult(textareaCount).result}`);

    const disabledCount = await callTool(MCP_PORT, 'browser_eval', {
      script: 'document.querySelectorAll("input:disabled, select:disabled, textarea:disabled").length'
    });
    console.log(`  disabled 字段数量: ${parseJsonResult(disabledCount).result}`);

    const requiredCount = await callTool(MCP_PORT, 'browser_eval', {
      script: 'document.querySelectorAll("input[required], select[required], textarea[required]").length'
    });
    console.log(`  required 字段数量: ${parseJsonResult(requiredCount).result}\n`);

    console.log('=== browser_form_validate 表单验证分析 ===\n');

    const formValidate = await callTool(MCP_PORT, 'browser_form_validate', { url: TEST_URL });
    const validateData = parseJsonResult(formValidate);
    console.log(`  表单找到: ${validateData.formFound ? '✓' : '✗'}`);
    console.log(`  字段数量: ${validateData.fields?.length || 0}`);
    if (validateData.validationResults) {
      console.log(`  必填缺失: ${validateData.validationResults.requiredFieldsMissing}`);
      console.log(`  格式违规: ${validateData.validationResults.patternViolations}`);
    }
    console.log(`  摘要: ${validateData.summary || 'N/A'}\n`);

    console.log('=== browser_form_fill 自动填充测试 ===\n');

    const fillResult = await callTool(MCP_PORT, 'browser_form_fill', {
      url: TEST_URL,
      submit: false
    });
    const fillData = parseJsonResult(fillResult);
    console.log(`  填充成功: ${fillData.filled?.filled ? '✓' : '✗'}`);
    console.log(`  总字段数: ${fillData.filled?.totalFields || 0}`);
    console.log(`  成功填充: ${fillData.filled?.filledCount || 0}`);
    console.log(`  使用 fallback: ${fillData.filled?.usedFallback ? '是' : '否'}`);
    if (fillData.filled?.error) {
      console.log(`  错误: ${fillData.filled.error}`);
    }
    console.log();

    if (fillData.filled?.fields && fillData.filled.fields.length > 0) {
      console.log('  字段填充详情:');
      for (const f of fillData.filled.fields) {
        const status = f.filled ? '✓' : '✗';
        const val = f.value ? (typeof f.value === 'string' ? f.value.slice(0, 35) : String(f.value)) : '';
        const typeInfo = f.fieldType || f.type || '';
        console.log(`    ${status} ${f.name.padEnd(16)} [${typeInfo.padEnd(8)}]: ${val}`);
      }
    }
    console.log();

    console.log('=== 手动覆盖字段值测试 ===\n');

    const overrideResult = await callTool(MCP_PORT, 'browser_form_fill', {
      url: TEST_URL,
      fields: {
        username: 'testuser_2024',
        email: 'override@example.com',
        phone: '13999999999',
        realname: '张三'
      },
      submit: false
    });
    const overrideData = parseJsonResult(overrideResult);
    console.log(`  填充成功: ${overrideData.filled?.filled ? '✓' : '✗'}\n`);

    console.log('  验证覆盖值:');
    const overrides = {
      username: 'testuser_2024',
      email: 'override@example.com',
      phone: '13999999999'
    };
    let overridePassed = 0;
    for (const [fname, expected] of Object.entries(overrides)) {
      const val = await callTool(MCP_PORT, 'browser_eval', {
        script: `document.querySelector('#${fname}')?.value || ''`
      });
      const actual = parseJsonResult(val).result;
      const match = actual === expected;
      if (match) overridePassed++;
      console.log(`    ${match ? '✓' : '✗'} ${fname.padEnd(10)}: ${actual || '(空)'}`);
    }
    console.log(`  覆盖测试通过: ${overridePassed}/${Object.keys(overrides).length}\n`);

    console.log('=== 自动提交测试 ===\n');

    const submitResult = await callTool(MCP_PORT, 'browser_form_fill', {
      url: TEST_URL,
      submit: true
    });
    const submitData = parseJsonResult(submitResult);
    console.log(`  提交按钮点击: ${submitData.submit?.clicked ? '✓' : '✗'}`);
    if (submitData.submit) {
      console.log(`  提交状态: ${submitData.submit.status || 'unknown'}`);
      console.log(`  URL 变化: ${submitData.submit.urlChanged ? '是' : '否'}`);
      if (submitData.submit.successMessage) {
        console.log(`  成功消息: ${submitData.submit.successMessage.slice(0, 50)}`);
      }
      if (submitData.submit.errorMessage) {
        console.log(`  错误消息: ${submitData.submit.errorMessage.slice(0, 50)}`);
      }
      if (submitData.submit.validationErrors) {
        console.log(`  验证错误: ${submitData.submit.validationErrors.length} 个`);
      }
    }
    if (submitData.submit?.error) {
      console.log(`  提交错误: ${submitData.submit.error}`);
    }
    console.log();

    console.log('=== 页面最终状态 ===\n');

    const resultMsg = await callTool(MCP_PORT, 'browser_eval', {
      script: 'document.querySelector("#resultMessage")?.textContent || "无结果消息"'
    });
    console.log(`  结果消息: ${parseJsonResult(resultMsg).result}`);

    const finalUrl = await callTool(MCP_PORT, 'browser_eval', {
      script: 'location.href'
    });
    console.log(`  最终 URL: ${parseJsonResult(finalUrl).result}\n`);

    console.log('='.repeat(60));
    console.log('✓ 测试完成');
    console.log('='.repeat(60));

  } catch (e) {
    console.error('\n✗ 测试失败:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

run();
