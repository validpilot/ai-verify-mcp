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

    test('outputSchema 包含 metrics/grade/recommendations', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_performance_trace.json'), 'utf8'));
      const outProps = schema.outputSchema.properties;
      assert.ok(outProps.metrics);
      assert.ok(outProps.grade);
      assert.ok(outProps.recommendations);
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

    test('outputSchema 包含 detected/riskLevel/recommendations', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_anti_bot_detect.json'), 'utf8'));
      const outProps = schema.outputSchema.properties;
      assert.ok(outProps.detected);
      assert.ok(outProps.riskLevel);
      assert.ok(outProps.recommendations);
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

    test('outputSchema 包含 fields/validationResults/summary', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_form_validate.json'), 'utf8'));
      const outProps = schema.outputSchema.properties;
      assert.ok(outProps.fields);
      assert.ok(outProps.validationResults);
      assert.ok(outProps.summary);
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

    test('outputSchema 包含 applied/pageInfo/verification', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_emulate_device.json'), 'utf8'));
      const outProps = schema.outputSchema.properties;
      assert.ok(outProps.applied);
      assert.ok(outProps.pageInfo);
      assert.ok(outProps.verification);
    });

    test('toolNames 中包含 browser_emulate_device', () => {
      assert.ok(toolNames.has('browser_emulate_device'));
    });
  });

  // browser_deep_interact
  describe('browser_deep_interact', () => {
    test('schema 文件存在且 JSON 合法', () => {
      const schemaPath = path.join(TOOLS_DIR, 'browser_deep_interact.json');
      assert.ok(fs.existsSync(schemaPath));
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      assert.equal(schema.name, 'browser_deep_interact');
    });

    test('schema 包含 mode/url/workflow/fillFields 参数', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_deep_interact.json'), 'utf8'));
      const props = schema.inputSchema.properties;
      assert.ok(props.mode);
      assert.ok(props.url);
      assert.ok(props.workflow);
      assert.ok(props.fillFields);
    });

    test('mode 参数枚举包含 detect/form/workflow/explore', () => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_deep_interact.json'), 'utf8'));
      const mode = schema.inputSchema.properties.mode;
      assert.ok(mode.enum);
      assert.ok(mode.enum.includes('detect'));
      assert.ok(mode.enum.includes('form'));
      assert.ok(mode.enum.includes('workflow'));
      assert.ok(mode.enum.includes('explore'));
    });

    test('toolNames 中包含 browser_deep_interact', () => {
      assert.ok(toolNames.has('browser_deep_interact'));
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

  test('outputSchema 包含 overallScore/grade/dimensions', () => {
    const TOOLS_DIR = path.join(__dirname, '..', 'tools');
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    const outProps = schema.outputSchema.properties;
    assert.ok(outProps.overallScore, '应有 overallScore');
    assert.ok(outProps.grade, '应有 grade');
    assert.ok(outProps.dimensions, '应有 dimensions');
    assert.ok(outProps.recommendations, '应有 recommendations');
  });
});