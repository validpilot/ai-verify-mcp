'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const HANDLERS_DIR = path.join(__dirname, '..', 'handlers');

// ============================================================
// validation_matrix 功能测试
// ============================================================

describe('validation_matrix handler 功能', () => {
  test('validation_matrix.json schema 文件存在', () => {
    const filePath = path.join(TOOLS_DIR, 'validation_matrix.json');
    assert.ok(fs.existsSync(filePath));
  });

  test('validation_matrix schema 包含完整的 outputSchema', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    assert.ok(schema.outputSchema, '应有 outputSchema');
    assert.ok(schema.outputSchema.properties, 'outputSchema 应有 properties');
    assert.ok(schema.outputSchema.properties.success, 'outputSchema 应包含 success');
    assert.ok(schema.outputSchema.properties.overallScore, 'outputSchema 应包含 overallScore');
    assert.ok(schema.outputSchema.properties.grade, 'outputSchema 应包含 grade');
    assert.ok(schema.outputSchema.properties.dimensions, 'outputSchema 应包含 dimensions');
  });

  test('validation_matrix schema dimensions 包含4个维度', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    const dims = schema.inputSchema.properties.dimensions;
    assert.ok(dims.default.includes('functional'), '默认维度应包含 functional');
    assert.ok(dims.default.includes('visual'), '默认维度应包含 visual');
    assert.ok(dims.default.includes('performance'), '默认维度应包含 performance');
    assert.ok(dims.default.includes('a11y'), '默认维度应包含 a11y');
  });

  test('validation_matrix schema required 字段正确', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    assert.ok(schema.inputSchema.required.includes('url'), 'url 应为必填');
    assert.ok(schema.inputSchema.required.includes('roles'), 'roles 应为必填');
    assert.ok(schema.inputSchema.required.includes('features'), 'features 应为必填');
    assert.equal(schema.inputSchema.required.length, 3, '应有3个必填字段');
  });

  test('validation_matrix schema roles 参数类型正确', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    const roles = schema.inputSchema.properties.roles;
    assert.equal(roles.type, 'array', 'roles 应为 array 类型');
    assert.ok(roles.items, 'roles 应有 items 定义');
    assert.equal(roles.items.type, 'object', 'roles items 应为 object 类型');
  });

  test('validation_matrix schema features 参数类型正确', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    const features = schema.inputSchema.properties.features;
    assert.equal(features.type, 'array', 'features 应为 array 类型');
    assert.ok(features.items, 'features 应有 items 定义');
    assert.equal(features.items.type, 'object', 'features items 应为 object 类型');
  });

  test('validation_matrix schema 包含 performanceThreshold 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    assert.ok(schema.inputSchema.properties.performanceThreshold, '应有 performanceThreshold 参数');
    assert.equal(schema.inputSchema.properties.performanceThreshold.type, 'number', 'performanceThreshold 应为 number 类型');
  });

  test('validation_matrix schema 包含 a11yStandard 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    assert.ok(schema.inputSchema.properties.a11yStandard, '应有 a11yStandard 参数');
    assert.equal(schema.inputSchema.properties.a11yStandard.type, 'string', 'a11yStandard 应为 string 类型');
    assert.equal(schema.inputSchema.properties.a11yStandard.default, 'wcag-aa', 'a11yStandard 默认值应为 wcag-aa');
  });

  test('validation_matrix schema 包含 outputFormat 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    assert.ok(schema.inputSchema.properties.outputFormat, '应有 outputFormat 参数');
    assert.equal(schema.inputSchema.properties.outputFormat.type, 'string', 'outputFormat 应为 string 类型');
    assert.equal(schema.inputSchema.properties.outputFormat.default, 'json', 'outputFormat 默认值应为 json');
  });

  test('validation_matrix 在 handlers/validation.js 中注册', () => {
    const validation = require('../handlers/validation');
    assert.ok(validation.tools.includes('validation_matrix'), 'validation_matrix 应在 validation handler 的 tools 数组中');
  });

  test('validation_matrix handler 导出正确的接口', () => {
    const validation = require('../handlers/validation');
    assert.ok(Array.isArray(validation.tools), 'tools 应为数组');
    assert.ok(validation.tools.length > 0, 'tools 数组不应为空');
    assert.ok(typeof validation.handle === 'function', 'handle 应为函数');
  });

  test('validation_matrix outputSchema grade 字段描述正确', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    const grade = schema.outputSchema.properties.grade;
    assert.ok(grade.description.includes('A/B/C/D/F'), 'grade 描述应包含等级说明');
  });

  test('validation_matrix outputSchema overallScore 描述正确', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    const score = schema.outputSchema.properties.overallScore;
    assert.ok(score.description.includes('0-100'), 'overallScore 描述应包含评分范围');
  });

  test('validation_matrix outputSchema dimensions 结构正确', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    const dims = schema.outputSchema.properties.dimensions;
    assert.ok(dims.properties.functional, 'dimensions 应包含 functional');
    assert.ok(dims.properties.visual, 'dimensions 应包含 visual');
    assert.ok(dims.properties.performance, 'dimensions 应包含 performance');
    assert.ok(dims.properties.a11y, 'dimensions 应包含 a11y');
  });

  test('validation_matrix outputSchema 包含 roleMatrix', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    assert.ok(schema.outputSchema.properties.roleMatrix, 'outputSchema 应包含 roleMatrix');
    assert.equal(schema.outputSchema.properties.roleMatrix.type, 'array', 'roleMatrix 应为 array 类型');
    assert.ok(schema.outputSchema.properties.roleMatrix.description, 'roleMatrix 应有描述');
  });

  test('validation_matrix outputSchema 包含 recommendations', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    assert.ok(schema.outputSchema.properties.recommendations, 'outputSchema 应包含 recommendations');
    assert.equal(schema.outputSchema.properties.recommendations.type, 'array', 'recommendations 应为 array 类型');
    assert.ok(schema.outputSchema.properties.recommendations.items, 'recommendations 应有 items 定义');
    assert.equal(schema.outputSchema.properties.recommendations.items.type, 'string', 'recommendations items 应为 string 类型');
  });

  test('validation_matrix outputSchema 包含 artifacts', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    assert.ok(schema.outputSchema.properties.artifacts, 'outputSchema 应包含 artifacts');
    assert.equal(schema.outputSchema.properties.artifacts.type, 'array', 'artifacts 应为 array 类型');
  });

  test('validation_matrix schema 包含 visualBaseline 可选参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    assert.ok(schema.inputSchema.properties.visualBaseline, '应有 visualBaseline 参数');
    assert.equal(schema.inputSchema.properties.visualBaseline.type, 'string', 'visualBaseline 应为 string 类型');
    assert.ok(!schema.inputSchema.required.includes('visualBaseline'), 'visualBaseline 不应为必填');
  });

  test('validation_matrix schema 包含 clearArtifacts/clearErrors 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_matrix.json'), 'utf8'));
    assert.ok(schema.inputSchema.properties.clearArtifacts, '应有 clearArtifacts 参数');
    assert.ok(schema.inputSchema.properties.clearErrors, '应有 clearErrors 参数');
    assert.equal(schema.inputSchema.properties.clearArtifacts.type, 'boolean', 'clearArtifacts 应为 boolean');
    assert.equal(schema.inputSchema.properties.clearErrors.type, 'boolean', 'clearErrors 应为 boolean');
  });
});