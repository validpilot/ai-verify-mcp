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
  const port = 59884;
  
  await callTool(port, 'browser_open', { url: 'http://localhost:3333' });
  await new Promise(r => setTimeout(r, 5000));
  
  const evalResult = await callTool(port, 'browser_eval', { script: 'document.querySelectorAll("input").length' });
  console.log('input count:', JSON.stringify(evalResult).slice(0, 500));
  
  const formResult = await callTool(port, 'browser_eval', { script: 'document.querySelectorAll("form").length' });
  console.log('form count:', JSON.stringify(formResult).slice(0, 500));
  
  const elFormResult = await callTool(port, 'browser_eval', { script: 'document.querySelectorAll("[class*=el-form]").length' });
  console.log('el-form count:', JSON.stringify(elFormResult).slice(0, 500));
  
  const htmlResult = await callTool(port, 'browser_eval', { script: 'document.body.innerHTML.slice(0, 3000)' });
  console.log('body HTML:', JSON.stringify(htmlResult).slice(0, 3000));
}

run().catch(e => console.error(e));