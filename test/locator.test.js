'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const locatorHandler = require('../handlers/locator');

function createMockDeps(opts = {}) {
  return {
    text: (content) => ({ content: [{ type: 'text', text: content }] }),
    ensurePage: async (args) => {
      if (opts.ensurePageFails) {
        const err = new Error('Page crashed');
        throw err;
      }
      return { target: { url: () => 'http://example.com' } };
    },
    findElement: opts.findElement || (async (target, args) => ({
      selector: args.selector || '',
      found: true,
      count: 1,
      elements: [{ tag: 'button', id: 'submit', text: 'Submit' }]
    })),
    findPage: opts.findPage || (async (target, args) => ({
      found: true,
      url: args.url || 'http://example.com',
      title: args.title || 'Example Page',
      matchScore: 1.0
    })),
    suggestLocator: opts.suggestLocator || (async (target, args) => ({
      suggestions: [
        { selector: '#main-btn', confidence: 0.95, reason: 'Unique ID match' },
        { selector: '.btn-primary', confidence: 0.8, reason: 'Class match' }
      ],
      description: args.description || ''
    })),
    validateLocator: opts.validateLocator || (async (target, args) => ({
      selector: args.selector || '',
      valid: true,
      matchCount: 1,
      errors: []
    }))
  };
}

describe('Locator tools', () => {
  it('browser_find_element returns element data', async () => {
    const deps = createMockDeps();
    const result = await locatorHandler.handle('browser_find_element', { selector: '#submit' }, deps);
    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.found, true);
    assert.strictEqual(parsed.count, 1);
    assert.strictEqual(parsed.elements[0].id, 'submit');
  });

  it('browser_find_element empty selector returns error from findElement', async () => {
    const deps = createMockDeps({
      findElement: async () => ({ selector: '', found: false, count: 0, elements: [], error: '缺少 selector 参数' })
    });
    const result = await locatorHandler.handle('browser_find_element', { selector: '' }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.found, false);
    assert.strictEqual(parsed.count, 0);
  });

  it('browser_find_page validates url/title params', async () => {
    const deps = createMockDeps();
    const result = await locatorHandler.handle('browser_find_page', { url: 'http://example.com', title: 'Test' }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.found, true);
    assert.strictEqual(parsed.url, 'http://example.com');
    assert.strictEqual(parsed.matchScore, 1.0);
  });

  it('browser_find_page without url returns not found', async () => {
    const deps = createMockDeps({
      findPage: async () => ({ found: false, url: '', title: '', matchScore: 0, error: '未找到匹配页面' })
    });
    const result = await locatorHandler.handle('browser_find_page', { url: '' }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.found, false);
    assert.strictEqual(parsed.matchScore, 0);
  });

  it('browser_locator_suggest returns suggestions array', async () => {
    const deps = createMockDeps();
    const result = await locatorHandler.handle('browser_locator_suggest', { description: 'primary button' }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.suggestions));
    assert.strictEqual(parsed.suggestions.length, 2);
    assert.strictEqual(parsed.suggestions[0].selector, '#main-btn');
    assert.strictEqual(parsed.suggestions[0].confidence, 0.95);
  });

  it('browser_locator_suggest with empty description still works', async () => {
    const deps = createMockDeps({
      suggestLocator: async () => ({ suggestions: [], description: '' })
    });
    const result = await locatorHandler.handle('browser_locator_suggest', {}, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.deepStrictEqual(parsed.suggestions, []);
  });

  it('browser_locator_validate returns validation result', async () => {
    const deps = createMockDeps();
    const result = await locatorHandler.handle('browser_locator_validate', { selector: '#main-btn' }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.valid, true);
    assert.strictEqual(parsed.matchCount, 1);
    assert.deepStrictEqual(parsed.errors, []);
  });

  it('browser_locator_validate with invalid selector returns error info', async () => {
    const deps = createMockDeps({
      validateLocator: async () => ({
        selector: '#bad-sel',
        valid: false,
        matchCount: 0,
        errors: ['元素未找到']
      })
    });
    const result = await locatorHandler.handle('browser_locator_validate', { selector: '#bad-sel' }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.valid, false);
    assert.strictEqual(parsed.matchCount, 0);
    assert.strictEqual(parsed.errors[0], '元素未找到');
  });

  it('unknown tool name returns isError', async () => {
    const deps = createMockDeps();
    const result = await locatorHandler.handle('browser_no_such_tool', {}, deps);
    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes('未知工具'));
  });
});
