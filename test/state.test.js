'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { StateManager } = require('../core/state');

describe('StateManager', () => {
  let state;
  let tmpToolsDir;

  before(() => {
    // 创建临时工具目录用于 loadTools 测试
    tmpToolsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-tools-test-'));
    // 创建测试工具 JSON 文件
    fs.writeFileSync(path.join(tmpToolsDir, 'tool_a.json'), JSON.stringify({ name: 'tool_a', description: 'test tool A' }));
    fs.writeFileSync(path.join(tmpToolsDir, 'tool_b.json'), JSON.stringify({ name: 'tool_b', description: 'test tool B' }));
    fs.writeFileSync(path.join(tmpToolsDir, 'not_json.txt'), 'should be ignored');
  });

  after(() => {
    try {
      for (const file of fs.readdirSync(tmpToolsDir)) {
        fs.unlinkSync(path.join(tmpToolsDir, file));
      }
      fs.rmdirSync(tmpToolsDir);
    } catch (_) {}
  });

  beforeEach(() => {
    state = new StateManager();
  });

  describe('constructor', () => {
    it('初始化空日志数组', () => {
      assert.ok(Array.isArray(state.consoleLogs));
      assert.ok(Array.isArray(state.networkLogs));
      assert.ok(Array.isArray(state.pageErrors));
      assert.strictEqual(state.consoleLogs.length, 0);
      assert.strictEqual(state.networkLogs.length, 0);
      assert.strictEqual(state.pageErrors.length, 0);
    });

    it('初始化 currentCheckpoint 为 ISO 字符串', () => {
      assert.strictEqual(typeof state.currentCheckpoint, 'string');
      // 验证是有效的 ISO 日期
      const d = new Date(state.currentCheckpoint);
      assert.ok(!isNaN(d.getTime()));
    });

    it('初始化 requestStartTimes 为 Map', () => {
      assert.ok(state.requestStartTimes instanceof Map);
      assert.strictEqual(state.requestStartTimes.size, 0);
    });

    it('设置 MAX_LOG_ENTRIES 为 500', () => {
      assert.strictEqual(state.MAX_LOG_ENTRIES, 500);
    });
  });

  describe('loadTools', () => {
    it('加载目录中的所有 JSON 工具文件', () => {
      const tools = state.loadTools(tmpToolsDir);
      assert.strictEqual(tools.length, 2);
      const names = tools.map(t => t.name).sort();
      assert.deepStrictEqual(names, ['tool_a', 'tool_b']);
    });

    it('跳过非 .json 文件', () => {
      const tools = state.loadTools(tmpToolsDir);
      assert.strictEqual(tools.length, 2);
      assert.ok(!tools.some(t => t.name === undefined));
    });

    it('目录不存在时返回空数组', () => {
      const tools = state.loadTools('/nonexistent/path/12345');
      assert.deepStrictEqual(tools, []);
    });

    it('目录不存在时调用 logFn 记录错误', () => {
      let loggedError = null;
      state.loadTools('/nonexistent/path/12345', (level, message, details) => {
        loggedError = { level, message, details };
      });
      assert.ok(loggedError);
      assert.strictEqual(loggedError.level, 'ERROR');
      assert.strictEqual(loggedError.message, '加载工具失败');
      assert.ok(loggedError.details.error);
    });

    it('不传 logFn 时不报错', () => {
      assert.doesNotThrow(() => state.loadTools('/nonexistent/path/12345'));
    });
  });

  describe('resetRuntimeLogs', () => {
    it('清空所有日志数组', () => {
      state.consoleLogs.push({ msg: 'a' });
      state.networkLogs.push({ url: 'b' });
      state.pageErrors.push({ err: 'c' });
      state.resetRuntimeLogs();
      assert.strictEqual(state.consoleLogs.length, 0);
      assert.strictEqual(state.networkLogs.length, 0);
      assert.strictEqual(state.pageErrors.length, 0);
    });

    it('更新 currentCheckpoint', () => {
      const oldCheckpoint = state.currentCheckpoint;
      // 等待一小段时间确保时间不同
      state.currentCheckpoint = new Date(Date.now() - 1000).toISOString();
      state.resetRuntimeLogs();
      const newTime = new Date(state.currentCheckpoint).getTime();
      const oldTime = new Date(oldCheckpoint).getTime();
      assert.ok(newTime >= oldTime);
    });

    it('传入 logFn 时记录 INFO 日志', () => {
      let logged = null;
      state.resetRuntimeLogs((level, message, details) => {
        logged = { level, message, details };
      });
      assert.ok(logged);
      assert.strictEqual(logged.level, 'INFO');
      assert.strictEqual(logged.message, 'runtime logs cleared');
      assert.ok(logged.details.checkpoint);
    });

    it('不传 logFn 时不报错', () => {
      assert.doesNotThrow(() => state.resetRuntimeLogs());
    });
  });

  describe('parseSince', () => {
    it('args.since 存在时返回对应时间戳', () => {
      const dateStr = '2026-01-15T10:30:00.000Z';
      const result = state.parseSince({ since: dateStr });
      assert.strictEqual(result, new Date(dateStr).getTime());
    });

    it('无 since 且 currentOnly 非 false 时返回 currentCheckpoint 时间', () => {
      const result = state.parseSince({});
      const expected = new Date(state.currentCheckpoint).getTime();
      assert.strictEqual(result, expected);
    });

    it('lastPageLoadTime 早于 currentCheckpoint 时返回 lastPageLoadTime', () => {
      state.lastPageLoadTime = Date.now() - 5000;
      state.currentCheckpoint = new Date().toISOString();
      const result = state.parseSince({});
      // 应返回较早的 lastPageLoadTime
      assert.strictEqual(result, state.lastPageLoadTime);
    });

    it('currentOnly 为 false 时返回 0', () => {
      const result = state.parseSince({ currentOnly: false });
      assert.strictEqual(result, 0);
    });
  });

  describe('filterBySince', () => {
    it('过滤掉 since 之前的项', () => {
      const items = [
        { timestamp: '2026-01-01T00:00:00.000Z', msg: 'old' },
        { timestamp: '2026-06-01T00:00:00.000Z', msg: 'new' }
      ];
      const result = state.filterBySince(items, { since: '2026-03-01T00:00:00.000Z' });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].msg, 'new');
    });

    it('since 为 0 时返回所有项', () => {
      const items = [
        { timestamp: '2026-01-01T00:00:00.000Z', msg: 'a' },
        { timestamp: '2026-06-01T00:00:00.000Z', msg: 'b' }
      ];
      const result = state.filterBySince(items, { currentOnly: false });
      assert.strictEqual(result.length, 2);
    });

    it('无 timestamp 的项被视为时间 0', () => {
      const items = [
        { msg: 'no timestamp' },
        { timestamp: '2099-01-01T00:00:00.000Z', msg: 'future' }
      ];
      const result = state.filterBySince(items, { since: '2026-01-01T00:00:00.000Z' });
      // 无 timestamp 的项时间为 0，小于 since，应被过滤
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].msg, 'future');
    });
  });

  describe('filterNetwork', () => {
    const sampleLogs = [
      { url: 'https://api.example.com/users', method: 'GET', status: 200, timestamp: '2099-01-01T00:00:00.000Z' },
      { url: 'https://api.example.com/posts', method: 'POST', status: 500, timestamp: '2099-01-01T00:00:00.000Z' },
      { url: 'https://cdn.example.com/script.js', method: 'GET', status: 304, timestamp: '2099-01-01T00:00:00.000Z' }
    ];

    it('urlContains 过滤 URL', () => {
      const result = state.filterNetwork(sampleLogs, { currentOnly: false, urlContains: 'api.example.com/users' });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].url, 'https://api.example.com/users');
    });

    it('contains 作为 urlContains 的别名', () => {
      const result = state.filterNetwork(sampleLogs, { currentOnly: false, contains: 'posts' });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].url, 'https://api.example.com/posts');
    });

    it('urlPattern 使用正则过滤', () => {
      const result = state.filterNetwork(sampleLogs, { currentOnly: false, urlPattern: '\\.js$' });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].url, 'https://cdn.example.com/script.js');
    });

    it('无效 urlPattern 跳过正则过滤', () => {
      const result = state.filterNetwork(sampleLogs, { currentOnly: false, urlPattern: '[' });
      // 无效正则不报错，返回所有（仅 since 过滤）
      assert.strictEqual(result.length, sampleLogs.length);
    });

    it('method 过滤 HTTP 方法', () => {
      const result = state.filterNetwork(sampleLogs, { currentOnly: false, method: 'POST' });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].method, 'POST');
    });

    it('statusMin 过滤最小状态码', () => {
      const result = state.filterNetwork(sampleLogs, { currentOnly: false, statusMin: 400 });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].status, 500);
    });

    it('statusMax 过滤最大状态码', () => {
      const result = state.filterNetwork(sampleLogs, { currentOnly: false, statusMax: 304 });
      assert.strictEqual(result.length, 2);
      const statuses = result.map(r => r.status).sort();
      assert.deepStrictEqual(statuses, [200, 304]);
    });

    it('组合多个过滤条件', () => {
      const result = state.filterNetwork(sampleLogs, {
        currentOnly: false,
        method: 'GET',
        statusMin: 200,
        statusMax: 200
      });
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].url, 'https://api.example.com/users');
    });
  });

  describe('trimLogs', () => {
    it('consoleLogs 超过 MAX_LOG_ENTRIES 时修剪', () => {
      for (let i = 0; i < state.MAX_LOG_ENTRIES + 100; i++) {
        state.consoleLogs.push({ msg: i });
      }
      state.trimLogs();
      assert.strictEqual(state.consoleLogs.length, state.MAX_LOG_ENTRIES);
    });

    it('networkLogs 超过 MAX_LOG_ENTRIES 时修剪', () => {
      for (let i = 0; i < state.MAX_LOG_ENTRIES + 50; i++) {
        state.networkLogs.push({ url: i });
      }
      state.trimLogs();
      assert.strictEqual(state.networkLogs.length, state.MAX_LOG_ENTRIES);
    });

    it('pageErrors 超过 MAX_LOG_ENTRIES/2 时修剪', () => {
      const halfMax = Math.floor(state.MAX_LOG_ENTRIES / 2);
      for (let i = 0; i < halfMax + 10; i++) {
        state.pageErrors.push({ err: i });
      }
      state.trimLogs();
      assert.strictEqual(state.pageErrors.length, halfMax);
    });

    it('清理过期的 requestStartTimes（超过 5 分钟）', () => {
      const now = Date.now();
      state.requestStartTimes.set('old-request', now - 6 * 60 * 1000); // 6 分钟前
      state.requestStartTimes.set('recent-request', now - 1000); // 1 秒前
      state.trimLogs();
      assert.strictEqual(state.requestStartTimes.size, 1);
      assert.ok(state.requestStartTimes.has('recent-request'));
      assert.ok(!state.requestStartTimes.has('old-request'));
    });

    it('日志未超限时不变', () => {
      state.consoleLogs.push({ msg: 'a' });
      state.networkLogs.push({ url: 'b' });
      state.pageErrors.push({ err: 'c' });
      state.trimLogs();
      assert.strictEqual(state.consoleLogs.length, 1);
      assert.strictEqual(state.networkLogs.length, 1);
      assert.strictEqual(state.pageErrors.length, 1);
    });
  });
});
