'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { handle: diagnoseHandle } = require('../handlers/diagnose');

// ============================================================
// 辅助函数：创建 mock deps 对象
// ============================================================

function makeTextFn() {
  return (str) => str;
}

function makeDeps(overrides = {}) {
  return {
    page: null,
    browser: null,
    browserSessionId: null,
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
    ensurePage: overrides.ensurePage || (async () => ({ target: { url: () => 'http://example.com' } })),
    evidenceCollector: overrides.evidenceCollector || {
      collectEvidence: async () => ({ evidence: { console: { recent: [] } } })
    },
    errorAggregator: overrides.errorAggregator || {
      aggregateErrors: (evidence) => ({ topErrors: [], summary: 'pass', uniqueCount: 0, totalCount: 0 }),
      errorSummaryMd: (evidence) => '## Error Summary\n- Status: pass'
    },
    mcpError: (msg, extra) => ({ content: [{ type: 'text', text: msg }], isError: true, ...(extra || {}) }),
    ...overrides,
  };
}

function parseResult(result) {
  // result 是 text(str) 的返回值，即字符串
  if (typeof result !== 'string') {
    throw new Error(`Expected string result, got ${typeof result}: ${JSON.stringify(result)}`);
  }
  try {
    return JSON.parse(result);
  } catch (_) {
    return result;
  }
}

// v1.10.0: error_fix_suggestion 已移除（别名 → error_analyze mode=fix）

// v1.10.0: error_summary_md 已移除（别名 → error_analyze mode=summary）
// v1.10.0: browser_errors_aggregate 已移除（别名 → browser_errors mode=aggregate）

// ============================================================
// 未知工具
// ============================================================

describe('未知工具', () => {
  test('返回 mcpError 且包含工具名', async () => {
    const deps = makeDeps();
    const result = await diagnoseHandle('nonexistent_tool', {}, deps);
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('nonexistent_tool'));
    assert.ok(result.content[0].text.includes('未知工具'));
    assert.ok(result.content[0].text.includes('diagnose'));
  });
});
