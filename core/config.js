'use strict';

const path = require('path');

const DEFAULT_CONFIG = {
  artifactDir: path.join(__dirname, '..', 'artifacts'),
  redaction: true,
  allowlist: ['localhost', '127.0.0.1', '::1'],
  blockedHosts: [],
  headless: true
};

function parseList(value) {
  if (!value) return [];
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function parseBool(value, fallback) {
  if (value === undefined) return fallback;
  return !/^(false|0|no)$/i.test(String(value));
}

function loadConfig(overrides = {}) {
  const envConfig = {
    artifactDir: process.env.VALIDPILOT_ARTIFACT_DIR || DEFAULT_CONFIG.artifactDir,
    redaction: parseBool(process.env.VALIDPILOT_REDACTION, DEFAULT_CONFIG.redaction),
    allowlist: parseList(process.env.VALIDPILOT_ALLOWLIST).length ? parseList(process.env.VALIDPILOT_ALLOWLIST) : DEFAULT_CONFIG.allowlist,
    blockedHosts: parseList(process.env.VALIDPILOT_BLOCKED_HOSTS),
    headless: parseBool(process.env.VALIDPILOT_HEADLESS, DEFAULT_CONFIG.headless)
  };
  return { ...DEFAULT_CONFIG, ...envConfig, ...overrides };
}

module.exports = {
  DEFAULT_CONFIG,
  loadConfig
};
