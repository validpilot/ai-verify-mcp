'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');

// Build toolNames from all handler modules
const handlers = [
  require('../handlers/browser'),
  require('../handlers/session'),
  require('../handlers/evidence'),
  require('../handlers/network'),
  require('../handlers/validation'),
  require('../handlers/diagnose'),
  require('../handlers/visual'),
  require('../handlers/locator'),
  require('../handlers/system'),
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
// browser_screenshot
// ============================================================

describe('browser_screenshot', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_screenshot.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_screenshot');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_screenshot（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_screenshot'), '工具 browser_screenshot 应在 toolNames 中');
  });
});

// ============================================================
// browser_screenshot_element
// ============================================================

describe('browser_screenshot_element', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_screenshot_element.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_screenshot_element');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_screenshot_element（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_screenshot_element'), '工具 browser_screenshot_element 应在 toolNames 中');
  });
});

// ============================================================
// browser_artifacts
// ============================================================

describe('browser_artifacts', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_artifacts.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_artifacts');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_artifacts（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_artifacts'), '工具 browser_artifacts 应在 toolNames 中');
  });
});

// ============================================================
// browser_artifacts_clear
// ============================================================

describe('browser_artifacts_clear', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_artifacts_clear.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_artifacts_clear');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_artifacts_clear（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_artifacts_clear'), '工具 browser_artifacts_clear 应在 toolNames 中');
  });
});

// ============================================================
// browser_har_export
// ============================================================

describe('browser_har_export', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_har_export.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_har_export');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_har_export（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_har_export'), '工具 browser_har_export 应在 toolNames 中');
  });
});

// ============================================================
// browser_step
// ============================================================

describe('browser_step', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_step.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_step');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_step（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_step'), '工具 browser_step 应在 toolNames 中');
  });
});

// ============================================================
// browser_trace_start
// ============================================================

describe('browser_trace_start', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_trace_start.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_trace_start');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_trace_start（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_trace_start'), '工具 browser_trace_start 应在 toolNames 中');
  });
});

// ============================================================
// browser_trace_stop
// ============================================================

describe('browser_trace_stop', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_trace_stop.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_trace_stop');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_trace_stop（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_trace_stop'), '工具 browser_trace_stop 应在 toolNames 中');
  });
});
