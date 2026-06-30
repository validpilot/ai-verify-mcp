'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const SERVER_FILE = path.join(__dirname, '..', 'server.js');

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

  test('server.js 包含 validation_check 的 case 处理器', () => {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    assert.ok(src.includes("case 'validation_check'"));
  });

  test('handler 调用 runValidationCheck 函数', () => {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    assert.ok(src.includes('runValidationCheck'), '应调用 runValidationCheck');
  });
});
