'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { handle: browserHandle } = require('../handlers/browser');

// ============================================================
// 辅助函数：创建 mock deps 对象
// ============================================================

function makeTextFn() {
  return (str) => str;
}

function makeFakeTarget(overrides = {}) {
  return {
    url: overrides.url || (() => 'http://example.com/page'),
    goto: overrides.goto || (async () => {}),
    locator: overrides.locator || (() => ({
      count: async () => 1,
      nth: () => ({ textContent: async () => '', evaluate: async () => '', getAttribute: async () => null }),
      click: async () => {},
      fill: async () => {},
      first: () => ({ innerText: async () => '' }),
      isVisible: async () => true,
      waitFor: async () => {},
    })),
    evaluate: overrides.evaluate || (async () => null),
    content: overrides.content || (async () => '<html></html>'),
    title: overrides.title || (async () => 'Page Title'),
    screenshot: overrides.screenshot || (async () => Buffer.from('')),
    waitForSelector: overrides.waitForSelector || (async () => {}),
    waitForTimeout: overrides.waitForTimeout || (async () => {}),
    ...overrides,
  };
}

function makeDeps(overrides = {}) {
  const target = overrides.target || makeFakeTarget();
  return {
    page: target,
    browser: null,
    browserSessionId: 'test-session',
    consoleLogs: [],
    networkLogs: [],
    pageErrors: [],
    currentCheckpoint: 0,
    eventCheckpoint: 0,
    lastAction: null,
    sessions: new Map(),
    activeSessionName: null,
    sessionCounter: 0,
    traceLogs: [],
    traceActive: false,
    currentTraceName: null,
    backendProbeResults: {},
    instrumentationEnabled: false,
    imageErrors: [],
    lastImageErrorCheckpoint: 0,
    validationResults: {},
    lastQualityChecks: {},
    lastValidationRun: null,
    requestStartTimes: {},
    stateManager: null,
    text: makeTextFn(),
    log: () => {},
    ensurePage: overrides.ensurePage || (async () => ({ target, reused: false, sessionId: 'test-session' })),
    getPageLinks: overrides.getPageLinks || (async () => ({ total: 0, links: [] })),
    probeKnownEndpoints: overrides.probeKnownEndpoints || (async () => []),
    assertPage: overrides.assertPage || (async (target, args) => ({
      passed: true,
      checks: [{ name: 'test', passed: true }],
      total: 1,
      passedCount: 1,
      failedCount: 0
    })),
    runFlow: overrides.runFlow || (async () => ({ steps: [], passed: true })),
    installInstrumentation: overrides.installInstrumentation || (async () => ({ installed: true })),
    getBrowserEvents: overrides.getBrowserEvents || (async () => ({ events: [] })),
    clearBrowserEvents: overrides.clearBrowserEvents || (async () => ({ cleared: true })),
    postActionErrorCheck: overrides.postActionErrorCheck || (async () => ({ detected: false, count: 0, console: [], page: [], network: [] })),
    mcpParamMissing: (param, name) => ({ content: [{ type: 'text', text: `缺少参数: ${param} (工具: ${name})` }], isError: true }),
    mcpError: (msg, extra) => ({ content: [{ type: 'text', text: msg }], isError: true, ...(extra || {}) }),
    ...overrides,
  };
}

function parseResult(result) {
  if (typeof result !== 'string') {
    return result;
  }
  try {
    return JSON.parse(result);
  } catch (_) {
    return result;
  }
}

// ============================================================
// browser_assert — PARAM_MISSING 路径
// ============================================================

describe('browser_assert', () => {
  test('无任何断言条件返回 PARAM_MISSING', async () => {
    const deps = makeDeps();
    const result = await browserHandle('browser_assert', {}, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.error, 'PARAM_MISSING');
    assert.ok(parsed.message.includes('未提供任何断言条件'));
    assert.ok(Array.isArray(parsed.supportedAssertions));
    assert.ok(parsed.supportedAssertions.length > 0);
    // 验证支持的断言列表
    const params = parsed.supportedAssertions.map(s => s.param);
    assert.ok(params.includes('urlContains'));
    assert.ok(params.includes('textContains'));
    assert.ok(params.includes('selectorVisible'));
    assert.ok(params.includes('noErrors'));
  });

  test('有断言条件时调用 assertPage', async () => {
    let assertCalled = false;
    let receivedArgs = null;
    const deps = makeDeps({
      assertPage: async (target, args) => {
        assertCalled = true;
        receivedArgs = args;
        return { passed: true, checks: [{ name: 'urlCheck', passed: true }] };
      }
    });
    const result = await browserHandle('browser_assert', { urlContains: 'example' }, deps);
    const parsed = parseResult(result);
    assert.equal(assertCalled, true);
    assert.equal(receivedArgs.urlContains, 'example');
    assert.equal(parsed.passed, true);
  });

  test('textContains 断言触发 assertPage', async () => {
    const deps = makeDeps();
    const result = await browserHandle('browser_assert', { textContains: 'hello' }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.passed, true);
  });

  test('selectorVisible 断言触发 assertPage', async () => {
    const deps = makeDeps();
    const result = await browserHandle('browser_assert', { selectorVisible: '.btn' }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.passed, true);
  });

  test('noErrors=true 断言触发 assertPage', async () => {
    const deps = makeDeps();
    const result = await browserHandle('browser_assert', { noErrors: true }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.passed, true);
  });
});

// ============================================================
// browser_click — 参数验证
// ============================================================

describe('browser_click', () => {
  test('无 selector 返回 mcpParamMissing', async () => {
    const deps = makeDeps();
    const result = await browserHandle('browser_click', {}, deps);
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('selector'));
    assert.ok(result.content[0].text.includes('browser_click'));
  });

  test('多元素匹配返回 MULTIPLE_ELEMENTS 错误', async () => {
    const deps = makeDeps({
      target: makeFakeTarget({
        locator: () => ({
          count: async () => 3,
          nth: (i) => ({
            textContent: async () => `元素 ${i}`,
            evaluate: async () => 'div',
            getAttribute: async () => '/link'
          })
        })
      })
    });
    const result = await browserHandle('browser_click', { selector: '.btn' }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.error, 'MULTIPLE_ELEMENTS');
    assert.equal(parsed.matchedCount, 3);
    assert.ok(parsed.elements.length <= 5);
  });

  test('多元素匹配 + index 参数时跳过 MULTIPLE_ELEMENTS 错误', async () => {
    let clickCalled = false;
    const deps = makeDeps({
      target: makeFakeTarget({
        locator: () => ({
          count: async () => 3,
          nth: () => ({
            click: async () => { clickCalled = true; },
            textContent: async () => '',
            evaluate: async () => 'div',
            getAttribute: async () => null
          })
        })
      })
    });
    const result = await browserHandle('browser_click', { selector: '.btn', index: 1 }, deps);
    // 应该尝试点击第 index 个元素，而非返回 MULTIPLE_ELEMENTS
    assert.equal(clickCalled, true);
  });
});

// ============================================================
// browser_hover — 参数验证
// ============================================================

describe('browser_hover', () => {
  test('无 selector 返回 mcpParamMissing', async () => {
    const deps = makeDeps();
    const result = await browserHandle('browser_hover', {}, deps);
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('selector'));
  });
});

// ============================================================
// browser_type — 参数验证
// ============================================================

describe('browser_type', () => {
  test('无 selector 返回 mcpParamMissing', async () => {
    const deps = makeDeps();
    const result = await browserHandle('browser_type', { text: 'hello' }, deps);
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('selector'));
  });
});

// ============================================================
// browser_press_key — 参数验证
// ============================================================

describe('browser_press_key', () => {
  test('无 key 返回 mcpParamMissing', async () => {
    const deps = makeDeps();
    const result = await browserHandle('browser_press_key', {}, deps);
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('key'));
  });
});

// ============================================================
// browser_highlight — 参数验证
// ============================================================

describe('browser_highlight', () => {
  test('无 selector 返回 mcpParamMissing', async () => {
    const deps = makeDeps();
    const result = await browserHandle('browser_highlight', {}, deps);
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('selector'));
  });
});

// ============================================================
// browser_smart_fill — 参数验证
// ============================================================

describe('browser_smart_fill', () => {
  test('无 selector 返回 mcpParamMissing', async () => {
    const deps = makeDeps();
    const result = await browserHandle('browser_smart_fill', {}, deps);
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('selector'));
  });
});

// ============================================================
// browser_open — 基本 mock 验证
// ============================================================

describe('browser_open', () => {
  test('无 url 时仍能调用（复用现有页面）', async () => {
    const deps = makeDeps();
    const result = await browserHandle('browser_open', {}, deps);
    assert.equal(typeof result, 'string');
    assert.ok(result.includes('已打开') || result.includes('已复用'));
  });

  test('指定 url 时调用 target.goto', async () => {
    let gotoCalled = false;
    let receivedUrl = null;
    const deps = makeDeps({
      target: makeFakeTarget({
        url: () => 'about:blank',
        goto: async (url) => {
          gotoCalled = true;
          receivedUrl = url;
        }
      }),
      ensurePage: async () => ({
        target: makeFakeTarget({
          url: () => 'about:blank',
          goto: async (url) => {
            gotoCalled = true;
            receivedUrl = url;
          }
        }),
        reused: false,
        sessionId: 'test'
      })
    });
    const result = await browserHandle('browser_open', { url: 'http://test.example.com' }, deps);
    assert.equal(gotoCalled, true);
    assert.equal(receivedUrl, 'http://test.example.com');
  });
});

// ============================================================
// browser_events_clear — 调用 clearBrowserEvents
// ============================================================

describe('browser_events_clear', () => {
  test('调用 clearBrowserEvents 并返回结果', async () => {
    let clearCalled = false;
    const deps = makeDeps({
      clearBrowserEvents: async () => {
        clearCalled = true;
        return { cleared: true, count: 5 };
      }
    });
    const result = await browserHandle('browser_events_clear', {}, deps);
    const parsed = parseResult(result);
    assert.equal(clearCalled, true);
    assert.equal(parsed.cleared, true);
    assert.equal(parsed.count, 5);
  });
});

// ============================================================
// browser_flow — 调用 runFlow
// ============================================================

describe('browser_flow', () => {
  test('调用 runFlow 并返回结果', async () => {
    let flowCalled = false;
    let receivedArgs = null;
    const deps = makeDeps({
      runFlow: async (target, args) => {
        flowCalled = true;
        receivedArgs = args;
        return { steps: [{ name: 'step1', passed: true }], passed: true, total: 1 };
      }
    });
    const result = await browserHandle('browser_flow', { steps: [{ type: 'click', selector: '.btn' }] }, deps);
    const parsed = parseResult(result);
    assert.equal(flowCalled, true);
    assert.ok(receivedArgs.steps);
    assert.equal(parsed.passed, true);
  });
});

// ============================================================
// browser_instrument — 调用 installInstrumentation
// ============================================================

describe('browser_instrument', () => {
  test('调用 installInstrumentation 并返回结果', async () => {
    let installCalled = false;
    const deps = makeDeps({
      installInstrumentation: async () => {
        installCalled = true;
        return { installed: true, hooks: ['click', 'input', 'navigation'] };
      }
    });
    const result = await browserHandle('browser_instrument', {}, deps);
    const parsed = parseResult(result);
    assert.equal(installCalled, true);
    assert.equal(parsed.installed, true);
    assert.ok(Array.isArray(parsed.hooks));
  });
});

// ============================================================
// browser_events — 调用 getBrowserEvents
// ============================================================

describe('browser_events', () => {
  test('调用 getBrowserEvents 并返回事件列表', async () => {
    let eventsCalled = false;
    const deps = makeDeps({
      getBrowserEvents: async () => {
        eventsCalled = true;
        return { events: [{ type: 'click', timestamp: 123 }], total: 1 };
      }
    });
    const result = await browserHandle('browser_events', {}, deps);
    const parsed = parseResult(result);
    assert.equal(eventsCalled, true);
    assert.equal(parsed.total, 1);
    assert.equal(parsed.events.length, 1);
  });
});

// ============================================================
// 未知工具
// ============================================================

describe('未知工具', () => {
  test('返回 mcpError 且包含工具名', async () => {
    const deps = makeDeps();
    const result = await browserHandle('nonexistent_tool', {}, deps);
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('nonexistent_tool'));
    assert.ok(result.content[0].text.includes('未知工具'));
    assert.ok(result.content[0].text.includes('browser'));
  });
});
