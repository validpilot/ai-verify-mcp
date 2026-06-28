// Generate demo.gif — terminal animation for ai-verify-mcp
// Uses Playwright to render frames, gif-encoder-2 to encode GIF
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const GIFEncoder = require('gif-encoder-2');

async function generateGIF() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 400 } });

  // Define frames: each frame is an array of terminal lines
  const frames = [
    [
      { text: 'ai-verify-mcp health', cls: 'prompt' },
      { text: '', cls: '' },
      { text: '  Checking environment...', cls: 'dim' },
      { text: '', cls: '' },
      { text: '', cls: '' },
      { text: '', cls: '' },
      { text: '', cls: '' },
      { text: '', cls: '' },
      { text: '', cls: '' },
      { text: '', cls: '' },
    ],
    [
      { text: '$ ai-verify-mcp health', cls: 'prompt' },
      { text: '', cls: '' },
      { text: '  Checking environment...', cls: 'dim' },
      { text: '', cls: '' },
      { text: '\u2713 Node.js: v20.10.0                OK', cls: 'success' },
      { text: '', cls: '' },
      { text: '', cls: '' },
      { text: '', cls: '' },
      { text: '', cls: '' },
      { text: '', cls: '' },
    ],
    [
      { text: '$ ai-verify-mcp health', cls: 'prompt' },
      { text: '', cls: '' },
      { text: '  Checking environment...', cls: 'dim' },
      { text: '', cls: '' },
      { text: '\u2713 Node.js: v20.10.0                OK', cls: 'success' },
      { text: '\u2713 Playwright: 1.61.1              OK', cls: 'success' },
      { text: '', cls: '' },
      { text: '', cls: '' },
      { text: '', cls: '' },
      { text: '', cls: '' },
    ],
    [
      { text: '$ ai-verify-mcp health', cls: 'prompt' },
      { text: '', cls: '' },
      { text: '  Checking environment...', cls: 'dim' },
      { text: '', cls: '' },
      { text: '\u2713 Node.js: v20.10.0                OK', cls: 'success' },
      { text: '\u2713 Playwright: 1.61.1              OK', cls: 'success' },
      { text: '\u2713 Tools loaded: 76                 OK', cls: 'success' },
      { text: '', cls: '' },
      { text: '', cls: '' },
      { text: '', cls: '' },
    ],
    [
      { text: '$ ai-verify-mcp health', cls: 'prompt' },
      { text: '', cls: '' },
      { text: '  Checking environment...', cls: 'dim' },
      { text: '', cls: '' },
      { text: '\u2713 Node.js: v20.10.0                OK', cls: 'success' },
      { text: '\u2713 Playwright: 1.61.1              OK', cls: 'success' },
      { text: '\u2713 Tools loaded: 76                 OK', cls: 'success' },
      { text: '\u2713 MCP server: ready                OK', cls: 'success' },
      { text: '', cls: '' },
      { text: '', cls: '' },
    ],
    [
      { text: '$ ai-verify-mcp health', cls: 'prompt' },
      { text: '', cls: '' },
      { text: '  Checking environment...', cls: 'dim' },
      { text: '', cls: '' },
      { text: '\u2713 Node.js: v20.10.0                OK', cls: 'success' },
      { text: '\u2713 Playwright: 1.61.1              OK', cls: 'success' },
      { text: '\u2713 Tools loaded: 76                 OK', cls: 'success' },
      { text: '\u2713 MCP server: ready                OK', cls: 'success' },
      { text: '', cls: '' },
      { text: '\uD83C\uDF89 All checks passed! Ready to verify.', cls: 'success-bold' },
    ],
  ];

  const delays = [120, 40, 40, 40, 50, 250]; // centiseconds

  function escapeHTML(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function frameHTML(lines) {
    const lineHTML = lines.map(l => {
      if (!l.text) return '<div class="line">&nbsp;</div>';
      return `<div class="line ${l.cls}">${escapeHTML(l.text)}</div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html><head>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0d1117; display: flex; align-items: center; justify-content: center; height: 100vh; }
.terminal { width: 780px; border-radius: 12px; overflow: hidden; border: 1px solid #30363d; box-shadow: 0 8px 32px rgba(0,0,0,0.4); font-family: 'Courier New', Consolas, monospace; }
.header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: #161b22; border-bottom: 1px solid #30363d; }
.dot { width: 12px; height: 12px; border-radius: 50%; }
.d1 { background: #ff5f57; } .d2 { background: #febc2e; } .d3 { background: #28c840; }
.title { margin-left: 8px; font-size: 13px; color: #8b949e; }
.body { padding: 16px 20px; background: #0d1117; min-height: 240px; }
.line { font-size: 15px; line-height: 2; color: #c9d1d9; white-space: pre; }
.dim { color: #6e7681; }
.prompt { color: #c9d1d9; }
.prompt::before { content: '$ '; color: #58a6ff; }
.success { color: #3fb950; }
.success-bold { color: #3fb950; font-weight: bold; }
</style></head><body>
<div class="terminal">
  <div class="header">
    <div class="dot d1"></div><div class="dot d2"></div><div class="dot d3"></div>
    <div class="title">Terminal — ai-verify-mcp</div>
  </div>
  <div class="body">${lineHTML}</div>
</div>
</body></html>`;
  }

  // Generate PNG screenshots for each frame
  const framePNGs = [];
  for (let i = 0; i < frames.length; i++) {
    const html = frameHTML(frames[i]);
    await page.setContent(html, { waitUntil: 'networkidle' });
    const buf = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 800, height: 320 } });
    framePNGs.push(PNG.sync.read(buf));
    console.log(`  Frame ${i + 1}/${frames.length} captured`);
  }

  await browser.close();

  const W = 800, H = 320;

  // Build GIF with gif-encoder-2
  // We need to provide pixel data. gif-encoder-2 supports either RGB or indexed.
  // Using direct RGB mode for simplicity (handles palette internally)
  const encoder = new GIFEncoder(W, H, 'neuquant');  // 'neuquant' handles quantization
  const outStream = fs.createWriteStream(path.join(__dirname, '..', 'docs', 'public', 'demo-v2.gif'));

  encoder.createReadStream().pipe(outStream);
  encoder.start();
  encoder.setRepeat(0); // infinite loop
  encoder.setDelay(10);  // Will override per-frame

  for (let i = 0; i < framePNGs.length; i++) {
    const png = framePNGs[i];
    encoder.setDelay(delays[i] * 10); // convert cs to ms

    // Extract RGBA pixels and convert to RGB (remove alpha)
    const rgb = new Uint8Array(W * H * 3);
    for (let j = 0; j < W * H; j++) {
      rgb[j * 3] = png.data[j * 4];
      rgb[j * 3 + 1] = png.data[j * 4 + 1];
      rgb[j * 3 + 2] = png.data[j * 4 + 2];
    }
    encoder.addFrame(rgb);
    console.log(`  Frame ${i + 1}/${frames.length} added to GIF`);
  }

  encoder.finish();

  // Wait for write to complete
  await new Promise(resolve => outStream.on('finish', resolve));

  const fsize = fs.statSync(path.join(__dirname, '..', 'docs', 'public', 'demo-v2.gif')).size;
  console.log(`\n\ndemo-v2.gif created: ${(fsize / 1024).toFixed(1)} KB, ${frames.length} frames, infinite loop`);
}

generateGIF().catch(e => {
  console.error('Failed:', e);
  process.exit(1);
});
