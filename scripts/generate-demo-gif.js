// Generate demo.gif - terminal animation for ai-verify-mcp
// Uses Playwright to render HTML frames, omggif to encode GIF
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function generateGIF() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 400 } });
  
  // Create terminal HTML with animated frames
  const frames = [
    [
      { text: '$ ai-verify-mcp health', cls: 'prompt-line' },
      { text: '', cls: '' },
      { text: '  Checking environment...', cls: 'dim' },
      { text: '', cls: '' },
      { text: '', cls: '' },
      { text: '', cls: '' },
      { text: '', cls: '' },
      { text: '', cls: '' },
    ],
    [
      { text: '$ ai-verify-mcp health', cls: 'prompt-line' },
      { text: '', cls: '' },
      { text: '  Checking environment...', cls: 'dim' },
      { text: '', cls: '' },
      { text: '✓ Node.js: v20.10.0                OK', cls: 'success' },
      { text: '', cls: '' },
      { text: '', cls: '' },
      { text: '', cls: '' },
    ],
    [
      { text: '$ ai-verify-mcp health', cls: 'prompt-line' },
      { text: '', cls: '' },
      { text: '  Checking environment...', cls: 'dim' },
      { text: '', cls: '' },
      { text: '✓ Node.js: v20.10.0                OK', cls: 'success' },
      { text: '✓ Playwright: 1.61.1              OK', cls: 'success' },
      { text: '', cls: '' },
      { text: '', cls: '' },
    ],
    [
      { text: '$ ai-verify-mcp health', cls: 'prompt-line' },
      { text: '', cls: '' },
      { text: '  Checking environment...', cls: 'dim' },
      { text: '', cls: '' },
      { text: '✓ Node.js: v20.10.0                OK', cls: 'success' },
      { text: '✓ Playwright: 1.61.1              OK', cls: 'success' },
      { text: '✓ Tools loaded: 76                 OK', cls: 'success' },
      { text: '', cls: '' },
    ],
    [
      { text: '$ ai-verify-mcp health', cls: 'prompt-line' },
      { text: '', cls: '' },
      { text: '  Checking environment...', cls: 'dim' },
      { text: '', cls: '' },
      { text: '✓ Node.js: v20.10.0                OK', cls: 'success' },
      { text: '✓ Playwright: 1.61.1              OK', cls: 'success' },
      { text: '✓ Tools loaded: 76                 OK', cls: 'success' },
      { text: '✓ MCP server: ready                OK', cls: 'success' },
    ],
    [
      { text: '$ ai-verify-mcp health', cls: 'prompt-line' },
      { text: '', cls: '' },
      { text: '  Checking environment...', cls: 'dim' },
      { text: '', cls: '' },
      { text: '✓ Node.js: v20.10.0                OK', cls: 'success' },
      { text: '✓ Playwright: 1.61.1              OK', cls: 'success' },
      { text: '✓ Tools loaded: 76                 OK', cls: 'success' },
      { text: '✓ MCP server: ready                OK', cls: 'success' },
      { text: '', cls: '' },
      { text: '🎉 All checks passed! Ready to verify.', cls: 'success-bold' },
    ],
  ];

  const delays = [120, 40, 40, 40, 50, 200]; // centiseconds

  // HTML template for each frame
  function frameHTML(lines) {
    const lineHTML = lines.map(l => {
      if (!l.text) return '<div class="line">&nbsp;</div>';
      return `<div class="line ${l.cls}">${escapeHTML(l.text)}</div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html><head>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0d1117; display: flex; align-items: center; justify-content: center; 
  height: 100vh; font-family: 'Courier New', 'Consolas', monospace; }
.terminal { width: 760px; border-radius: 12px; overflow: hidden; border: 1px solid #30363d;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
.header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; 
  background: #161b22; border-bottom: 1px solid #30363d; }
.dot { width: 12px; height: 12px; border-radius: 50%; }
.d1 { background: #ff5f57; } .d2 { background: #febc2e; } .d3 { background: #28c840; }
.title { margin-left: 8px; font-size: 13px; color: #8b949e; }
.body { padding: 16px 20px; background: #0d1117; min-height: 200px; }
.line { font-size: 14px; line-height: 1.8; color: #c9d1d9; }
.dim { color: #6e7681; }
.success { color: #3fb950; }
.prompt-line .prefix { color: #58a6ff; }
.success-bold { color: #3fb950; font-weight: bold; }
</style></head><body>
<div class="terminal">
  <div class="header">
    <div class="dot d1"></div><div class="dot d2"></div><div class="dot d3"></div>
    <div class="title">Terminal — ai-verify-mcp</div>
  </div>
  <div class="body">
    ${lineHTML}
  </div>
</div>
</body></html>`;
  }

  function escapeHTML(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Create temp directory for frame screenshots
  const framesDir = path.join(__dirname, '..', 'docs', 'public');
  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

  const screenshots = [];
  for (let i = 0; i < frames.length; i++) {
    const html = frameHTML(frames[i]);
    await page.setContent(html, { waitUntil: 'networkidle' });
    const ssBuf = await page.screenshot({ 
      type: 'png',
      clip: { x: 0, y: 0, width: 800, height: 320 }
    });
    screenshots.push(ssBuf);
    console.log(`  Frame ${i + 1}/${frames.length} captured`);
  }

  await browser.close();

  // Now encode frames to GIF using gifencoder via a child process
  // or use a simple raw GIF generator
  
  // Read PNGs back
  const { PNG } = require('pngjs');
  const omggif = require('omggif');

  const frameImages = screenshots.map(buf => PNG.sync.read(buf));
  const W2 = 800, H2 = 320;

  // Quantize colors to 256 max (omggif limit) using median cut
  function quantizeColors(pngs, maxColors) {
    // Collect all unique colors
    const colorSet = new Set();
    pngs.forEach(png => {
      for (let i = 0; i < W2 * H2; i++) {
        const r = png.data[i*4], g = png.data[i*4+1], b = png.data[i*4+2];
        // Reduce precision to help compression
        const rr = (r >> 2) << 2, gg = (g >> 2) << 2, bb = (b >> 2) << 2;
        colorSet.add(`${rr},${gg},${bb}`);
      }
    });
    
    let colors = Array.from(colorSet).map(s => s.split(',').map(Number));
    console.log(`  Unique colors (4-bit quantized): ${colors.length}`);
    
    if (colors.length > maxColors) {
      // Simple frequency-based: keep most common colors
      // Count frequency
      const freq = {};
      pngs.forEach(png => {
        for (let i = 0; i < W2 * H2; i++) {
          const rr = (png.data[i*4] >> 2) << 2;
          const gg = (png.data[i*4+1] >> 2) << 2;
          const bb = (png.data[i*4+2] >> 2) << 2;
          const key = `${rr},${gg},${bb}`;
          freq[key] = (freq[key] || 0) + 1;
        }
      });
      
      // Sort by frequency, keep top maxColors
      colors.sort((a, b) => (freq[b.join(',')] || 0) - (freq[a.join(',')] || 0));
      colors = colors.slice(0, maxColors);
      // Add pure black if not present
      if (!colors.find(c => c[0] === 0 && c[1] === 0 && c[2] === 0)) {
        colors.pop();
        colors.push([0, 0, 0]);
      }
    }
    
    return colors;
  }

  // Build global color palette (max 256)
  const paletteList = quantizeColors(frameImages, 256);
  while (paletteList.length < 256) paletteList.push([0, 0, 0]);
  
  // Build palette map
  const paletteMap = {};
  paletteList.forEach((c, i) => { paletteMap[c.join(',')] = i; });

  // Convert frames to indexed (with quantization)
  const indexFrames = frameImages.map(png => {
    const idx = new Uint8Array(W2 * H2);
    for (let i = 0; i < W2 * H2; i++) {
      const rr = (png.data[i*4] >> 2) << 2;
      const gg = (png.data[i*4+1] >> 2) << 2;
      const bb = (png.data[i*4+2] >> 2) << 2;
      const key = `${rr},${gg},${bb}`;
      idx[i] = paletteMap[key] || 0;
    }
    return idx;
  });

  // Allocate output buffer
  const maxSize = 10 * 1024 * 1024; // 10MB should be enough
  const outBuf = new Uint8Array(maxSize);

  // Write GIF using omggif
  const writer = new omggif.GifWriter(outBuf, W2, H2, {
    palette: paletteList,
    loop: 0 // infinite loop
  });

  for (let i = 0; i < indexFrames.length; i++) {
    writer.addFrame(0, 0, W2, H2, indexFrames[i], {
      delay: delays[i] // centiseconds
    });
  }

  const endOffset = writer.end();
  const finalBuf = outBuf.subarray(0, endOffset);

  const outPath = path.join(framesDir, 'demo.gif');
  fs.writeFileSync(outPath, Buffer.from(finalBuf));
  console.log(`\n✅ demo.gif created: ${outPath}`);
  console.log(`   Size: ${(finalBuf.length / 1024).toFixed(1)} KB`);
  console.log(`   Frames: ${frames.length}`);
  console.log(`   Loop: infinite`);
}

generateGIF().catch(e => {
  console.error('Failed:', e);
  process.exit(1);
});
