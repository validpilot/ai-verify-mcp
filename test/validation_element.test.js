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

describe('validation_element', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'validation_element.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'validation_element');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 targetUrl/elementSelector 为必填，expectedText 为可选', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_element.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.targetUrl);
    assert.equal(props.targetUrl.type, 'string');
    assert.ok(props.elementSelector);
    assert.equal(props.elementSelector.type, 'string');
    assert.ok(props.expectedText);
    assert.equal(props.expectedText.type, 'string');
    assert.ok(schema.inputSchema.required.includes('targetUrl'), 'targetUrl 应为必填');
    assert.ok(schema.inputSchema.required.includes('elementSelector'), 'elementSelector 应为必填');
  });

  test('toolNames 中包含 validation_element（已注册到 MCP）', () => {
    assert.ok(toolNames.has('validation_element'), '工具 validation_element 应在 toolNames 中');
  });

  test('handler 调用 runValidationElement 函数', () => {
    const handlerSrc = fs.readFileSync(path.join(HANDLERS_DIR, 'validation.js'), 'utf8');
    assert.ok(handlerSrc.includes('runValidationElement'), '应调用 runValidationElement');
  });
});
