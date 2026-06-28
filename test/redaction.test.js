'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { redactString, isSensitiveKey, redact } = require('../core/redaction');

test('redaction.isSensitiveKey - password', () => {
  assert.equal(isSensitiveKey('password'), true);
  assert.equal(isSensitiveKey('Password'), true);
  assert.equal(isSensitiveKey('user_password'), true);
});

test('redaction.isSensitiveKey - token', () => {
  assert.equal(isSensitiveKey('token'), true);
  assert.equal(isSensitiveKey('access_token'), true);
});

test('redaction.isSensitiveKey - secret', () => {
  assert.equal(isSensitiveKey('secret'), true);
  assert.equal(isSensitiveKey('api_secret'), true);
});

test('redaction.isSensitiveKey - api key variants', () => {
  assert.equal(isSensitiveKey('apikey'), true);
  assert.equal(isSensitiveKey('api_key'), true);
  assert.equal(isSensitiveKey('api-key'), true);
});

test('redaction.isSensitiveKey - not sensitive', () => {
  assert.equal(isSensitiveKey('username'), false);
  assert.equal(isSensitiveKey('name'), false);
  assert.equal(isSensitiveKey('email'), false);
  assert.equal(isSensitiveKey(''), false);
});

test('redaction.redactString - Bearer token', () => {
  const result = redactString('Authorization: Bearer abc123.def456.ghi789');
  assert.ok(!result.includes('abc123'));
  assert.ok(result.includes('Authorization:'));
  assert.ok(result.includes('******'));
});

test('redaction.redactString - api_key pattern', () => {
  const result = redactString('api_key: sk-1234567890abcdef');
  assert.ok(!result.includes('sk-1234567890'));
  assert.ok(result.includes('api_key'));
});

test('redaction.redactString - token pattern', () => {
  const result = redactString('token=ghp_abcdefghij1234567890');
  assert.ok(!result.includes('ghp_abcdef'));
  assert.ok(result.includes('token='));
});

test('redaction.redactString - plain text unchanged', () => {
  const text = 'hello world';
  assert.equal(redactString(text), text);
});

test('redaction - null value returns null', () => {
  assert.equal(redact(null), null);
  assert.equal(redact(undefined), undefined);
});

test('redaction - sensitive key redacted', () => {
  const obj = { password: 'secret123' };
  const result = redact(obj);
  assert.equal(result.password, '******');
});

test('redaction - nested object sensitive keys', () => {
  const obj = {
    user: { name: 'alice', token: 'abc123' },
    config: { api_key: 'sk-xxx' }
  };
  const result = redact(obj);
  assert.equal(result.user.name, 'alice');
  assert.equal(result.user.token, '******');
  assert.equal(result.config.api_key, '******');
});

test('redaction - array of objects', () => {
  const arr = [
    { user: 'a', password: 'p1' },
    { user: 'b', password: 'p2' }
  ];
  const result = redact(arr);
  assert.equal(result.length, 2);
  assert.equal(result[0].password, '******');
  assert.equal(result[1].password, '******');
});

test('redaction - string with sensitive text inside object', () => {
  const obj = { header: 'Bearer xyz1234567890' };
  const result = redact(obj);
  assert.ok(!result.header.includes('xyz1234567890'));
});

test('redaction - primitives pass through', () => {
  assert.equal(redact(42), 42);
  assert.equal(redact(true), true);
  assert.equal(redact('hello'), 'hello');
});
