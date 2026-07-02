'use strict';
/**
 * 一键启动：MCP 服务 + 测试项目 Server，然后运行测试
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEST_PROJECT = path.join(ROOT, 'test-project');
const MCP_SCRIPT = path.join(ROOT, 'start-http.js');
const TEST_SCRIPT = path.join(ROOT, 'scripts', 'real-project-test.js');

let mcpServer, testServer;

// 启动 MCP 服务
function startMCPServer() {
  return new Promise((resolve, reject) => {
    mcpServer = spawn('node', [MCP_SCRIPT], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, MCP_HTTP_PORT: '3456' }
    });
    
    mcpServer.stdout.on('data', d => process.stdout.write(`[MCP] ${d}`));
    mcpServer.stderr.on('data', d => process.stderr.write(`[MCP-ERR] ${d}`));
    
    // 等待服务启动
    const check = () => {
      const req = http.get('http://localhost:3456/health', res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve());
      });
      req.on('error', () => setTimeout(check, 500));
      req.setTimeout(2000, () => { req.destroy(); setTimeout(check, 500); });
    };
    setTimeout(check, 2000);
  });
}

// 启动测试项目服务器
function startTestServer() {
  return new Promise((resolve, reject) => {
    testServer = spawn('npx', ['-y', 'http-server', TEST_PROJECT, '-p', '5173', '--cors', '-s'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    
    testServer.stdout.on('data', d => process.stdout.write(`[HTTP] ${d}`));
    testServer.stderr.on('data', d => process.stderr.write(`[HTTP-ERR] ${d}`));
    
    const check = () => {
      const req = http.get('http://localhost:5173', res => {
        resolve();
      });
      req.on('error', () => setTimeout(check, 500));
      req.setTimeout(2000, () => { req.destroy(); setTimeout(check, 500); });
    };
    setTimeout(check, 3000);
  });
}

// 运行测试
function runTest() {
  return new Promise((resolve, reject) => {
    const tester = spawn('node', [TEST_SCRIPT], {
      cwd: ROOT,
      stdio: ['inherit', 'inherit', 'inherit'],
      env: { ...process.env }
    });
    tester.on('exit', (code) => {
      resolve(code);
    });
  });
}

async function main() {
  console.log('=== 启动 MCP 服务 ===');
  await startMCPServer();
  console.log('✅ MCP 服务已启动 (port 3456)');
  
  console.log('=== 启动测试项目 ===');
  try {
    await startTestServer();
    console.log('✅ 测试项目已启动 (port 5173)');
  } catch (e) {
    console.log('⚠️ 测试项目启动失败，部分测试可能失败:', e.message);
  }
  
  console.log('\n=== 运行测试 ===\n');
  const code = await runTest();
  
  console.log(`\n=== 测试完成，退出码: ${code} ===`);
  
  // 清理
  if (mcpServer) mcpServer.kill();
  if (testServer) testServer.kill();
  
  process.exit(code || 0);
}

main().catch(e => {
  console.error('启动失败:', e);
  if (mcpServer) mcpServer.kill();
  if (testServer) testServer.kill();
  process.exit(1);
});
