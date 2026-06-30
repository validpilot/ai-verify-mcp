'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { loadConfig, DEFAULT_CONFIG } = require('../core/config');

beforeEach(() => {
  delete process.env.VALIDPILOT_ARTIFACT_DIR;
  delete process.env.VALIDPILOT_REDACTION;
  delete process.env.VALIDPILOT_ALLOWLIST;
  delete process.env.VALIDPILOT_BLOCKED_HOSTS;
  delete process.env.VALIDPILOT_HEADLESS;
});

afterEach(() => {
  delete process.env.VALIDPILOT_ARTIFACT_DIR;
  delete process.env.VALIDPILOT_REDACTION;
  delete process.env.VALIDPILOT_ALLOWLIST;
  delete process.env.VALIDPILOT_BLOCKED_HOSTS;
  delete process.env.VALIDPILOT_HEADLESS;
});

test('loadConfig - returns default config with no overrides', () => {
  const config = loadConfig();
  assert.strictEqual(config.redaction, DEFAULT_CONFIG.redaction);
  assert.deepStrictEqual(config.allowlist, DEFAULT_CONFIG.allowlist);
  assert.deepStrictEqual(config.blockedHosts, []);
  assert.strictEqual(config.headless, DEFAULT_CONFIG.headless);
});

test('loadConfig - overrides work', () => {
  const config = loadConfig({ headless: false, redaction: false });
  assert.strictEqual(config.headless, false);
  assert.strictEqual(config.redaction, false);
});

test('loadConfig - env vars override defaults', () => {
  process.env.VALIDPILOT_HEADLESS = 'false';
  process.env.VALIDPILOT_REDACTION = '0';
  const config = loadConfig();
  assert.strictEqual(config.headless, false);
  assert.strictEqual(config.redaction, false);
});

test('loadConfig - env vars: truthy values', () => {
  process.env.VALIDPILOT_HEADLESS = 'true';
  process.env.VALIDPILOT_REDACTION = 'yes';
  const config = loadConfig();
  assert.strictEqual(config.headless, true);
  assert.strictEqual(config.redaction, true);
});

test('loadConfig - allowlist from env', () => {
  process.env.VALIDPILOT_ALLOWLIST = 'example.com,test.org , ,';
  const config = loadConfig();
  assert.deepStrictEqual(config.allowlist, ['example.com', 'test.org']);
});

test('loadConfig - blockedHosts from env', () => {
  process.env.VALIDPILOT_BLOCKED_HOSTS = 'evil.com,bad.net';
  const config = loadConfig();
  assert.deepStrictEqual(config.blockedHosts, ['evil.com', 'bad.net']);
});

test('loadConfig - overrides take precedence over env', () => {
  process.env.VALIDPILOT_HEADLESS = 'true';
  const config = loadConfig({ headless: false });
  assert.strictEqual(config.headless, false);
});
