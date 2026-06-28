'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkUrl, safeUrlLog } = require('../core/security');
const { loadConfig } = require('../core/config');

test('security.checkUrl - invalid url', () => {
  const result = checkUrl('not a url');
  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes('invalid url'));
});

test('security.checkUrl - unsupported protocol', () => {
  const result = checkUrl('ftp://example.com');
  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes('unsupported protocol'));
});

test('security.checkUrl - http allowed by default', () => {
  const config = loadConfig();
  const result = checkUrl('http://example.com', config);
  if ((config.allowlist || []).length === 0) {
    assert.equal(result.allowed, true);
  }
});

test('security.checkUrl - https allowed by default', () => {
  const config = loadConfig();
  const result = checkUrl('https://example.com', config);
  if ((config.allowlist || []).length === 0) {
    assert.equal(result.allowed, true);
  }
});

test('security.checkUrl - blocked host', () => {
  const config = { blockedHosts: ['example.com'], allowlist: [] };
  const result = checkUrl('https://example.com', config);
  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes('blocked host'));
});

test('security.checkUrl - blocked subdomain', () => {
  const config = { blockedHosts: ['example.com'], allowlist: [] };
  const result = checkUrl('https://sub.example.com', config);
  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes('blocked host'));
});

test('security.checkUrl - allowlist mode rejects non-allowlisted', () => {
  const config = { blockedHosts: [], allowlist: ['trusted.com'] };
  const result = checkUrl('https://other.com', config);
  assert.equal(result.allowed, false);
  assert.ok(result.reason.includes('not in allowlist'));
});

test('security.checkUrl - allowlist mode allows allowlisted', () => {
  const config = { blockedHosts: [], allowlist: ['trusted.com'] };
  const result = checkUrl('https://trusted.com', config);
  assert.equal(result.allowed, true);
});

test('security.checkUrl - allowlist subdomain match', () => {
  const config = { blockedHosts: [], allowlist: ['trusted.com'] };
  const result = checkUrl('https://api.trusted.com', config);
  assert.equal(result.allowed, true);
});

test('security.safeUrlLog - removes credentials', () => {
  const result = safeUrlLog('https://user:pass@example.com/path');
  assert.ok(!result.includes('user'));
  assert.ok(!result.includes('pass'));
});

test('security.safeUrlLog - redacts search params', () => {
  const result = safeUrlLog('https://example.com/?secret=123');
  assert.ok(!result.includes('secret=123'));
});

test('security.safeUrlLog - removes hash', () => {
  const result = safeUrlLog('https://example.com/#token');
  assert.ok(!result.includes('token'));
});

test('security.safeUrlLog - handles invalid url gracefully', () => {
  const result = safeUrlLog('not a url');
  assert.equal(typeof result, 'string');
});
