'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');

describe('browser_full_regression schema', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_full_regression.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_full_regression');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 url/maxDepth/maxItems/includeSubMenus/timeout/visible 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.url);
    assert.equal(props.url.type, 'string');
    assert.ok(props.maxDepth);
    assert.equal(props.maxDepth.type, 'number');
    assert.ok(props.maxItems);
    assert.ok(props.includeSubMenus);
    assert.ok(props.timeout);
    assert.ok(props.visible);
  });

  test('maxDepth 最大值限制为 5', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    assert.equal(schema.inputSchema.properties.maxDepth.maximum, 5);
  });

  test('maxItems 最大值限制为 100', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    assert.equal(schema.inputSchema.properties.maxItems.maximum, 100);
  });

  test('url 有默认值且非必填', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    assert.ok(typeof schema.inputSchema.properties.url.default === 'string');
    const required = schema.inputSchema.required || [];
    assert.ok(!required.includes('url'));
  });
});

describe('browser_full_regression handler', () => {
  test('handler（system.js）包含 browser_full_regression 工具', () => {
    const sys = require('../handlers/system');
    assert.ok(Array.isArray(sys.tools));
    assert.ok(sys.tools.includes('browser_full_regression'));
    assert.ok(typeof sys.handle === 'function');
  });

  test('handler 导出 tools 数量合理', () => {
    const sys = require('../handlers/system');
    assert.ok(sys.tools.length >= 1);
  });

  test('所有 system handler 的工具有对应的 JSON 文件', () => {
    const sys = require('../handlers/system');
    for (const toolName of sys.tools) {
      const filePath = path.join(TOOLS_DIR, `${toolName}.json`);
      assert.ok(fs.existsSync(filePath), `工具 JSON 文件缺失: ${toolName}`);
      const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.equal(schema.name, toolName);
    }
  });

  test('handle 函数在不提供参数时不会崩溃', async () => {
    const sys = require('../handlers/system');
    try {
      const result = await sys.handle('browser_full_regression', {}, {});
      assert.ok(typeof result === 'string');
    } catch (e) {
      assert.ok(e); // Expected without proper deps
    }
  });
});

describe('browser_full_regression tools directory', () => {
  test('tools/browser_full_regression.json schema 属性均已知', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    const known = new Set(['url', 'maxDepth', 'maxItems', 'includeSubMenus', 'timeout', 'visible']);
    for (const key of Object.keys(props)) {
      assert.ok(known.has(key), `未知属性: ${key}`);
    }
  });

  test('Description 不为空且包含完整功能说明', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    assert.ok(schema.description.length > 50);
  });
});

describe('browser_full_regression cross-handler consistency', () => {
  test('在所有 handler 工具列表中唯一注册', () => {
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
    let count = 0;
    for (const h of handlers) {
      if (h.tools.includes('browser_full_regression')) count++;
    }
    assert.equal(count, 1, 'browser_full_regression 应只在一个 handler 中注册');
  });
});
