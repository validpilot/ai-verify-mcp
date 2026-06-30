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
// validation_start
// ============================================================

describe('validation_start', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'validation_start.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'validation_start');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 targetUrl/testScenarios 参数且均为必填', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_start.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.targetUrl);
    assert.equal(props.targetUrl.type, 'string');
    assert.ok(props.testScenarios);
    assert.equal(props.testScenarios.type, 'array');
    assert.ok(schema.inputSchema.required.includes('targetUrl'), 'targetUrl 应为必填');
    assert.ok(schema.inputSchema.required.includes('testScenarios'), 'testScenarios 应为必填');
  });

  test('toolNames 中包含 validation_start（已注册到 MCP）', () => {
    assert.ok(toolNames.has('validation_start'), '工具 validation_start 应在 toolNames 中');
  });
});

// ============================================================
// validation_run
// ============================================================

describe('validation_run', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'validation_run.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'validation_run');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 cases 为必填，及其他可选参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_run.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.name);
    assert.equal(props.name.type, 'string');
    assert.ok(props.cases);
    assert.equal(props.cases.type, 'array');
    assert.ok(schema.inputSchema.required.includes('cases'), 'cases 应为必填');
    assert.ok(props.clearArtifacts);
    assert.equal(props.clearArtifacts.type, 'boolean');
    assert.ok(props.clearErrors);
    assert.equal(props.clearErrors.type, 'boolean');
    assert.ok(props.instrument);
    assert.equal(props.instrument.type, 'boolean');
    assert.ok(props.trace);
    assert.equal(props.trace.type, 'boolean');
    assert.ok(props.har);
    assert.equal(props.har.type, 'boolean');
    assert.ok(props.investigateOnFailure);
    assert.equal(props.investigateOnFailure.type, 'boolean');
    assert.ok(props.continueOnFailure);
    assert.equal(props.continueOnFailure.type, 'boolean');
  });

  test('toolNames 中包含 validation_run（已注册到 MCP）', () => {
    assert.ok(toolNames.has('validation_run'), '工具 validation_run 应在 toolNames 中');
  });
});

// ============================================================
// validation_suite_run（占位工具，仅验证注册）
// ============================================================

describe('validation_suite_run', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'validation_suite_run.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'validation_suite_run');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 suite/file/continueOnFailure/sessionName 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_suite_run.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.suite);
    assert.equal(props.suite.type, 'string');
    assert.ok(props.file);
    assert.equal(props.file.type, 'string');
    assert.ok(props.continueOnFailure);
    assert.equal(props.continueOnFailure.type, 'boolean');
    assert.ok(props.sessionName);
    assert.equal(props.sessionName.type, 'string');
  });

  test('toolNames 中包含 validation_suite_run（已注册到 MCP）', () => {
    assert.ok(toolNames.has('validation_suite_run'), '工具 validation_suite_run 应在 toolNames 中');
  });
});

// ============================================================
// validation_report
// ============================================================

describe('validation_report', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'validation_report.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'validation_report');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 format 参数，枚举值包含 markdown/json', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_report.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.format);
    assert.equal(props.format.type, 'string');
    assert.ok(props.format.enum.includes('markdown'), 'format 应包含 markdown');
    assert.ok(props.format.enum.includes('json'), 'format 应包含 json');
  });

  test('toolNames 中包含 validation_report（已注册到 MCP）', () => {
    assert.ok(toolNames.has('validation_report'), '工具 validation_report 应在 toolNames 中');
  });
});

// ============================================================
// validation_report_export
// ============================================================

describe('validation_report_export', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'validation_report_export.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'validation_report_export');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 无入参（inputSchema properties 为空对象）', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_report_export.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.deepEqual(props, {});
  });

  test('toolNames 中包含 validation_report_export（已注册到 MCP）', () => {
    assert.ok(toolNames.has('validation_report_export'), '工具 validation_report_export 应在 toolNames 中');
  });
});

// ============================================================
// validation_matrix（占位工具，仅验证注册）
// ============================================================

describe('validation_matrix', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'validation_matrix.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'validation_matrix');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 roles/features 为必填，及其他可选参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.name);
    assert.equal(props.name.type, 'string');
    assert.ok(props.roles);
    assert.equal(props.roles.type, 'array');
    assert.ok(props.features);
    assert.equal(props.features.type, 'array');
    assert.ok(schema.inputSchema.required.includes('roles'), 'roles 应为必填');
    assert.ok(schema.inputSchema.required.includes('features'), 'features 应为必填');
    assert.ok(props.clearArtifacts);
    assert.equal(props.clearArtifacts.type, 'boolean');
    assert.ok(props.clearErrors);
    assert.equal(props.clearErrors.type, 'boolean');
    assert.ok(props.instrument);
    assert.equal(props.instrument.type, 'boolean');
    assert.ok(props.har);
    assert.equal(props.har.type, 'boolean');
    assert.ok(props.investigateOnFailure);
    assert.equal(props.investigateOnFailure.type, 'boolean');
    assert.ok(props.continueOnFailure);
    assert.equal(props.continueOnFailure.type, 'boolean');
  });

  test('toolNames 中包含 validation_matrix（已注册到 MCP）', () => {
    assert.ok(toolNames.has('validation_matrix'), '工具 validation_matrix 应在 toolNames 中');
  });
});

// ============================================================
// validation_decision（占位工具，仅验证注册）
// ============================================================

describe('validation_decision', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'validation_decision.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'validation_decision');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 browserErrors 对象和 format 枚举参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_decision.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.browserErrors);
    assert.equal(props.browserErrors.type, 'object');
    assert.ok(props.browserErrors.properties.pageErrorCount);
    assert.ok(props.browserErrors.properties.criticalJsErrors);
    assert.ok(props.browserErrors.properties.criticalCssErrors);
    assert.ok(props.browserErrors.properties.totalCount);
    assert.ok(props.format);
    assert.equal(props.format.type, 'string');
    assert.ok(props.format.enum.includes('json'), 'format 应包含 json');
    assert.ok(props.format.enum.includes('text'), 'format 应包含 text');
  });

  test('toolNames 中包含 validation_decision（已注册到 MCP）', () => {
    assert.ok(toolNames.has('validation_decision'), '工具 validation_decision 应在 toolNames 中');
  });
});
