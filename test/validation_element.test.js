'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const SERVER_FILE = path.join(__dirname, '..', 'server.js');

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

  test('server.js 包含 validation_element 的 case 处理器', () => {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    assert.ok(src.includes("case 'validation_element'"));
  });

  test('handler 调用 runValidationElement 函数', () => {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    const match = src.match(/case 'validation_element':[\s\S]*?return/);
    assert.ok(match, 'validation_element handler 应包含 return 语句');
    assert.ok(src.includes('runValidationElement'), '应调用 runValidationElement');
  });
});
