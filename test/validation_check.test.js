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

describe('validation_check', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'validation_check.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'validation_check');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 name/url/wait/assertions 等业务参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_check.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.name);
    assert.equal(props.name.type, 'string');
    assert.ok(props.url);
    assert.equal(props.url.type, 'string');
    assert.ok(props.wait);
    assert.equal(props.wait.type, 'object');
    assert.ok(props.assertions);
    assert.equal(props.assertions.type, 'object');
    assert.ok(props.textContains);
    assert.equal(props.textContains.type, 'string');
    assert.ok(props.selectorVisible);
    assert.equal(props.selectorVisible.type, 'string');
    assert.ok(props.urlContains);
    assert.equal(props.urlContains.type, 'string');
    assert.ok(props.noErrors);
    assert.equal(props.noErrors.type, 'boolean');
    assert.ok(props.clearErrors);
    assert.equal(props.clearErrors.type, 'boolean');
    assert.ok(props.instrument);
    assert.equal(props.instrument.type, 'boolean');
    assert.ok(props.evidence);
    assert.equal(props.evidence.type, 'boolean');
  });

  test('toolNames 中包含 validation_check（已注册到 MCP）', () => {
    assert.ok(toolNames.has('validation_check'), '工具 validation_check 应在 toolNames 中');
  });

  test('handler 调用 runValidationCheck 函数', () => {
    const handlerSrc = fs.readFileSync(path.join(HANDLERS_DIR, 'validation.js'), 'utf8');
    assert.ok(handlerSrc.includes('runValidationCheck'), '应调用 runValidationCheck');
  });
});
