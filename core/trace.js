'use strict';

const MAX_TRACE_LOGS = 1500;

class TraceManager {
  static TRACE_HEADER_NAMES = [
    'traceparent', 'x-trace-id', 'x-request-id', 'x-correlation-id',
    'trace-id', 'request-id', 'x-amzn-trace-id'
  ];

  constructor() {
    this.traceLogs = [];
  }

  genHex(bytes) {
    let s = '';
    for (let i = 0; i < bytes; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }

  genTraceId() { return this.genHex(32); }
  genSpanId() { return this.genHex(16); }

  buildTraceparent(traceId, spanId, sampled = true) {
    return `00-${traceId || this.genTraceId()}-${spanId || this.genSpanId()}-${sampled ? '01' : '00'}`;
  }

  parseTraceparent(h) {
    if (!h) return null;
    const v = String(h).trim();
    const m = v.match(/^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i);
    if (m) return { version: m[1], traceId: m[2], spanId: m[3], flags: m[4], sampled: m[4] === '01' };
    const parts = v.split('-');
    if (parts.length === 1 && /^[0-9a-f]{32}$/i.test(parts[0])) return { traceId: parts[0], flags: '01', sampled: true };
    return null;
  }

  findTraceId(headers) {
    if (!headers) return null;
    for (const key of TraceManager.TRACE_HEADER_NAMES) {
      const val = headers[key] || headers[key.toLowerCase()];
      if (val) {
        const parsed = this.parseTraceparent(val);
        if (parsed) return { traceId: parsed.traceId, spanId: parsed.spanId, source: 'w3c-traceparent' };
      }
    }
    for (const key of TraceManager.TRACE_HEADER_NAMES) {
      if (key === 'traceparent') continue;
      const val = headers[key] || headers[key.toLowerCase()];
      if (val) return { traceId: val, spanId: null, source: `header:${key}` };
    }
    for (const key of TraceManager.TRACE_HEADER_NAMES) {
      if (key === 'traceparent') continue;
      const underscoreKey = key.replace(/-/g, '_');
      const val = headers[underscoreKey] || headers[underscoreKey.toLowerCase()];
      if (val) return { traceId: val, spanId: null, source: `header:${underscoreKey}` };
    }
    return null;
  }

  trimTraceLogs() {
    if (this.traceLogs.length > MAX_TRACE_LOGS) {
      this.traceLogs = this.traceLogs.slice(-Math.floor(MAX_TRACE_LOGS / 2));
    }
  }
}

module.exports = TraceManager;
