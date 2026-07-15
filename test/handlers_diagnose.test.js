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

// ============================================================
// error_fix_suggestion — 纯模式匹配，无需 page
// ============================================================

describe('error_fix_suggestion', () => {
  test('404 错误匹配 404_not_found 模式', async () => {
    const deps = makeDeps();
    const result = await diagnoseHandle('error_fix_suggestion', { errorSummary: 'GET /api/users 404 Not Found' }, deps);
    const parsed = parseResult(result);
    assert.ok(parsed.matchedPatterns.includes('404_not_found'));
    assert.ok(parsed.suggestions.length > 0);
    assert.ok(parsed.totalSuggestions > 0);
    assert.equal(parsed.errorSummary, 'GET /api/users 404 Not Found');
    assert.ok(parsed.generatedAt);
  });

  test('401 错误匹配 401_unauthorized 模式', async () => {
    const deps = makeDeps();
    const result = await diagnoseHandle('error_fix_suggestion', { errorSummary: 'Request failed with 401 Unauthorized' }, deps);
    const parsed = parseResult(result);
    assert.ok(parsed.matchedPatterns.includes('401_unauthorized'));
    assert.ok(parsed.suggestions.some(s => s.relatedTool === 'browser_cookies'));
  });

  test('500 错误匹配 5xx_server_error 模式', async () => {
    const deps = makeDeps();
    const result = await diagnoseHandle('error_fix_suggestion', { errorSummary: '500 Internal Server Error' }, deps);
    const parsed = parseResult(result);
    assert.ok(parsed.matchedPatterns.includes('5xx_server_error'));
  });

  test('CORS 错误匹配 cors_cross_origin 模式', async () => {
    const deps = makeDeps();
    const result = await diagnoseHandle('error_fix_suggestion', { errorSummary: "blocked by CORS policy: No 'Access-Control-Allow-Origin'" }, deps);
    const parsed = parseResult(result);
    assert.ok(parsed.matchedPatterns.includes('cors_cross_origin'));
  });

  test('TypeError 匹配 type_error_undefined 模式', async () => {
    const deps = makeDeps();
    const result = await diagnoseHandle('error_fix_suggestion', { errorSummary: 'TypeError: Cannot read properties of undefined' }, deps);
    const parsed = parseResult(result);
    assert.ok(parsed.matchedPatterns.includes('type_error_undefined'));
  });

  test('超时错误匹配 timeout 模式', async () => {
    const deps = makeDeps();
    const result = await diagnoseHandle('error_fix_suggestion', { errorSummary: 'Request timeout: ETIMEDOUT' }, deps);
    const parsed = parseResult(result);
    assert.ok(parsed.matchedPatterns.includes('timeout'));
  });

  test('元素未找到匹配 element_not_found 模式', async () => {
    const deps = makeDeps();
    const result = await diagnoseHandle('error_fix_suggestion', { errorSummary: 'element not found: .submit-btn' }, deps);
    const parsed = parseResult(result);
    assert.ok(parsed.matchedPatterns.includes('element_not_found'));
  });

  test('WebSocket 错误匹配 websocket_error 模式', async () => {
    const deps = makeDeps();
    const result = await diagnoseHandle('error_fix_suggestion', { errorSummary: 'WebSocket connection failed: wss://example.com/ws' }, deps);
    const parsed = parseResult(result);
    assert.ok(parsed.matchedPatterns.includes('websocket_error'));
  });

  test('SQL UndefinedColumn 匹配 sql_undefined_column 模式', async () => {
    const deps = makeDeps();
    const result = await diagnoseHandle('error_fix_suggestion', { errorSummary: 'UndefinedColumn: column "payout_status" does not exist' }, deps);
    const parsed = parseResult(result);
    assert.ok(parsed.matchedPatterns.includes('sql_undefined_column'));
  });

  test('Python ImportError 匹配 python_import_error 模式', async () => {
    const deps = makeDeps();
    const result = await diagnoseHandle('error_fix_suggestion', { errorSummary: 'ModuleNotFoundError: No module named "fastapi"' }, deps);
    const parsed = parseResult(result);
    assert.ok(parsed.matchedPatterns.includes('python_import_error'));
  });

  test('端口冲突匹配 port_conflict 模式', async () => {
    const deps = makeDeps();
    const result = await diagnoseHandle('error_fix_suggestion', { errorSummary: 'Error: EADDRINUSE port 3000 already in use' }, deps);
    const parsed = parseResult(result);
    assert.ok(parsed.matchedPatterns.includes('port_conflict'));
  });

  test('未知错误返回默认建议', async () => {
    const deps = makeDeps();
    const result = await diagnoseHandle('error_fix_suggestion', { errorSummary: '一些完全无法识别的随机错误文本 xyz123' }, deps);
    const parsed = parseResult(result);
    assert.deepEqual(parsed.matchedPatterns, []);
    assert.equal(parsed.suggestions.length, 3);  // 默认 3 条建议
    assert.ok(parsed.suggestions.some(s => s.relatedTool === 'browser_errors'));
  });

  test('maxSuggestions 限制返回数量', async () => {
    const deps = makeDeps();
    // CORS 有 4 条建议，限制为 2
    const result = await diagnoseHandle('error_fix_suggestion', {
      errorSummary: "CORS policy: No 'Access-Control-Allow-Origin'",
      maxSuggestions: 2
    }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.suggestions.length, 2);
    assert.equal(parsed.totalSuggestions, 2);
  });

  test('errorSummary 为对象时 JSON.stringify 处理', async () => {
    const deps = makeDeps();
    const result = await diagnoseHandle('error_fix_suggestion', {
      errorSummary: { code: 404, message: 'Not Found' }
    }, deps);
    const parsed = parseResult(result);
    assert.ok(parsed.matchedPatterns.includes('404_not_found'));
  });

  test('空 errorSummary 返回默认建议', async () => {
    const deps = makeDeps();
    const result = await diagnoseHandle('error_fix_suggestion', { errorSummary: '' }, deps);
    const parsed = parseResult(result);
    assert.deepEqual(parsed.matchedPatterns, []);
    assert.equal(parsed.suggestions.length, 3);
  });

  test('建议按 confidence 降序排序', async () => {
    const deps = makeDeps();
    const result = await diagnoseHandle('error_fix_suggestion', {
      errorSummary: '404 Not Found timeout'
    }, deps);
    const parsed = parseResult(result);
    // 404 + timeout 都匹配，建议合并后按 confidence 排序
    for (let i = 1; i < parsed.suggestions.length; i++) {
      assert.ok(parsed.suggestions[i - 1].confidence >= parsed.suggestions[i].confidence,
        `建议 ${i - 1} confidence=${parsed.suggestions[i - 1].confidence} 应 >= 建议 ${i} confidence=${parsed.suggestions[i].confidence}`);
    }
  });
});

// ============================================================
// error_summary_md — 使用 args.evidence 跳过 page
// ============================================================

describe('error_summary_md', () => {
  test('使用 args.evidence 直接生成摘要', async () => {
    const deps = makeDeps({
      errorAggregator: {
        errorSummaryMd: (evidence) => `## Error Summary\n- Status: pass\n- evidence: ${JSON.stringify(evidence).length}`
      }
    });
    const evidence = { console: { recent: [{ type: 'error', text: 'test' }] } };
    const result = await diagnoseHandle('error_summary_md', { evidence }, deps);
    assert.equal(typeof result, 'string');
    assert.ok(result.includes('Error Summary'));
    assert.ok(result.includes('Status: pass'));
  });

  test('无 evidence 时调用 evidenceCollector.collectEvidence', async () => {
    let collectCalled = false;
    const deps = makeDeps({
      evidenceCollector: {
        collectEvidence: async () => {
          collectCalled = true;
          return { evidence: { console: { recent: [] } } };
        }
      },
      errorAggregator: {
        errorSummaryMd: () => '## Error Summary\n- Status: pass'
      }
    });
    const result = await diagnoseHandle('error_summary_md', {}, deps);
    assert.equal(collectCalled, true);
    assert.ok(result.includes('Status: pass'));
  });

  test('传递 args 给 collectEvidence', async () => {
    let receivedArgs = null;
    const deps = makeDeps({
      evidenceCollector: {
        collectEvidence: async (args) => {
          receivedArgs = args;
          return { evidence: {} };
        }
      },
      errorAggregator: { errorSummaryMd: () => 'pass' }
    });
    await diagnoseHandle('error_summary_md', { includeWarnings: true, since: 100 }, deps);
    assert.equal(receivedArgs.includeWarnings, true);
    assert.equal(receivedArgs.since, 100);
  });
});

// ============================================================
// browser_errors_aggregate — 使用 args.evidence 跳过 page
// ============================================================

describe('browser_errors_aggregate', () => {
  test('使用 args.evidence 直接聚合', async () => {
    const deps = makeDeps({
      errorAggregator: {
        aggregateErrors: (evidence, args) => ({
          topErrors: [{ signature: 'sig1', count: 2, severity: 2 }],
          summary: 'fail',
          uniqueCount: 1,
          totalCount: 2,
          receivedArgs: args
        })
      }
    });
    const evidence = { console: { recent: [{ type: 'error', text: 'x' }] } };
    const result = await diagnoseHandle('browser_errors_aggregate', { evidence, limit: 10 }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.topErrors.length, 1);
    assert.equal(parsed.uniqueCount, 1);
    assert.equal(parsed.totalCount, 2);
  });

  test('includeCurrentPage=false 时不调用 evidenceCollector', async () => {
    let collectCalled = false;
    const deps = makeDeps({
      evidenceCollector: {
        collectEvidence: async () => {
          collectCalled = true;
          return { evidence: {} };
        }
      },
      errorAggregator: {
        aggregateErrors: () => ({ topErrors: [], summary: 'pass', uniqueCount: 0, totalCount: 0 })
      }
    });
    await diagnoseHandle('browser_errors_aggregate', { includeCurrentPage: false }, deps);
    assert.equal(collectCalled, false);
  });

  test('无 evidence 时调用 evidenceCollector.collectEvidence', async () => {
    let collectCalled = false;
    const deps = makeDeps({
      evidenceCollector: {
        collectEvidence: async () => {
          collectCalled = true;
          return { evidence: { console: { recent: [] } } };
        }
      },
      errorAggregator: {
        aggregateErrors: () => ({ topErrors: [], summary: 'pass', uniqueCount: 0, totalCount: 0 })
      }
    });
    await diagnoseHandle('browser_errors_aggregate', {}, deps);
    assert.equal(collectCalled, true);
  });
});

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
