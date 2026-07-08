'use strict';

const http = require('http');

async function callTool(port, name, args) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      jsonrpc: '2.0',
      id: String(Date.now()),
      method: 'tools/call',
      params: { name, arguments: args }
    });
    const req = http.request({ hostname: 'localhost', port, path: '/mcp', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        const result = JSON.parse(body);
        resolve(result);
      });
    });
    req.write(data);
    req.end();
  });
}

async function run() {
  const port = 3456;
  
  console.log('=== 测试页面状态管理 ===');
  
  console.log('1. browser_open');
  const openResult = await callTool(port, 'browser_open', { url: 'http://localhost:3333' });
  console.log('browser_open:', openResult.result.content[0].text);
  
  console.log('\n2. browser_navigate');
  await callTool(port, 'browser_navigate', { action: 'goto', url: 'http://localhost:3333', waitUntil: 'networkidle' });
  
  console.log('\n3. 等待 10 秒');
  await new Promise(r => setTimeout(r, 10000));
  
  console.log('\n4. browser_snapshot');
  const snapshot = await callTool(port, 'browser_snapshot', {});
  const snapshotData = JSON.parse(snapshot.result.content[0].text);
  console.log('Snapshot URL:', snapshotData.url);
  console.log('Snapshot Title:', snapshotData.title);
  console.log('Snapshot stateHash:', snapshotData.stateHash);
  
  console.log('\n5. browser_eval');
  const url = await callTool(port, 'browser_eval', { script: 'window.location.href' });
  console.log('URL:', JSON.parse(url.result.content[0].text).result);
  
  console.log('\n6. mcp_self_test');
  const selfTest = await callTool(port, 'mcp_self_test', {});
  console.log('Self test:', selfTest.result.content[0].text.slice(0, 500));
  
  console.log('\n7. 再次 browser_eval');
  const url2 = await callTool(port, 'browser_eval', { script: 'window.location.href' });
  console.log('URL:', JSON.parse(url2.result.content[0].text).result);
}

run().catch(e => console.error(e));