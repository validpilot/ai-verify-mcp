#!/usr/bin/env node
/**
 * ValidPilot OSS MCP 独立启动脚本
 * 用于手动测试和调试MCP服务器
 * 
 * 使用方法：
 * node standalone-start.js
 */
const path = require('path');
const { spawn } = require('child_process');

const serverPath = path.join(__dirname, 'server.js');

console.log('=== ValidPilot OSS MCP 独立启动 ===');
console.log('服务器路径:', serverPath);
console.log('工具数量: 60');
console.log('');

// 启动MCP服务器（stdio模式）
const server = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, NODE_ENV: 'development' }
});

server.stdout.on('data', (data) => {
  console.log('[stdout]', data.toString());
});

server.stderr.on('data', (data) => {
  console.log('[stderr]', data.toString());
});

server.on('error', (err) => {
  console.error('启动失败:', err.message);
  process.exit(1);
});

server.on('close', (code) => {
  console.log('服务器关闭，退出码:', code);
});

// 保持进程运行
process.stdin.resume();
console.log('服务器已启动，按 Ctrl+C 关闭');