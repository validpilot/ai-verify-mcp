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
// browser_visual_component 验证
// ============================================================

describe('browser_visual_component', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_visual_component.json'), 'utf8'));
    assert.equal(schema.name, 'browser_visual_component');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
    assert.ok(schema.inputSchema.properties);
    assert.ok(schema.inputSchema.required);
    assert.ok(schema.inputSchema.required.includes('name'));
    assert.ok(schema.inputSchema.required.includes('selector'));
  });

  test('已注册到 MCP（toolNames 中包含）', () => {
    assert.ok(toolNames.has('browser_visual_component'));
  });

  test('handler 接收到未知 name 返回 isError', async () => {
    const handler = require('../handlers/visual');
    const deps = {
      ensurePage: () => Promise.resolve({ target: {} }),
      text: x => ({ content: [{ type: 'text', text: x }] }),
      networkLogs: [],
      consoleLogs: [],
      VISUAL_BASELINE_DIR: path.join(__dirname, '..', 'artifacts', 'visual', 'baselines'),
      VISUAL_ACTUAL_DIR: path.join(__dirname, '..', 'artifacts', 'visual', 'actual'),
      VISUAL_DIFF_DIR: path.join(__dirname, '..', 'artifacts', 'visual', 'diff'),
      visualCompare: () => Promise.resolve({ diffPixels: 0, diffRatio: 0, passed: true }),
      visualBaseline: () => Promise.resolve({}),
      visualReport: () => ({}),
      runA11yCheck: () => Promise.resolve({}),
      evidenceCollector: { screenshotDiff: () => Promise.resolve({}) },
      runFullAudit: () => Promise.resolve({}),
      runLighthouseAudit: () => Promise.resolve({}),
    };
    const result = await handler.handle('nonexistent_tool_xyz', {}, deps);
    assert.ok(result.isError);
  });

  test('缺少 selector 时返回错误', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_visual_component.json'), 'utf8'));
    assert.ok(schema.inputSchema.required.includes('selector'));
  });

  test('handler 能正确识别 browser_visual_component', () => {
    const handler = require('../handlers/visual');
    assert.ok(handler.tools.includes('browser_visual_component'));
  });

  test('参数 maxDiffPixelRatio 为可选参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_visual_component.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.maxDiffPixelRatio);
    assert.equal(schema.inputSchema.required.length, 2); // only name + selector
  });
});
