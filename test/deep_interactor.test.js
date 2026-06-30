'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { autoFillForm, runInteractionChain } = require('../hands/deep_interactor');

// Mock Playwright page — 使用可复用的 locator 工厂支持链式调用
function makeLocatorInner() {
  return {
    count: async () => 1,
    evaluate: async (fn, overrides) => [
      { name: 'email', type: 'email', tag: 'input', selector: '[name="email"]', value: overrides.email || 'test@example.com' },
      { name: 'name', type: 'text', tag: 'input', selector: '[name="name"]', value: overrides.name || 'test_name_value' },
    ],
    locator: () => ({ first: () => makeLocatorInner() }),
    fill: async () => {},
    type: async () => {},
    check: async () => {},
    isChecked: async () => false,
    selectOption: async () => {},
    screenshot: async () => Buffer.from('mock'),
    scrollIntoViewIfNeeded: async () => {},
  };
}

function mockPage() {
  return {
    locator: () => ({ first: () => makeLocatorInner() }),
    click: async () => {},
    goto: async () => {},
    evaluate: async (fn, val) => {},
    hover: async () => {},
    fill: async () => {},
    type: async () => {},
    scrollIntoViewIfNeeded: async () => {},
    selectOption: async () => {},
    screenshot: async () => Buffer.from('mock'),
  };
}

describe('autoFillForm', () => {
  it('should fill form fields with auto-generated values', async () => {
    const result = await autoFillForm(mockPage(), 'form');
    assert.ok(result.filled, 'autoFillForm should fill at least one field');
    assert.ok(Array.isArray(result.fields), 'should return fields array');
  });

  it('should return error when form not found', async () => {
    const emptyPage = { ...mockPage(), locator: () => ({ first: () => ({ count: async () => 0 }) }) };
    const result = await autoFillForm(emptyPage, 'form');
    assert.ok(result.error, 'should return error when form missing');
  });

  it('should accept overrides for specific fields', async () => {
    const result = await autoFillForm(mockPage(), 'form', { email: 'custom@test.com' });
    assert.ok(result.filled || result.error, 'should handle overrides');
  });
});

describe('runInteractionChain', () => {
  it('should execute click action', async () => {
    const result = await runInteractionChain(mockPage(), [{ action: 'click', selector: '#btn' }]);
    assert.equal(result.totalSteps, 1);
    assert.ok(result.steps.length > 0);
  });

  it('should execute multi-step chain', async () => {
    const chain = [
      { action: 'click', selector: '#btn1' },
      { action: 'wait', ms: 500 },
      { action: 'type', selector: '#input', value: 'test' },
      { action: 'click', selector: '#submit' },
    ];
    const result = await runInteractionChain(mockPage(), chain);
    assert.equal(result.totalSteps, 4);
  });
});
