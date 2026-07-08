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
  
  console.log('=== 最小测试 ===');
  
  console.log('1. browser_open');
  const openResult = await callTool(port, 'browser_open', { url: 'http://localhost:3333', waitUntil: 'networkidle', timeout: 30000 });
  console.log('browser_open:', openResult.result.content[0].text);
  
  console.log('\n2. 等待 15 秒');
  await new Promise(r => setTimeout(r, 15000));
  
  console.log('\n3. browser_eval: window.location.href');
  const url = await callTool(port, 'browser_eval', { script: 'window.location.href' });
  console.log('URL:', JSON.parse(url.result.content[0].text).result);
  
  console.log('\n4. browser_eval: document.title');
  const title = await callTool(port, 'browser_eval', { script: 'document.title' });
  console.log('Title:', JSON.parse(title.result.content[0].text).result);
  
  console.log('\n5. browser_eval: document.body.innerHTML.length');
  const bodyLength = await callTool(port, 'browser_eval', { script: 'document.body.innerHTML.length' });
  console.log('Body length:', JSON.parse(bodyLength.result.content[0].text).result);
  
  console.log('\n6. browser_eval: document.querySelectorAll("img").length');
  const imgCount = await callTool(port, 'browser_eval', { script: 'document.querySelectorAll("img").length' });
  console.log('Image count:', JSON.parse(imgCount.result.content[0].text).result);
  
  console.log('\n7. browser_eval: document.querySelectorAll("input").length');
  const inputCount = await callTool(port, 'browser_eval', { script: 'document.querySelectorAll("input").length' });
  console.log('Input count:', JSON.parse(inputCount.result.content[0].text).result);
}

run().catch(e => console.error(e));