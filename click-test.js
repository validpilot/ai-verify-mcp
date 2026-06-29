const fs = require('fs');
const outPath = __dirname + '\\click_test_result.txt';
function log(msg) { fs.appendFileSync(outPath, msg + '\n'); }

(async () => {
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const errors = [];
    page.on('response', r => { if (r.status() >= 400) errors.push({type:'http', url: r.url().slice(0,100), status: r.status()}); });
    page.on('pageerror', e => errors.push({type:'js', msg: e.message.slice(0,120)}));
    page.on('console', msg => { if (msg.type() === 'error') errors.push({type:'console', msg: msg.text().slice(0,120)}); });

    log('=== Phase 1: Open page ===');
    await page.goto('http://192.168.8.4:5173/app.html', { waitUntil: 'networkidle', timeout: 30000 });
    log('Title: ' + await page.title());
    log('URL: ' + page.url());

    log('\n=== Phase 2: Find clickables ===');
    const btns = await page.evaluate(() => {
      const els = document.querySelectorAll('button, a[href], [role=button], input[type=button], input[type=submit], [onclick]');
      return Array.from(els).slice(0,50).map(el => ({
        tag: el.tagName, id: el.id || '',
        text: (el.innerText || el.textContent || el.value || '').trim().slice(0,50),
        visible: el.offsetParent !== null, disabled: !!el.disabled
      }));
    });
    log('Found ' + btns.length + ' clickable elements');
    btns.forEach((b,i) => log('  ' + (i+1) + '. <' + b.tag + '> "' + b.text + '" ' + (b.visible?'visible':'hidden') + (b.disabled?'[disabled]':'')));

    log('\n=== Phase 3: Click each ===');
    let success = 0, fail = 0, skipped = 0;
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      if (!b.visible || b.disabled) { skipped++; continue; }
      const beforeUrl = page.url();
      try {
        if (b.id) {
          await page.click('#' + b.id.replace(/[^\w-]/g,''), { timeout: 3000, force: true });
        } else if (b.text) {
          await page.getByText(b.text, { exact: false }).first().click({ timeout: 3000, force: true });
        } else { skipped++; continue; }
        await page.waitForTimeout(1000);
        const afterUrl = page.url();
        if (afterUrl !== beforeUrl) {
          log('  PASS [' + (b.text||b.id) + '] navigated');
          await page.goBack();
          await page.waitForTimeout(800);
        } else {
          log('  PASS [' + (b.text||b.id) + '] clicked');
        }
        success++;
      } catch(e) {
        log('  FAIL [' + (b.text||b.id) + '] ' + e.message.slice(0,60));
        fail++;
      }
    }

    log('\n=== Phase 4: Summary ===');
    log('Pass: ' + success + ', Fail: ' + fail + ', Skipped: ' + skipped);
    log('Errors captured (' + errors.length + '):');
    errors.forEach(e => log('  ' + e.type + ': ' + JSON.stringify(e.msg||e.url||e.status)));
    if (errors.length === 0) log('  Zero errors');

    await browser.close();
    log('\nDone');
  } catch(e) {
    log('SCRIPT FAILED: ' + e.message);
    log(e.stack);
  }
})();
