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
  
  await callTool(port, 'browser_open', { url: 'http://localhost:3333' });
  await new Promise(r => setTimeout(r, 15000));
  
  console.log('=== 页面状态检查 ===');
  
  const url = await callTool(port, 'browser_eval', { script: 'window.location.href' });
  console.log('URL:', JSON.parse(url.result.content[0].text).result);
  
  const title = await callTool(port, 'browser_eval', { script: 'document.title' });
  console.log('Title:', JSON.parse(title.result.content[0].text).result);
  
  const bodyLength = await callTool(port, 'browser_eval', { script: 'document.body.innerHTML.length' });
  console.log('Body HTML length:', JSON.parse(bodyLength.result.content[0].text).result);
  
  const snapshot = await callTool(port, 'browser_snapshot', {});
  console.log('Snapshot:', snapshot.result.content[0].text.slice(0, 2000));
}

run().catch(e => console.error(e));