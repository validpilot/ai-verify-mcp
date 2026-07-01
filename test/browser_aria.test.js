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
// browser_aria_snapshot 验证
// ============================================================

describe('browser_aria_snapshot', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_aria_snapshot.json'), 'utf8'));
    assert.equal(schema.name, 'browser_aria_snapshot');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
    assert.ok(schema.inputSchema.properties);
  });

  test('已注册到 MCP（toolNames 中包含）', () => {
    assert.ok(toolNames.has('browser_aria_snapshot'));
  });

  test('handler 包含 assignRefs 逻辑和 _ref 设置', () => {
    const src = fs.readFileSync(path.join(HANDLERS_DIR, 'browser.js'), 'utf8');
    assert.ok(src.includes('node._ref = ref'), '应在原始节点上设置 _ref');
    assert.ok(src.includes('assignRefs'), '包含 assignRefs 函数');
  });

  test('描述提及 AI 驱动的元素定位', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_aria_snapshot.json'), 'utf8'));
    assert.ok(schema.description.includes('AI') || schema.description.includes('ref') || schema.description.includes('稳定'), '描述应提及 AI/ref/稳定性');
  });
});

// ============================================================
// browser_aria_click 验证
// ============================================================

describe('browser_aria_click', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_aria_click.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_aria_click');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
    assert.ok(schema.inputSchema.properties);
  });

  test('已注册到 MCP（toolNames 中包含）', () => {
    assert.ok(toolNames.has('browser_aria_click'), '工具 browser_aria_click 应在 toolNames 中');
  });

  test('schema 包含 ref 为必填 string 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_aria_click.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.ref);
    assert.equal(props.ref.type, 'string');
    assert.ok(Array.isArray(schema.inputSchema.required), 'required 应为数组');
    assert.ok(schema.inputSchema.required.includes('ref'), 'ref 应为必填参数');
  });

  test('handler 包含 browser_aria_click 处理逻辑', () => {
    const src = fs.readFileSync(path.join(HANDLERS_DIR, 'browser.js'), 'utf8');
    assert.ok(src.includes("name === 'browser_aria_click'"));
    assert.ok(src.includes('mouse.click'), '使用 mouse.click API');
    assert.ok(src.includes('findNodeByRef'), '使用 findNodeByRef 查找节点');
  });
});

// ============================================================
// browser_aria_type 验证
// ============================================================

describe('browser_aria_type', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_aria_type.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_aria_type');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
    assert.ok(schema.inputSchema.properties);
  });

  test('已注册到 MCP（toolNames 中包含）', () => {
    assert.ok(toolNames.has('browser_aria_type'), '工具 browser_aria_type 应在 toolNames 中');
  });

  test('schema 包含 ref 和 text 均为必填参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_aria_type.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.ref);
    assert.equal(props.ref.type, 'string');
    assert.ok(props.text);
    assert.equal(props.text.type, 'string');
    assert.ok(Array.isArray(schema.inputSchema.required));
    assert.ok(schema.inputSchema.required.includes('ref'), 'ref 应为必填');
    assert.ok(schema.inputSchema.required.includes('text'), 'text 应为必填');
  });

  test('handler 包含 browser_aria_type 处理逻辑', () => {
    const src = fs.readFileSync(path.join(HANDLERS_DIR, 'browser.js'), 'utf8');
    assert.ok(src.includes("name === 'browser_aria_type'"));
    assert.ok(src.includes('keyboard.type'), '使用 keyboard.type API');
    assert.ok(src.includes('Control+A'), '支持清空已有内容');
  });
});

// ============================================================
// findNodeByRef 辅助函数验证
// ============================================================

describe('findNodeByRef 辅助函数', () => {
  test('handler 中定义了 findNodeByRef 函数', () => {
    const src = fs.readFileSync(path.join(HANDLERS_DIR, 'browser.js'), 'utf8');
    assert.ok(src.includes('function findNodeByRef'), '应定义 findNodeByRef 函数');
    assert.ok(src.includes('node._ref === ref'), '应通过 _ref 查找节点');
  });
});

// ============================================================
// ARIA 系列工具整体验证
// ============================================================

describe('ARIA 工具系列一致性', () => {
  test('3 个 ARIA 工具全部注册', () => {
    const ariaTools = ['browser_aria_snapshot', 'browser_aria_click', 'browser_aria_type'];
    for (const tool of ariaTools) {
      assert.ok(toolNames.has(tool), `ARIA 工具 ${tool} 应已注册`);
    }
  });

  test('3 个 ARIA schema 文件均存在且合法', () => {
    const ariaFiles = ['browser_aria_snapshot.json', 'browser_aria_click.json', 'browser_aria_type.json'];
    for (const file of ariaFiles) {
      const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, file), 'utf8'));
      assert.ok(schema.name, `${file} 应有 name`);
      assert.ok(schema.description, `${file} 应有 description`);
      assert.ok(schema.inputSchema, `${file} 应有 inputSchema`);
    }
  });

  test('描述一致性 — ref 定位不依赖 CSS 选择器（符合产品定位 v2.0 差异化优势）', () => {
    const clickSchema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_aria_click.json'), 'utf8'));
    const typeSchema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_aria_type.json'), 'utf8'));
    assert.ok(clickSchema.description.includes('CSS') || clickSchema.description.includes('稳定'), 'browser_aria_click 描述应强调 CSS 无关性');
    assert.ok(typeSchema.description.includes('CSS') || typeSchema.description.includes('稳定'), 'browser_aria_type 描述应强调 CSS 无关性');
  });
});
