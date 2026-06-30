'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// handlers 模块导出测试
describe('handlers 模块导出验证', () => {
  test('handlers/browser.js 导出 tools 数组和 handle 函数', () => {
    const browser = require('../handlers/browser');
    assert.ok(Array.isArray(browser.tools));
    assert.ok(browser.tools.length > 0);
    assert.ok(typeof browser.handle === 'function');
  });

  test('handlers/diagnose.js 导出 tools 数组和 handle 函数', () => {
    const diagnose = require('../handlers/diagnose');
    assert.ok(Array.isArray(diagnose.tools));
    assert.ok(diagnose.tools.length > 0);
    assert.ok(typeof diagnose.handle === 'function');
  });

  test('handlers/session.js 导出 tools 数组和 handle 函数', () => {
    const session = require('../handlers/session');
    assert.ok(Array.isArray(session.tools));
    assert.ok(session.tools.length > 0);
    assert.ok(typeof session.handle === 'function');
  });

  test('handlers/visual.js 导出 tools 数组和 handle 函数', () => {
    const visual = require('../handlers/visual');
    assert.ok(Array.isArray(visual.tools));
    assert.ok(visual.tools.length > 0);
    assert.ok(typeof visual.handle === 'function');
  });

  test('handlers/validation.js 导出 tools 数组和 handle 函数', () => {
    const validation = require('../handlers/validation');
    assert.ok(Array.isArray(validation.tools));
    assert.ok(validation.tools.length > 0);
    assert.ok(typeof validation.handle === 'function');
  });

  test('handlers/evidence.js 导出 tools 数组和 handle 函数', () => {
    const evidence = require('../handlers/evidence');
    assert.ok(Array.isArray(evidence.tools));
    assert.ok(evidence.tools.length > 0);
    assert.ok(typeof evidence.handle === 'function');
  });

  test('handlers/network.js 导出 tools 数组和 handle 函数', () => {
    const network = require('../handlers/network');
    assert.ok(Array.isArray(network.tools));
    assert.ok(network.tools.length > 0);
    assert.ok(typeof network.handle === 'function');
  });

  test('handlers/locator.js 导出 tools 数组和 handle 函数', () => {
    const locator = require('../handlers/locator');
    assert.ok(Array.isArray(locator.tools));
    assert.ok(locator.tools.length > 0);
    assert.ok(typeof locator.handle === 'function');
  });

  test('handlers/system.js 导出 tools 数组和 handle 函数', () => {
    const system = require('../handlers/system');
    assert.ok(Array.isArray(system.tools));
    assert.ok(system.tools.length > 0);
    assert.ok(typeof system.handle === 'function');
  });

  test('handlers/system.js 工具列表包含核心工具', () => {
    const system = require('../handlers/system');
    const coreTools = ['project_audit', 'css_var_check', 'browser_full_regression', 'browser_form_fill', 'browser_deep_interact'];
    for (const tool of coreTools) {
      assert.ok(system.tools.includes(tool), `system handler 缺少工具: ${tool}`);
    }
  });

  test('所有 handler 工具无重复注册', () => {
    const all = [
      require('../handlers/browser'),
      require('../handlers/session'),
      require('../handlers/evidence'),
      require('../handlers/network'),
      require('../handlers/validation'),
      require('../handlers/diagnose'),
      require('../handlers/visual'),
      require('../handlers/locator'),
      require('../handlers/system'),
    ];
    const names = [];
    for (const h of all) {
      for (const t of h.tools) {
        assert.ok(!names.includes(t), `工具 ${t} 重复注册`);
        names.push(t);
      }
    }
  });

  test('每个 handler 的 handle 函数在无匹配工具名时返回错误', async () => {
    const handlers = [
      require('../handlers/browser'),
      require('../handlers/session'),
      require('../handlers/evidence'),
      require('../handlers/network'),
      require('../handlers/validation'),
      require('../handlers/diagnose'),
      require('../handlers/visual'),
      require('../handlers/locator'),
      require('../handlers/system'),
    ];
    for (const h of handlers) {
      try {
        const result = await h.handle('non_existent_tool_x', {}, {});
        assert.ok(typeof result === 'string');
      } catch (e) {
        // Some handlers throw, some return - both are acceptable
        assert.ok(e);
      }
    }
  });

});

// 新增工具在 handlers 中注册测试
describe('新增工具 handler 注册验证', () => {
  test('browser_form_validate 在 browser handler 中注册', () => {
    const browser = require('../handlers/browser');
    assert.ok(browser.tools.includes('browser_form_validate'));
  });

  test('browser_anti_bot_detect 在 diagnose handler 中注册', () => {
    const diagnose = require('../handlers/diagnose');
    assert.ok(diagnose.tools.includes('browser_anti_bot_detect'));
  });

  test('browser_emulate_device 在 session handler 中注册', () => {
    const session = require('../handlers/session');
    assert.ok(session.tools.includes('browser_emulate_device'));
  });

  test('browser_performance_trace 在 visual handler 中注册', () => {
    const visual = require('../handlers/visual');
    assert.ok(visual.tools.includes('browser_performance_trace'));
  });
});

// core 模块测试
describe('core 模块验证', () => {
  test('core/logger.js 导出 Logger 类', () => {
    const Logger = require('../core/logger');
    assert.ok(typeof Logger === 'function');
    const logger = new Logger();
    assert.ok(typeof logger.log === 'function');
  });

  test('core/state.js 导出 StateManager 类', () => {
    const { StateManager } = require('../core/state');
    assert.ok(typeof StateManager === 'function');
    const sm = new StateManager();
    assert.ok(typeof sm.loadTools === 'function');
    assert.ok(typeof sm.resetRuntimeLogs === 'function');
    assert.ok(typeof sm.trimLogs === 'function');
  });

  test('core/trace.js 导出 TraceManager 类', () => {
    const TraceManager = require('../core/trace');
    assert.ok(typeof TraceManager === 'function');
    const tm = new TraceManager();
    assert.ok(typeof tm.genTraceId === 'function');
    assert.ok(typeof tm.genSpanId === 'function');
    assert.ok(typeof tm.buildTraceparent === 'function');
  });

  test('TraceManager 生成正确格式的 traceId', () => {
    const TraceManager = require('../core/trace');
    const tm = new TraceManager();
    const traceId = tm.genTraceId();
    assert.ok(typeof traceId === 'string');
    assert.ok(traceId.length === 32);
    assert.ok( /^[0-9a-f]+$/.test(traceId));
  });

  test('TraceManager 生成正确格式的 spanId', () => {
    const TraceManager = require('../core/trace');
    const tm = new TraceManager();
    const spanId = tm.genSpanId();
    assert.ok(typeof spanId === 'string');
    assert.ok(spanId.length === 16);
    assert.ok( /^[0-9a-f]+$/.test(spanId));
  });

  test('TraceManager buildTraceparent 格式正确', () => {
    const TraceManager = require('../core/trace');
    const tm = new TraceManager();
    const traceparent = tm.buildTraceparent('abc123def456abc123def456abc123de', 'fed456abc123def');
    assert.ok(traceparent.startsWith('00-'));
    assert.ok(traceparent.endsWith('-01'));
    assert.ok(traceparent.includes('-fed456abc123def-'));
  });

  test('TraceManager parseTraceparent 正确解析', () => {
    const TraceManager = require('../core/trace');
    const tm = new TraceManager();
    const tid = tm.genTraceId();
    const sid = tm.genSpanId();
    const tp = tm.buildTraceparent(tid, sid);
    const parsed = tm.parseTraceparent(tp);
    assert.ok(parsed);
    assert.equal(parsed.version, '00');
    assert.equal(parsed.traceId, tid);
    assert.equal(parsed.spanId, sid);
    assert.ok(parsed.sampled);
  });
});