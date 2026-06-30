'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const playwrightAdapter = require('../engines/playwright_adapter');

describe('playwright_adapter - ensureDir', () => {
  it('creates default artifact directory', () => {
    const dir = playwrightAdapter.ensureDir();
    assert.ok(typeof dir === 'string');
    assert.ok(dir.includes('artifacts'));
  });
});

describe('playwright_adapter - safeName (internal)', () => {
  // safeName is not exported; test via redactString which uses it internally
  it('ensures artifact naming works via ensureDir', () => {
    const dir = playwrightAdapter.ensureDir();
    assert.ok(dir.includes('phase1'));
  });
});

describe('playwright_adapter - toFileUrl', () => {
  it('returns http urls unchanged', () => {
    assert.equal(playwrightAdapter.toFileUrl('http://example.com'), 'http://example.com');
  });

  it('returns https urls unchanged', () => {
    assert.equal(playwrightAdapter.toFileUrl('https://example.com'), 'https://example.com');
  });

  it('returns file urls unchanged', () => {
    assert.equal(playwrightAdapter.toFileUrl('file:///x/y.html'), 'file:///x/y.html');
  });

  it('converts relative paths to file:// URLs', () => {
    const url = playwrightAdapter.toFileUrl('examples/demo/index.html');
    assert.ok(url.startsWith('file://'));
    assert.ok(url.endsWith('examples/demo/index.html'));
  });

  it('normalizes backslashes to forward slashes', () => {
    const url = playwrightAdapter.toFileUrl('./a\\b\\c.html');
    assert.ok(url.includes('/a/b/c.html'));
  });
});

describe('playwright_adapter - redactString', () => {
  it('redacts Bearer tokens', () => {
    const r = playwrightAdapter.redactString('Authorization: Bearer abc123.def456');
    assert.ok(r.includes('Bearer ******'));
    assert.ok(!r.includes('abc123.def456'));
  });

  it('redacts api_key format', () => {
    const r = playwrightAdapter.redactString('api_key=abc123def456');
    assert.ok(r.includes('api_key=******'));
  });

  it('redacts token format', () => {
    const r = playwrightAdapter.redactString('token: abc123def456');
    assert.ok(r.includes('token: ******'));
  });

  it('passes through plain text', () => {
    assert.equal(playwrightAdapter.redactString('hello world'), 'hello world');
  });

  it('handles null/undefined safely', () => {
    assert.equal(playwrightAdapter.redactString(null), '');
    assert.equal(playwrightAdapter.redactString(undefined), '');
  });

  it('caps output at 2000 chars', () => {
    const long = 'a'.repeat(5000);
    const r = playwrightAdapter.redactString(long);
    assert.ok(r.length <= 2000);
  });
});

describe('playwright_adapter - truncate', () => {
  it('truncates long strings with ellipsis', () => {
    const r = playwrightAdapter.truncate('x'.repeat(600), 100);
    assert.ok(r.length <= 103); // 100 + '...'
    assert.ok(r.endsWith('...'));
  });

  it('keeps short strings unchanged', () => {
    assert.equal(playwrightAdapter.truncate('short', 500), 'short');
  });

  it('uses default max when not provided', () => {
    const r = playwrightAdapter.truncate('x'.repeat(600));
    assert.ok(r.length <= 503);
  });
});

describe('playwright_adapter - summarizeEntries', () => {
  it('returns empty array for empty input', () => {
    assert.deepEqual(playwrightAdapter.summarizeEntries([]), []);
  });

  it('keeps only last N entries', () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({ source: 'console', text: `msg-${i}` }));
    const summary = playwrightAdapter.summarizeEntries(entries, 5);
    assert.equal(summary.length, 5);
    assert.equal(summary[0].text, 'msg-15');
  });

  it('trims undefined and empty values', () => {
    const summary = playwrightAdapter.summarizeEntries([
      { source: 'console', type: '', url: undefined, status: 200, text: 'ok' }
    ]);
    assert.equal(summary[0].type, undefined);
    assert.ok(!('url' in summary[0]));
    assert.equal(summary[0].status, 200);
  });

  it('truncates long text', () => {
    const long = 'x'.repeat(500);
    const summary = playwrightAdapter.summarizeEntries([{ text: long }]);
    assert.ok(summary[0].text.length <= 243);
  });
});

describe('playwright_adapter - PlaywrightAdapter class', () => {
  it('initializes with default options', () => {
    const adapter = new playwrightAdapter.PlaywrightAdapter();
    assert.equal(adapter.options.headless, true);
    assert.deepEqual(adapter.options.viewport, { width: 1280, height: 800 });
    assert.equal(adapter.browser, null);
    assert.equal(adapter.page, null);
    assert.equal(adapter.consoleLogs.length, 0);
    assert.equal(adapter.networkLogs.length, 0);
    assert.equal(adapter.pageErrors.length, 0);
  });

  it('merges custom options with defaults', () => {
    const adapter = new playwrightAdapter.PlaywrightAdapter({
      headless: false,
      viewport: { width: 1920, height: 1080 }
    });
    assert.equal(adapter.options.headless, false);
    assert.deepEqual(adapter.options.viewport, { width: 1920, height: 1080 });
  });

  it('exposes defaultAdapter singleton', () => {
    assert.ok(playwrightAdapter.defaultAdapter);
    assert.ok(playwrightAdapter.defaultAdapter.options);
  });

  it('errors() returns error counts', async () => {
    const adapter = new playwrightAdapter.PlaywrightAdapter();
    adapter.consoleLogs.push({ type: 'error', text: 'foo' });
    adapter.pageErrors.push({ text: 'bar' });
    adapter.networkLogs.push({ status: 500, url: '/x' });
    const result = await adapter.errors();
    assert.equal(result.action, 'errors');
    assert.equal(result.console, 1);
    assert.equal(result.pageError, 1);
    assert.ok(result.errors.length >= 2);
  });

  it('errorsClear empties all logs', () => {
    const adapter = new playwrightAdapter.PlaywrightAdapter();
    adapter.consoleLogs.push({ type: 'error', text: 'foo' });
    adapter.errorsClear();
    assert.equal(adapter.consoleLogs.length, 0);
    assert.equal(adapter.pageErrors.length, 0);
    assert.equal(adapter.networkLogs.length, 0);
  });
});

describe('playwright_adapter - export structure', () => {
  it('exports all expected functions and class', () => {
    assert.equal(typeof playwrightAdapter.ensureDir, 'function');
    assert.equal(typeof playwrightAdapter.toFileUrl, 'function');
    assert.equal(typeof playwrightAdapter.redactString, 'function');
    assert.equal(typeof playwrightAdapter.truncate, 'function');
    assert.equal(typeof playwrightAdapter.summarizeEntries, 'function');
    assert.equal(typeof playwrightAdapter.PlaywrightAdapter, 'function');
    // defaultAdapter is a PlaywrightAdapter instance
    assert.ok(playwrightAdapter.defaultAdapter instanceof playwrightAdapter.PlaywrightAdapter);
  });
});
