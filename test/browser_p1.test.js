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

// v1.10.0: browser_find_page 已移除（别名 → browser_find mode=page）

// ============================================================
// browser_links
// ============================================================

describe('browser_links', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_links.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_links');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 filter/includeExternal/maxLinks 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_links.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.filter);
    assert.equal(props.filter.type, 'string');
    assert.ok(props.includeExternal);
    assert.equal(props.includeExternal.type, 'boolean');
    assert.ok(props.maxLinks);
    assert.equal(props.maxLinks.type, 'number');
  });

  test('toolNames 中包含 browser_links（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_links'), '工具 browser_links 应在 toolNames 中');
  });
});

// ============================================================
// browser_highlight
// ============================================================

describe('browser_highlight', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_highlight.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_highlight');
    assert.ok(schema.description);
  });

  test('schema 包含 selector 为必填，color 为可选字符串', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_highlight.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.selector);
    assert.equal(props.selector.type, 'string');
    assert.ok(schema.inputSchema.required.includes('selector'), 'selector 应为必填');
    assert.ok(props.color);
    assert.equal(props.color.type, 'string');
  });

  test('toolNames 中包含 browser_highlight 且 handler 返回高亮信息', () => {
    assert.ok(toolNames.has('browser_highlight'), '工具 browser_highlight 应在 toolNames 中');
    const handlerSrc = fs.readFileSync(path.join(HANDLERS_DIR, 'browser.js'), 'utf8');
    assert.ok(handlerSrc.includes('已高亮元素'));
  });
});

// ============================================================
// browser_scroll
// ============================================================

describe('browser_scroll', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_scroll.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_scroll');
    assert.ok(schema.description);
  });

  test('schema 包含 selector/scrollIntoView/x/y/behavior 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_scroll.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.selector);
    assert.equal(props.selector.type, 'string');
    assert.ok(props.scrollIntoView);
    assert.equal(props.scrollIntoView.type, 'boolean');
    assert.ok(props.x);
    assert.equal(props.x.type, 'number');
    assert.ok(props.y);
    assert.equal(props.y.type, 'number');
    assert.ok(props.behavior);
    assert.equal(props.behavior.type, 'string');
    assert.deepEqual(props.behavior.enum, ['auto', 'smooth']);
    // no required fields for scroll
    assert.ok(Array.isArray(schema.inputSchema.required));
  });

  test('toolNames 中包含 browser_scroll 且 handler 返回滚动信息', () => {
    assert.ok(toolNames.has('browser_scroll'), '工具 browser_scroll 应在 toolNames 中');
    const handlerSrc = fs.readFileSync(path.join(HANDLERS_DIR, 'browser.js'), 'utf8');
    assert.ok(handlerSrc.includes('已滚动'));
  });
});

// v1.10.0: browser_find_element 已移除（别名 → browser_find mode=element）

// v1.10.0: browser_locator_suggest 已移除（别名 → browser_locator mode=suggest）
// v1.10.0: browser_locator_validate 已移除（别名 → browser_locator mode=validate）
