const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>验证码测试页面</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; background: #f5f5f5; }
    .captcha-container { margin: 20px 0; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .captcha-image { border: 1px solid #ddd; padding: 5px; background: #eee; }
    .captcha-label { font-size: 14px; color: #666; margin-top: 8px; }
    .code { font-family: monospace; font-size: 16px; color: #333; }
  </style>
</head>
<body>
  <h1>验证码测试页面</h1>
  
  <div class="captcha-container">
    <h3>1. 数字验证码 (1234)</h3>
    <img id="captcha1" src="https://dummyimage.com/150x50/ffffff/000000&text=1234" class="captcha-image">
    <div class="captcha-label">预期结果: <span class="code">1234</span></div>
  </div>

  <div class="captcha-container">
    <h3>2. 字母数字混合验证码 (Ab58)</h3>
    <img id="captcha2" src="https://dummyimage.com/150x50/ffffff/000000&text=Ab58" class="captcha-image">
    <div class="captcha-label">预期结果: <span class="code">Ab58</span></div>
  </div>

  <div class="captcha-container">
    <h3>3. 大写字母验证码 (ABCD)</h3>
    <img id="captcha3" src="https://dummyimage.com/150x50/ffffff/000000&text=ABCD" class="captcha-image">
    <div class="captcha-label">预期结果: <span class="code">ABCD</span></div>
  </div>

  <div class="captcha-container">
    <h3>4. 小写字母验证码 (abcd)</h3>
    <img id="captcha4" src="https://dummyimage.com/150x50/ffffff/000000&text=abcd" class="captcha-image">
    <div class="captcha-label">预期结果: <span class="code">abcd</span></div>
  </div>

  <div class="captcha-container">
    <h3>5. Canvas 验证码</h3>
    <canvas id="canvas-captcha" width="150" height="50" class="captcha-image"></canvas>
    <div class="captcha-label">Canvas 生成的验证码</div>
  </div>

  <script>
    function generateCanvasCaptcha() {
      const canvas = document.getElementById('canvas-captcha');
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#eee';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let code = '';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      ctx.font = '30px Arial';
      ctx.fillStyle = '#333';
      for (let i = 0; i < code.length; i++) {
        ctx.save();
        ctx.translate(20 + i * 35, 35);
        ctx.rotate((Math.random() - 0.5) * 0.3);
        ctx.fillText(code[i], 0, 0);
        ctx.restore();
      }
      
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.strokeStyle = '#999';
        ctx.stroke();
      }
      
      return code;
    }
    
    generateCanvasCaptcha();
  </script>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`验证码测试服务器运行在 http://localhost:${PORT}`);
});