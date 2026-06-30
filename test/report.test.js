'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildJsonReport, buildHtmlReport } = require('../core/report');

test('report.buildJsonReport - basic structure', () => {
  const report = buildJsonReport({ pass: true, summary: 'all good' });
  assert.ok(report.generatedAt);
  assert.equal(typeof report.generatedAt, 'string');
  assert.equal(report.ok, true);
  assert.equal(report.passed, true);
  assert.equal(report.summary, 'all good');
  assert.ok(Array.isArray(report.artifacts));
  assert.ok(Array.isArray(report.errors));
});

test('report.buildJsonReport - ok field priority', () => {
  const r1 = buildJsonReport({ ok: true });
  assert.equal(r1.ok, true);
  assert.equal(r1.passed, true);
  const r2 = buildJsonReport({ pass: false });
  assert.equal(r2.ok, false);
  assert.equal(r2.passed, false);
});

test('report.buildJsonReport - artifacts and errors', () => {
  const report = buildJsonReport({
    pass: true,
    artifacts: ['a.png', 'b.json'],
    errors: [{ msg: 'test error' }]
  });
  assert.equal(report.artifacts.length, 2);
  assert.equal(report.errors.length, 1);
});

test('report.buildJsonReport - redacts sensitive data', () => {
  const report = buildJsonReport({
    pass: true,
    data: { password: 'secret123', name: 'alice' }
  });
  assert.equal(report.data.password, '******');
  assert.equal(report.data.name, 'alice');
});

test('report.buildHtmlReport - returns HTML string', () => {
  const html = buildHtmlReport({ pass: true, summary: 'test' });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('ValidPilot Report'));
  assert.ok(html.includes('pass'));
  assert.ok(html.includes('test'));
});

test('report.buildHtmlReport - escapes HTML in summary', () => {
  const html = buildHtmlReport({ pass: false, summary: '<script>alert(1)</script>' });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('report.buildHtmlReport - fail status', () => {
  const html = buildHtmlReport({ pass: false });
  assert.ok(html.includes('fail'));
});
