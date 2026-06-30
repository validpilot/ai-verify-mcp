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
// browser_errors_clear
// ============================================================

describe('browser_errors_clear', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_errors_clear.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_errors_clear');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 无入参（properties 为空对象）', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_errors_clear.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props);
    assert.equal(Object.keys(props).length, 0);
  });

  test('toolNames 中包含 browser_errors_clear（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_errors_clear'), '工具 browser_errors_clear 应在 toolNames 中');
  });
});

// ============================================================
// browser_storage
// ============================================================

describe('browser_storage', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_storage.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_storage');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 scope 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_storage.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.scope);
    assert.equal(props.scope.type, 'string');
  });

  test('toolNames 中包含 browser_storage（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_storage'), '工具 browser_storage 应在 toolNames 中');
  });
});

// ============================================================
// browser_cookies
// ============================================================

describe('browser_cookies', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_cookies.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_cookies');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 action/domain/name/cookie 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_cookies.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.action);
    assert.equal(props.action.type, 'string');
    assert.deepEqual(props.action.enum, ['get', 'clear', 'set']);

    assert.ok(props.domain);
    assert.equal(props.domain.type, 'string');

    assert.ok(props.name);
    assert.equal(props.name.type, 'string');

    assert.ok(props.cookie);
    assert.equal(props.cookie.type, 'object');
    assert.ok(props.cookie.properties);
    assert.equal(props.cookie.properties.name.type, 'string');
    assert.equal(props.cookie.properties.value.type, 'string');
  });

  test('toolNames 中包含 browser_cookies（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_cookies'), '工具 browser_cookies 应在 toolNames 中');
  });
});
