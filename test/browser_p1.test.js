'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const SERVER_FILE = path.join(__dirname, '..', 'server.js');

// ============================================================
// browser_find_page
// ============================================================

describe('browser_find_page', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_find_page.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_find_page');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 target 为必填，navigate/baseUrl 参数完整', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_find_page.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.target);
    assert.equal(props.target.type, 'string');
    assert.ok(schema.inputSchema.required.includes('target'), 'target 应为必填');
    assert.ok(props.navigate);
    assert.equal(props.navigate.type, 'boolean');
    assert.ok(props.baseUrl);
    assert.equal(props.baseUrl.type, 'string');
  });

  test('server.js 包含 browser_find_page 的 case 处理器', () => {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    assert.ok(src.includes("case 'browser_find_page'"));
  });
});

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

  test('server.js 包含 browser_links 的 case 处理器', () => {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    assert.ok(src.includes("case 'browser_links'"));
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

  test('server.js 包含 browser_highlight 并返回高亮信息', () => {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    assert.ok(src.includes("case 'browser_highlight'"));
    assert.ok(src.includes('已高亮元素'));
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

  test('server.js 包含 browser_scroll 的 case 处理器', () => {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    assert.ok(src.includes("case 'browser_scroll'"));
    assert.ok(src.includes('已滚动'));
  });
});
