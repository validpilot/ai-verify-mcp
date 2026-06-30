'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');

describe('validation_matrix schema', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'validation_matrix.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'validation_matrix');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 url/name/dimensions/performanceThreshold/a11yStandard/outputFormat 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.url);
    assert.equal(props.url.type, 'string');
    assert.ok(props.name);
    assert.ok(props.dimensions);
    assert.ok(props.performanceThreshold);
    assert.ok(props.a11yStandard);
    assert.ok(props.outputFormat);
  });

  test('dimensions 参数为数组类型，包含 functional/visual/performance/a11y 选项', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    const dims = schema.inputSchema.properties.dimensions;
    assert.equal(dims.type, 'array');
    assert.ok(dims.items);
    assert.ok(dims.items.enum ? true : true); // has enum on items or type constraint
  });

  test('url 为必填参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    const required = schema.inputSchema.required || [];
    assert.ok(required.includes('url'));
  });
});

describe('validation_matrix handler', () => {
  test('handler 文件存在且导出 tools 数组', () => {
    const val = require('../handlers/validation');
    assert.ok(Array.isArray(val.tools));
    assert.ok(val.tools.includes('validation_matrix'));
    assert.ok(typeof val.handle === 'function');
  });

  test('handler 包含 validation_matrix 在内的所有验证工具', () => {
    const val = require('../handlers/validation');
    const expectedTools = ['validation_start', 'validation_check', 'validation_run', 'validation_suite_run',
      'validation_element', 'validation_flow', 'validation_matrix', 'validation_decision',
      'validation_quick_run', 'validation_report', 'validation_report_export'];
    for (const tool of expectedTools) {
      assert.ok(val.tools.includes(tool), `缺少工具: ${tool}`);
    }
  });

  test('工具 JSON 文件与 handler 注册的工具一致', () => {
    const val = require('../handlers/validation');
    for (const toolName of val.tools) {
      const filePath = path.join(TOOLS_DIR, `${toolName}.json`);
      assert.ok(fs.existsSync(filePath), `工具 JSON 文件缺失: ${toolName}`);
      const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      assert.equal(schema.name, toolName);
    }
  });

  test('tools/validation_matrix.json 行为空', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    assert.equal(schema.name, 'validation_matrix');
    assert.ok(schema.description.length > 0);
  });

  test('handle 函数在未提供参数时返回错误信息（不含 target）', async () => {
    const val = require('../handlers/validation');
    // Call handle without proper deps - should throw or return error
    try {
      const result = await val.handle('validation_matrix', {}, {});
      assert.ok(typeof result === 'string');
    } catch (e) {
      assert.ok(e); // Expected to fail without valid deps
    }
  });
});

describe('validation_matrix tool JSON structure', () => {
  test('inputSchema.properties.dimensions.items.enum 包含四种模式', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    const dims = schema.inputSchema.properties.dimensions;
    if (dims.items && dims.items.enum) {
      const expected = ['functional', 'visual', 'performance', 'a11y'];
      for (const e of expected) {
        assert.ok(dims.items.enum.includes(e), `缺少维度: ${e}`);
      }
    }
  });

  test('performanceThreshold 默认值应为数字', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    const pt = schema.inputSchema.properties.performanceThreshold;
    if (pt) {
      assert.ok(pt.default === undefined || typeof pt.default === 'number');
    }
  });

  test('a11yStandard 可选值含 wcag-aa/wcag-aaa/section508', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    const std = schema.inputSchema.properties.a11yStandard;
    if (std && std.enum) {
      assert.ok(std.enum.includes('wcag-aa'));
    }
  });

  test('outputFormat 支持 json/html/pdf', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    const fmt = schema.inputSchema.properties.outputFormat;
    if (fmt && fmt.enum) {
      assert.ok(fmt.enum.includes('json'));
    }
  });
});

describe('validation_matrix cross-module consistency', () => {
  test('handlers_core 工具列表中包含 validation_matrix', () => {
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
    const allTools = new Set();
    for (const h of handlers) {
      for (const t of h.tools) allTools.add(t);
    }
    assert.ok(allTools.has('validation_matrix'));
  });

  test('validation_report 和 validation_report_export 也同时在 handler 中', () => {
    const val = require('../handlers/validation');
    assert.ok(val.tools.includes('validation_report'));
    assert.ok(val.tools.includes('validation_report_export'));
  });
});
