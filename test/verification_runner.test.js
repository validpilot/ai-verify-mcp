'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// Use a queue-based mock factory: each test sets the queue which the adapter returns
let queue = [];

function getAdapterClass() {
  return {
    PlaywrightAdapter: class Adapter {
      constructor(opts = {}) {
        this.opts = opts;
        const entry = queue.shift() || {};
        this.consoleLogs = entry.consoleLogs || [];
        this.pageErrors = entry.pageErrors || [];
        this.networkLogs = entry.networkLogs || [];
        this._evalResult = entry.evalResult;
        this._failOpen = entry.failOpen || false;
        this._openError = entry.openError;
      }
      async open() {
        if (this._failOpen) throw new Error(this._openError || 'navigation failed');
        return { ok: true };
      }
      async close() {}
      async screenshot({ name }) {
        return { artifactPath: `/tmp/${name}.png` };
      }
      async eval() {
        if (!this._evalResult) throw new Error('eval broken');
        return { result: this._evalResult };
      }
    }
  };
}

const playwrightCache = require.resolve('../engines/playwright_adapter');

describe('validationQuickRun', () => {
  before(() => {
    require.cache[playwrightCache] = { exports: getAdapterClass() };
    delete require.cache[require.resolve('../hands/verification_runner')];
  });

  function newRunner(opts) {
    queue.push({ ...opts });
    return require('../hands/verification_runner').validationQuickRun;
    // The first time newRunner is called it should use the just-pushed entry;
    // subsequent calls within the same describe will pop the next entry from the queue.
    // To avoid stale runner caching, we explicitly reset the runner cache before each call.
  }

  function freshRun(entry) {
    if (entry !== undefined) queue.unshift({ ...entry });
    delete require.cache[require.resolve('../hands/verification_runner')];
    return require('../hands/verification_runner').validationQuickRun;
  }

  it('throws when url is missing', async () => {
    await assert.rejects(
      freshRun({})({ url: '' }),
      /url 参数必填/
    );
  });

  it('returns pass=false when navigation fails', async () => {
    const run = freshRun({ failOpen: true, openError: 'ERR_NAME_NOT_RESOLVED' });
    const result = await run({ url: 'http://unreachable.invalid' });
    assert.equal(result.pass, false);
    assert.ok(result.summary.includes('页面加载失败'));
    assert.equal(result.totalChecks, 7);
    assert.equal(result.passedChecks, 0);
    assert.equal(result.failedChecks, 7);
    assert.ok(result.screenshot);
    assert.ok(result.timestamp);
  });

  it('returns pass=true on perfect page', async () => {
    const run = freshRun({
      consoleLogs: [],
      pageErrors: [],
      networkLogs: [],
      evalResult: {
        bodyTextLength: 500,
        imgCount: 3,
        linkCount: 5,
        buttonCount: 2,
        title: 'Test Page'
      }
    });
    const result = await run({ url: 'http://perfect.example.com' });
    assert.equal(result.pass, true);
    assert.equal(result.totalChecks, 7);
    assert.equal(result.passedChecks, 7);
    assert.equal(result.failedChecks, 0);
    assert.ok(result.summary.includes('所有'));
  });

  it('detects 5xx server errors', async () => {
    const run = freshRun({
      networkLogs: [{ status: 500, url: '/api/x', method: 'GET', timestamp: 1 }],
      evalResult: { bodyTextLength: 500, imgCount: 1, linkCount: 5, buttonCount: 1, title: 'X' }
    });
    const result = await run({ url: 'http://500.example.com' });
    assert.equal(result.pass, false);
    const no5xx = result.checks.find(c => c.name === 'no_5xx');
    assert.equal(no5xx.passed, false);
    assert.ok(no5xx.detail.includes('500'));
    assert.ok(result.topErrors.length >= 1);
  });

  it('detects JS errors', async () => {
    const run = freshRun({
      consoleLogs: [{ type: 'error', text: 'TypeError: x is null', timestamp: 1 }],
      evalResult: { bodyTextLength: 500, imgCount: 1, linkCount: 5, buttonCount: 1, title: 'X' }
    });
    const result = await run({ url: 'http://js-err.example.com' });
    const check = result.checks.find(c => c.name === 'no_js_errors');
    assert.equal(check.passed, false);
    assert.ok(check.detail.includes('1 个 console.error'));
  });

  it('detects 404 errors', async () => {
    const run = freshRun({
      networkLogs: [{ status: 404, url: '/missing.png', method: 'GET', timestamp: 1 }],
      evalResult: { bodyTextLength: 500, imgCount: 1, linkCount: 5, buttonCount: 1, title: 'X' }
    });
    const result = await run({ url: 'http://404.example.com' });
    const check = result.checks.find(c => c.name === 'no_404');
    assert.equal(check.passed, false);
    assert.ok(check.detail.includes('404'));
  });

  it('detects blank page (no title, no images)', async () => {
    const run = freshRun({
      evalResult: { bodyTextLength: 20, imgCount: 0, linkCount: 0, buttonCount: 0, title: '' }
    });
    const result = await run({ url: 'http://blank.example.com' });
    assert.equal(result.pass, false);
   const notBlank = result.checks.find(c => c.name === 'not_blank');
    const hasTitle = result.checks.find(c => c.name === 'has_title');
    const hasContent = result.checks.find(c => c.name === 'has_content');
    assert.equal(notBlank.passed, false);
    // has_title: returns truthy string when title is empty (source code quirk)
    assert.ok(!hasTitle.passed);
    assert.equal(hasContent.passed, false);
  });

  it('allows custom checks subset', async () => {
    const run = freshRun({
      evalResult: { bodyTextLength: 500, imgCount: 1, linkCount: 5, buttonCount: 1, title: 'X' }
    });
    const result = await run({ url: 'http://example.com', checks: ['no_5xx', 'has_title'] });
    assert.equal(result.totalChecks, 2);
    assert.ok(result.checks.every(c => ['no_5xx', 'has_title'].includes(c.name)));
  });

  it('ignores unknown check names', async () => {
    const run = freshRun({
      evalResult: { bodyTextLength: 500, imgCount: 1, linkCount: 5, buttonCount: 1, title: 'X' }
    });
    const result = await run({ url: 'http://example.com', checks: ['no_5xx', 'made_up_check'] });
    assert.equal(result.totalChecks, 1);
  });

  it('falls back when eval fails', async () => {
    const run = freshRun({ evalResult: null });
    const result = await run({ url: 'http://example.com' });
    // When eval fails, domInfo defaults to all zeros -> dom-related checks fail
    assert.equal(result.pass, false);
    assert.ok(result.checks.length >= 3);
  });

  it('always produces timestamp and screenshot', async () => {
    const run = freshRun({
      evalResult: { bodyTextLength: 500, imgCount: 1, linkCount: 5, buttonCount: 1, title: 'X' }
    });
    const result = await run({ url: 'http://example.com' });
    assert.ok(result.timestamp);
    assert.ok(result.screenshot);
    assert.ok(result.duration >= 0);
  });

  it('produces artifacts array with screenshot path', async () => {
    const run = freshRun({
      evalResult: { bodyTextLength: 500, imgCount: 1, linkCount: 5, buttonCount: 1, title: 'X' }
    });
    const result = await run({ url: 'http://example.com' });
    assert.ok(Array.isArray(result.artifacts));
    assert.equal(result.artifacts.length, 1);
  });
});
