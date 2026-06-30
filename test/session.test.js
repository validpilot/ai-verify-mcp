'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const HANDLERS_DIR = path.join(__dirname, '..', 'handlers');

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
// browser_sessions
// ============================================================

describe('browser_sessions', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_sessions.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_sessions');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_sessions（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_sessions'), '工具 browser_sessions 应在 toolNames 中');
  });
});

// ============================================================
// browser_session_create
// ============================================================

describe('browser_session_create', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_session_create.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_session_create');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_session_create（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_session_create'), '工具 browser_session_create 应在 toolNames 中');
  });
});

// ============================================================
// browser_session_switch
// ============================================================

describe('browser_session_switch', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_session_switch.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_session_switch');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_session_switch（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_session_switch'), '工具 browser_session_switch 应在 toolNames 中');
  });
});

// ============================================================
// browser_session_close
// ============================================================

describe('browser_session_close', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_session_close.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_session_close');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 browser_session_close（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_session_close'), '工具 browser_session_close 应在 toolNames 中');
  });
});
