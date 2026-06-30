'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { buildResult, pass, fail } = require('../core/result');

test('buildResult - default is fail', () => {
  const r = buildResult();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.passed, false);
  assert.strictEqual(r.summary, 'fail');
  assert.strictEqual(r.data, null);
  assert.deepStrictEqual(r.artifacts, []);
  assert.deepStrictEqual(r.errors, []);
});

test('buildResult - ok option', () => {
  const r = buildResult({ ok: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.passed, true);
});

test('buildResult - passed option', () => {
  const r = buildResult({ passed: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.passed, true);
});

test('buildResult - summary', () => {
  const r = buildResult({ ok: true, summary: 'all good' });
  assert.strictEqual(r.summary, 'all good');
});

test('buildResult - data and artifacts and errors', () => {
  const r = buildResult({
    data: { foo: 'bar' },
    artifacts: ['a.png'],
    errors: ['oops']
  });
  assert.deepStrictEqual(r.data, { foo: 'bar' });
  assert.deepStrictEqual(r.artifacts, ['a.png']);
  assert.deepStrictEqual(r.errors, ['oops']);
});

test('buildResult - non-array artifacts/errors become empty arrays', () => {
  const r = buildResult({ artifacts: 'not-array', errors: 'not-array' });
  assert.deepStrictEqual(r.artifacts, []);
  assert.deepStrictEqual(r.errors, []);
});

test('pass - creates passing result', () => {
  const r = pass('great', { x: 1 }, ['shot.png']);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.passed, true);
  assert.strictEqual(r.summary, 'great');
  assert.deepStrictEqual(r.data, { x: 1 });
  assert.deepStrictEqual(r.artifacts, ['shot.png']);
  assert.deepStrictEqual(r.errors, []);
});

test('fail - creates failing result', () => {
  const r = fail('bad', ['err1', 'err2'], { info: 'x' }, ['log.txt']);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.passed, false);
  assert.strictEqual(r.summary, 'bad');
  assert.deepStrictEqual(r.errors, ['err1', 'err2']);
  assert.deepStrictEqual(r.data, { info: 'x' });
  assert.deepStrictEqual(r.artifacts, ['log.txt']);
});

test('fail - single error string becomes array', () => {
  const r = fail('bad', 'single-error');
  assert.deepStrictEqual(r.errors, ['single-error']);
});
