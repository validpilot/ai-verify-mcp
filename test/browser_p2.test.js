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
// browser_network
// ============================================================

describe('browser_network', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_network.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_network');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 URL/方法/状态码/checkpoint 过滤参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_network.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.contains);
    assert.equal(props.contains.type, 'string');
    assert.ok(props.urlContains);
    assert.equal(props.urlContains.type, 'string');
    assert.ok(props.method);
    assert.equal(props.method.type, 'string');
    assert.ok(props.statusMin);
    assert.equal(props.statusMin.type, 'number');
    assert.ok(props.statusMax);
    assert.equal(props.statusMax.type, 'number');
    assert.ok(props.since);
    assert.equal(props.since.type, 'string');
    assert.ok(props.currentOnly);
    assert.equal(props.currentOnly.type, 'boolean');
  });

  test('toolNames 中包含 browser_network（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_network'), '工具 browser_network 应在 toolNames 中');
  });
});

// ============================================================
// browser_network_detail
// ============================================================

describe('browser_network_detail', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_network_detail.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_network_detail');
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 contains/urlContains/method/status/limit 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_network_detail.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.contains);
    assert.equal(props.contains.type, 'string');
    assert.ok(props.urlContains);
    assert.equal(props.urlContains.type, 'string');
    assert.ok(props.method);
    assert.equal(props.method.type, 'string');
    assert.ok(props.statusMin);
    assert.equal(props.statusMin.type, 'number');
    assert.ok(props.statusMax);
    assert.equal(props.statusMax.type, 'number');
    assert.ok(props.since);
    assert.equal(props.since.type, 'string');
    assert.ok(props.currentOnly);
    assert.equal(props.currentOnly.type, 'boolean');
    assert.ok(props.limit);
    assert.equal(props.limit.type, 'number');
  });

  test('toolNames 中包含 browser_network_detail（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_network_detail'), '工具 browser_network_detail 应在 toolNames 中');
  });
});

// ============================================================
// browser_console
// ============================================================

describe('browser_console', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_console.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_console');
    assert.ok(schema.description);
  });

  test('schema 包含 level 枚举值正确（log/warning/error/debug/info/all）', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_console.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.level);
    assert.equal(props.level.type, 'string');
    assert.deepEqual(props.level.enum, ['log', 'warning', 'error', 'debug', 'info', 'all']);

    assert.ok(props.since);
    assert.equal(props.since.type, 'string');

    assert.ok(props.limit);
    assert.equal(props.limit.type, 'number');

    assert.ok(props.urlContains);
    assert.equal(props.urlContains.type, 'string');
  });

  test('toolNames 中包含 browser_console 且 handler 按 level 过滤', () => {
    assert.ok(toolNames.has('browser_console'), '工具 browser_console 应在 toolNames 中');
    const handlerSrc = fs.readFileSync(path.join(HANDLERS_DIR, 'network.js'), 'utf8');
    assert.ok(handlerSrc.includes('.filter(item => item.type === level)'));
  });
});

// ============================================================
// browser_errors
// ============================================================

describe('browser_errors', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_errors.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_errors');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 includeWarnings/limit/currentOnly/urlContains/method/status 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_errors.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.includeWarnings);
    assert.equal(props.includeWarnings.type, 'boolean');
    assert.ok(props.limit);
    assert.equal(props.limit.type, 'number');
    assert.ok(props.currentOnly);
    assert.equal(props.currentOnly.type, 'boolean');
    assert.ok(props.urlContains);
    assert.equal(props.urlContains.type, 'string');
    assert.ok(props.method);
    assert.equal(props.method.type, 'string');
    assert.ok(props.statusMin);
    assert.equal(props.statusMin.type, 'number');
    assert.ok(props.statusMax);
    assert.equal(props.statusMax.type, 'number');
  });

  test('toolNames 中包含 browser_errors（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_errors'), '工具 browser_errors 应在 toolNames 中');
  });
});

// ============================================================
// browser_errors_aggregate
// ============================================================

describe('browser_errors_aggregate', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_errors_aggregate.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_errors_aggregate');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 limit/includeCurrentPage/evidence 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_errors_aggregate.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.limit);
    assert.equal(props.limit.type, 'number');
    assert.ok(props.includeCurrentPage);
    assert.equal(props.includeCurrentPage.type, 'boolean');
    assert.ok(props.evidence);
    assert.equal(props.evidence.type, 'object');
  });

  test('toolNames 中包含 browser_errors_aggregate 且 handler 调用 aggregateErrors', () => {
    assert.ok(toolNames.has('browser_errors_aggregate'), '工具 browser_errors_aggregate 应在 toolNames 中');
    const handlerSrc = fs.readFileSync(path.join(HANDLERS_DIR, 'diagnose.js'), 'utf8');
    assert.ok(handlerSrc.includes('aggregateErrors'));
  });
});
