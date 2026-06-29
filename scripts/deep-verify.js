'use strict';
const { chromium } = require('playwright');
const URL = 'http://192.168.8.4:5173';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // Collect ALL errors
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const apiResponses = {};

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({ text: msg.text(), location: msg.location() });
    }
  });
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('requestfailed', req => failedRequests.push({ url: req.url(), error: req.failure()?.errorText }));
  page.on('response', resp => {
    const url = resp.url();
    const status = resp.status();
    if (status >= 400 || url.includes('/api/')) {
      if (!apiResponses[url]) apiResponses[url] = [];
      apiResponses[url].push(status);
    }
  });

  await page.goto(URL + '/app.html', { waitUntil: 'load', timeout: 15000 });
  // Wait for SPA to initialize
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n=== CONSOLE ERRORS ===');
  consoleErrors.forEach(e => console.log(`[${e.location?.url || '?'}:${e.location?.lineNumber || '?'}] ${e.text}`));

  console.log('\n=== PAGE ERRORS ===');
  pageErrors.forEach(e => console.log(e));

  console.log('\n=== FAILED REQUESTS ===');
  failedRequests.forEach(r => console.log(`${r.url} → ${r.error}`));

  console.log('\n=== 4xx/5xx API RESPONSES ===');
  Object.entries(apiResponses).forEach(([url, codes]) => {
    if (codes.some(c => c >= 400)) console.log(`${url} → ${codes.join(', ')}`);
  });

  // DOM state
  console.log('\n=== DOM STATE ===');
  const dom = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    visible: document.body ? document.body.innerText.substring(0, 500) : 'NO BODY',
    errors: document.querySelectorAll('.error, .alert, [class*=err]').length,
  }));
  console.log(JSON.stringify(dom, null, 2));

  await browser.close();
}

main().catch(e => console.error('FATAL:', e));
