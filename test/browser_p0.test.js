'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const HANDLERS_DIR = path.join(__dirname, '..', 'handlers');
const SERVER_FILE = path.join(__dirname, '..', 'server.js');

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
// browser_diagnose
// ============================================================

describe('browser_diagnose', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_diagnose.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_diagnose');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
    assert.ok(schema.inputSchema.properties);
  });

  test('schema 包含 selector/errorType/includeStackTrace 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_diagnose.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.selector);
    assert.equal(props.selector.type, 'string');
    assert.ok(props.errorType);
    assert.equal(props.errorType.type, 'string');
    assert.ok(props.errorType.enum);
    assert.deepEqual(props.errorType.enum, ['all', 'js', 'network', 'element', 'interaction']);
    assert.ok(props.includeStackTrace);
    assert.equal(props.includeStackTrace.type, 'boolean');
  });

  test('toolNames 中包含 browser_diagnose（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_diagnose'), '工具 browser_diagnose 应在 toolNames 中');
  });
});

// ============================================================
// browser_element_status
// ============================================================

describe('browser_element_status', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_element_status.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_element_status');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 selector 为必填项，checkEvents/checkVisibility/checkInteractability 为 boolean', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_element_status.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.selector);
    assert.equal(props.selector.type, 'string');
    assert.ok(schema.inputSchema.required.includes('selector'), 'selector 应为必填');
    assert.ok(props.checkEvents);
    assert.equal(props.checkEvents.type, 'boolean');
    assert.ok(props.checkVisibility);
    assert.equal(props.checkVisibility.type, 'boolean');
    assert.ok(props.checkInteractability);
    assert.equal(props.checkInteractability.type, 'boolean');
  });

  test('toolNames 中包含 browser_element_status 且 handler 验证 selector 为空时返回错误', () => {
    assert.ok(toolNames.has('browser_element_status'), '工具 browser_element_status 应在 toolNames 中');
    const handlerSrc = fs.readFileSync(path.join(HANDLERS_DIR, 'diagnose.js'), 'utf8');
    assert.ok(handlerSrc.includes('需要提供 selector 参数'));
  });
});

// ============================================================
// browser_quick_fix
// ============================================================

describe('browser_quick_fix', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_quick_fix.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_quick_fix');
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 selector 为必填，problem 枚举值正确', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_quick_fix.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.selector);
    assert.ok(schema.inputSchema.required.includes('selector'), 'selector 应为必填');

    assert.ok(props.problem);
    const expectedProblems = ['not_found', 'not_visible', 'not_interactable', 'click_failed',
      'type_failed', 'js_error', 'api_failed', 'page_crashed', 'resource_blocked'];
    assert.deepEqual(props.problem.enum, expectedProblems);

    assert.ok(props.problems);
    assert.equal(props.problems.type, 'array');
    assert.ok(props.waitStrategy);
    assert.equal(props.waitStrategy.type, 'string');
    assert.deepEqual(props.waitStrategy.enum, ['smart', 'fixed', 'none']);
    assert.ok(props.maxAttempts);
    assert.equal(props.maxAttempts.type, 'number');
  });

  test('toolNames 中包含 browser_quick_fix 且 handler 验证 selector 为空时返回错误', () => {
    assert.ok(toolNames.has('browser_quick_fix'), '工具 browser_quick_fix 应在 toolNames 中');
    const handlerSrc = fs.readFileSync(path.join(HANDLERS_DIR, 'diagnose.js'), 'utf8');
    assert.ok(handlerSrc.includes('需要提供 selector 参数'));
  });
});

// ============================================================
// browser_verify_fix
// ============================================================

describe('browser_verify_fix', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_verify_fix.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_verify_fix');
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 selector 为必填，fixAction 枚举值正确', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_verify_fix.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.selector);
    assert.ok(schema.inputSchema.required.includes('selector'), 'selector 应为必填');

    assert.ok(props.fixAction);
    assert.deepEqual(props.fixAction.enum, ['click', 'type', 'wait', 'scroll', 'quick_fix', 'none']);

    assert.ok(props.fixValue);
    assert.equal(props.fixValue.type, 'string');

    assert.ok(props.verificationCriteria);
    assert.equal(props.verificationCriteria.type, 'object');
    assert.ok(props.verificationCriteria.properties);
    const criteriaProps = props.verificationCriteria.properties;
    assert.ok(criteriaProps.noNewErrors);
    assert.equal(criteriaProps.noNewErrors.type, 'boolean');
    assert.ok(criteriaProps.elementVisible);
    assert.equal(criteriaProps.elementVisible.type, 'boolean');
    assert.ok(criteriaProps.urlChanged);
    assert.equal(criteriaProps.urlChanged.type, 'boolean');

    assert.ok(props.timeout);
    assert.equal(props.timeout.type, 'number');
  });

  test('toolNames 中包含 browser_verify_fix 且 handler 验证 selector 为空时返回错误', () => {
    assert.ok(toolNames.has('browser_verify_fix'), '工具 browser_verify_fix 应在 toolNames 中');
    const handlerSrc = fs.readFileSync(path.join(HANDLERS_DIR, 'diagnose.js'), 'utf8');
    assert.ok(handlerSrc.includes('需要提供 selector 参数'));
  });
});

// ============================================================
// browser_aria_snapshot
// ============================================================

describe('browser_aria_snapshot', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_aria_snapshot.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_aria_snapshot');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
    assert.ok(schema.inputSchema.properties);
  });

  test('toolNames 中包含 browser_aria_snapshot（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_aria_snapshot'), '工具 browser_aria_snapshot 应在 toolNames 中');
  });

  test('schema 包含 selector 和 maxDepth 可选参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_aria_snapshot.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.selector);
    assert.equal(props.selector.type, 'string');
    assert.equal(props.selector.description.includes('CSS'), true);
    assert.ok(props.maxDepth);
    assert.equal(props.maxDepth.type, 'number');
  });

  test('handler 中存在 browser_aria_snapshot 处理逻辑', () => {
    const handlerSrc = fs.readFileSync(path.join(HANDLERS_DIR, 'browser.js'), 'utf8');
    assert.ok(handlerSrc.includes('browser_aria_snapshot'));
    assert.ok(handlerSrc.includes('accessibility.snapshot'), '使用 Playwright accessibility snapshot API');
    assert.ok(handlerSrc.includes('assignRefs'), '包含 ref 分配逻辑');
  });

  test('描述中提及 AI 驱动的元素定位（符合产品定位 v2.0）', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_aria_snapshot.json'), 'utf8'));
    assert.ok(schema.description.includes('AI') || schema.description.includes('ref'), '描述应提及 AI 或 ref 稳定性');
  });
});
