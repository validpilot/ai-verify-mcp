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
  
  console.log('=== 测试 browser_open 导航 ===');
  
  console.log('1. 调用 browser_open (带 headless: false)');
  const openResult = await callTool(port, 'browser_open', { url: 'http://localhost:3333', headless: false });
  console.log('browser_open result:', openResult.result.content[0].text);
  
  console.log('\n2. 等待 15 秒...');
  await new Promise(r => setTimeout(r, 15000));
  
  console.log('\n3. 调用 browser_snapshot');
  const snapshot = await callTool(port, 'browser_snapshot', {});
  console.log('Snapshot URL:', JSON.parse(snapshot.result.content[0].text).url);
  console.log('Snapshot Title:', JSON.parse(snapshot.result.content[0].text).title);
  
  console.log('\n4. 调用 browser_eval');
  const url = await callTool(port, 'browser_eval', { script: 'window.location.href' });
  console.log('URL:', JSON.parse(url.result.content[0].text).result);
  
  const bodyLength = await callTool(port, 'browser_eval', { script: 'document.body.innerHTML.length' });
  console.log('Body length:', JSON.parse(bodyLength.result.content[0].text).result);
}

run().catch(e => console.error(e));