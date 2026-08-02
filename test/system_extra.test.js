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
// css_var_check
// ============================================================

describe('css_var_check', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'css_var_check.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'css_var_check');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 css 为必填 string 参数，及 filePath 可选参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'css_var_check.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.css);
    assert.equal(props.css.type, 'string');
    assert.ok(schema.inputSchema.required.includes('css'), 'css 应为必填');
    assert.ok(props.filePath);
    assert.equal(props.filePath.type, 'string');
  });

  test('toolNames 中包含 css_var_check（已注册到 MCP）', () => {
    assert.ok(toolNames.has('css_var_check'), '工具 css_var_check 应在 toolNames 中');
  });
});

// ============================================================
// skill_mcp_validate
// ============================================================

// v1.10.0: skill_mcp_validate 已移除（别名 → skill_validate mode=mcp_validate）

// ============================================================
// skill_mcp_sync（OSS 不包含，属于 Team 版付费能力）
// ============================================================

describe('skill_mcp_sync', () => {
  test('schema 文件不存在（OSS 不包含付费功能）', () => {
    const filePath = path.join(TOOLS_DIR, 'skill_mcp_sync.json');
    assert.ok(!fs.existsSync(filePath), 'skill_mcp_sync.json 不应存在于 OSS 版本中');
  });

  test('toolNames 中不包含 skill_mcp_sync（OSS 不包含付费功能）', () => {
    assert.ok(!toolNames.has('skill_mcp_sync'), '工具 skill_mcp_sync 不应在 OSS 版本中（属于 Team 版付费能力）');
  });
});

// ============================================================
// browser_trace_chain
// ============================================================

// v1.10.0: browser_trace_chain 已移除（别名 → trace_correlate mode=chain）

// ============================================================
// backend_logs（OSS 不包含，属于 Pro 版付费能力）
// ============================================================

describe('backend_logs', () => {
  test('schema 文件不存在（OSS 不包含付费功能）', () => {
    const filePath = path.join(TOOLS_DIR, 'backend_logs.json');
    assert.ok(!fs.existsSync(filePath), 'backend_logs.json 不应存在于 OSS 版本中');
  });

  test('toolNames 中不包含 backend_logs（OSS 不包含付费功能）', () => {
    assert.ok(!toolNames.has('backend_logs'), '工具 backend_logs 不应在 OSS 版本中（属于 Pro 版付费能力）');
  });
});

// ============================================================
// browser_full_regression
// ============================================================

describe('browser_full_regression', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_full_regression.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_full_regression');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 url/maxDepth/maxItems/includeSubMenus/timeout/visible 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_full_regression.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.url);
    assert.equal(props.url.type, 'string');
    assert.ok(props.maxDepth);
    assert.equal(props.maxDepth.type, 'number');
    assert.ok(props.maxItems);
    assert.equal(props.maxItems.type, 'number');
    assert.ok(props.includeSubMenus);
    assert.equal(props.includeSubMenus.type, 'boolean');
    assert.ok(props.timeout);
    assert.equal(props.timeout.type, 'number');
    assert.ok(props.visible);
    assert.equal(props.visible.type, 'boolean');
  });

  test('toolNames 中包含 browser_full_regression（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_full_regression'), '工具 browser_full_regression 应在 toolNames 中');
  });
});

// ============================================================
// browser_deep_interact（OSS 不包含，属于 Pro 版付费能力）
// ============================================================

describe('browser_deep_interact', () => {
  test('schema 文件不存在（OSS 不包含付费功能）', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_deep_interact.json');
    assert.ok(!fs.existsSync(filePath), 'browser_deep_interact.json 不应存在于 OSS 版本中');
  });

  test('toolNames 中不包含 browser_deep_interact（OSS 不包含付费功能）', () => {
    assert.ok(!toolNames.has('browser_deep_interact'), '工具 browser_deep_interact 不应在 OSS 版本中（属于 Pro 版付费能力）');
  });
});

// ============================================================
// browser_traverse_menu
// ============================================================

describe('browser_traverse_menu', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_traverse_menu.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_traverse_menu');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 maxDepth/maxItems/waitMs/includeSubMenus 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_traverse_menu.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.maxDepth);
    assert.equal(props.maxDepth.type, 'number');
    assert.ok(props.maxItems);
    assert.equal(props.maxItems.type, 'number');
    assert.ok(props.waitMs);
    assert.equal(props.waitMs.type, 'number');
    assert.ok(props.includeSubMenus);
    assert.equal(props.includeSubMenus.type, 'boolean');
  });

  test('toolNames 中包含 browser_traverse_menu（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_traverse_menu'), '工具 browser_traverse_menu 应在 toolNames 中');
  });
});

// ============================================================
// mcp_health_check
// ============================================================

// v1.10.0: mcp_health_check 已移除（别名 → mcp_diag mode=health）

// ============================================================
// mcp_self_test
// ============================================================

// v1.10.0: mcp_self_test 已移除（别名 → mcp_diag mode=selftest）

// ============================================================
// benchmark_run（OSS 不包含，属于 Pro 版付费能力）
// ============================================================

describe('benchmark_run', () => {
  test('schema 文件不存在（OSS 不包含付费功能）', () => {
    const filePath = path.join(TOOLS_DIR, 'benchmark_run.json');
    assert.ok(!fs.existsSync(filePath), 'benchmark_run.json 不应存在于 OSS 版本中');
  });

  test('toolNames 中不包含 benchmark_run（OSS 不包含付费功能）', () => {
    assert.ok(!toolNames.has('benchmark_run'), '工具 benchmark_run 不应在 OSS 版本中（属于 Pro 版付费能力）');
  });
});

// ============================================================
// ai_debug_investigate（OSS 不包含，属于 Pro 版付费能力）
// ============================================================

describe('ai_debug_investigate', () => {
  test('schema 文件不存在（OSS 不包含付费功能）', () => {
    const filePath = path.join(TOOLS_DIR, 'ai_debug_investigate.json');
    assert.ok(!fs.existsSync(filePath), 'ai_debug_investigate.json 不应存在于 OSS 版本中');
  });

  test('toolNames 中不包含 ai_debug_investigate（OSS 不包含付费功能）', () => {
    assert.ok(!toolNames.has('ai_debug_investigate'), '工具 ai_debug_investigate 不应在 OSS 版本中（属于 Pro 版付费能力）');
  });
});

// ============================================================
// auto_fix_pipeline（OSS 不包含，属于 Pro 版付费能力）
// ============================================================

describe('auto_fix_pipeline', () => {
  test('schema 文件不存在（OSS 不包含付费功能）', () => {
    const filePath = path.join(TOOLS_DIR, 'auto_fix_pipeline.json');
    assert.ok(!fs.existsSync(filePath), 'auto_fix_pipeline.json 不应存在于 OSS 版本中');
  });

  test('toolNames 中不包含 auto_fix_pipeline（OSS 不包含付费功能）', () => {
    assert.ok(!toolNames.has('auto_fix_pipeline'), '工具 auto_fix_pipeline 不应在 OSS 版本中（属于 Pro 版付费能力）');
  });
});

// ============================================================
// fix_verify（OSS 不包含，属于 Pro 版付费能力）
// ============================================================

describe('fix_verify', () => {
  test('schema 文件不存在（OSS 不包含付费功能）', () => {
    const filePath = path.join(TOOLS_DIR, 'fix_verify.json');
    assert.ok(!fs.existsSync(filePath), 'fix_verify.json 不应存在于 OSS 版本中');
  });

  test('toolNames 中不包含 fix_verify（OSS 不包含付费功能）', () => {
    assert.ok(!toolNames.has('fix_verify'), '工具 fix_verify 不应在 OSS 版本中（属于 Pro 版付费能力）');
  });
});

// ============================================================
// skill_tools_map（v1.9.3+ Skill↔Tool 双向映射查询）
// ============================================================

// v1.10.0: skill_tools_map 已移除（别名 → skill_validate mode=tools_map）

// ============================================================
// skill_consistency_check（v1.9.3+ Skill-MCP 一致性批量校验，不依赖外部文件）
// ============================================================

// v1.10.0: skill_consistency_check 已移除（别名 → skill_validate mode=consistency）
