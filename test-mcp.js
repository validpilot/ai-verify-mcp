#!/usr/bin/env node
/**
 * MCP服务器调试测试
 */
const { spawn } = require('child_process');
const readline = require('readline');

const serverPath = require('path').join(__dirname, 'server.js');
console.log('测试服务器:', serverPath);

const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

server.stdout.on('data', (data) => {
  console.log('[MCP stdout]', data.toString().slice(0, 200));
});

server.stderr.on('data', (data) => {
  console.error('[MCP stderr]', data.toString().slice(0, 500));
});

server.on('error', (err) => {
  console.error('[启动错误]', err.message);
});

server.on('close', (code) => {
  console.log('[服务器关闭]', code);
  process.exit(code || 0);
});

// 发送初始化请求
setTimeout(() => {
  const initReq = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' }
    }
  };
  console.log('[发送]', JSON.stringify(initReq));
  server.stdin.write(JSON.stringify(initReq) + '\n');
}, 1000);

// 发送list_tools请求
setTimeout(() => {
  const listReq = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  };
  console.log('[发送]', JSON.stringify(listReq));
  server.stdin.write(JSON.stringify(listReq) + '\n');
}, 2000);

setTimeout(() => {
  server.kill();
  process.exit(0);
}, 5000);
