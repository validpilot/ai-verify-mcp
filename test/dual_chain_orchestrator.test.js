'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { DualChainOrchestrator } = require('../orchestrator/dual_chain_orchestrator');

// ============================================================
// 构造函数
// ============================================================

describe('DualChainOrchestrator — 构造函数', () => {
  it('使用默认值构造', () => {
    const orch = new DualChainOrchestrator();
    assert.equal(orch.callTool, null);
    assert.equal(typeof orch.log, 'function');
    assert.equal(orch.maxIterations, 5);
  });

  it('接受自定义 options', () => {
    const callTool = async () => null;
    const logs = [];
    const log = (level, msg, ctx) => logs.push({ level, msg, ctx });
    const orch = new DualChainOrchestrator({ callTool, log, maxIterations: 10 });
    assert.equal(orch.callTool, callTool);
    assert.equal(orch.log, log);
    assert.equal(orch.maxIterations, 10);
  });

  it('默认 log 是 no-op', () => {
    const orch = new DualChainOrchestrator();
    assert.doesNotThrow(() => orch.log('INFO', 'msg', { a: 1 }));
  });
});

// ============================================================
// _summarizeChainResult
// ============================================================

describe('_summarizeChainResult', () => {
  it('null 输入返回零值摘要', () => {
    const orch = new DualChainOrchestrator();
    const result = orch._summarizeChainResult(null);
    assert.deepEqual(result, { features: 0, findings: 0 });
  });

  it('undefined 输入返回零值摘要', () => {
    const orch = new DualChainOrchestrator();
    const result = orch._summarizeChainResult(undefined);
    assert.deepEqual(result, { features: 0, findings: 0 });
  });

  it('空对象返回零值摘要', () => {
    const orch = new DualChainOrchestrator();
    const result = orch._summarizeChainResult({});
    assert.deepEqual(result, { features: 0, findings: 0, overallStatus: undefined });
  });

  it('完整对象返回正确摘要', () => {
    const orch = new DualChainOrchestrator();
    const result = orch._summarizeChainResult({
      features: [{ name: 'f1' }, { name: 'f2' }],
      findings: [{ id: 1 }, { id: 2 }, { id: 3 }],
      overallStatus: 'success'
    });
    assert.deepEqual(result, { features: 2, findings: 3, overallStatus: 'success' });
  });

  it('features/findings 为非数组时使用 length 属性（字符串长度）', () => {
    const orch = new DualChainOrchestrator();
    const result = orch._summarizeChainResult({ features: null, findings: 'not array' });
    assert.equal(result.features, 0);  // null 没有 length
    assert.equal(result.findings, 9);  // 'not array'.length === 9
  });
});

// ============================================================
// _generateRecommendations
// ============================================================

describe('_generateRecommendations', () => {
  it('无断裂时返回空数组', () => {
    const orch = new DualChainOrchestrator();
    const recs = orch._generateRecommendations({ breaks: [] });
    assert.deepEqual(recs, []);
  });

  it('无 crossValidation 时返回空数组', () => {
    const orch = new DualChainOrchestrator();
    const recs = orch._generateRecommendations(undefined);
    assert.deepEqual(recs, []);
  });

  it('FALSE_SUCCESS 类型生成数据写入逻辑建议', () => {
    const orch = new DualChainOrchestrator();
    const recs = orch._generateRecommendations({
      breaks: [{ type: 'FALSE_SUCCESS', severity: 'critical' }]
    });
    assert.equal(recs.length, 1);
    assert.ok(recs[0].includes('repository.save'));
  });

  it('RENDER_FAILURE 类型生成状态管理建议', () => {
    const orch = new DualChainOrchestrator();
    const recs = orch._generateRecommendations({
      breaks: [{ type: 'RENDER_FAILURE', severity: 'high' }]
    });
    assert.equal(recs.length, 1);
    assert.ok(recs[0].includes('state/UI'));
  });

  it('FALSE_SUCCESS + RENDER_FAILURE 生成两条建议', () => {
    const orch = new DualChainOrchestrator();
    const recs = orch._generateRecommendations({
      breaks: [
        { type: 'FALSE_SUCCESS', severity: 'critical' },
        { type: 'RENDER_FAILURE', severity: 'high' }
      ]
    });
    assert.equal(recs.length, 2);
  });

  it('其他类型断裂不生成建议', () => {
    const orch = new DualChainOrchestrator();
    const recs = orch._generateRecommendations({
      breaks: [{ type: 'OTHER_TYPE', severity: 'low' }]
    });
    assert.deepEqual(recs, []);
  });
});

// ============================================================
// _detectChainBreaks
// ============================================================

describe('_detectChainBreaks', () => {
  it('两侧均无结果时返回 pass verdict', () => {
    const orch = new DualChainOrchestrator();
    const result = orch._detectChainBreaks(null, null);
    assert.equal(result.verdict.level, 'pass');
    assert.equal(result.verdict.label.includes('验证通过'), true);
    assert.equal(result.breaks.length, 0);
    assert.equal(result.summary.totalBreaks, 0);
    assert.equal(result.summary.critical, 0);
    assert.equal(result.summary.high, 0);
    assert.equal(result.summary.medium, 0);
    assert.equal(result.summary.low, 0);
  });

  it('功能 happyPath 成功 + API 错误 = FALSE_SUCCESS critical', () => {
    const orch = new DualChainOrchestrator();
    const functionalResult = {
      features: [
        { name: '登录', url: '/login', happyPath: { status: 'success' } }
      ]
    };
    const technicalResult = {
      apiResponses: [
        { endpoint: '/login', isError: true, status: 500 }
      ]
    };
    const result = orch._detectChainBreaks(functionalResult, technicalResult);
    assert.equal(result.breaks.length, 1);
    assert.equal(result.breaks[0].type, 'FALSE_SUCCESS');
    assert.equal(result.breaks[0].severity, 'critical');
    assert.equal(result.verdict.level, 'critical');
    assert.equal(result.summary.critical, 1);
    assert.equal(result.matrix.features.length, 1);
    assert.equal(result.matrix.features[0].name, '登录');
    assert.equal(result.matrix.features[0].breaks, 1);
  });

  it('功能 hasErrors + API 无错误 = RENDER_FAILURE high', () => {
    const orch = new DualChainOrchestrator();
    const functionalResult = {
      features: [
        { name: '提交订单', url: '/api/orders', happyPath: { status: 'failed', hasErrors: true } }
      ]
    };
    const technicalResult = {
      apiResponses: [
        { endpoint: '/api/orders', isError: false, status: 200 }
      ]
    };
    const result = orch._detectChainBreaks(functionalResult, technicalResult);
    assert.equal(result.breaks.length, 1);
    assert.equal(result.breaks[0].type, 'RENDER_FAILURE');
    assert.equal(result.breaks[0].severity, 'high');
    assert.equal(result.verdict.level, 'high');
    assert.equal(result.summary.high, 1);
  });

  it('无匹配 API 的功能不产生断裂', () => {
    const orch = new DualChainOrchestrator();
    const functionalResult = {
      features: [
        { name: '未知功能', url: '/unknown', happyPath: { status: 'success' } }
      ]
    };
    const technicalResult = {
      apiResponses: [
        { endpoint: '/api/other', isError: true, status: 500 }
      ]
    };
    const result = orch._detectChainBreaks(functionalResult, technicalResult);
    assert.equal(result.breaks.length, 0);
    assert.equal(result.verdict.level, 'pass');
  });

  it('happyPath 未成功时不检测 FALSE_SUCCESS', () => {
    const orch = new DualChainOrchestrator();
    const functionalResult = {
      features: [
        { name: '失败功能', url: '/api/x', happyPath: { status: 'failed' } }
      ]
    };
    const technicalResult = {
      apiResponses: [
        { endpoint: '/api/x', isError: true, status: 500 }
      ]
    };
    const result = orch._detectChainBreaks(functionalResult, technicalResult);
    assert.equal(result.breaks.length, 0);
  });

  it('hasErrors=false + API 成功 = 无断裂', () => {
    const orch = new DualChainOrchestrator();
    const functionalResult = {
      features: [
        { name: '正常功能', url: '/api/ok', happyPath: { status: 'success', hasErrors: false } }
      ]
    };
    const technicalResult = {
      apiResponses: [
        { endpoint: '/api/ok', isError: false, status: 200 }
      ]
    };
    const result = orch._detectChainBreaks(functionalResult, technicalResult);
    assert.equal(result.breaks.length, 0);
    assert.equal(result.verdict.level, 'pass');
  });

  it('matrix.features 不包含无断裂的功能', () => {
    const orch = new DualChainOrchestrator();
    const functionalResult = {
      features: [
        { name: '正常', url: '/ok', happyPath: { status: 'success', hasErrors: false } },
        { name: '异常', url: '/bad', happyPath: { status: 'success' } }
      ]
    };
    const technicalResult = {
      apiResponses: [
        { endpoint: '/bad', isError: true, status: 500 }
      ]
    };
    const result = orch._detectChainBreaks(functionalResult, technicalResult);
    assert.equal(result.matrix.features.length, 1);
    assert.equal(result.matrix.features[0].name, '异常');
  });

  it('matrix 显示 functional/technical 状态', () => {
    const orch = new DualChainOrchestrator();
    const result = orch._detectChainBreaks(
      { overallStatus: 'success', overallSummary: '功能正常' },
      { overallStatus: 'failed', overallSummary: 'API 异常' }
    );
    assert.equal(result.matrix.functional.status, 'success');
    assert.equal(result.matrix.functional.summary, '功能正常');
    assert.equal(result.matrix.technical.status, 'failed');
    assert.equal(result.matrix.technical.summary, 'API 异常');
  });

  it('多个 critical 断裂仍为 critical verdict', () => {
    const orch = new DualChainOrchestrator();
    const functionalResult = {
      features: [
        { name: 'f1', url: '/a', happyPath: { status: 'success' } },
        { name: 'f2', url: '/b', happyPath: { status: 'success' } }
      ]
    };
    const technicalResult = {
      apiResponses: [
        { endpoint: '/a', isError: true, status: 500 },
        { endpoint: '/b', isError: true, status: 500 }
      ]
    };
    const result = orch._detectChainBreaks(functionalResult, technicalResult);
    assert.equal(result.summary.critical, 2);
    assert.equal(result.verdict.level, 'critical');
  });

  it('仅 high 断裂时为 high verdict', () => {
    const orch = new DualChainOrchestrator();
    const functionalResult = {
      features: [
        { name: 'f1', url: '/a', happyPath: { status: 'failed', hasErrors: true } }
      ]
    };
    const technicalResult = {
      apiResponses: [
        { endpoint: '/a', isError: false, status: 200 }
      ]
    };
    const result = orch._detectChainBreaks(functionalResult, technicalResult);
    assert.equal(result.summary.high, 1);
    assert.equal(result.summary.critical, 0);
    assert.equal(result.verdict.level, 'high');
  });
});

// ============================================================
// _parseResult
// ============================================================

describe('_parseResult', () => {
  it('null/undefined 返回 null', () => {
    const orch = new DualChainOrchestrator();
    assert.equal(orch._parseResult(null), null);
    assert.equal(orch._parseResult(undefined), null);
  });

  it('字符串直接返回字符串', () => {
    const orch = new DualChainOrchestrator();
    assert.equal(orch._parseResult('hello'), 'hello');
  });

  it('JSON 字符串解析为对象', () => {
    const orch = new DualChainOrchestrator();
    const result = orch._parseResult('{"a":1,"b":2}');
    assert.deepEqual(result, { a: 1, b: 2 });
  });

  it('非 JSON 字符串原样返回', () => {
    const orch = new DualChainOrchestrator();
    const result = orch._parseResult('not json {');
    assert.equal(result, 'not json {');
  });

  it('MCP content[0].text 提取并解析', () => {
    const orch = new DualChainOrchestrator();
    const result = orch._parseResult({
      content: [{ type: 'text', text: '{"foo":"bar"}' }]
    });
    assert.deepEqual(result, { foo: 'bar' });
  });

  it('MCP content[0].text 非 JSON 原样返回字符串', () => {
    const orch = new DualChainOrchestrator();
    const result = orch._parseResult({
      content: [{ type: 'text', text: 'plain text' }]
    });
    assert.equal(result, 'plain text');
  });

  it('result.content[0].text 嵌套结构提取', () => {
    const orch = new DualChainOrchestrator();
    const result = orch._parseResult({
      result: { content: [{ type: 'text', text: '{"nested":true}' }] }
    });
    assert.deepEqual(result, { nested: true });
  });

  it('result 对象直接返回', () => {
    const orch = new DualChainOrchestrator();
    const input = { result: { x: 1, y: 2 } };
    const result = orch._parseResult(input);
    assert.deepEqual(result, { x: 1, y: 2 });
  });

  it('普通对象直接返回', () => {
    const orch = new DualChainOrchestrator();
    const input = { a: 1, b: [1, 2, 3] };
    const result = orch._parseResult(input);
    assert.deepEqual(result, input);
  });

  it('content 数组但无 text 字段返回原对象', () => {
    const orch = new DualChainOrchestrator();
    const input = { content: [{ type: 'image' }] };
    const result = orch._parseResult(input);
    assert.equal(result, input);
  });
});

// ============================================================
// _callToolSafe
// ============================================================

describe('_callToolSafe', () => {
  it('无 callTool 时返回 null', async () => {
    const orch = new DualChainOrchestrator();
    const result = await orch._callToolSafe('any_tool', { x: 1 });
    assert.equal(result, null);
  });

  it('callTool 成功时返回结果', async () => {
    const callTool = async (name, args) => ({ name, args, ok: true });
    const orch = new DualChainOrchestrator({ callTool });
    const result = await orch._callToolSafe('tool_a', { x: 1 });
    assert.deepEqual(result, { name: 'tool_a', args: { x: 1 }, ok: true });
  });

  it('callTool 抛错时返回 null 不抛出', async () => {
    const callTool = async () => { throw new Error('network failure'); };
    const logs = [];
    const log = (level, msg) => logs.push({ level, msg });
    const orch = new DualChainOrchestrator({ callTool, log });
    const result = await orch._callToolSafe('tool_a', {});
    assert.equal(result, null);
    assert.ok(logs.some(l => l.level === 'WARN' && l.msg.includes('tool_a')));
  });

  it('传递正确的 name 和 args 给 callTool', async () => {
    let receivedName = null;
    let receivedArgs = null;
    const callTool = async (name, args) => {
      receivedName = name;
      receivedArgs = args;
      return 'ok';
    };
    const orch = new DualChainOrchestrator({ callTool });
    await orch._callToolSafe('browser_navigate', { url: 'http://example.com' });
    assert.equal(receivedName, 'browser_navigate');
    assert.deepEqual(receivedArgs, { url: 'http://example.com' });
  });
});

// ============================================================
// execute — 整体编排流程
// ============================================================

describe('execute', () => {
  it('缺少 target 抛出错误', async () => {
    const orch = new DualChainOrchestrator();
    await assert.rejects(
      () => orch.execute(null),
      /需要 target 参数/
    );
  });

  it('空字符串 target 抛出错误', async () => {
    const orch = new DualChainOrchestrator();
    await assert.rejects(
      () => orch.execute(''),
      /需要 target 参数/
    );
  });

  it('仅 functional 链路时跳过交叉验证', async () => {
    const callTool = async (name) => {
      // 返回最小化的有效结构，避免 _parseResult 解析失败
      if (name === 'exploration_quick' || name === 'business_loop_validate') {
        return { content: [{ type: 'text', text: '{"features":[],"findings":[],"overallStatus":"success","overallSummary":"ok"}' }] };
      }
      return { content: [{ type: 'text', text: '{}' }] };
    };
    const orch = new DualChainOrchestrator({ callTool });
    const result = await orch.execute('http://example.com', { chains: ['functional'] });
    assert.ok(result.sessionId);
    assert.equal(result.target, 'http://example.com');
    assert.equal(result.chains.functional.status, 'completed');
    assert.equal(result.chains.technical, null);
    assert.equal(result.crossValidation.verdict.level, 'incomplete');
    assert.ok(result.timing.totalMs >= 0);
    assert.ok(result.timing.startedAt);
    assert.ok(result.timing.completedAt);
  });

  it('仅 technical 链路时跳过交叉验证', async () => {
    const callTool = async () => ({
      content: [{ type: 'text', text: '{"apiResponses":[],"overallStatus":"success","overallSummary":"ok","findings":[]}' }]
    });
    const orch = new DualChainOrchestrator({ callTool });
    const result = await orch.execute('http://example.com', { chains: ['technical'] });
    assert.equal(result.chains.functional, null);
    assert.equal(result.chains.technical.status, 'completed');
    assert.equal(result.crossValidation.verdict.level, 'incomplete');
  });

  it('双链路无断裂时 verdict=pass', async () => {
    const callTool = async (name) => {
      if (name === 'exploration_quick' || name === 'business_loop_validate') {
        return { content: [{ type: 'text', text: '{"features":[],"findings":[],"overallStatus":"success","overallSummary":"ok"}' }] };
      }
      return { content: [{ type: 'text', text: '{"apiResponses":[],"overallStatus":"success","overallSummary":"ok","findings":[]}' }] };
    };
    const orch = new DualChainOrchestrator({ callTool });
    const result = await orch.execute('http://example.com', { chains: ['functional', 'technical'] });
    assert.equal(result.crossValidation.verdict.level, 'pass');
    assert.equal(result.crossValidation.summary.totalBreaks, 0);
    assert.equal(result.fix, null);  // autoFix 默认开启但无 breaks
  });

  it('autoFix=false 时不执行修复', async () => {
    const callTool = async () => ({
      content: [{ type: 'text', text: '{"features":[],"findings":[],"overallStatus":"success","overallSummary":"ok","apiResponses":[]}' }]
    });
    const orch = new DualChainOrchestrator({ callTool });
    const result = await orch.execute('http://example.com', { autoFix: false });
    assert.equal(result.fix, null);
  });

  it('使用自定义 sessionId', async () => {
    const callTool = async () => ({
      content: [{ type: 'text', text: '{}' }]
    });
    const orch = new DualChainOrchestrator({ callTool });
    const result = await orch.execute('http://example.com', { sessionId: 'my-custom-id' });
    assert.equal(result.sessionId, 'my-custom-id');
  });

  it('无 callTool 时仍可完成（各链路返回 null）', async () => {
    const orch = new DualChainOrchestrator();  // 无 callTool
    const result = await orch.execute('http://example.com');
    assert.equal(result.chains.functional.status, 'completed');
    assert.equal(result.chains.technical.status, 'completed');
    assert.equal(result.crossValidation.verdict.level, 'pass');
  });
});

// ============================================================
// _runSynthesis
// ============================================================

describe('_runSynthesis', () => {
  it('无任何 findings 时返回空报告', async () => {
    const orch = new DualChainOrchestrator();
    const crossValidation = {
      verdict: { level: 'pass', label: '✅ 验证通过' },
      breaks: [],
      matrix: null
    };
    const result = await orch._runSynthesis('target', 'session', {}, null, null, crossValidation);
    assert.equal(result.report.verdict.level, 'pass');
    assert.equal(result.report.totalFindings, 0);
    assert.deepEqual(result.report.bySeverity, { critical: 0, high: 0, medium: 0, low: 0 });
    assert.equal(result.report.keyFindings.length, 0);
    assert.equal(result.report.chainBreakMatrix, null);
    assert.deepEqual(result.report.recommendations, []);
    assert.equal(result.memoryWrite.episodic, false);
  });

  it('聚合 functional findings 和 crossValidation breaks', async () => {
    const orch = new DualChainOrchestrator();
    const functionalResult = {
      findings: [
        { severity: 'high', description: 'f1', phase: 'happy_path' },
        { severity: 'medium', description: 'f2', phase: 'adversarial' }
      ]
    };
    const crossValidation = {
      verdict: { level: 'critical', label: '🔴 严重' },
      breaks: [
        { type: 'FALSE_SUCCESS', severity: 'critical', description: 'b1', evidence: {} }
      ],
      matrix: { features: [] }
    };
    const result = await orch._runSynthesis('target', 'session', {}, functionalResult, null, crossValidation);
    assert.equal(result.report.totalFindings, 3);
    assert.equal(result.report.bySeverity.critical, 1);
    assert.equal(result.report.bySeverity.high, 1);
    assert.equal(result.report.bySeverity.medium, 1);
    assert.equal(result.report.keyFindings.length, 2);  // critical + high
    assert.ok(result.report.chainBreakMatrix);
    assert.equal(result.report.recommendations.length, 1);  // FALSE_SUCCESS
  });

  it('无 crossValidation 时 verdict 为 unknown', async () => {
    const orch = new DualChainOrchestrator();
    const result = await orch._runSynthesis('target', 'session', {}, null, null, null);
    assert.equal(result.report.verdict.level, 'unknown');
  });
});

// ============================================================
// _runAutoFix
// ============================================================

describe('_runAutoFix', () => {
  it('callTool 成功时返回 completed 状态', async () => {
    const callTool = async () => ({ content: [{ type: 'text', text: '{"status":"fixed"}' }] });
    const orch = new DualChainOrchestrator({ callTool });
    const crossValidation = {
      breaks: [{ type: 'FALSE_SUCCESS', severity: 'critical', description: 'd1', evidence: {} }]
    };
    const result = await orch._runAutoFix('target', 'session', crossValidation, {});
    assert.equal(result.status, 'completed');
    assert.ok(result.result);
  });

  it('callTool 抛错时 _callToolSafe 吞错返回 null，_runAutoFix 仍为 completed', async () => {
    const callTool = async () => { throw new Error('fix failed'); };
    const log = () => {};
    const orch = new DualChainOrchestrator({ callTool, log });
    const crossValidation = {
      breaks: [{ type: 'RENDER_FAILURE', severity: 'high', description: 'd1', evidence: {} }]
    };
    const result = await orch._runAutoFix('target', 'session', crossValidation, {});
    // _callToolSafe 内部 catch 后返回 null，外层 try 不会触发
    assert.equal(result.status, 'completed');
    assert.equal(result.result, null);
  });

  it('无 callTool 时 result 为 null 但 status 仍为 completed', async () => {
    const orch = new DualChainOrchestrator();
    const crossValidation = {
      breaks: [{ type: 'FALSE_SUCCESS', severity: 'critical', description: 'd1', evidence: {} }]
    };
    const result = await orch._runAutoFix('target', 'session', crossValidation, {});
    assert.equal(result.status, 'completed');
    assert.equal(result.result, null);
  });
});
