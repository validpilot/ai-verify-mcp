#!/usr/bin/env node
/**
 * ValidPilot OSS MCP - HTTP模式外部启动脚本
 *
 * 使用方法：
 *   node start-http.js
 *   MCP_HTTP_PORT=3556 node start-http.js
 *
 * 健康检查：
 *   curl http://localhost:3456/health
 *
 * 测试：
 *   node test-http2.js
 */

const { spawn } = require('child_process');
const path = require('path');

const PORT = process.env.MCP_HTTP_PORT || 3456;

console.log('=== ValidPilot OSS MCP HTTP Server ===');
console.log('端口:', PORT);
console.log('启动中...\n');

const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    MCP_MODE: 'http',
    MCP_HTTP_PORT: String(PORT)
  }
});

server.on('error', (err) => {
  console.error('启动失败:', err.message);
  process.exit(1);
});

server.on('close', (code) => {
  console.log(`\n服务器退出，代码: ${code}`);
  process.exit(code || 0);
});

process.on('SIGINT', () => server.kill('SIGINT'));
process.on('SIGTERM', () => server.kill('SIGTERM'));
