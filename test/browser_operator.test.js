'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// Mock the playwright_adapter
const mockAdapter = {};
for (const method of ['open', 'click', 'type', 'wait', 'eval', 'screenshot', 'batch',
  'checkAction', 'collectAction', 'reportAction', 'collectEvidenceSummary']) {
  mockAdapter[method] = async (args) => ({ called: method, args });
}

require.cache[require.resolve('../engines/playwright_adapter')] = {
  exports: {
    defaultAdapter: mockAdapter,
    truncate: (v, m) => String(v).slice(0, m || 500)
  }
};

const browserOp = require('../hands/browser_operator');

describe('browser_operator', () => {
  it('open delegates to adapter.open', async () => {
    const result = await browserOp.open({ url: 'https://example.com' });
    assert.equal(result.called, 'open');
    assert.equal(result.args.url, 'https://example.com');
  });

  it('navigate delegates to adapter.open', async () => {
    const result = await browserOp.navigate({ url: 'https://example.com' });
    assert.equal(result.called, 'open');
  });

  it('click delegates to adapter.click', async () => {
    const result = await browserOp.click({ selector: '#btn' });
    assert.equal(result.called, 'click');
    assert.equal(result.args.selector, '#btn');
  });

  it('type delegates to adapter.type', async () => {
    const result = await browserOp.type({ text: 'hello' });
    assert.equal(result.called, 'type');
  });

  it('wait delegates to adapter.wait', async () => {
    const result = await browserOp.wait({ ms: 1000 });
    assert.equal(result.called, 'wait');
  });

  it('eval delegates to adapter.eval', async () => {
    const result = await browserOp.eval({ code: '1+1' });
    assert.equal(result.called, 'eval');
  });

  it('screenshot delegates to adapter.screenshot', async () => {
    const result = await browserOp.screenshot({ fullPage: true });
    assert.equal(result.called, 'screenshot');
  });

  it('batch delegates to adapter.batch', async () => {
    const result = await browserOp.batch({ steps: [] });
    assert.equal(result.called, 'batch');
  });

  it('summary delegates to adapter.collectEvidenceSummary', async () => {
    const result = await browserOp.summary({ url: 'x' });
    assert.equal(result.called, 'collectEvidenceSummary');
  });

  it('check delegates to adapter.checkAction', async () => {
    const result = await browserOp.check({ assertion: 'visible' });
    assert.equal(result.called, 'checkAction');
  });

  it('collect delegates to adapter.collectAction', async () => {
    const result = await browserOp.collect({ type: 'console' });
    assert.equal(result.called, 'collectAction');
  });

  it('report delegates to adapter.reportAction', async () => {
    const result = await browserOp.report({ format: 'html' });
    assert.equal(result.called, 'reportAction');
  });
});
