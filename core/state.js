'use strict';

const fs = require('fs');
const path = require('path');

class StateManager {
  constructor() {
    this.consoleLogs = [];
    this.networkLogs = [];
    this.pageErrors = [];
    this.currentCheckpoint = new Date().toISOString();
    this.requestStartTimes = new Map();
    this.MAX_LOG_ENTRIES = 500;
  }

  loadTools(TOOLS_DIR, logFn) {
    const tools = [];
    try {
      for (const file of fs.readdirSync(TOOLS_DIR)) {
        if (!file.endsWith('.json')) continue;
        const tool = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, file), 'utf8'));
        if (tool.input_schema && !tool.inputSchema) {
          tool.inputSchema = tool.input_schema;
          delete tool.input_schema;
        }
        tools.push(tool);
      }
    } catch (error) {
      if (logFn) logFn('ERROR', '加载工具失败', { error: error.message });
    }
    return tools;
  }

  resetRuntimeLogs(logFn) {
    this.consoleLogs = [];
    this.networkLogs = [];
    this.pageErrors = [];
    this.currentCheckpoint = new Date().toISOString();
    if (logFn) logFn('INFO', 'runtime logs cleared', { checkpoint: this.currentCheckpoint });
  }

  parseSince(args = {}) {
    if (args.since) return new Date(args.since).getTime();
    if (args.currentOnly !== false) return new Date(this.currentCheckpoint).getTime();
    return 0;
  }

  filterBySince(items, args = {}) {
    const since = this.parseSince(args);
    return items.filter(item => !since || new Date(item.timestamp || 0).getTime() >= since);
  }

  filterNetwork(items, args = {}) {
    let records = this.filterBySince(items, args);
    const contains = args.urlContains || args.contains;
    if (contains) records = records.filter(item => item.url && item.url.includes(contains));
    if (args.urlPattern) {
      try {
        const re = new RegExp(args.urlPattern);
        records = records.filter(item => item.url && re.test(item.url));
      } catch (e) {
        // invalid regex, skip pattern filter
      }
    }
    if (args.method) records = records.filter(item => item.method === args.method);
    if (typeof args.statusMin === 'number') records = records.filter(item => Number(item.status || 0) >= args.statusMin);
    if (typeof args.statusMax === 'number') records = records.filter(item => Number(item.status || 0) <= args.statusMax);
    return records;
  }

  trimLogs() {
    if (this.consoleLogs.length > this.MAX_LOG_ENTRIES) {
      this.consoleLogs = this.consoleLogs.slice(-this.MAX_LOG_ENTRIES);
    }
    if (this.networkLogs.length > this.MAX_LOG_ENTRIES) {
      this.networkLogs = this.networkLogs.slice(-this.MAX_LOG_ENTRIES);
    }
    if (this.pageErrors.length > this.MAX_LOG_ENTRIES / 2) {
      this.pageErrors = this.pageErrors.slice(-Math.floor(this.MAX_LOG_ENTRIES / 2));
    }
    const now = Date.now();
    const MAX_REQUEST_AGE = 5 * 60 * 1000;
    for (const [request, startTime] of this.requestStartTimes.entries()) {
      if (now - startTime > MAX_REQUEST_AGE) {
        this.requestStartTimes.delete(request);
      }
    }
  }
}

module.exports = {
  StateManager
};