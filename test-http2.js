// HTTP模式测试脚本
const http = require('http');

const OPTIONS = {
  hostname: 'localhost',
  port: 3456,
  path: '/mcp',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
};

function request(data) {
  return new Promise((resolve, reject) => {
    const req = http.request(OPTIONS, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

async function test() {
  console.log('=== 健康检查 ===');
  const health = await new Promise((resolve, reject) => {
    http.get('http://localhost:3456/health', (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
  console.log(health);
  
  console.log('\n=== 初始化请求 ===');
  const initResp = await request({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' }
    }
  });
  console.log(initResp);
  
  console.log('\n=== 工具列表请求 ===');
  const toolsResp = await request({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  });
  console.log('工具数量:', toolsResp.result?.tools?.length);
  
  process.exit(0);
}

test().catch(console.error);