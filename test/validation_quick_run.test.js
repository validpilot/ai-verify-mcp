'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const SERVER_FILE = path.join(__dirname, '..', 'server.js');

describe('validation_quick_run', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'validation_quick_run.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'validation_quick_run');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 url 为必填，headless/timeout 为可选', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_quick_run.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.url);
    assert.equal(props.url.type, 'string');
    assert.ok(props.headless);
    assert.equal(props.headless.type, 'boolean');
    assert.ok(props.timeout);
    assert.equal(props.timeout.type, 'number');
    assert.ok(schema.inputSchema.required.includes('url'), 'url 应为必填');
  });

  test('server.js 包含 validation_quick_run 的 case 处理器', () => {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    assert.ok(src.includes("case 'validation_quick_run'"));
  });

  test('handler 调用 runValidationQuickRun 函数', () => {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    assert.ok(src.includes('runValidationQuickRun'), '应调用 runValidationQuickRun');
  });
});
