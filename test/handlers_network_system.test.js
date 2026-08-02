'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { redact } = require('../core/redaction');
const { handle: networkHandle } = require('../handlers/network');
const { handle: systemHandle } = require('../handlers/system');

// ============================================================
// 辅助函数：创建最小化 mock deps 对象
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
  return records;
}

function makeNetworkDeps(overrides = {}) {
  const networkLogs = overrides.networkLogs || [];
  const consoleLogs = overrides.consoleLogs || [];
  const pageErrors = overrides.pageErrors || [];
  return {
    page: null,
    browser: null,
    browserSessionId: null,
    consoleLogs,
    networkLogs,
    pageErrors,
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
    redact,
    redactString: (v) => v,
    isSensitiveKey: () => false,
    filterNetwork: mockFilterNetwork,
    filterNetworkDetails: (args = {}) => redact(mockFilterNetwork(networkLogs, args).slice(-(args.limit || 50))),
    getUnifiedErrors: overrides.getUnifiedErrors || (() => ({
      consoleErrors: [],
      pageErrors: [],
      summary: { total: 0, consoleErrorCount: 0, pageErrorCount: 0 },
      checkpoint: 0
    })),
    resetRuntimeLogs: overrides.resetRuntimeLogs || (() => {
      networkLogs.length = 0;
      consoleLogs.length = 0;
      pageErrors.length = 0;
    }),
    mcpParamMissing: (param, name) => ({ content: [{ type: 'text', text: `缺少参数: ${param} (工具: ${name})` }], isError: true }),
    ...overrides,
  };
}

function makeSystemDeps(overrides = {}) {
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
    redact,
    redactString: (v) => v,
    isSensitiveKey: () => false,
    path: require('path'),
    fs: require('fs'),
    PROJECT_ROOT: overrides.PROJECT_ROOT || require('path').join(__dirname, '..'),
    TOOLS_DIR: overrides.TOOLS_DIR || require('path').join(__dirname, '..', 'tools'),
    ...overrides,
  };
}

// ============================================================
// network.js — browser_network
// ============================================================

describe('network.js handle — browser_network', () => {
  test('返回网络记录列表，不含 details', async () => {
    const logs = [
      { url: 'https://example.com/api', method: 'GET', status: 200, duration: 100 },
      { url: 'https://example.com/error', method: 'POST', status: 500, duration: 50 },
    ];
    const deps = makeNetworkDeps({ networkLogs: logs });
    const result = await networkHandle('browser_network', {}, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.total, 2);
    assert.equal(parsed.errors, 1);
    assert.equal(parsed.slowRequests, 0);
    // 不含 details 时 requestBody/responseBody 被删除
    assert.ok(!parsed.records[0].requestBody);
    assert.ok(!parsed.records[0].responseBody);
  });

  test('includeDetails=true 时保留 POST requestBody', async () => {
    const logs = [
      { url: 'https://example.com/api', method: 'POST', status: 200, duration: 100, requestBody: '{"a":1}', responseBody: 'long'.repeat(200) },
      { url: 'https://example.com/get', method: 'GET', status: 200, duration: 50, requestBody: 'should-be-removed', responseBody: 'ok' },
    ];
    const deps = makeNetworkDeps({ networkLogs: logs });
    const result = await networkHandle('browser_network', { includeDetails: true }, deps);
    const parsed = JSON.parse(result);
    // POST 保留 requestBody
    assert.ok(parsed.records[0].requestBody);
    // GET 删除 requestBody
    assert.ok(!parsed.records[1].requestBody);
    // responseBody 超过 500 字符时截断
    assert.ok(parsed.records[0].responseBody.length <= 500);
  });

  test('慢请求统计 (duration > 3000)', async () => {
    const logs = [
      { url: 'https://slow.com/api', method: 'GET', status: 200, duration: 5000 },
      { url: 'https://fast.com/api', method: 'GET', status: 200, duration: 100 },
    ];
    const deps = makeNetworkDeps({ networkLogs: logs });
    const result = await networkHandle('browser_network', {}, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.slowRequests, 1);
  });

  test('limit 参数限制返回记录数', async () => {
    const logs = Array.from({ length: 10 }, (_, i) => ({
      url: `https://example.com/${i}`, method: 'GET', status: 200, duration: 10
    }));
    const deps = makeNetworkDeps({ networkLogs: logs });
    const result = await networkHandle('browser_network', { limit: 3 }, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.total, 10);
    assert.equal(parsed.records.length, 3);
  });

  test('有错误时 nextSteps 包含错误排查建议', async () => {
    const logs = [
      { url: 'https://example.com/500', method: 'GET', status: 500, duration: 100 },
    ];
    const deps = makeNetworkDeps({ networkLogs: logs });
    const result = await networkHandle('browser_network', {}, deps);
    const parsed = JSON.parse(result);
    // v1.10.0: browser_network_detail 已合并为 browser_network { mode: 'detail' }
    assert.ok(parsed.nextSteps.some(s => s.includes('browser_network') && s.includes('detail')));
  });
});

// ============================================================
// network.js handle — browser_console
// ============================================================

describe('network.js handle — browser_console', () => {
  test('返回所有级别日志（不指定 level）', async () => {
    const consoleLogs = [
      { type: 'log', text: 'hello' },
      { type: 'error', text: 'boom' },
      { type: 'warning', text: 'careful' },
    ];
    const deps = makeNetworkDeps({ consoleLogs });
    const result = await networkHandle('browser_console', {}, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.count, 3);
  });

  test('按 level=error 过滤日志', async () => {
    const consoleLogs = [
      { type: 'log', text: 'hello' },
      { type: 'error', text: 'boom' },
      { type: 'warning', text: 'careful' },
    ];
    const deps = makeNetworkDeps({ consoleLogs });
    const result = await networkHandle('browser_console', { level: 'error' }, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.count, 1);
    assert.equal(parsed.logs[0].text, 'boom');
  });

  test('level=all 返回全部日志', async () => {
    const consoleLogs = [
      { type: 'log', text: 'a' },
      { type: 'error', text: 'b' },
    ];
    const deps = makeNetworkDeps({ consoleLogs });
    const result = await networkHandle('browser_console', { level: 'all' }, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.count, 2);
  });

  test('limit 参数限制返回条数（取最后 N 条）', async () => {
    const consoleLogs = Array.from({ length: 10 }, (_, i) => ({ type: 'log', text: `msg-${i}` }));
    const deps = makeNetworkDeps({ consoleLogs });
    const result = await networkHandle('browser_console', { limit: 3 }, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.count, 3);
    assert.equal(parsed.logs[2].text, 'msg-9');
  });

  test('空日志时返回空数组', async () => {
    const deps = makeNetworkDeps({ consoleLogs: [] });
    const result = await networkHandle('browser_console', {}, deps);
    const parsed = JSON.parse(result);
    assert.equal(parsed.count, 0);
    assert.deepEqual(parsed.logs, []);
  });
});

// v1.10.0: browser_network_detail 已移除（别名 → browser_network mode=detail）

// v1.10.0: browser_errors_clear 已移除（别名 → browser_errors mode=clear）

// ============================================================
// network.js handle — browser_errors（无 page 时）
// ============================================================

describe('network.js handle — browser_errors（page=null）', () => {
  test('无 page 时返回 getUnifiedErrors 结果', async () => {
    const deps = makeNetworkDeps({
      page: null,
      getUnifiedErrors: () => ({
        consoleErrors: [{ source: 'console', type: 'error', text: 'Syntax Error' }],
        pageErrors: [],
        summary: { total: 1, consoleErrorCount: 1, pageErrorCount: 0 },
        checkpoint: 10,
      }),
    });
    const result = await networkHandle('browser_errors', {}, deps);
    const parsed = JSON.parse(result);
    assert.ok(parsed.summary.total > 0);
    // v1.10.0: browser_diagnose 已合并为 browser_debug { mode: 'diagnose' }
    assert.ok(parsed.nextSteps.some(s => s.includes('browser_debug') && s.includes('diagnose')));
  });

  test('无错误时返回 "页面无新错误" 建议路径', async () => {
    const deps = makeNetworkDeps({
      page: null,
      getUnifiedErrors: () => ({
        consoleErrors: [],
        pageErrors: [],
        summary: { total: 0, consoleErrorCount: 0, pageErrorCount: 0 },
        checkpoint: 0,
      }),
    });
    const result = await networkHandle('browser_errors', {}, deps);
    const parsed = JSON.parse(result);
    assert.ok(parsed.nextSteps.some(s => s.includes('继续验证流程')));
  });
});

// ============================================================
// network.js handle — 未知工具
// ============================================================

describe('network.js handle — 未知工具', () => {
  test('未知工具名返回 mcpError', async () => {
    const deps = makeNetworkDeps();
    const result = await networkHandle('unknown_tool_xyz', {}, deps);
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('未知工具'));
  });
});

// ============================================================
// system.js handle — css_var_check
// ============================================================

describe('system.js handle — css_var_check', () => {
  test('缺少 css 参数时返回错误', async () => {
    const deps = makeSystemDeps();
    const result = await systemHandle('css_var_check', {}, deps);
    const parsed = JSON.parse(result);
    assert.ok(parsed.error);
    assert.ok(parsed.error.includes('css'));
  });

  test('分析有效 CSS 返回结果', async () => {
    const css = ':root { --primary: #007bff; --secondary: #6c757d; } .btn { color: var(--primary); }';
    const deps = makeSystemDeps();
    const result = await systemHandle('css_var_check', { css }, deps);
    const parsed = JSON.parse(result);
    // css-var-analyzer 应返回分析结果
    assert.ok(parsed.nextSteps);
    // 不应有 error 字段
    assert.ok(!parsed.error);
  });

  test('空 CSS 字符串被视为缺少参数', async () => {
    // 空字符串是 falsy，handler 的 !css 检查会拦截
    const deps = makeSystemDeps();
    const result = await systemHandle('css_var_check', { css: '' }, deps);
    const parsed = JSON.parse(result);
    assert.ok(parsed.error);
  });

  test('无 CSS 变量的样式表正常处理', async () => {
    const css = '.btn { color: red; background: blue; }';
    const deps = makeSystemDeps();
    const result = await systemHandle('css_var_check', { css }, deps);
    const parsed = JSON.parse(result);
    assert.ok(parsed.nextSteps);
    assert.ok(!parsed.error);
  });
});

// v1.10.0: skill_tools_map 已移除（别名 → skill_validate mode=tools_map）
// v1.10.0: skill_consistency_check 已移除（别名 → skill_validate mode=consistency）

// ============================================================
// system.js handle — 未知工具
// ============================================================

describe('system.js handle — 未知工具', () => {
  test('未知工具名返回 mcpError', async () => {
    const deps = makeSystemDeps();
    const result = await systemHandle('unknown_tool_xyz', {}, deps);
    assert.ok(result.isError);
    assert.ok(result.content[0].text.includes('未知工具'));
  });
});
