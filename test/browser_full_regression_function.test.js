'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const HANDLERS_DIR = path.join(__dirname, '..', 'handlers');

// ============================================================
// browser_full_regression 功能测试（基于实际 schema）
// ============================================================

describe('browser_full_regression handler 功能', () => {
  test('browser_full_regression.json schema 文件存在', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_full_regression.json');
    assert.ok(fs.existsSync(filePath));
  });

  test('browser_full_regression schema 包含完整的 inputSchema', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    assert.ok(schema.inputSchema, '应有 inputSchema');
    assert.ok(schema.inputSchema.properties, 'inputSchema 应有 properties');
    assert.ok(schema.inputSchema.properties.url, 'inputSchema 应包含 url');
    assert.ok(schema.inputSchema.properties.maxItems, 'inputSchema 应包含 maxItems');
    assert.ok(schema.inputSchema.properties.timeout, 'inputSchema 应包含 timeout');
  });

  test('browser_full_regression schema url 参数为可选', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    const url = schema.inputSchema.properties.url;
    assert.equal(url.type, 'string', 'url 应为 string 类型');
    assert.ok(url.description, 'url 应有 description');
    assert.ok(!schema.inputSchema.required || !schema.inputSchema.required.includes('url'), 'url 应为可选');
  });

  test('browser_full_regression schema maxItems 参数类型正确', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    const maxItems = schema.inputSchema.properties.maxItems;
    assert.equal(maxItems.type, 'number', 'maxItems 应为 number 类型');
    assert.ok(maxItems.default, 'maxItems 应有 default 值');
  });

  test('browser_full_regression schema timeout 参数类型正确', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    const timeout = schema.inputSchema.properties.timeout;
    assert.equal(timeout.type, 'number', 'timeout 应为 number 类型');
    assert.ok(timeout.default, 'timeout 应有 default 值');
  });

  test('browser_full_regression schema 包含 visible 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    assert.ok(schema.inputSchema.properties.visible, '应有 visible 参数');
    assert.equal(schema.inputSchema.properties.visible.type, 'boolean', 'visible 应为 boolean 类型');
  });

  test('browser_full_regression schema 包含 maxDepth 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    assert.ok(schema.inputSchema.properties.maxDepth, '应有 maxDepth 参数');
    assert.equal(schema.inputSchema.properties.maxDepth.type, 'number', 'maxDepth 应为 number 类型');
  });

  test('browser_full_regression schema 包含 includeSubMenus 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    assert.ok(schema.inputSchema.properties.includeSubMenus, '应有 includeSubMenus 参数');
    assert.equal(schema.inputSchema.properties.includeSubMenus.type, 'boolean', 'includeSubMenus 应为 boolean 类型');
  });

  test('browser_full_regression 在 handlers/system.js 中注册', () => {
    const system = require('../handlers/system');
    assert.ok(system.tools.includes('browser_full_regression'), 'browser_full_regression 应在 system handler 的 tools 数组中');
  });

  test('browser_full_regression handler 导出正确的接口', () => {
    const system = require('../handlers/system');
    assert.ok(Array.isArray(system.tools), 'tools 应为数组');
    assert.ok(system.tools.length > 0, 'tools 数组不应为空');
    assert.ok(typeof system.handle === 'function', 'handle 应为函数');
  });

  test('browser_full_regression schema 所有参数都有 description', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    for (const key of Object.keys(props)) {
      assert.ok(props[key].description, `参数 ${key} 应有 description`);
    }
  });

  test('browser_full_regression schema 包含完整的 description', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    assert.ok(schema.description, '应有 description');
    assert.ok(schema.description.length > 10, 'description 应足够详细');
  });

  test('browser_full_regression schema 参数数量正确', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(Object.keys(props).length >= 6, '应有至少6个参数');
  });

  test('browser_full_regression schema name 字段正确', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    assert.equal(schema.name, 'browser_full_regression', 'name 应为 browser_full_regression');
  });

  test('browser_full_regression 可被正确加载为 MCP 工具', () => {
    const systemHandler = require('../handlers/system');
    const found = systemHandler.tools.find(t => t === 'browser_full_regression');
    assert.ok(found, 'browser_full_regression 应在 system handler 的 tools 中');
  });

  test('browser_full_regression 与其他 system 工具共存', () => {
    const system = require('../handlers/system');
    assert.ok(system.tools.length > 1, 'system handler 应有多个工具');
    assert.ok(system.tools.includes('mcp_health_check'), 'system handler 应包含 mcp_health_check');
  });

  test('browser_full_regression 参数默认值合理', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    const timeout = schema.inputSchema.properties.timeout;
    assert.ok(timeout.default >= 60, 'timeout 默认值应 >= 60秒');
    assert.ok(timeout.default <= 300, 'timeout 默认值应 <= 300秒');
  });
});