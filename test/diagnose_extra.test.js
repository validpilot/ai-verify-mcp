'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const HANDLERS_DIR = path.join(__dirname, '..', 'handlers');
const SERVER_FILE = path.join(__dirname, '..', 'server.js');

// Build toolNames from handler modules
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
// browser_debug_report
// ============================================================

describe('browser_debug_report', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_debug_report.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_debug_report');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
    assert.ok(schema.inputSchema.properties);
  });

  test('schema 包含 includeDom/includeStorage 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_debug_report.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.includeDom);
    assert.equal(props.includeDom.type, 'boolean');
    assert.ok(props.includeStorage);
    assert.equal(props.includeStorage.type, 'boolean');
  });

  test('toolNames 中包含 browser_debug_report（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_debug_report'), '工具 browser_debug_report 应在 toolNames 中');
  });
});

// ============================================================
// error_summary_md
// ============================================================

describe('error_summary_md', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'error_summary_md.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'error_summary_md');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
    assert.ok(schema.inputSchema.properties);
  });

  test('schema 包含 evidence/limit 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'error_summary_md.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.evidence);
    assert.equal(props.evidence.type, 'object');
    assert.ok(props.limit);
    assert.equal(props.limit.type, 'number');
  });

  test('toolNames 中包含 error_summary_md（已注册到 MCP）', () => {
    assert.ok(toolNames.has('error_summary_md'), '工具 error_summary_md 应在 toolNames 中');
  });
});

// ============================================================
// debug_investigate
// ============================================================

describe('debug_investigate', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'debug_investigate.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'debug_investigate');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
    assert.ok(schema.inputSchema.properties);
  });

  test('schema 包含 symptom/expected/focus/urlContains/statusMin/limit/includeStorage/includeArtifacts 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'debug_investigate.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.symptom);
    assert.equal(props.symptom.type, 'string');
    assert.ok(props.expected);
    assert.equal(props.expected.type, 'string');
    assert.ok(props.focus);
    assert.equal(props.focus.type, 'string');
    assert.ok(props.urlContains);
    assert.equal(props.urlContains.type, 'string');
    assert.ok(props.statusMin);
    assert.equal(props.statusMin.type, 'number');
    assert.ok(props.limit);
    assert.equal(props.limit.type, 'number');
    assert.ok(props.includeStorage);
    assert.equal(props.includeStorage.type, 'boolean');
    assert.ok(props.includeArtifacts);
    assert.equal(props.includeArtifacts.type, 'boolean');
  });

  test('toolNames 中包含 debug_investigate（已注册到 MCP）', () => {
    assert.ok(toolNames.has('debug_investigate'), '工具 debug_investigate 应在 toolNames 中');
  });
});
