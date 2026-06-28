'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { PlaywrightAdapter, toFileUrl } = require('../engines/playwright_adapter');

const TEST_PAGE = toFileUrl(path.resolve(__dirname, 'fixtures', 'e2e-test.html'));

describe('PlaywrightAdapter E2E - lifecycle', () => {
  it('opens a local HTML page', async () => {
    const a = new PlaywrightAdapter({ headless: true });
    const result = await a.open({ url: TEST_PAGE, timeout: 10000 });
    assert.equal(result.ok, true);
    assert.equal(result.action, 'open');
    await a.close();
  });

  it('evaluates JavaScript in page context', async () => {
    const a = new PlaywrightAdapter({ headless: true });
    await a.open({ url: TEST_PAGE, timeout: 10000 });
    const result = await a.eval({ expression: 'document.title' });
    assert.equal(result.ok, true);
    assert.equal(result.result, 'E2E Test Page');
    await a.close();
  });

  it('gets DOM summary with controls', async () => {
    const a = new PlaywrightAdapter({ headless: true });
    await a.open({ url: TEST_PAGE, timeout: 10000 });
    const result = await a.domSummary();
    assert.equal(result.title, 'E2E Test Page');
    assert.ok(result.controls.length >= 3);
    assert.equal(result.readyState, 'complete');
    await a.close();
  });

  it('screenshots the page', async () => {
    const a = new PlaywrightAdapter({ headless: true });
    await a.open({ url: TEST_PAGE, timeout: 10000 });
    const result = await a.screenshot({ name: 'e2e-test' });
    assert.equal(result.ok, true);
    assert.equal(result.action, 'screenshot');
    assert.ok(result.artifactPath);
    await a.close();
  });
});

describe('PlaywrightAdapter E2E - interactive actions', () => {
  /** @type {PlaywrightAdapter} */
  let adapter;

  before(async () => {
    adapter = new PlaywrightAdapter({ headless: true });
    await adapter.open({ url: TEST_PAGE, timeout: 10000 });
  });

  after(async () => {
    if (adapter) {
      try { await adapter.close(); } catch (e) { /* ignore */ }
    }
  });

  it('types text into an input field', async () => {
    const result = await adapter.type({ selector: '#input', text: 'hello e2e' });
    assert.equal(result.ok, true);
    // Verify via eval
    const evalResult = await adapter.eval({
      expression: 'document.getElementById("input").value'
    });
    assert.equal(evalResult.result, 'hello e2e');
  });

  it('clicks a button and observes effect', async () => {
    const result = await adapter.click({ selector: '#btn' });
    assert.equal(result.ok, true);
    const evalResult = await adapter.eval({
      expression: 'document.getElementById("output").textContent'
    });
    assert.equal(evalResult.result, 'clicked');
  });

  it('waits for a selector to appear', async () => {
    const waitResult = await adapter.wait({ selector: '#btn' });
    assert.equal(waitResult.ok, true);

    // Wait with custom timeout
    const waitTimeout = await adapter.wait({ selector: '#title', timeout: 3000 });
    assert.equal(waitTimeout.ok, true);
  });
});

describe('PlaywrightAdapter E2E - element inspection', () => {
  /** @type {PlaywrightAdapter} */
  let adapter;

  before(async () => {
    adapter = new PlaywrightAdapter({ headless: true });
    await adapter.open({ url: TEST_PAGE, timeout: 10000 });
  });

  after(async () => {
    if (adapter) {
      try { await adapter.close(); } catch (e) { /* ignore */ }
    }
  });

  it('counts list items via hover', async () => {
    const items = await adapter.eval({
      expression: 'document.querySelectorAll("#list .item").length'
    });
    assert.equal(items.result, 3);
  });
});

describe('PlaywrightAdapter E2E - evidence collection', () => {
  /** @type {PlaywrightAdapter} */
  let adapter;

  before(async () => {
    adapter = new PlaywrightAdapter({ headless: true });
    await adapter.open({ url: TEST_PAGE, timeout: 10000 });
  });

  after(async () => {
    if (adapter) {
      try { await adapter.close(); } catch (e) { /* ignore */ }
    }
  });

  it('collects console log evidence', async () => {
    const evidence = await adapter.collectEvidenceSummary({ limit: 10 });
    assert.ok(evidence.console);
    assert.ok(evidence.dom);
    assert.equal(evidence.dom.title, 'E2E Test Page');
    assert.equal(evidence.dom.readyState, 'complete');
    // Console should have our messages
    assert.ok(evidence.console.count >= 2);
  });

  it('reports action with pass/fail', async () => {
    const result = await adapter.reportAction({ type: 'page_loaded' });
    assert.ok(result);
  });
});

describe('PlaywrightAdapter E2E - errors and cleanup', () => {
  it('errors() returns empty before any actions', async () => {
    const a = new PlaywrightAdapter({ headless: true });
    const errors = await a.errors({ limit: 10 });
    assert.equal(errors.action, 'errors');
    assert.equal(errors.console, 0);
    assert.equal(errors.pageError, 0);
    await a.close();
  });

  it('errorsClear resets all logs', async () => {
    const a = new PlaywrightAdapter({ headless: true });
    a.consoleLogs.push({ type: 'error', text: 'test error' });
    const cleared = await a.errorsClear();
    assert.equal(cleared.action, 'errors_clear');
    assert.equal(cleared.cleared, true);
    assert.equal(a.consoleLogs.length, 0);
    await a.close();
  });

  it('writeArtifact creates file and returns path', async () => {
    const a = new PlaywrightAdapter({ headless: true });
    const result = a.writeArtifact('test-artifact', { foo: 'bar' });
    assert.ok(typeof result === 'string');
    assert.ok(result.includes('test-artifact'));
    const fs = require('fs');
    assert.ok(fs.existsSync(result));
    fs.unlinkSync(result);
    await a.close();
  });
});

describe('PlaywrightAdapter E2E - multiple browser sessions', () => {
  it('can open and close two separate adapters', async () => {
    const a1 = new PlaywrightAdapter({ headless: true });
    const a2 = new PlaywrightAdapter({ headless: true });

    await a1.open({ url: TEST_PAGE, timeout: 10000 });
    await a2.open({ url: TEST_PAGE, timeout: 10000 });

    const title1 = await a1.eval({ expression: 'document.title' });
    const title2 = await a2.eval({ expression: 'document.title' });
    assert.equal(title1.result, 'E2E Test Page');
    assert.equal(title2.result, 'E2E Test Page');

    await a1.close();
    await a2.close();
  });
});
