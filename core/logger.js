'use strict';

const fs = require('fs');
const path = require('path');
const { redact } = require('./redaction');

class Logger {
  static LOG_FILE = path.join(__dirname, '..', 'validation.log');
  static MAX_LOG_SIZE = 10 * 1024 * 1024;
  static MAX_LOG_FILES = 5;

  constructor() {
    this.lastLogRotateCheck = 0;
  }

  rotateLogs() {
    try {
      for (let i = Logger.MAX_LOG_FILES - 1; i >= 1; i--) {
        const oldFile = `${Logger.LOG_FILE}.${i}`;
        const newFile = `${Logger.LOG_FILE}.${i + 1}`;
        if (fs.existsSync(oldFile)) {
          if (i === Logger.MAX_LOG_FILES - 1 && fs.existsSync(newFile)) {
            fs.unlinkSync(newFile);
          }
          fs.renameSync(oldFile, newFile);
        }
      }
      if (fs.existsSync(Logger.LOG_FILE)) {
        fs.renameSync(Logger.LOG_FILE, `${Logger.LOG_FILE}.1`);
      }
    } catch (_) {}
  }

  log(level, message, details = {}) {
    const entry = { timestamp: new Date().toISOString(), level, message, ...redact(details) };
    try {
      const now = Date.now();
      if (now - this.lastLogRotateCheck > 60000) {
        this.lastLogRotateCheck = now;
        try {
          const stats = fs.statSync(Logger.LOG_FILE);
          if (stats.size > Logger.MAX_LOG_SIZE) {
            this.rotateLogs();
          }
        } catch (_) {}
      }
      fs.appendFileSync(Logger.LOG_FILE, JSON.stringify(entry) + '\n');
    } catch (_) {}
  }

  readRecentMcpErrors(args = {}) {
    const limit = args.limit || 50;
    const includeWarnings = args.includeWarnings === true;
    const since = args.since ? new Date(args.since).getTime() : 0;
    try {
      if (!fs.existsSync(Logger.LOG_FILE)) return [];
      return fs.readFileSync(Logger.LOG_FILE, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-500)
        .map(line => {
          try { return JSON.parse(line); } catch (_) { return null; }
        })
        .filter(item => item && (item.level === 'ERROR' || (includeWarnings && item.level === 'WARN')))
        .filter(item => !since || new Date(item.timestamp || 0).getTime() >= since)
        .slice(-limit);
    } catch (error) {
      return [{ source: 'mcp-log', level: 'ERROR', message: '读取 MCP 日志失败', error: error.message, timestamp: new Date().toISOString() }];
    }
  }
}

module.exports = Logger;