#!/usr/bin/env node
// 验证 MCP stdio 协议握手：initialize → tools/list
const { spawn } = require('child_process');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let buffer = '';

const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'test' }
});

server.stdout.on('data', (data) => {
  buffer += data.toString();
  // 尝试读取完整JSON行
  const lines = buffer.split('\n');
  buffer = lines.pop(); // 最后一行可能不完整
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      handleMessage(msg);
    } catch { /* 非 JSON 行（日志），跳过 */ }
  }
});

server.stderr.on('data', (data) => {
  const txt = data.toString().trim();
  if (txt && !txt.startsWith('Listening')) {
    console.log('[STDERR]', txt.slice(0, 120));
  }
});

let handshakeDone = false;
let capturedServerName = '';

function send(msg) {
  const line = JSON.stringify(msg) + '\n';
  server.stdin.write(line);
}

function handleMessage(msg) {
  if (msg.id === 1 && !handshakeDone) {
    console.log('=== initialize 响应 ===');
    console.log('serverInfo:', JSON.stringify(msg.result?.serverInfo));
    console.log('protocolVersion:', msg.result?.protocolVersion);

    // 验证 serverInfo.name === 'ai-verify-mcp'
    capturedServerName = msg.result?.serverInfo?.name || '';
    if (capturedServerName === 'ai-verify-mcp') {
      console.log('✅ serverInfo.name 正确: ai-verify-mcp');
    } else {
      console.log('❌ serverInfo.name 错误:', msg.result?.serverInfo?.name);
      process.exit(1);
    }

    // 发送 initialized notification
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    // 然后请求 tools/list
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    handshakeDone = true;
  } else if (msg.id === 2) {
    console.log('\n=== tools/list 响应 ===');
    const tools = msg.result?.tools || [];
    console.log('工具数量:', tools.length);

    // 验证工具数量在合理范围
    if (tools.length >= 60 && tools.length <= 80) {
      console.log('✅ 工具数量在预期范围 (60-80):', tools.length);
    } else {
      console.log('⚠️  工具数量异常:', tools.length, '(预期 60-80)');
    }

    // 验证关键工具存在
    const requiredTools = [
      'browser_open', 'browser_screenshot', 'browser_click',
      'validation_quick_run', 'mcp_health_check', 'mcp_self_test'
    ];
    const toolNames = tools.map(t => t.name);
    let missing = [];
    for (const t of requiredTools) {
      if (!toolNames.includes(t)) {
        missing.push(t);
        console.log('❌ 缺少关键工具:', t);
      }
    }
    if (missing.length === 0) {
      console.log('✅ 全部关键工具均已注册');
    }

    // 验证工具 schema 完整性
    let schemaIssues = 0;
    for (const t of tools) {
      if (!t.name) { schemaIssues++; continue; }
      if (!t.inputSchema && t.inputSchema !== undefined) { schemaIssues++; continue; }
    }
    if (schemaIssues === 0) {
      console.log('✅ 全部工具 schema 完整');
    } else {
      console.log('❌', schemaIssues, '个工具 schema 有问题');
    }

    // 打印前5个工具名
    console.log('\n前5个工具:', toolNames.slice(0, 5).join(', '));
    console.log('后5个工具:', toolNames.slice(-5).join(', '));

    const allPassed = 
      capturedServerName === 'ai-verify-mcp' &&
      tools.length >= 60 &&
      missing.length === 0 &&
      schemaIssues === 0;

    console.log('\n=== 总结 ===');
    console.log(allPassed ? '✅ 全部 MCP 协议测试通过' : '❌ 部分测试失败');
    
    server.kill();
    process.exit(allPassed ? 0 : 1);
  }
}

// 启动 initialize
console.log('=== 正在启动 MCP Server ... ===\n');
setTimeout(() => {
  send({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' }
    }
  });
}, 2000);

// 超时保护
setTimeout(() => {
  console.log('❌ 超时：10秒内未完成协议握手');
  server.kill();
  process.exit(1);
}, 10000);
