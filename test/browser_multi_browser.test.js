'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const HANDLERS_DIR = path.join(__dirname, '..', 'handlers');
const SERVER_PATH = path.join(__dirname, '..', 'server.js');

// Build toolNames from handler modules
const handlers = [require('../handlers/browser')];
function buildToolNames() {
  const names = new Set();
  for (const h of handlers) {
    for (const name of h.tools) names.add(name);
  }
  return names;
}
const toolNames = buildToolNames();

// ============================================================
// browser_open — browserType 参数
// ============================================================

describe('browser_open — 多浏览器支持', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_open.json'), 'utf8'));
    assert.equal(schema.name, 'browser_open');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema.properties);
  });

  test('schema 新增 browserType 枚举参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_open.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.browserType, '应包含 browserType 参数');
    assert.equal(props.browserType.type, 'string');
    assert.ok(Array.isArray(props.browserType.enum), 'browserType 应为枚举');
    assert.ok(props.browserType.enum.includes('chromium'), '应支持 chromium');
    assert.ok(props.browserType.enum.includes('firefox'), '应支持 firefox');
    assert.ok(props.browserType.enum.includes('webkit'), '应支持 webkit');
    assert.equal(props.browserType.default, 'chromium', '默认应为 chromium');
  });

  test('server.js 导入 firefox 和 webkit', () => {
    const src = fs.readFileSync(SERVER_PATH, 'utf8');
    assert.ok(src.includes('firefox'), 'server.js 应导入 firefox');
    assert.ok(src.includes('webkit'), 'server.js 应导入 webkit');
  });

  test('ensurePage 支持 browserType 参数', () => {
    const src = fs.readFileSync(SERVER_PATH, 'utf8');
    assert.ok(src.includes("browserType = args.browserType"), 'ensurePage 应读取 args.browserType');
    assert.ok(src.includes("const browserEngines = { chromium, firefox, webkit }"), '应定义浏览器引擎映射');
    assert.ok(src.includes("engine.launch"), '应使用动态 engine.launch');
  });

  test('scheme 描述中提及产品定位 v2.0', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_open.json'), 'utf8'));
    assert.ok(schema.description.includes('P0-6') || schema.description.includes('多浏览器'), '描述应提及多浏览器支持能力');
  });
});

// ============================================================
// browser_matrix_test — 跨浏览器矩阵测试
// ============================================================

describe('browser_matrix_test', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_matrix_test.json');
    assert.ok(fs.existsSync(filePath), 'browser_matrix_test.json 应存在');
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_matrix_test');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema.properties);
    assert.ok(schema.inputSchema.required.includes('steps'), 'steps 应为必填');
  });

  test('已注册到 MCP（toolNames 中包含）', () => {
    assert.ok(toolNames.has('browser_matrix_test'), 'browser_matrix_test 应在 toolNames 中');
  });

  test('schema browsers 参数支持 chromium/firefox/webkit 枚举', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_matrix_test.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.browsers, '应包含 browsers 参数');
    assert.equal(props.browsers.type, 'array', 'browsers 应为数组');
    assert.ok(props.browsers.items, 'browsers 应有 items 定义');
    assert.ok(props.browsers.items.enum.includes('chromium'), '应支持 chromium');
    assert.ok(props.browsers.items.enum.includes('firefox'), '应支持 firefox');
    assert.ok(props.browsers.items.enum.includes('webkit'), '应支持 webkit');
  });

  test('schema steps 参数支持 navigate/click/type/screenshot/evaluate', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_matrix_test.json'), 'utf8'));
    const stepItems = schema.inputSchema.properties.steps.items;
    assert.ok(stepItems, 'steps 应有 items 定义');
    assert.ok(stepItems.properties.action, 'steps 每项应有 action');
    assert.ok(stepItems.properties.action.enum.includes('navigate'), '应支持 navigate');
    assert.ok(stepItems.properties.action.enum.includes('click'), '应支持 click');
    assert.ok(stepItems.properties.action.enum.includes('type'), '应支持 type');
    assert.ok(stepItems.properties.action.enum.includes('screenshot'), '应支持 screenshot');
    assert.ok(stepItems.properties.action.enum.includes('evaluate'), '应支持 evaluate');
    assert.ok(Array.isArray(stepItems.required) && stepItems.required.includes('action'), 'action 应为必填');
  });

  test('handler 中存在 browser_matrix_test 处理逻辑', () => {
    const src = fs.readFileSync(path.join(HANDLERS_DIR, 'browser.js'), 'utf8');
    assert.ok(src.includes("name === 'browser_matrix_test'"), 'handler 应包含 browser_matrix_test 处理');
    assert.ok(src.includes("require('playwright')"), '应导入 playwright');
    assert.ok(src.includes("for (const browserType of browserTypes)"), '应遍历 browsers');
    assert.ok(src.includes("engine.launch"), '应启动浏览器引擎');
    assert.ok(src.includes("browser.close"), '应关闭浏览器');
  });

  test('handler 校验 steps 为空时返回错误', () => {
    const src = fs.readFileSync(path.join(HANDLERS_DIR, 'browser.js'), 'utf8');
    assert.ok(src.includes('steps.length === 0'), '应校验 steps 为空');
    assert.ok(src.includes('缺少必需参数: steps'), '返回错误信息');
  });

  test('描述中提及产品定位 v2.0 能力补齐方案', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_matrix_test.json'), 'utf8'));
    assert.ok(schema.description.includes('P0-6') || schema.description.includes('跨浏览器'), '描述应提及跨浏览器矩阵测试');
  });

  test('描述中提及 chromium/firefox/webkit 任意组合', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_matrix_test.json'), 'utf8'));
    assert.ok(schema.description.includes('chromium') && schema.description.includes('firefox') && schema.description.includes('webkit'),
      '描述应提及三种浏览器引擎');
  });
});
