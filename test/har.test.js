'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const evidenceHandler = require('../handlers/evidence');

function createMockDeps(opts = {}) {
  return {
    text: (content) => ({ content: [{ type: 'text', text: content }] }),
    ensurePage: async () => ({ target: { url: () => 'http://example.com' } }),
    exportHar: opts.exportHar || ((args) => ({
      har: { log: { version: '1.2', entries: [] } },
      filePath: '/tmp/har-export.har',
      entryCount: 0,
      exported: true
    }))
  };
}

describe('HAR Export', () => {
  it('browser_har_export returns HAR data structure', async () => {
    const deps = createMockDeps();
    const result = await evidenceHandler.handle('browser_har_export', {}, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.har);
    assert.ok(parsed.har.log);
    assert.strictEqual(parsed.har.log.version, '1.2');
    assert.strictEqual(parsed.entryCount, 0);
    assert.strictEqual(parsed.exported, true);
  });

  it('browser_har_export returns proper structure on error', async () => {
    const deps = createMockDeps({
      exportHar: () => ({ error: 'No page available for HAR export', exported: false })
    });
    const result = await evidenceHandler.handle('browser_har_export', {}, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.exported, false);
    assert.ok(parsed.error);
  });

  it('browser_har_export returns filePath on success', async () => {
    const deps = createMockDeps({
      exportHar: () => ({
        har: { log: { version: '1.2', entries: [{ request: { url: 'http://ex.com' }, response: { status: 200 } }] } },
        filePath: '/tmp/har-export-123.har',
        entryCount: 1,
        exported: true
      })
    });
    const result = await evidenceHandler.handle('browser_har_export', {}, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.entryCount, 1);
    assert.ok(parsed.filePath.includes('.har'));
  });

  it('browser_har_export handles unknown tool gracefully', async () => {
    const deps = createMockDeps();
    const result = await evidenceHandler.handle('browser_unknown_tool', {}, deps);
    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes('未知工具'));
  });
});
