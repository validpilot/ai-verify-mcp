'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');

// 新增工具测试
describe('新增工具 schema 验证', () => {
  const toolNames = new Set();
  before(() => {
    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    for (const f of files) {
      const content = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, f), 'utf8'));
      toolNames.add(content.name);
    }
  });

  // browser_performance_trace
  describe('browser_performance_trace', () => {
    test('schema 文件存在且 JSON 合法', () => {
      const schemaPath = path.join(TOOLS_DIR, 'browser_performance_trace.json');
      assert.ok(fs.existsSync(schemaPath));
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      assert.equal(schema.name, 'browser_performance_trace');
    });

    test('schema 包含 url/categories/duration/exportHar 参数', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_performance_trace.json'), 'utf8'));
      const props = schema.inputSchema.properties;
      assert.ok(props.url);
      assert.ok(props.categories);
      assert.ok(props.duration);
      assert.ok(props.exportHar);
    });

    // v1.6.8 移除 outputSchema：handler 返回 text content 而非 structuredContent，MCP 协议要求 outputSchema 必须不存在
    test('outputSchema 不存在（MCP 协议合规）', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_performance_trace.json'), 'utf8'));
      assert.equal(schema.outputSchema, undefined, '不应定义 outputSchema');
    });

    test('toolNames 中包含 browser_performance_trace', () => {
      assert.ok(toolNames.has('browser_performance_trace'));
    });
  });

  // browser_anti_bot_detect
  describe('browser_anti_bot_detect', () => {
    test('schema 文件存在且 JSON 合法', () => {
      const schemaPath = path.join(TOOLS_DIR, 'browser_anti_bot_detect.json');
      assert.ok(fs.existsSync(schemaPath));
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      assert.equal(schema.name, 'browser_anti_bot_detect');
    });

    test('schema 包含 url/checkHeaders/checkCaptcha 参数', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_anti_bot_detect.json'), 'utf8'));
      const props = schema.inputSchema.properties;
      assert.ok(props.url);
      assert.ok(props.checkHeaders);
      assert.ok(props.checkCaptcha);
    });

    // v1.6.8 移除 outputSchema：handler 返回 text content 而非 structuredContent，MCP 协议要求 outputSchema 必须不存在
    test('outputSchema 不存在（MCP 协议合规）', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_anti_bot_detect.json'), 'utf8'));
      assert.equal(schema.outputSchema, undefined, '不应定义 outputSchema');
    });

    test('toolNames 中包含 browser_anti_bot_detect', () => {
      assert.ok(toolNames.has('browser_anti_bot_detect'));
    });
  });

  // browser_form_validate
  describe('browser_form_validate', () => {
    test('schema 文件存在且 JSON 合法', () => {
      const schemaPath = path.join(TOOLS_DIR, 'browser_form_validate.json');
      assert.ok(fs.existsSync(schemaPath));
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      assert.equal(schema.name, 'browser_form_validate');
    });

    test('schema 包含 url/formSelector/validateSubmit 参数', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_form_validate.json'), 'utf8'));
      const props = schema.inputSchema.properties;
      assert.ok(props.url);
      assert.ok(props.formSelector);
      assert.ok(props.validateSubmit);
    });

    // v1.6.8 移除 outputSchema：handler 返回 text content 而非 structuredContent，MCP 协议要求 outputSchema 必须不存在
    test('outputSchema 不存在（MCP 协议合规）', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_form_validate.json'), 'utf8'));
      assert.equal(schema.outputSchema, undefined, '不应定义 outputSchema');
    });

    test('toolNames 中包含 browser_form_validate', () => {
      assert.ok(toolNames.has('browser_form_validate'));
    });
  });

  // browser_emulate_device
  describe('browser_emulate_device', () => {
    test('schema 文件存在且 JSON 合法', () => {
      const schemaPath = path.join(TOOLS_DIR, 'browser_emulate_device.json');
      assert.ok(fs.existsSync(schemaPath));
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      assert.equal(schema.name, 'browser_emulate_device');
    });

    test('schema 包含 device/orientation/touch/userAgent 参数', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_emulate_device.json'), 'utf8'));
      const props = schema.inputSchema.properties;
      assert.ok(props.device);
      assert.ok(props.orientation);
      assert.ok(props.touch);
      assert.ok(props.userAgent);
    });

    // v1.6.8 移除 outputSchema：handler 返回 text content 而非 structuredContent，MCP 协议要求 outputSchema 必须不存在
    test('outputSchema 不存在（MCP 协议合规）', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_emulate_device.json'), 'utf8'));
      assert.equal(schema.outputSchema, undefined, '不应定义 outputSchema');
    });

    test('toolNames 中包含 browser_emulate_device', () => {
      assert.ok(toolNames.has('browser_emulate_device'));
    });
  });

  // browser_deep_interact（OSS 不包含，属于 Pro 版付费能力）
  describe('browser_deep_interact', () => {
    test('schema 文件不存在（OSS 不包含付费功能）', () => {
      const schemaPath = path.join(TOOLS_DIR, 'browser_deep_interact.json');
      assert.ok(!fs.existsSync(schemaPath), 'browser_deep_interact.json 不应存在于 OSS 版本中');
    });

    test('toolNames 中不包含 browser_deep_interact（OSS 不包含付费功能）', () => {
      assert.ok(!toolNames.has('browser_deep_interact'), '工具 browser_deep_interact 不应在 OSS 版本中（属于 Pro 版付费能力）');
    });
  });

  // browser_form_fill
  describe('browser_form_fill', () => {
    test('schema 文件存在且 JSON 合法', () => {
      const schemaPath = path.join(TOOLS_DIR, 'browser_form_fill.json');
      assert.ok(fs.existsSync(schemaPath));
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      assert.equal(schema.name, 'browser_form_fill');
    });

    test('schema 包含 url/selector/fields/submit/submitSelector 参数', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_form_fill.json'), 'utf8'));
      const props = schema.inputSchema.properties;
      assert.ok(props.url);
      assert.ok(props.selector);
      assert.ok(props.fields);
      assert.ok(props.submit);
      assert.ok(props.submitSelector);
    });

    test('url 为必填参数', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_form_fill.json'), 'utf8'));
      assert.ok(schema.inputSchema.required.includes('url'));
    });

    test('toolNames 中包含 browser_form_fill', () => {
      assert.ok(toolNames.has('browser_form_fill'));
    });
  });
});

// validation_matrix 增强测试
describe('validation_matrix 增强', () => {
  test('schema 包含新增的 url/dimensions/performanceThreshold 参数', () => {
    const TOOLS_DIR = path.join(__dirname, '..', 'tools');
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.url, '应有 url 参数');
    assert.ok(props.dimensions, '应有 dimensions 参数');
    assert.ok(props.performanceThreshold, '应有 performanceThreshold 参数');
    assert.ok(props.a11yStandard, '应有 a11yStandard 参数');
    assert.ok(props.outputFormat, '应有 outputFormat 参数');
  });

  test('schema required 包含 url', () => {
    const TOOLS_DIR = path.join(__dirname, '..', 'tools');
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    assert.ok(schema.inputSchema.required.includes('url'), 'url 应为必填');
    assert.ok(schema.inputSchema.required.includes('roles'), 'roles 应为必填');
    assert.ok(schema.inputSchema.required.includes('features'), 'features 应为必填');
  });

  // v1.6.8 移除 outputSchema：handler 返回 text content 而非 structuredContent，MCP 协议要求 outputSchema 必须不存在
  test('outputSchema 不存在（MCP 协议合规）', () => {
    const TOOLS_DIR = path.join(__dirname, '..', 'tools');
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    assert.equal(schema.outputSchema, undefined, '不应定义 outputSchema');
  });
});