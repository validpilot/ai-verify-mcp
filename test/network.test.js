'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const networkHandler = require('../handlers/network');

function createMockDeps(opts = {}) {
  return {
    text: (content) => ({ content: [{ type: 'text', text: content }] }),
    redact: (data) => data,
    networkLogs: opts.networkLogs || [
      { url: 'http://example.com/api/data', status: 200, method: 'GET', size: 1024 },
      { url: 'http://example.com/api/users', status: 200, method: 'GET', size: 2048 },
      { url: 'http://example.com/api/404', status: 404, method: 'GET', size: 0 }
    ],
    filterNetwork: opts.filterNetwork || ((logs, args) => {
      let result = logs || [];
      if (args?.status) result = result.filter(e => e.status === args.status);
      if (args?.limit) result = result.slice(-args.limit);
      return result;
    }),
    filterNetworkDetails: opts.filterNetworkDetails || ((args) => {
      if (!args.requestId && !args.url) {
        return { error: '请提供 requestId 或 url 参数', entries: [] };
      }
      if (args.requestId === 'invalid') {
        return { error: `未找到请求 ${args.requestId}`, entries: [] };
      }
      return {
        requestId: args.requestId || 'auto-generated',
        url: args.url || 'http://example.com/api/data',
        method: 'GET',
        status: 200,
        headers: { 'content-type': 'application/json' },
        timing: { dns: 1, connect: 2, ttfb: 50, total: 55 }
      };
    })
  };
}

describe('Network tools', () => {
  it('browser_network returns network log entries', async () => {
    const deps = createMockDeps();
    const result = await networkHandler.handle('browser_network', {}, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed));
    assert.strictEqual(parsed.length, 3);
    assert.strictEqual(parsed[0].url, 'http://example.com/api/data');
  });

  it('browser_network empty logs returns empty array', async () => {
    const deps = createMockDeps({
      networkLogs: [],
      filterNetwork: (logs) => logs || []
    });
    const result = await networkHandler.handle('browser_network', {}, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.deepStrictEqual(parsed, []);
  });

  it('browser_network filters by status code', async () => {
    const deps = createMockDeps();
    const result = await networkHandler.handle('browser_network', { status: 404 }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].status, 404);
  });

  it('browser_network_detail with specific request returns details', async () => {
    const deps = createMockDeps();
    const result = await networkHandler.handle('browser_network_detail', { requestId: 'req-001' }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.requestId, 'req-001');
    assert.strictEqual(parsed.status, 200);
    assert.ok(parsed.headers);
    assert.ok(parsed.timing);
  });

  it('browser_network_detail with url-based lookup', async () => {
    const deps = createMockDeps();
    const result = await networkHandler.handle('browser_network_detail', { url: 'http://example.com/api/data' }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.url, 'http://example.com/api/data');
    assert.strictEqual(parsed.status, 200);
  });

  it('browser_network_detail invalid requestId returns error', async () => {
    const deps = createMockDeps();
    const result = await networkHandler.handle('browser_network_detail', { requestId: 'invalid' }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.error);
    assert.ok(parsed.error.includes('未找到'));
    assert.deepStrictEqual(parsed.entries, []);
  });

  it('browser_network_detail without params returns error', async () => {
    const deps = createMockDeps();
    const result = await networkHandler.handle('browser_network_detail', {}, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.error);
  });
});
