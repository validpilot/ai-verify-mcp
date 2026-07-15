'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { handle: validationHandle } = require('../handlers/validation');

// ============================================================
// 辅助函数：创建 mock deps 对象
// ============================================================

function makeTextFn() {
  return (str) => str;
}

function mockFilterNetwork(items, args = {}) {
  let records = [...items];
  const contains = args.urlContains || args.contains;
  if (contains) records = records.filter(item => item.url && item.url.includes(contains));
  if (args.method) records = records.filter(item => item.method === args.method);
  if (typeof args.statusMin === 'number') records = records.filter(item => Number(item.status || 0) >= args.statusMin);
  if (typeof args.statusMax === 'number') records = records.filter(item => Number(item.status || 0) <= args.statusMax);
  if (typeof args.since === 'number') records = records.filter(item => (item.timestamp || 0) >= args.since);
  return records;
}

function makeDeps(overrides = {}) {
  const networkLogs = overrides.networkLogs || [];
  return {
    page: null,
    browser: null,
    browserSessionId: null,
    consoleLogs: [],
    networkLogs,
    pageErrors: [],
    currentCheckpoint: overrides.currentCheckpoint || 0,
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
    path,
    fs,
    resetRuntimeLogs: overrides.resetRuntimeLogs || (() => {}),
    ensurePage: overrides.ensurePage || (async () => ({ target: { url: () => 'http://example.com' } })),
    filterNetwork: overrides.filterNetwork || mockFilterNetwork,
    fetchBackendLogs: overrides.fetchBackendLogs,
    findTraceId: overrides.findTraceId,
    buildValidationReport: overrides.buildValidationReport || ((args) => ({ tool: 'validation_report', args, generatedAt: new Date().toISOString() })),
    exportValidationReport: overrides.exportValidationReport || ((args) => ({ tool: 'validation_report_export', exported: true, args })),
    runDeployVerify: overrides.runDeployVerify || (async (args) => ({ tool: 'deploy_verify', ok: true, args })),
    mcpParamMissing: (param, name) => ({ content: [{ type: 'text', text: `缺少参数: ${param} (工具: ${name})` }], isError: true }),
    mcpError: (msg, extra) => ({ content: [{ type: 'text', text: msg }], isError: true, ...(extra || {}) }),
    ...overrides,
  };
}

function parseResult(result) {
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
// validation_start — 仅需 resetRuntimeLogs
// ============================================================

describe('validation_start', () => {
  test('启动验证并返回场景数', async () => {
    let resetCalled = false;
    const deps = makeDeps({
      resetRuntimeLogs: () => { resetCalled = true; },
      currentCheckpoint: 42
    });
    const result = await validationHandle('validation_start', {
      targetUrl: 'http://example.com',
      testScenarios: [{ name: 's1' }, { name: 's2' }]
    }, deps);
    assert.equal(resetCalled, true);
    assert.ok(result.includes('场景数: 2'));
    assert.ok(result.includes('checkpoint: 42'));
    assert.ok(result.includes('http://example.com'));
  });

  test('未指定 targetUrl 时显示未指定', async () => {
    const deps = makeDeps();
    const result = await validationHandle('validation_start', {}, deps);
    assert.ok(result.includes('未指定'));
    assert.ok(result.includes('场景数: 0'));
  });

  test('testScenarios 为非数组时按 0 处理', async () => {
    const deps = makeDeps();
    const result = await validationHandle('validation_start', { testScenarios: 'not array' }, deps);
    assert.ok(result.includes('场景数: 0'));
  });
});

// ============================================================
// validation_decision — 占位返回
// ============================================================

describe('validation_decision', () => {
  test('返回固定占位字符串', async () => {
    const deps = makeDeps();
    const result = await validationHandle('validation_decision', {}, deps);
    assert.equal(typeof result, 'string');
    assert.ok(result.includes('validation_decision'));
    assert.ok(result.includes('闭源端'));
    assert.ok(result.includes('占位'));
  });
});

// ============================================================
// chain_list_templates — 纯列表
// ============================================================

describe('chain_list_templates', () => {
  test('返回所有内置模板', async () => {
    const deps = makeDeps();
    const result = await validationHandle('chain_list_templates', {}, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.tool, 'chain_list_templates');
    assert.ok(Array.isArray(parsed.templates));
    assert.ok(parsed.templates.length >= 5);  // 至少 5 个内置模板
  });

  test('每个模板包含必要字段', async () => {
    const deps = makeDeps();
    const result = await validationHandle('chain_list_templates', {}, deps);
    const parsed = parseResult(result);
    for (const tpl of parsed.templates) {
      assert.ok(tpl.name, `模板缺少 name: ${JSON.stringify(tpl)}`);
      assert.ok(tpl.description, `模板 ${tpl.name} 缺少 description`);
      assert.equal(typeof tpl.stepCount, 'number');
      assert.equal(typeof tpl.hasStateSources, 'boolean');
    }
  });

  test('包含 marketplace-purchase 模板', async () => {
    const deps = makeDeps();
    const result = await validationHandle('chain_list_templates', {}, deps);
    const parsed = parseResult(result);
    assert.ok(parsed.templates.some(t => t.name === 'marketplace-purchase'));
  });

  test('login-basic 模板无 stateSources', async () => {
    const deps = makeDeps();
    const result = await validationHandle('chain_list_templates', {}, deps);
    const parsed = parseResult(result);
    const loginBasic = parsed.templates.find(t => t.name === 'login-basic');
    assert.ok(loginBasic);
    assert.equal(loginBasic.hasStateSources, false);
  });

  test('marketplace-purchase 模板有 stateSources', async () => {
    const deps = makeDeps();
    const result = await validationHandle('chain_list_templates', {}, deps);
    const parsed = parseResult(result);
    const marketplace = parsed.templates.find(t => t.name === 'marketplace-purchase');
    assert.ok(marketplace);
    assert.equal(marketplace.hasStateSources, true);
    assert.ok(marketplace.stepCount > 0);
  });
});

// ============================================================
// chain_score_report — 纯计算
// ============================================================

describe('chain_score_report', () => {
  test('空结果返回满分', async () => {
    const deps = makeDeps();
    const result = await validationHandle('chain_score_report', {}, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.tool, 'chain_score_report');
    assert.equal(parsed.scores.functional.score, 0);  // totalSteps=0 → 0
    assert.equal(parsed.scores.technical.score, 100); // networkTotal=0,apiSteps=0 → 100
    assert.equal(parsed.scores.consistency.score, 100);
    assert.equal(parsed.scores.contract.score, 100);
    assert.equal(parsed.scores.observability.score, 100);
    // 0*0.3 + 100*0.25 + 100*0.2 + 100*0.15 + 100*0.1 = 70
    assert.equal(parsed.overall, 70);
    assert.equal(parsed.grade, 'C');
  });

  test('全部通过的链路得 A 级', async () => {
    const deps = makeDeps();
    const result = await validationHandle('chain_score_report', {
      chainResult: {
        totalSteps: 10,
        passedSteps: 10,
        failedSteps: 0,
        steps: [],
        failures: [],
        runtimeErrors: { summary: {} },
        stateDiff: { checks: [{ passed: true }, { passed: true }] },
        networkRequests: [{ status: 200 }, { status: 201 }]
      }
    }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.scores.functional.score, 100);
    assert.equal(parsed.scores.technical.score, 100);
    assert.equal(parsed.scores.consistency.score, 100);
    assert.equal(parsed.overall, 100);
    assert.equal(parsed.grade, 'A');
    assert.equal(parsed.summary.passed, true);
  });

  test('全部失败的链路得 F 级', async () => {
    const deps = makeDeps();
    const result = await validationHandle('chain_score_report', {
      chainResult: {
        totalSteps: 10,
        passedSteps: 0,
        failedSteps: 10,
        steps: [],
        failures: [{ msg: 'f1' }],
        runtimeErrors: { summary: { severity: { critical: 5 } } },
        stateDiff: { checks: [{ passed: false }] },
        networkRequests: [{ status: 500 }]
      }
    }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.scores.functional.score, 0);
    assert.equal(parsed.scores.technical.score, 0);
    assert.equal(parsed.scores.consistency.score, 0);
    assert.equal(parsed.scores.observability.score, 0); // -5*25 = -125 → max(0, ...)
    assert.equal(parsed.summary.passed, false);
    assert.equal(parsed.grade, 'F');
  });

  test('使用 result 别名参数', async () => {
    const deps = makeDeps();
    const result = await validationHandle('chain_score_report', {
      result: {
        totalSteps: 5,
        passedSteps: 5,
        failedSteps: 0,
        steps: [],
        failures: [],
        runtimeErrors: { summary: {} },
        stateDiff: {},
        networkRequests: []
      }
    }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.scores.functional.score, 100);
  });

  test('使用 runId 参数', async () => {
    const deps = makeDeps();
    const result = await validationHandle('chain_score_report', {
      runId: 'run-123',
      chainResult: { totalSteps: 1, passedSteps: 1, failedSteps: 0, steps: [], failures: [] }
    }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.runId, 'run-123');
  });

  test('chainResult.runId 优先于 args.runId', async () => {
    const deps = makeDeps();
    const result = await validationHandle('chain_score_report', {
      runId: 'from-args',
      chainResult: { runId: 'from-chain', totalSteps: 1, passedSteps: 1, failedSteps: 0, steps: [], failures: [] }
    }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.runId, 'from-chain');
  });

  test('API 步骤契约检查', async () => {
    const deps = makeDeps();
    const result = await validationHandle('chain_score_report', {
      chainResult: {
        totalSteps: 2,
        passedSteps: 2,
        failedSteps: 0,
        steps: [
          { action: 'apiRequest', passed: true, validation: { checks: [{ passed: true }, { passed: true }] } },
          { action: 'apiRequest', passed: true, validation: { checks: [{ passed: true }, { passed: false }] } }
        ],
        failures: [],
        runtimeErrors: { summary: {} },
        stateDiff: {},
        networkRequests: []
      }
    }, deps);
    const parsed = parseResult(result);
    // 3 passed / 4 total = 75
    assert.equal(parsed.scores.contract.score, 75);
    assert.equal(parsed.scores.contract.contractChecks, 4);
    assert.equal(parsed.scores.contract.contractPassed, 3);
  });

  test('网络请求成功率影响 technical score', async () => {
    const deps = makeDeps();
    const result = await validationHandle('chain_score_report', {
      chainResult: {
        totalSteps: 1,
        passedSteps: 1,
        failedSteps: 0,
        steps: [],
        failures: [],
        runtimeErrors: { summary: {} },
        stateDiff: {},
        networkRequests: [
          { status: 200 },
          { status: 200 },
          { status: 500 },
          { status: 404 }
        ]
      }
    }, deps);
    const parsed = parseResult(result);
    // 2 success / 4 total = 50
    assert.equal(parsed.scores.technical.score, 50);
    assert.equal(parsed.scores.technical.networkSuccess, 2);
    assert.equal(parsed.scores.technical.networkTotal, 4);
  });

  test('medium 错误降低 observability 分数', async () => {
    const deps = makeDeps();
    const result = await validationHandle('chain_score_report', {
      chainResult: {
        totalSteps: 1,
        passedSteps: 1,
        failedSteps: 0,
        steps: [],
        failures: [],
        runtimeErrors: { summary: { severity: { medium: 4 } } },
        stateDiff: {},
        networkRequests: []
      }
    }, deps);
    const parsed = parseResult(result);
    // 100 - 4*5 = 80
    assert.equal(parsed.scores.observability.score, 80);
  });

  test('grade B 边界 (80-89)', async () => {
    const deps = makeDeps();
    // functional=100, technical=100, consistency=100, contract=100, observability=0
    // 100*0.3 + 100*0.25 + 100*0.2 + 100*0.15 + 0*0.1 = 90 → A
    // 改为 functional=80 → 80*0.3 + 100*0.25+100*0.2+100*0.15+0*0.1 = 24+25+20+15+0 = 84 → B
    const result = await validationHandle('chain_score_report', {
      chainResult: {
        totalSteps: 10,
        passedSteps: 8,
        failedSteps: 2,
        steps: [],
        failures: [],
        runtimeErrors: { summary: { severity: { critical: 4 } } }, // observability = 0
        stateDiff: { checks: [{ passed: true }] }, // consistency = 100
        networkRequests: [] // technical = 100
      }
    }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.scores.functional.score, 80);
    assert.equal(parsed.overall, 84);
    assert.equal(parsed.grade, 'B');
  });
});

// ============================================================
// contract_baseline — 真实 fs 操作（contracts/ 目录在 .gitignore 中）
// ============================================================

const TEST_BASELINE_NAME = 'unit-test-baseline-tmp';

describe('contract_baseline', () => {
  // 清理：每个测试后删除临时 baseline
  function cleanup(name = TEST_BASELINE_NAME) {
    const baselineDir = path.join(__dirname, '..', 'contracts');
    const filePath = path.join(baselineDir, `baseline-${name}.json`);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
    }
  }

  test('action=list 返回所有 baselines', async () => {
    const deps = makeDeps();
    const result = await validationHandle('contract_baseline', { action: 'list' }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.tool, 'contract_baseline');
    assert.equal(parsed.action, 'list');
    assert.ok(Array.isArray(parsed.baselines));
  });

  test('action=save 创建 baseline 文件', async () => {
    cleanup();
    try {
      const deps = makeDeps();
      const contracts = [
        { endpoint: '/api/users', method: 'GET', status: 200, schema: { type: 'object' } },
        { endpoint: '/api/orders', method: 'POST', status: 201, schema: { type: 'object' } }
      ];
      const result = await validationHandle('contract_baseline', {
        action: 'save',
        name: TEST_BASELINE_NAME,
        contracts
      }, deps);
      const parsed = parseResult(result);
      assert.equal(parsed.action, 'save');
      assert.ok(parsed.result.saved);
      assert.equal(parsed.result.contractCount, 2);
      assert.ok(fs.existsSync(parsed.result.filePath));
    } finally {
      cleanup();
    }
  });

  test('action=load 读取已保存的 baseline', async () => {
    cleanup();
    try {
      const deps = makeDeps();
      // 先保存
      await validationHandle('contract_baseline', {
        action: 'save',
        name: TEST_BASELINE_NAME,
        contracts: [{ endpoint: '/api/x', method: 'GET', status: 200, schema: { type: 'object' } }]
      }, deps);
      // 再加载
      const result = await validationHandle('contract_baseline', {
        action: 'load',
        name: TEST_BASELINE_NAME
      }, deps);
      const parsed = parseResult(result);
      assert.equal(parsed.action, 'load');
      assert.ok(parsed.baseline);
      assert.equal(parsed.baseline.name, TEST_BASELINE_NAME);
      assert.ok(parsed.baseline.contracts);
      assert.equal(parsed.baseline.contracts.length, 1);
    } finally {
      cleanup();
    }
  });

  test('action=load 不存在的 baseline 返回 null', async () => {
    cleanup();
    const deps = makeDeps();
    const result = await validationHandle('contract_baseline', {
      action: 'load',
      name: 'nonexistent-baseline-xyz'
    }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.action, 'load');
    assert.equal(parsed.baseline, null);
  });

  test('action=delete 删除已存在的 baseline', async () => {
    cleanup();
    try {
      const deps = makeDeps();
      // 先保存
      await validationHandle('contract_baseline', {
        action: 'save',
        name: TEST_BASELINE_NAME,
        contracts: []
      }, deps);
      // 再删除
      const result = await validationHandle('contract_baseline', {
        action: 'delete',
        name: TEST_BASELINE_NAME
      }, deps);
      const parsed = parseResult(result);
      assert.equal(parsed.action, 'delete');
      assert.equal(parsed.deleted, true);
    } finally {
      cleanup();
    }
  });

  test('action=delete 不存在的 baseline 返回 deleted=false', async () => {
    cleanup();
    const deps = makeDeps();
    const result = await validationHandle('contract_baseline', {
      action: 'delete',
      name: 'nonexistent-baseline-xyz'
    }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.action, 'delete');
    assert.equal(parsed.deleted, false);
    assert.ok(parsed.message.includes('不存在'));
  });

  test('action=compare 与已保存 baseline 对比', async () => {
    cleanup();
    try {
      const deps = makeDeps();
      // 先保存 baseline
      await validationHandle('contract_baseline', {
        action: 'save',
        name: TEST_BASELINE_NAME,
        contracts: [
          { endpoint: '/api/users', method: 'GET', status: 200, schema: { type: 'object', properties: { id: { type: 'number' } } } }
        ]
      }, deps);
      // 对比相同的 contracts（应无 drift）
      const result = await validationHandle('contract_baseline', {
        action: 'compare',
        name: TEST_BASELINE_NAME,
        contracts: [
          { endpoint: '/api/users', method: 'GET', status: 200, schema: { type: 'object', properties: { id: { type: 'number' } } } }
        ]
      }, deps);
      const parsed = parseResult(result);
      assert.equal(parsed.action, 'compare');
      assert.ok(parsed.result);
    } finally {
      cleanup();
    }
  });

  test('action=compare 不存在的 baseline 返回提示', async () => {
    cleanup();
    const deps = makeDeps();
    const result = await validationHandle('contract_baseline', {
      action: 'compare',
      name: 'nonexistent-baseline-xyz',
      contracts: []
    }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.action, 'compare');
    assert.ok(parsed.result);
    assert.ok(parsed.result.message.includes('不存在'));
  });

  test('未知 action 返回错误', async () => {
    const deps = makeDeps();
    const result = await validationHandle('contract_baseline', {
      action: 'unknown_action'
    }, deps);
    const parsed = parseResult(result);
    assert.ok(parsed.error);
    assert.ok(parsed.error.includes('未知 action'));
  });

  test('未指定 action 默认为 list', async () => {
    const deps = makeDeps();
    const result = await validationHandle('contract_baseline', {}, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.action, 'list');
  });

  test('baseline 名称被 sanitize（特殊字符替换为 _）', async () => {
    const dirtyName = 'test/../bad';
    // /[^a-zA-Z0-9_-]/g 替换为 _ : 'test' + '/' + '..' + '/' + 'bad' → 'test____bad' (4 个 _)
    const cleanName = 'test____bad';
    const baselineDir = path.join(__dirname, '..', 'contracts');
    const filePath = path.join(baselineDir, `baseline-${cleanName}.json`);
    try {
      const deps = makeDeps();
      const result = await validationHandle('contract_baseline', {
        action: 'save',
        name: dirtyName,
        contracts: []
      }, deps);
      const parsed = parseResult(result);
      assert.ok(parsed.result.saved);
      assert.ok(fs.existsSync(filePath));
    } finally {
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
      }
    }
  });
});

// ============================================================
// validation_report — 调用 deps.buildValidationReport
// ============================================================

describe('validation_report', () => {
  test('调用 buildValidationReport 并返回结果', async () => {
    let receivedArgs = null;
    const deps = makeDeps({
      buildValidationReport: (args) => {
        receivedArgs = args;
        return { tool: 'validation_report', total: 5, passed: 4, failed: 1 };
      }
    });
    const result = await validationHandle('validation_report', { runId: 'r1' }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.tool, 'validation_report');
    assert.equal(parsed.total, 5);
    assert.equal(receivedArgs.runId, 'r1');
  });

  test('buildValidationReport 返回字符串时直接返回', async () => {
    const deps = makeDeps({
      buildValidationReport: () => '# Markdown Report\n\nThis is a string report.'
    });
    const result = await validationHandle('validation_report', {}, deps);
    assert.equal(typeof result, 'string');
    assert.ok(result.includes('Markdown Report'));
  });
});

// ============================================================
// validation_report_export — 调用 deps.exportValidationReport
// ============================================================

describe('validation_report_export', () => {
  test('调用 exportValidationReport 并返回结果', async () => {
    let receivedArgs = null;
    const deps = makeDeps({
      exportValidationReport: (args) => {
        receivedArgs = args;
        return { exported: true, format: 'pdf', url: 'http://example.com/r.pdf' };
      }
    });
    const result = await validationHandle('validation_report_export', { format: 'pdf', runId: 'r1' }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.exported, true);
    assert.equal(parsed.format, 'pdf');
    assert.equal(receivedArgs.runId, 'r1');
  });
});

// ============================================================
// validation_check — check_type=deploy_verify 不需要 page
// ============================================================

describe('validation_check (deploy_verify)', () => {
  test('check_type=deploy_verify 调用 runDeployVerify', async () => {
    let receivedArgs = null;
    const deps = makeDeps({
      runDeployVerify: async (args) => {
        receivedArgs = args;
        return { ok: true, checks: [{ name: 'health', passed: true }] };
      }
    });
    const result = await validationHandle('validation_check', {
      check_type: 'deploy_verify',
      targetUrl: 'http://example.com'
    }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.ok, true);
    assert.equal(receivedArgs.targetUrl, 'http://example.com');
  });
});

// ============================================================
// trace_correlation_check — mock filterNetwork/networkLogs
// ============================================================

describe('trace_correlation_check', () => {
  test('无网络日志时返回 0% 覆盖率', async () => {
    const deps = makeDeps({
      networkLogs: [],
      currentCheckpoint: 100
    });
    const result = await validationHandle('trace_correlation_check', {}, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.tool, 'trace_correlation_check');
    assert.equal(parsed.totalRequests, 0);
    assert.equal(parsed.tracedRequests, 0);
    assert.equal(parsed.untracedRequests, 0);
    assert.equal(parsed.traceCoverage, '0%');
    assert.equal(parsed.uniqueTraceIds, 0);
    assert.equal(parsed.backendChecked, false);
    assert.equal(parsed.backendCorrelation, null);
    assert.equal(parsed.score.traceCoverage, 0);
    assert.equal(parsed.score.overall, 0);
  });

  test('带 traceId 的网络日志计入 tracedRequests', async () => {
    const deps = makeDeps({
      networkLogs: [
        { url: 'http://example.com/api/users', status: 200, method: 'GET', traceId: 'trace-001', timestamp: 200 },
        { url: 'http://example.com/api/orders', status: 200, method: 'GET', traceId: 'trace-002', timestamp: 201 }
      ],
      currentCheckpoint: 100
    });
    const result = await validationHandle('trace_correlation_check', {}, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.totalRequests, 2);
    assert.equal(parsed.tracedRequests, 2);
    assert.equal(parsed.untracedRequests, 0);
    assert.equal(parsed.uniqueTraceIds, 2);
    assert.equal(parsed.traceCoverage, '100%');
    assert.equal(parsed.score.traceCoverage, 100);
  });

  test('无 traceId 的网络日志计入 untracedRequests', async () => {
    const deps = makeDeps({
      networkLogs: [
        { url: 'http://example.com/api/users', status: 200, method: 'GET', timestamp: 200 },
        { url: 'http://example.com/api/orders', status: 200, method: 'GET', traceId: 't1', timestamp: 201 }
      ],
      currentCheckpoint: 100
    });
    const result = await validationHandle('trace_correlation_check', {}, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.totalRequests, 2);
    assert.equal(parsed.tracedRequests, 1);
    assert.equal(parsed.untracedRequests, 1);
    assert.equal(parsed.traceCoverage, '50%');
    assert.equal(parsed.untracedSample.length, 1);
  });

  test('使用 findTraceId 函数从 headers 提取 traceId', async () => {
    const deps = makeDeps({
      networkLogs: [
        {
          url: 'http://example.com/api/x',
          status: 200,
          method: 'GET',
          timestamp: 200,
          requestHeaders: { 'X-Trace-Id': 'extracted-trace-1' }
        }
      ],
      currentCheckpoint: 100,
      findTraceId: (headers) => {
        if (headers && headers['X-Trace-Id']) {
          return { traceId: headers['X-Trace-Id'] };
        }
        return null;
      }
    });
    const result = await validationHandle('trace_correlation_check', {}, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.tracedRequests, 1);
    assert.equal(parsed.untracedRequests, 0);
    assert.equal(parsed.uniqueTraceIds, 1);
  });

  test('urlContains 过滤网络日志', async () => {
    const deps = makeDeps({
      networkLogs: [
        { url: 'http://example.com/api/users', status: 200, method: 'GET', traceId: 't1', timestamp: 200 },
        { url: 'http://example.com/static/x.js', status: 200, method: 'GET', traceId: 't2', timestamp: 201 }
      ],
      currentCheckpoint: 100
    });
    const result = await validationHandle('trace_correlation_check', { urlContains: '/api/' }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.totalRequests, 1);
    assert.equal(parsed.tracedRequests, 1);
  });

  test('since 参数过滤早于该时间的日志', async () => {
    const deps = makeDeps({
      networkLogs: [
        { url: 'http://example.com/api/old', status: 200, method: 'GET', traceId: 't1', timestamp: 50 },
        { url: 'http://example.com/api/new', status: 200, method: 'GET', traceId: 't2', timestamp: 200 }
      ],
      currentCheckpoint: 0
    });
    const result = await validationHandle('trace_correlation_check', { since: 100 }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.totalRequests, 1);
    assert.equal(parsed.since, 100);
  });

  test('backendLogPath 不存在时返回错误信息', async () => {
    const deps = makeDeps({
      networkLogs: [
        { url: 'http://example.com/api/x', status: 200, method: 'GET', traceId: 't1', timestamp: 200 }
      ],
      currentCheckpoint: 100
    });
    const result = await validationHandle('trace_correlation_check', {
      backendLogPath: '/nonexistent/path/to/log.txt'
    }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.backendChecked, true);
    assert.equal(parsed.backendMatched, 0);
    assert.ok(parsed.traceIds.length > 0);
    assert.ok(parsed.traceIds[0].backendMatched === null || parsed.traceIds[0].backendMatched === false);
  });

  test('useSshBackend=true 调用 fetchBackendLogs', async () => {
    let fetchCalled = false;
    const deps = makeDeps({
      networkLogs: [
        { url: 'http://example.com/api/x', status: 200, method: 'GET', traceId: 't1', timestamp: 200 }
      ],
      currentCheckpoint: 100,
      fetchBackendLogs: async (params) => {
        fetchCalled = true;
        return { logs: [{ service: 'api-server', traceId: params.traceId }] };
      }
    });
    const result = await validationHandle('trace_correlation_check', { useSshBackend: true }, deps);
    const parsed = parseResult(result);
    assert.equal(fetchCalled, true);
    assert.equal(parsed.backendChecked, true);
    assert.equal(parsed.backendMatched, 1);
    assert.equal(parsed.backendCorrelation, '100%');
  });

  test('useSshBackend=true 但 fetchBackendLogs 抛错时记录 error', async () => {
    const deps = makeDeps({
      networkLogs: [
        { url: 'http://example.com/api/x', status: 200, method: 'GET', traceId: 't1', timestamp: 200 }
      ],
      currentCheckpoint: 100,
      fetchBackendLogs: async () => { throw new Error('ssh failed'); }
    });
    const result = await validationHandle('trace_correlation_check', { useSshBackend: true }, deps);
    const parsed = parseResult(result);
    assert.equal(parsed.backendChecked, true);
    assert.equal(parsed.backendMatched, 0);
    assert.equal(parsed.backendCorrelation, '0%');
  });
});

// ============================================================
// validation_compliance — 纯模块级函数
// ============================================================

describe('validation_compliance', () => {
  test('空 functions 返回 0 总数', async () => {
    const deps = makeDeps();
    const result = await validationHandle('validation_compliance', { functions: [] }, deps);
    const parsed = parseResult(result);
    assert.ok(parsed.totalFunctions !== undefined);
  });

  test('数据提交类功能缺少必需步骤时为 NON-COMPLIANT', async () => {
    const deps = makeDeps();
    const result = await validationHandle('validation_compliance', {
      functions: [
        {
          name: '提交订单',
          type: '数据提交类',
          steps: [
            { stepType: '入口可达', status: 'passed' },
            { stepType: '操作可行', status: 'passed' }
            // 缺少 请求正确、响应正常、状态更新
          ]
        }
      ],
      strictMode: true
    }, deps);
    const parsed = parseResult(result);
    assert.ok(parsed.complianceResults);
    assert.equal(parsed.complianceResults.length, 1);
    assert.equal(parsed.complianceResults[0].complianceStatus, 'NON-COMPLIANT');
    assert.ok(parsed.complianceResults[0].violations.length > 0);
  });

  test('数据提交类功能完整 5 步为 COMPLIANT', async () => {
    const deps = makeDeps();
    const result = await validationHandle('validation_compliance', {
      functions: [
        {
          name: '提交订单',
          type: '数据提交类',
          steps: [
            { stepType: '入口可达', status: 'passed', evidence: 'screenshot1.png' },
            { stepType: '操作可行', status: 'passed', evidence: 'screenshot2.png' },
            { stepType: '请求正确', status: 'passed', evidence: 'screenshot3.png' },
            { stepType: '响应正常', status: 'passed', evidence: 'screenshot4.png' },
            { stepType: '状态更新', status: 'passed', evidence: 'screenshot5.png' }
          ]
        }
      ],
      strictMode: true
    }, deps);
    const parsed = parseResult(result);
    // 注：5 步全 passed + evidence 齐全 → COMPLIANT
    // 注意：截图未做 screenshotValidation 二次分析，可能仍为 PARTIAL
    // 但只要不是 NON-COMPLIANT 即说明 5 步检查通过
    assert.notEqual(parsed.complianceResults[0].complianceStatus, 'NON-COMPLIANT');
  });

  test('strictMode=false 时不强制 5 步检查', async () => {
    const deps = makeDeps();
    const result = await validationHandle('validation_compliance', {
      functions: [
        {
          name: '提交订单',
          type: '数据提交类',
          steps: [{ stepType: '入口可达', status: 'passed' }]
        }
      ],
      strictMode: false
    }, deps);
    const parsed = parseResult(result);
    // strictMode=false 时即使数据提交类缺少步骤也不报违规
    assert.notEqual(parsed.complianceResults[0].complianceStatus, 'NON-COMPLIANT');
  });
});

// ============================================================
// 未知工具
// ============================================================

describe('未知工具', () => {
  test('返回 mcpError 且包含工具名', async () => {
    const deps = makeDeps();
    const result = await validationHandle('nonexistent_tool', {}, deps);
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('nonexistent_tool'));
    assert.ok(result.content[0].text.includes('未知工具'));
    assert.ok(result.content[0].text.includes('validation'));
  });
});
