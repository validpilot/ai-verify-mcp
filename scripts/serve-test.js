'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3333;
const FIXTURES_DIR = path.join(__dirname, '..', 'test', 'fixtures');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);

  if (urlPath === '/') {
    urlPath = '/form-test.html';
  }

  const filePath = path.join(FIXTURES_DIR, urlPath);

  if (!filePath.startsWith(FIXTURES_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Internal Server Error: ' + err.message);
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`表单测试服务器已启动:`);
  console.log(`  主页: http://localhost:${PORT}/`);
  console.log(`  表单测试页: http://localhost:${PORT}/form-test.html`);
  console.log(`  E2E测试页: http://localhost:${PORT}/e2e-test.html`);
  console.log(`按 Ctrl+C 停止服务器`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用，请先关闭占用程序或修改端口号`);
    process.exit(1);
  }
  console.error('服务器错误:', err.message);
});

process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  server.close(() => {
    console.log('服务器已关闭');
    process.exit(0);
  });
});

module.exports = server;
