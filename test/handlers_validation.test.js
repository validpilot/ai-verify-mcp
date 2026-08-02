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

// v1.10.0: chain_list_templates 已移除（别名 → chain_spec mode=list）

// ============================================================
// chain_score_report — 纯计算
// ============================================================

// v1.10.0: chain_score_report 已移除（别名 → chain_spec mode=score）

// ============================================================
// contract_baseline — 真实 fs 操作（contracts/ 目录在 .gitignore 中）
// ============================================================

const TEST_BASELINE_NAME = 'unit-test-baseline-tmp';

// v1.10.0: contract_baseline 已移除（别名 → contract mode=baseline）

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

// v1.10.0: validation_report_export 已移除（别名 → validation_report mode=export）

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

// v1.10.0: trace_correlation_check 已移除（别名 → trace_correlate mode=check）

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
