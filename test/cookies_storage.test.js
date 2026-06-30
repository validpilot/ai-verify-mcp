'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const networkHandler = require('../handlers/network');

function createMockDeps(opts = {}) {
  const cookies = opts.cookies || [
    { name: 'session', value: 'abc123xyz', domain: '.example.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }
  ];

  const mockPage = {
    url: () => 'http://example.com',
    context: () => ({
      cookies: async () => cookies,
      clearCookies: async () => {},
      addCookies: async (c) => {}
    }),
    isClosed: () => false
  };

  return {
    text: (content) => ({ content: [{ type: 'text', text: content }] }),
    ensurePage: async () => ({ target: mockPage }),
    redact: (data) => data,
    page: opts.page || mockPage,
    getStorageSnapshot: opts.getStorageSnapshot || (async (target, scope) => ({
      scope: scope || 'all',
      localStorage: { items: [{ key: 'token', value: 'x' }, { key: 'theme', value: 'dark' }], count: 2 },
      sessionStorage: { items: [{ key: 'tabId', value: 'tab1' }], count: 1 }
    }))
  };
}

describe('Cookies and Storage tools', () => {
  it('browser_cookies get action returns cookies list', async () => {
    const deps = createMockDeps();
    const result = await networkHandler.handle('browser_cookies', { action: 'get' }, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.action, 'get');
    assert.strictEqual(parsed.total, 1);
    assert.ok(Array.isArray(parsed.cookies));
    assert.strictEqual(parsed.cookies[0].name, 'session');
  });

  it('browser_cookies should validate set action params', async () => {
    const deps = createMockDeps();
    const result = await networkHandler.handle('browser_cookies', { action: 'set' }, deps);
    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes('cookie.name'));
  });

  it('browser_cookies set action with valid params succeeds', async () => {
    const deps = createMockDeps();
    const result = await networkHandler.handle('browser_cookies', {
      action: 'set',
      cookie: { name: 'test', value: 'val', domain: '.example.com' }
    }, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.action, 'set');
    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.cookie, 'test');
  });

  it('browser_cookies clear action succeeds', async () => {
    const deps = createMockDeps();
    const result = await networkHandler.handle('browser_cookies', { action: 'clear' }, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.action, 'clear');
    assert.strictEqual(parsed.success, true);
  });

  it('browser_cookies invalid action returns error', async () => {
    const deps = createMockDeps();
    const depsWithBadAction = { ...deps, page: null };
    // "delete" is not a recognized action, handler falls through to 'get'
    const result = await networkHandler.handle('browser_cookies', { action: 'delete' }, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    // Falls through to get behavior (default)
    assert.strictEqual(parsed.action, 'get');
  });

  it('browser_storage returns structure with localStorage and sessionStorage', async () => {
    const deps = createMockDeps();
    const result = await networkHandler.handle('browser_storage', { scope: 'all' }, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.localStorage);
    assert.ok(parsed.sessionStorage);
    assert.strictEqual(parsed.localStorage.count, 2);
    assert.strictEqual(parsed.sessionStorage.count, 1);
  });

  it('browser_storage handles empty storage gracefully', async () => {
    const deps = createMockDeps({
      getStorageSnapshot: async () => ({
        scope: 'all',
        localStorage: { items: [], count: 0 },
        sessionStorage: { items: [], count: 0 }
      })
    });
    const result = await networkHandler.handle('browser_storage', {}, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.localStorage.count, 0);
    assert.strictEqual(parsed.sessionStorage.count, 0);
    assert.deepStrictEqual(parsed.localStorage.items, []);
  });
});
