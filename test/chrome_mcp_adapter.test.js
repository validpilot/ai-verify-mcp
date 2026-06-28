'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { ChromeMCPAdapter } = require('../engines/chrome_mcp_adapter');

describe('ChromeMCPAdapter - constructor', () => {
  it('initializes with default options', () => {
    const adapter = new ChromeMCPAdapter();
    assert.equal(adapter.browser, null);
    assert.equal(adapter.defaultPage, null);
    assert.equal(adapter.pages.size, 0);
    assert.equal(adapter._engine, null);
    assert.equal(adapter.options.headless, true);
    assert.equal(adapter.options.cdpPort, 9222);
  });

  it('merges custom options', () => {
    const adapter = new ChromeMCPAdapter({ headless: false, cdpPort: 9229 });
    assert.equal(adapter.options.headless, false);
    assert.equal(adapter.options.cdpPort, 9229);
  });

  it('accepts executablePath option', () => {
    const adapter = new ChromeMCPAdapter({ executablePath: '/custom/chrome' });
    assert.equal(adapter.options.executablePath, '/custom/chrome');
  });
});

describe('ChromeMCPAdapter - isConnected', () => {
  it('returns false when browser is null', () => {
    const adapter = new ChromeMCPAdapter();
    assert.equal(adapter.isConnected(), false);
  });

  it('returns true when browser has isConnected method that returns true', () => {
    const adapter = new ChromeMCPAdapter();
    adapter.browser = { isConnected: () => true };
    assert.equal(adapter.isConnected(), true);
  });

  it('returns false when browser.isConnected throws', () => {
    const adapter = new ChromeMCPAdapter();
    adapter.browser = { isConnected: () => { throw new Error('disconnected'); } };
    assert.equal(adapter.isConnected(), false);
  });

  it('returns true when browser has no isConnected but exists', () => {
    const adapter = new ChromeMCPAdapter();
    adapter.browser = {};
    assert.equal(adapter.isConnected(), true);
  });
});

describe('ChromeMCPAdapter - pre-launch error states', () => {
  it('newPage throws before launch', async () => {
    const adapter = new ChromeMCPAdapter();
    await assert.rejects(
      () => adapter.newPage(),
      /Browser not launched/
    );
  });

  it('getPage throws before launch', () => {
    const adapter = new ChromeMCPAdapter();
    assert.throws(
      () => adapter.getPage(),
      /Browser not launched/
    );
  });

  it('goto throws before launch', async () => {
    const adapter = new ChromeMCPAdapter();
    await assert.rejects(
      () => adapter.goto('http://example.com'),
      /Browser not launched/
    );
  });

  it('screenshot throws before launch', async () => {
    const adapter = new ChromeMCPAdapter();
    await assert.rejects(
      () => adapter.screenshot(),
      /Browser not launched/
    );
  });

  it('evaluate throws before launch', async () => {
    const adapter = new ChromeMCPAdapter();
    await assert.rejects(
      () => adapter.evaluate('() => 1'),
      /Browser not launched/
    );
  });

  it('click throws before launch', async () => {
    const adapter = new ChromeMCPAdapter();
    await assert.rejects(
      () => adapter.click('#btn'),
      /Browser not launched/
    );
  });

  it('type throws before launch', async () => {
    const adapter = new ChromeMCPAdapter();
    await assert.rejects(
      () => adapter.type('#input', 'text'),
      /Browser not launched/
    );
  });

  it('close does not throw when not launched', async () => {
    const adapter = new ChromeMCPAdapter();
    await adapter.close();
    assert.equal(adapter.browser, null);
  });
});

describe('ChromeMCPAdapter - getPage errors', () => {
  it('throws when no default page set', () => {
    const adapter = new ChromeMCPAdapter();
    // Manually set a mock browser to bypass launch check
    adapter.browser = {};
    assert.throws(
      () => adapter.getPage(),
      /No default page/
    );
  });

  it('throws when named page not found', () => {
    const adapter = new ChromeMCPAdapter();
    adapter.browser = {};
    adapter.defaultPage = {};
    assert.throws(
      () => adapter.getPage('nonexistent'),
      /not found/
    );
  });

  it('returns default page when name is null and default exists', () => {
    const adapter = new ChromeMCPAdapter();
    adapter.browser = {};
    const mockPage = { url: () => 'http://example.com' };
    adapter.defaultPage = mockPage;
    assert.equal(adapter.getPage(), mockPage);
  });

  it('returns named page when it exists', () => {
    const adapter = new ChromeMCPAdapter();
    adapter.browser = {};
    adapter.defaultPage = {};
    const namedPage = { url: () => 'http://named.page' };
    adapter.pages.set('mypage', { page: namedPage, name: 'mypage' });
    assert.equal(adapter.getPage('mypage'), namedPage);
  });
});

describe('ChromeMCPAdapter - close behavior', () => {
  it('clears all pages and browser on close', async () => {
    const adapter = new ChromeMCPAdapter();
    adapter.browser = { close: async () => {} };
    adapter.defaultPage = { close: async () => {} };
    adapter.pages = new Map([['p1', { page: { close: async () => {} } }]]);
    await adapter.close();
    assert.equal(adapter.browser, null);
    assert.equal(adapter.defaultPage, null);
    assert.equal(adapter.pages.size, 0);
    assert.equal(adapter._engine, null);
  });

  it('handles page close errors gracefully', async () => {
    const adapter = new ChromeMCPAdapter();
    adapter.browser = { close: async () => { throw new Error('browser close fail'); } };
    adapter.defaultPage = { close: async () => { throw new Error('page close fail'); } };
    await adapter.close();
    assert.equal(adapter.browser, null);
  });
});

describe('ChromeMCPAdapter - detectChromePath', () => {
  it('returns null when no Chrome found (behaves gracefully)', () => {
    // This will check real filesystem but likely return null in CI
    const result = ChromeMCPAdapter.detectChromePath();
    // Should either be a string path or null
    assert.ok(result === null || typeof result === 'string');
  });
});

describe('ChromeMCPAdapter - exports', () => {
  it('exports ChromeMCPAdapter class', () => {
    assert.equal(typeof ChromeMCPAdapter, 'function');
    assert.equal(ChromeMCPAdapter.name, 'ChromeMCPAdapter');
  });

  it('has static detectChromePath method', () => {
    assert.equal(typeof ChromeMCPAdapter.detectChromePath, 'function');
  });
});
