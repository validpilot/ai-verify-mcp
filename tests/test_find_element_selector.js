const { chromium } = require('playwright');
const handlerLocator = require('../handlers/locator');

async function testBrowserFindElementSelector() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  const testHtml = `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <div id="container">
    <h1 class="main-title">Hello World</h1>
    <p class="content">This is a test</p>
    <button id="submit-btn" class="btn primary">Submit</button>
    <input type="text" id="username" placeholder="Enter username">
    <ul class="list">
      <li>Item 1</li>
      <li>Item 2</li>
      <li>Item 3</li>
    </ul>
  </div>
</body>
</html>`;

  await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(testHtml)}`);

  const deps = {
    page: page,
    browser: browser,
    browserSessionId: 1,
    activeSessionName: 'default',
    sessionCounter: 1,
    traceActive: false,
    currentTraceName: null,
    instrumentationEnabled: false,
    currentCheckpoint: new Date().toISOString(),
    eventCheckpoint: new Date().toISOString(),
    lastAction: null,
    lastImageErrorCheckpoint: new Date().toISOString()
  };

  console.log('=== Test 1: Selector #submit-btn ===');
  let result = await handlerLocator.handle('browser_find_element', { selector: '#submit-btn' }, deps);
  console.log(JSON.parse(result.content[0].text));

  console.log('\n=== Test 2: Selector .btn ===');
  result = await handlerLocator.handle('browser_find_element', { selector: '.btn' }, deps);
  console.log(JSON.parse(result.content[0].text));

  console.log('\n=== Test 3: Selector h1 ===');
  result = await handlerLocator.handle('browser_find_element', { selector: 'h1' }, deps);
  console.log(JSON.parse(result.content[0].text));

  console.log('\n=== Test 4: Selector li (multiple elements) ===');
  result = await handlerLocator.handle('browser_find_element', { selector: 'li', limit: 5 }, deps);
  console.log(JSON.parse(result.content[0].text));

  console.log('\n=== Test 5: Selector input[type="text"] ===');
  result = await handlerLocator.handle('browser_find_element', { selector: 'input[type="text"]' }, deps);
  console.log(JSON.parse(result.content[0].text));

  console.log('\n=== Test 6: Text "Hello" (fallback) ===');
  result = await handlerLocator.handle('browser_find_element', { text: 'Hello' }, deps);
  console.log(JSON.parse(result.content[0].text));

  console.log('\n=== Test 7: Invalid selector ===');
  result = await handlerLocator.handle('browser_find_element', { selector: 'invalid{selector' }, deps);
  console.log(JSON.parse(result.content[0].text));

  await browser.close();
  console.log('\n=== All tests completed ===');
}

testBrowserFindElementSelector().catch(e => {
  console.error('Test failed:', e.message);
  process.exit(1);
});