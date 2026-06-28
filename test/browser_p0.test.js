'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const SERVER_FILE = path.join(__dirname, '..', 'server.js');

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

  test('server.js 包含 browser_diagnose 的 case 处理器', () => {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    assert.ok(src.includes("case 'browser_diagnose'"));
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

  test('server.js 包含 browser_element_status 且验证 selector 为空时返回错误', () => {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    assert.ok(src.includes("case 'browser_element_status'"));
    assert.ok(src.includes('需要提供 selector 参数'));
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

  test('server.js 包含 browser_quick_fix 且验证 selector 为空时返回错误', () => {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    assert.ok(src.includes("case 'browser_quick_fix'"));
    assert.ok(src.includes('需要提供 selector 参数'));
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

  test('server.js 包含 browser_verify_fix 且验证 selector 为空时返回错误', () => {
    const src = fs.readFileSync(SERVER_FILE, 'utf8');
    assert.ok(src.includes("case 'browser_verify_fix'"));
    assert.ok(src.includes('需要提供 selector 参数'));
  });
});
