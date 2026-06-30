'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const evidenceHandler = require('../handlers/evidence');
const systemHandler = require('../handlers/system');

function createMockDeps() {
  return {
    text: (content) => ({ content: [{ type: 'text', text: content }] }),
    traceLogs: [],
    traceActive: false,
    ensurePage: async () => ({ target: { url: () => 'http://example.com', close: async () => {} } }),
    startTrace: async (target, args) => {
      return { active: true, startedAt: new Date().toISOString(), options: args || {} };
    },
    stopTrace: async (target, args) => {
      return { active: false, logs: [{ event: 'navigation', url: 'http://example.com/page' }], count: 1 };
    },
    buildTraceChain: (args) => {
      const limit = args?.limit || 10;
      return {
        chain: [
          { step: 1, action: 'navigate', url: 'http://example.com', timestamp: new Date().toISOString() },
          { step: 2, action: 'click', selector: '.btn', timestamp: new Date().toISOString() }
        ].slice(0, limit),
        totalSteps: 2,
        limit
      };
    }
  };
}

describe('Trace tools', () => {
  it('browser_trace_start should enable tracing', async () => {
    const deps = createMockDeps();
    const result = await evidenceHandler.handle('browser_trace_start', { categories: ['navigation'] }, deps);
    assert.ok(result.content);
    assert.ok(result.content[0].type === 'text');
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.active, true);
    assert.ok(parsed.startedAt);
    assert.deepStrictEqual(parsed.options, { categories: ['navigation'] });
  });

  it('browser_trace_start should work without args', async () => {
    const deps = createMockDeps();
    const result = await evidenceHandler.handle('browser_trace_start', {}, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.active, true);
    assert.deepStrictEqual(parsed.options, {});
  });

  it('browser_trace_start should reject invalid options', async () => {
    const deps = createMockDeps();
    deps.startTrace = async (target, args) => {
      return { active: true, startedAt: new Date().toISOString(), options: args || {} };
    };
    const result = await evidenceHandler.handle('browser_trace_start', { invalidKey: 'bad' }, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.active, true);
    assert.ok(parsed.options);
  });

  it('browser_trace_stop should return collected logs', async () => {
    const deps = createMockDeps();
    const result = await evidenceHandler.handle('browser_trace_stop', {}, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.active, false);
    assert.strictEqual(parsed.count, 1);
    assert.ok(Array.isArray(parsed.logs));
    assert.strictEqual(parsed.logs.length, 1);
    assert.strictEqual(parsed.logs[0].event, 'navigation');
  });

  it('browser_trace_stop when not active returns empty', async () => {
    const deps = createMockDeps();
    deps.stopTrace = async () => ({ active: false, logs: [], count: 0 });
    const result = await evidenceHandler.handle('browser_trace_stop', {}, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.active, false);
    assert.strictEqual(parsed.count, 0);
    assert.deepStrictEqual(parsed.logs, []);
  });

  it('browser_trace_chain should return structured chain', async () => {
    const deps = createMockDeps();
    const result = await systemHandler.handle('browser_trace_chain', {}, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.chain));
    assert.strictEqual(parsed.totalSteps, 2);
    assert.strictEqual(parsed.limit, 10);
  });

  it('browser_trace_chain with custom limit', async () => {
    const deps = createMockDeps();
    const result = await systemHandler.handle('browser_trace_chain', { limit: 1 }, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.chain.length, 1);
    assert.strictEqual(parsed.limit, 1);
  });

  it('trace_start preserves passed options', async () => {
    const deps = createMockDeps();
    deps.startTrace = async (target, args) => {
      return { active: true, startedAt: new Date().toISOString(), options: args || {} };
    };
    const result = await evidenceHandler.handle('browser_trace_start', { screenshots: true, snapshots: true }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.options.screenshots, true);
    assert.strictEqual(parsed.options.snapshots, true);
  });

  it('trace_chain handles empty logs gracefully', async () => {
    const deps = createMockDeps();
    deps.buildTraceChain = () => ({ chain: [], totalSteps: 0, limit: 10 });
    const result = await systemHandler.handle('browser_trace_chain', {}, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.deepStrictEqual(parsed.chain, []);
    assert.strictEqual(parsed.totalSteps, 0);
  });
});
