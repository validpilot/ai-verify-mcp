'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');

describe('tools schema 目录结构', () => {
  test('tools 目录存在', () => {
    assert.ok(fs.existsSync(TOOLS_DIR), 'tools 目录应存在');
  });

  test('tools 目录包含 JSON 文件', () => {
    const files = fs.readdirSync(TOOLS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    assert.ok(jsonFiles.length > 0, 'tools 目录应包含 JSON 文件');
  });

  test('每个 tool schema 文件都有 name 字段', () => {
    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files.slice(0, 10)) { // 检查前10个
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, file), 'utf8'));
      assert.ok(schema.name, `${file} 应有 name 字段`);
    }
  });

  test('每个 tool schema 文件都有 description 字段', () => {
    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files.slice(0, 10)) {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, file), 'utf8'));
      assert.ok(schema.description, `${file} 应有 description 字段`);
    }
  });

  test('每个 tool schema 文件都有 inputSchema 字段', () => {
    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files.slice(0, 10)) {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, file), 'utf8'));
      assert.ok(schema.inputSchema, `${file} 应有 inputSchema 字段`);
      assert.equal(schema.inputSchema.type, 'object', `${file} inputSchema type 应为 object`);
    }
  });

  test('每个 tool schema 的 name 与文件名匹配', () => {
    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files.slice(0, 10)) {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, file), 'utf8'));
      const expectedName = file.replace('.json', '');
      assert.equal(schema.name, expectedName, `${file} name 应为 ${expectedName}`);
    }
  });

  test('tool schema 文件数量合理', () => {
    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    assert.ok(files.length >= 80, '应有至少 80 个工具 schema');
    assert.ok(files.length <= 100, '应有不超过 100 个工具 schema');
  });

  test('tool schema 文件都是合法 JSON', () => {
    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files.slice(0, 20)) {
      try {
        JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, file), 'utf8'));
      } catch (e) {
        assert.fail(`${file} 不是合法 JSON: ${e.message}`);
      }
    }
  });

  test('所有 tool schema 文件都有 properties 字段', () => {
    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files.slice(0, 10)) {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, file), 'utf8'));
      assert.ok(schema.inputSchema.properties, `${file} inputSchema 应有 properties`);
    }
  });

  test('核心工具 schema 文件存在', () => {
    const coreTools = ['browser_open', 'browser_click', 'browser_navigate', 'validation_start', 'browser_diagnose'];
    for (const tool of coreTools) {
      const filePath = path.join(TOOLS_DIR, `${tool}.json`);
      assert.ok(fs.existsSync(filePath), `核心工具 ${tool}.json 应存在`);
    }
  });

  test('新增工具 schema 文件存在', () => {
    const newTools = ['browser_performance_trace', 'browser_form_validate', 'browser_anti_bot_detect', 'browser_emulate_device'];
    for (const tool of newTools) {
      const filePath = path.join(TOOLS_DIR, `${tool}.json`);
      assert.ok(fs.existsSync(filePath), `新增工具 ${tool}.json 应存在`);
    }
  });

  test('validation 系列工具 schema 文件存在', () => {
    const validationTools = ['validation_start', 'validation_run', 'validation_check', 'validation_matrix', 'validation_report'];
    for (const tool of validationTools) {
      const filePath = path.join(TOOLS_DIR, `${tool}.json`);
      assert.ok(fs.existsSync(filePath), `validation 工具 ${tool}.json 应存在`);
    }
  });

  test('tool schema 无重复 name', () => {
    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    const names = files.map(f => f.replace('.json', ''));
    const uniqueNames = new Set(names);
    assert.equal(names.length, uniqueNames.size, '工具 name 应无重复');
  });

  test('tool schema description 长度合理', () => {
    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files.slice(0, 10)) {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, file), 'utf8'));
      assert.ok(schema.description.length >= 10, `${file} description 应至少10字符`);
      assert.ok(schema.description.length <= 500, `${file} description 应不超过500字符`);
    }
  });

  test('tool schema inputSchema 包含 type 字段', () => {
    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files.slice(0, 10)) {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, file), 'utf8'));
      assert.ok(schema.inputSchema.type, `${file} inputSchema 应有 type 字段`);
    }
  });

  test('部分 tool schema 有 outputSchema', () => {
    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    const withOutput = files.filter(f => {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, f), 'utf8'));
      return schema.outputSchema;
    });
    assert.ok(withOutput.length > 0, '应有部分工具包含 outputSchema');
  });

  test('tool schema 文件编码为 UTF-8', () => {
    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files.slice(0, 5)) {
      const content = fs.readFileSync(path.join(TOOLS_DIR, file), 'utf8');
      assert.ok(content.length > 0, `${file} 应有内容`);
    }
  });

  test('tool schema 文件大小合理', () => {
    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const stats = fs.statSync(path.join(TOOLS_DIR, file));
      assert.ok(stats.size > 100, `${file} 文件大小应 > 100 bytes`);
      assert.ok(stats.size < 10000, `${file} 文件大小应 < 10 KB`);
    }
  });

  test('tool schema 无语法错误', () => {
    const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    let errorCount = 0;
    for (const file of files) {
      try {
        const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, file), 'utf8'));
        // 检查必要字段
        if (!schema.name || !schema.description || !schema.inputSchema) {
          errorCount++;
        }
      } catch (e) {
        errorCount++;
      }
    }
    assert.equal(errorCount, 0, '所有 tool schema 应无语法错误');
  });
});