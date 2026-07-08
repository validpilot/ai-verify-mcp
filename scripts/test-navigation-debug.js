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
  
  console.log('=== 测试导航调试 ===');
  
  console.log('1. browser_open with full URL');
  const openResult = await callTool(port, 'browser_open', { url: 'http://localhost:3333/#/login?redirect=/dashboard' });
  console.log('browser_open:', openResult.result.content[0].text);
  
  console.log('\n2. 等待 10 秒...');
  await new Promise(r => setTimeout(r, 10000));
  
  console.log('\n3. browser_eval: window.location.href');
  const url = await callTool(port, 'browser_eval', { script: 'window.location.href' });
  console.log('URL:', JSON.parse(url.result.content[0].text).result);
  
  console.log('\n4. browser_eval: document.title');
  const title = await callTool(port, 'browser_eval', { script: 'document.title' });
  console.log('Title:', JSON.parse(title.result.content[0].text).result);
  
  console.log('\n5. browser_eval: document.body.innerHTML.length');
  const body = await callTool(port, 'browser_eval', { script: 'document.body.innerHTML.length' });
  console.log('Body length:', JSON.parse(body.result.content[0].text).result);
  
  console.log('\n6. browser_eval: document.querySelectorAll("img").length');
  const imgCount = await callTool(port, 'browser_eval', { script: 'document.querySelectorAll("img").length' });
  console.log('Image count:', JSON.parse(imgCount.result.content[0].text).result);
  
  console.log('\n7. browser_navigate to force refresh');
  const navResult = await callTool(port, 'browser_navigate', { action: 'goto', url: 'http://localhost:3333/#/login?redirect=/dashboard' });
  console.log('browser_navigate:', navResult.result.content[0].text);
  
  console.log('\n8. 等待 10 秒...');
  await new Promise(r => setTimeout(r, 10000));
  
  console.log('\n9. browser_eval: window.location.href');
  const url2 = await callTool(port, 'browser_eval', { script: 'window.location.href' });
  console.log('URL:', JSON.parse(url2.result.content[0].text).result);
  
  console.log('\n10. browser_eval: document.querySelectorAll("img").length');
  const imgCount2 = await callTool(port, 'browser_eval', { script: 'document.querySelectorAll("img").length' });
  console.log('Image count:', JSON.parse(imgCount2.result.content[0].text).result);
}

run().catch(e => console.error(e));