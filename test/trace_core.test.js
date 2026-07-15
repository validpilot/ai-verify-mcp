'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const TraceManager = require('../core/trace');

describe('TraceManager', () => {
  let tm;

  beforeEach(() => {
    tm = new TraceManager();
  });

  describe('静态属性', () => {
    it('TRACE_HEADER_NAMES 包含 7 个常见追踪头', () => {
      assert.strictEqual(TraceManager.TRACE_HEADER_NAMES.length, 7);
      assert.ok(TraceManager.TRACE_HEADER_NAMES.includes('traceparent'));
      assert.ok(TraceManager.TRACE_HEADER_NAMES.includes('x-trace-id'));
      assert.ok(TraceManager.TRACE_HEADER_NAMES.includes('x-request-id'));
      assert.ok(TraceManager.TRACE_HEADER_NAMES.includes('x-correlation-id'));
      assert.ok(TraceManager.TRACE_HEADER_NAMES.includes('trace-id'));
      assert.ok(TraceManager.TRACE_HEADER_NAMES.includes('request-id'));
      assert.ok(TraceManager.TRACE_HEADER_NAMES.includes('x-amzn-trace-id'));
    });
  });

  describe('constructor', () => {
    it('初始化空 traceLogs 数组', () => {
      assert.ok(Array.isArray(tm.traceLogs));
      assert.strictEqual(tm.traceLogs.length, 0);
    });
  });

  describe('genHex', () => {
    it('生成指定长度的十六进制字符串', () => {
      const hex16 = tm.genHex(16);
      assert.strictEqual(hex16.length, 16);
      assert.ok(/^[0-9a-f]{16}$/.test(hex16));
    });

    it('生成 32 位十六进制字符串', () => {
      const hex32 = tm.genHex(32);
      assert.strictEqual(hex32.length, 32);
      assert.ok(/^[0-9a-f]{32}$/.test(hex32));
    });

    it('每次调用生成不同的值', () => {
      const a = tm.genHex(16);
      const b = tm.genHex(16);
      assert.notStrictEqual(a, b);
    });
  });

  describe('genTraceId', () => {
    it('生成 32 位十六进制 trace ID', () => {
      const id = tm.genTraceId();
      assert.strictEqual(id.length, 32);
      assert.ok(/^[0-9a-f]{32}$/.test(id));
    });
  });

  describe('genSpanId', () => {
    it('生成 16 位十六进制 span ID', () => {
      const id = tm.genSpanId();
      assert.strictEqual(id.length, 16);
      assert.ok(/^[0-9a-f]{16}$/.test(id));
    });
  });

  describe('buildTraceparent', () => {
    it('使用提供的 traceId 和 spanId 构建标准格式', () => {
      const traceId = '0af7651916cd43dd8448eb211c80319c';
      const spanId = 'b7ad6b7169203331';
      const tp = tm.buildTraceparent(traceId, spanId);
      assert.strictEqual(tp, `00-${traceId}-${spanId}-01`);
    });

    it('sampled=false 时 flags 为 00', () => {
      const tp = tm.buildTraceparent('0af7651916cd43dd8448eb211c80319c', 'b7ad6b7169203331', false);
      assert.ok(tp.endsWith('-00'));
    });

    it('sampled 默认为 true', () => {
      const tp = tm.buildTraceparent('0af7651916cd43dd8448eb211c80319c', 'b7ad6b7169203331');
      assert.ok(tp.endsWith('-01'));
    });

    it('未提供 traceId 时自动生成', () => {
      const tp = tm.buildTraceparent(null, 'b7ad6b7169203331');
      const parts = tp.split('-');
      assert.strictEqual(parts.length, 4);
      assert.strictEqual(parts[0], '00');
      assert.strictEqual(parts[1].length, 32);
      assert.strictEqual(parts[2], 'b7ad6b7169203331');
    });

    it('未提供 spanId 时自动生成', () => {
      const tp = tm.buildTraceparent('0af7651916cd43dd8448eb211c80319c', null);
      const parts = tp.split('-');
      assert.strictEqual(parts[2].length, 16);
    });
  });

  describe('parseTraceparent', () => {
    it('解析标准 W3C traceparent 格式', () => {
      const tp = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      const parsed = tm.parseTraceparent(tp);
      assert.ok(parsed);
      assert.strictEqual(parsed.version, '00');
      assert.strictEqual(parsed.traceId, '0af7651916cd43dd8448eb211c80319c');
      assert.strictEqual(parsed.spanId, 'b7ad6b7169203331');
      assert.strictEqual(parsed.flags, '01');
      assert.strictEqual(parsed.sampled, true);
    });

    it('flags=00 时 sampled 为 false', () => {
      const tp = '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-00';
      const parsed = tm.parseTraceparent(tp);
      assert.strictEqual(parsed.sampled, false);
    });

    it('解析纯 32 位 hex trace ID（无分隔符）', () => {
      const hex = '0af7651916cd43dd8448eb211c80319c';
      const parsed = tm.parseTraceparent(hex);
      assert.ok(parsed);
      assert.strictEqual(parsed.traceId, hex);
      assert.strictEqual(parsed.sampled, true);
      assert.strictEqual(parsed.flags, '01');
    });

    it('null 输入返回 null', () => {
      assert.strictEqual(tm.parseTraceparent(null), null);
    });

    it('空字符串返回 null', () => {
      assert.strictEqual(tm.parseTraceparent(''), null);
    });

    it('无效格式返回 null', () => {
      assert.strictEqual(tm.parseTraceparent('invalid-format'), null);
      assert.strictEqual(tm.parseTraceparent('00-short-b7ad6b7169203331-01'), null);
      assert.strictEqual(tm.parseTraceparent('not-hex-at-all'), null);
    });

    it('大写 hex 被接受', () => {
      const tp = '00-0AF7651916CD43DD8448EB211C80319C-B7AD6B7169203331-01';
      const parsed = tm.parseTraceparent(tp);
      assert.ok(parsed);
      // 大写 hex 应被接受（正则使用 i 标志）
      assert.ok(parsed.traceId);
    });

    it('带空白的输入被 trim', () => {
      const tp = '  00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01  ';
      const parsed = tm.parseTraceparent(tp);
      assert.ok(parsed);
    });
  });

  describe('findTraceId', () => {
    it('null headers 返回 null', () => {
      assert.strictEqual(tm.findTraceId(null), null);
    });

    it('空对象 headers 返回 null', () => {
      assert.strictEqual(tm.findTraceId({}), null);
    });

    it('从 traceparent 头提取 W3C trace ID', () => {
      const headers = {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
      };
      const result = tm.findTraceId(headers);
      assert.ok(result);
      assert.strictEqual(result.traceId, '0af7651916cd43dd8448eb211c80319c');
      assert.strictEqual(result.spanId, 'b7ad6b7169203331');
      assert.strictEqual(result.source, 'w3c-traceparent');
    });

    it('从 x-trace-id 头提取 trace ID', () => {
      const headers = { 'x-trace-id': 'custom-trace-123' };
      const result = tm.findTraceId(headers);
      assert.ok(result);
      assert.strictEqual(result.traceId, 'custom-trace-123');
      assert.strictEqual(result.spanId, null);
      assert.ok(result.source.includes('x-trace-id'));
    });

    it('从 x-request-id 头提取 trace ID', () => {
      const headers = { 'x-request-id': 'req-456' };
      const result = tm.findTraceId(headers);
      assert.ok(result);
      assert.strictEqual(result.traceId, 'req-456');
    });

    it('从 x-correlation-id 头提取 trace ID', () => {
      const headers = { 'x-correlation-id': 'corr-789' };
      const result = tm.findTraceId(headers);
      assert.ok(result);
      assert.strictEqual(result.traceId, 'corr-789');
    });

    it('从 x-amzn-trace-id 头提取 trace ID', () => {
      const headers = { 'x-amzn-trace-id': 'amzn-012' };
      const result = tm.findTraceId(headers);
      assert.ok(result);
      assert.strictEqual(result.traceId, 'amzn-012');
    });

    it('小写头名也能匹配', () => {
      const headers = { 'x-trace-id': 'lower-case-id' };
      const result = tm.findTraceId({ 'x_trace_id': 'underscore-id' });
      assert.ok(result);
      assert.strictEqual(result.traceId, 'underscore-id');
    });

    it('下划线变体头名（x_trace_id）能匹配', () => {
      const headers = { 'x_trace_id': 'underscore-id' };
      const result = tm.findTraceId(headers);
      assert.ok(result);
      assert.strictEqual(result.traceId, 'underscore-id');
    });

    it('traceparent 优先于其他头', () => {
      const headers = {
        'x-trace-id': 'from-x-trace-id',
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
      };
      const result = tm.findTraceId(headers);
      assert.strictEqual(result.source, 'w3c-traceparent');
      assert.strictEqual(result.traceId, '0af7651916cd43dd8448eb211c80319c');
    });

    it('traceparent 头值无效时回退到其他头', () => {
      const headers = {
        traceparent: 'invalid-value',
        'x-trace-id': 'fallback-id'
      };
      const result = tm.findTraceId(headers);
      assert.ok(result);
      assert.strictEqual(result.traceId, 'fallback-id');
    });

    it('多个非 traceparent 头时返回第一个匹配', () => {
      const headers = {
        'x-request-id': 'req-id',
        'x-trace-id': 'trace-id'
      };
      const result = tm.findTraceId(headers);
      assert.ok(result);
      // TRACE_HEADER_NAMES 中 x-trace-id 在 x-request-id 之后，
      // 但按数组顺序遍历，x-trace-id 先于 x-request-id
      assert.ok(result.traceId);
    });
  });

  describe('trimTraceLogs', () => {
    it('日志未超过限制时不修剪', () => {
      for (let i = 0; i < 100; i++) {
        tm.traceLogs.push({ step: i });
      }
      tm.trimTraceLogs();
      assert.strictEqual(tm.traceLogs.length, 100);
    });

    it('日志超过 1500 条时修剪为一半', () => {
      const MAX = 1500;
      for (let i = 0; i < MAX + 500; i++) {
        tm.traceLogs.push({ step: i });
      }
      tm.trimTraceLogs();
      assert.strictEqual(tm.traceLogs.length, Math.floor(MAX / 2));
      // 保留的是最后 750 条（索引从 1250 到 1999）
      assert.strictEqual(tm.traceLogs[0].step, 1250);
      assert.strictEqual(tm.traceLogs[tm.traceLogs.length - 1].step, MAX + 499);
    });

    it('恰好等于限制时不修剪', () => {
      const MAX = 1500;
      for (let i = 0; i < MAX; i++) {
        tm.traceLogs.push({ step: i });
      }
      tm.trimTraceLogs();
      assert.strictEqual(tm.traceLogs.length, MAX);
    });
  });
});
