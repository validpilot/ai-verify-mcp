'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const Logger = require('../core/logger');

// 使用临时目录避免污染实际日志文件
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-logger-test-'));
const tmpLogFile = path.join(tmpDir, 'validation.log');

describe('Logger', () => {
  let logger;

  before(() => {
    // 重定向 LOG_FILE 到临时文件
    Logger.LOG_FILE = tmpLogFile;
  });

  after(() => {
    // 清理临时目录
    try {
      for (const file of fs.readdirSync(tmpDir)) {
        fs.unlinkSync(path.join(tmpDir, file));
      }
      fs.rmdirSync(tmpDir);
    } catch (_) {}
  });

  beforeEach(() => {
    logger = new Logger();
    // 清理临时日志文件
    try { fs.unlinkSync(tmpLogFile); } catch (_) {}
    for (let i = 1; i <= Logger.MAX_LOG_FILES + 1; i++) {
      try { fs.unlinkSync(`${tmpLogFile}.${i}`); } catch (_) {}
    }
  });

  describe('rotateLogs', () => {
    it('将主日志文件重命名为 .1', () => {
      fs.writeFileSync(tmpLogFile, 'line1\n');
      logger.rotateLogs();
      assert.ok(fs.existsSync(`${tmpLogFile}.1`));
      assert.ok(!fs.existsSync(tmpLogFile));
    });

    it('轮转已有的 .1 到 .2', () => {
      fs.writeFileSync(tmpLogFile, 'current\n');
      fs.writeFileSync(`${tmpLogFile}.1`, 'old1\n');
      logger.rotateLogs();
      assert.ok(fs.existsSync(`${tmpLogFile}.1`));
      assert.ok(fs.existsSync(`${tmpLogFile}.2`));
      assert.strictEqual(fs.readFileSync(`${tmpLogFile}.2`, 'utf8'), 'old1\n');
    });

    it('删除超出 MAX_LOG_FILES 的最旧文件', () => {
      // 创建 .4 和 .5 文件（MAX_LOG_FILES=5）
      // rotateLogs 循环从 i=4 开始: .4 存在时, 先删除 .5, 再 rename .4→.5
      fs.writeFileSync(tmpLogFile, 'current\n');
      fs.writeFileSync(`${tmpLogFile}.${Logger.MAX_LOG_FILES - 1}`, 'fourth\n');
      fs.writeFileSync(`${tmpLogFile}.${Logger.MAX_LOG_FILES}`, 'oldest\n');
      logger.rotateLogs();
      // 旧的 .5 应该被删除, 新的 .5 由 .4 重命名而来
      assert.ok(fs.existsSync(`${tmpLogFile}.${Logger.MAX_LOG_FILES}`));
      assert.strictEqual(fs.readFileSync(`${tmpLogFile}.${Logger.MAX_LOG_FILES}`, 'utf8'), 'fourth\n');
    });

    it('无日志文件时不报错', () => {
      assert.doesNotThrow(() => logger.rotateLogs());
    });
  });

  describe('log', () => {
    it('写入日志条目到文件', () => {
      logger.log('INFO', 'test message', { customField: 'value' });
      const content = fs.readFileSync(tmpLogFile, 'utf8');
      const entry = JSON.parse(content.trim());
      assert.strictEqual(entry.level, 'INFO');
      assert.strictEqual(entry.message, 'test message');
      assert.strictEqual(entry.customField, 'value');
      assert.ok(entry.timestamp);
    });

    it('脱敏敏感字段', () => {
      logger.log('INFO', 'login', { password: 'secret123', user: 'alice' });
      const content = fs.readFileSync(tmpLogFile, 'utf8');
      const entry = JSON.parse(content.trim());
      assert.strictEqual(entry.password, '******');
      assert.strictEqual(entry.user, 'alice');
    });

    it('details 默认为空对象', () => {
      logger.log('ERROR', 'no details');
      const content = fs.readFileSync(tmpLogFile, 'utf8');
      const entry = JSON.parse(content.trim());
      assert.strictEqual(entry.level, 'ERROR');
      assert.strictEqual(entry.message, 'no details');
    });

    it('大日志文件触发轮转', () => {
      // 写入超过 MAX_LOG_SIZE 的内容
      const largeData = 'x'.repeat(Logger.MAX_LOG_SIZE + 100);
      fs.writeFileSync(tmpLogFile, largeData);
      // 设置 lastLogRotateCheck 为 0 确保触发检查
      logger.lastLogRotateCheck = 0;
      logger.log('INFO', 'trigger rotate');
      // 原文件应被轮转为 .1
      assert.ok(fs.existsSync(`${tmpLogFile}.1`));
      // 新日志应写入主文件
      const content = fs.readFileSync(tmpLogFile, 'utf8');
      const entry = JSON.parse(content.trim());
      assert.strictEqual(entry.message, 'trigger rotate');
    });

    it('60 秒内不重复检查轮转', () => {
      logger.log('INFO', 'first');
      const firstCheck = logger.lastLogRotateCheck;
      logger.log('INFO', 'second');
      // 第二次不应触发轮转检查（lastLogRotateCheck 不变）
      assert.strictEqual(logger.lastLogRotateCheck, firstCheck);
    });
  });

  describe('readRecentMcpErrors', () => {
    it('返回空数组当日志文件不存在', () => {
      try { fs.unlinkSync(tmpLogFile); } catch (_) {}
      const result = logger.readRecentMcpErrors();
      assert.deepStrictEqual(result, []);
    });

    it('只返回 ERROR 级别日志', () => {
      logger.log('INFO', 'info message');
      logger.log('ERROR', 'error message');
      logger.log('WARN', 'warn message');
      const result = logger.readRecentMcpErrors();
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].level, 'ERROR');
      assert.strictEqual(result[0].message, 'error message');
    });

    it('includeWarnings 选项包含 WARN 级别', () => {
      logger.log('ERROR', 'error message');
      logger.log('WARN', 'warn message');
      logger.log('INFO', 'info message');
      const result = logger.readRecentMcpErrors({ includeWarnings: true });
      assert.strictEqual(result.length, 2);
      const levels = result.map(e => e.level).sort();
      assert.deepStrictEqual(levels, ['ERROR', 'WARN']);
    });

    it('limit 选项限制返回数量', () => {
      for (let i = 0; i < 10; i++) {
        logger.log('ERROR', `error ${i}`);
      }
      const result = logger.readRecentMcpErrors({ limit: 3 });
      assert.strictEqual(result.length, 3);
    });

    it('since 选项过滤时间', async () => {
      logger.log('ERROR', 'old error');
      // 等待 50ms 确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 50));
      const cutoff = new Date().toISOString();
      // 再等待 50ms 确保新日志时间戳严格大于 cutoff
      await new Promise(resolve => setTimeout(resolve, 50));
      logger.log('ERROR', 'recent error');
      const result = logger.readRecentMcpErrors({ since: cutoff });
      // 只应返回 cutoff 之后的日志
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].message, 'recent error');
    });

    it('跳过无法解析的行', () => {
      fs.writeFileSync(tmpLogFile, 'invalid json line\n');
      logger.log('ERROR', 'valid error');
      const result = logger.readRecentMcpErrors();
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].message, 'valid error');
    });
  });
});
