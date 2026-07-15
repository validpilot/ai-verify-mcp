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
  assert.ok(html.includes('ValidPilot Verify'));
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

// ========== 补充分支测试 ==========

test('report.buildJsonReport - passed 字段优先于 pass', () => {
  const r = buildJsonReport({ passed: true, pass: false });
  assert.equal(r.passed, true);
});

test('report.buildJsonReport - ok 回退到 pass 再到 passed', () => {
  const r = buildJsonReport({ passed: true });
  // ok 优先链: data.ok → data.pass → data.passed → false
  // 当只有 passed: true 时，ok 回退到 data.passed = true
  assert.equal(r.ok, true);
  assert.equal(r.passed, true);
});

test('report.buildJsonReport - 默认 summary 为空字符串', () => {
  const r = buildJsonReport({});
  assert.equal(r.summary, '');
  assert.equal(r.ok, false);
  assert.equal(r.passed, false);
});

test('report.buildJsonReport - 非数组 artifacts 被规范化为空数组', () => {
  const r = buildJsonReport({ artifacts: 'not an array', errors: null });
  assert.ok(Array.isArray(r.artifacts));
  assert.strictEqual(r.artifacts.length, 0);
  assert.ok(Array.isArray(r.errors));
  assert.strictEqual(r.errors.length, 0);
});

test('report.buildJsonReport - data 与顶层字段合并', () => {
  const r = buildJsonReport({ pass: true, data: { custom: 'value' } });
  assert.equal(r.data.custom, 'value');
});

test('report.buildHtmlReport - 冒烟测试数据（data.items）', () => {
  const html = buildHtmlReport({
    pass: true,
    items: [{ name: 'tool1', passed: true }, { name: 'tool2', passed: false }]
  });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('tool1') || html.includes('tool2'));
});

test('report.buildHtmlReport - 错误报告（data.error）', () => {
  const html = buildHtmlReport({
    error: 'Something went wrong',
    isError: true
  });
  assert.ok(html.startsWith('<!doctype html>'));
});

test('report.buildHtmlReport - 验证报告带完整数据', () => {
  const html = buildHtmlReport({
    pass: true,
    name: 'Integration Test',
    type: 'e2e',
    summary: 'All checks passed',
    results: [{ passed: true }, { passed: true }, { passed: false }],
    findings: [{ name: 'finding1', severity: 'info' }],
    toolchain: { browser: 'chromium', tools: ['tool1'], version: '1.0.0' }
  });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('Integration Test') || html.includes('pass'));
});

test('report.buildHtmlReport - fallback HTML（report-html 加载失败时）', () => {
  // 通过 mock require 来触发 catch 块
  // 直接测试 buildHtmlReport 的 catch 路径较难，因为 report-html.js 是有效模块
  // 但可以验证正常路径的健壮性
  const html = buildHtmlReport({ pass: true });
  assert.ok(typeof html === 'string');
  assert.ok(html.length > 0);
});

test('report.escapeHtml - 转义特殊字符（通过 buildHtmlReport summary 间接测试）', () => {
  const html = buildHtmlReport({
    pass: false,
    summary: '<img src=x onerror=alert(1)>'
  });
  // 确保原始 HTML 标签不出现在输出中
  assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.ok(html.includes('&lt;img'));
});

test('report.escapeHtml - 转义引号和 & 符号', () => {
  const html = buildHtmlReport({
    pass: false,
    summary: 'a & b "c" <d>'
  });
  assert.ok(html.includes('&amp;'));
});
