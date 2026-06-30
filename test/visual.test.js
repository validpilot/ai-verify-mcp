'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');

// Build toolNames from handler modules
const handlers = [
  require('../handlers/visual'),
];

function buildToolNames() {
  const names = new Set();
  for (const h of handlers) {
    for (const name of h.tools) {
      names.add(name);
    }
  }
  return names;
}

const toolNames = buildToolNames();

// ============================================================
// browser_visual_baseline
// ============================================================

describe('browser_visual_baseline', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_visual_baseline.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_visual_baseline');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_visual_baseline', () => {
    assert.ok(toolNames.has('browser_visual_baseline'), '工具 browser_visual_baseline 应在 toolNames 中');
  });
});

// ============================================================
// browser_visual_compare
// ============================================================

describe('browser_visual_compare', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_visual_compare.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_visual_compare');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_visual_compare', () => {
    assert.ok(toolNames.has('browser_visual_compare'), '工具 browser_visual_compare 应在 toolNames 中');
  });
});

// ============================================================
// browser_visual_report
// ============================================================

describe('browser_visual_report', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_visual_report.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_visual_report');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_visual_report', () => {
    assert.ok(toolNames.has('browser_visual_report'), '工具 browser_visual_report 应在 toolNames 中');
  });
});

// ============================================================
// browser_a11y_check
// ============================================================

describe('browser_a11y_check', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_a11y_check.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_a11y_check');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_a11y_check', () => {
    assert.ok(toolNames.has('browser_a11y_check'), '工具 browser_a11y_check 应在 toolNames 中');
  });
});

// ============================================================
// screenshot_diff
// ============================================================

describe('screenshot_diff', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'screenshot_diff.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'screenshot_diff');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 screenshot_diff', () => {
    assert.ok(toolNames.has('screenshot_diff'), '工具 screenshot_diff 应在 toolNames 中');
  });
});

// ============================================================
// browser_full_audit
// ============================================================

describe('browser_full_audit', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_full_audit.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_full_audit');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_full_audit', () => {
    assert.ok(toolNames.has('browser_full_audit'), '工具 browser_full_audit 应在 toolNames 中');
  });
});

// ============================================================
// browser_performance_check
// ============================================================

describe('browser_performance_check', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_performance_check.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_performance_check');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_performance_check', () => {
    assert.ok(toolNames.has('browser_performance_check'), '工具 browser_performance_check 应在 toolNames 中');
  });
});

// ============================================================
// browser_lighthouse_audit
// ============================================================

describe('browser_lighthouse_audit', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_lighthouse_audit.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_lighthouse_audit');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_lighthouse_audit', () => {
    assert.ok(toolNames.has('browser_lighthouse_audit'), '工具 browser_lighthouse_audit 应在 toolNames 中');
  });
});
