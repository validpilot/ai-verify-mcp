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

describe('skill_mcp_validate', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'skill_mcp_validate.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'skill_mcp_validate');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 skillName 为必填，及 mode 枚举参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'skill_mcp_validate.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.skillName);
    assert.equal(props.skillName.type, 'string');
    assert.ok(schema.inputSchema.required.includes('skillName'), 'skillName 应为必填');
    assert.ok(props.mode);
    assert.equal(props.mode.type, 'string');
    assert.ok(props.mode.enum.includes('strict'), 'mode 应包含 strict');
    assert.ok(props.mode.enum.includes('warn'), 'mode 应包含 warn');
  });

  test('toolNames 中包含 skill_mcp_validate（已注册到 MCP）', () => {
    assert.ok(toolNames.has('skill_mcp_validate'), '工具 skill_mcp_validate 应在 toolNames 中');
  });
});

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

describe('browser_trace_chain', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_trace_chain.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_trace_chain');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 traceId/since/url/statusMin/includeBackendLogs 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_trace_chain.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.traceId);
    assert.equal(props.traceId.type, 'string');
    assert.ok(props.since);
    assert.equal(props.since.type, 'string');
    assert.ok(props.url);
    assert.equal(props.url.type, 'string');
    assert.ok(props.statusMin);
    assert.equal(props.statusMin.type, 'number');
    assert.ok(props.includeBackendLogs);
    assert.equal(props.includeBackendLogs.type, 'boolean');
  });

  test('toolNames 中包含 browser_trace_chain（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_trace_chain'), '工具 browser_trace_chain 应在 toolNames 中');
  });
});

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

describe('mcp_health_check', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'mcp_health_check.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'mcp_health_check');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 无入参（inputSchema properties 为空对象）', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'mcp_health_check.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.deepEqual(props, {});
  });

  test('toolNames 中包含 mcp_health_check（已注册到 MCP）', () => {
    assert.ok(toolNames.has('mcp_health_check'), '工具 mcp_health_check 应在 toolNames 中');
  });
});

// ============================================================
// mcp_self_test
// ============================================================

describe('mcp_self_test', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'mcp_self_test.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'mcp_self_test');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 sessionName/headless/trace 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'mcp_self_test.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.sessionName);
    assert.equal(props.sessionName.type, 'string');
    assert.ok(props.headless);
    assert.equal(props.headless.type, 'boolean');
    assert.ok(props.trace);
    assert.equal(props.trace.type, 'boolean');
  });

  test('toolNames 中包含 mcp_self_test（已注册到 MCP）', () => {
    assert.ok(toolNames.has('mcp_self_test'), '工具 mcp_self_test 应在 toolNames 中');
  });
});

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

describe('skill_tools_map', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'skill_tools_map.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'skill_tools_map');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 skillName/toolName/includeDetails 参数及 anyOf 二选一约束', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'skill_tools_map.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.skillName);
    assert.equal(props.skillName.type, 'string');
    assert.ok(props.toolName);
    assert.equal(props.toolName.type, 'string');
    assert.ok(props.includeDetails);
    assert.equal(props.includeDetails.type, 'boolean');
    assert.ok(Array.isArray(schema.inputSchema.anyOf), 'anyOf 必须存在（skillName 或 toolName 二选一）');
    assert.equal(schema.inputSchema.anyOf.length, 2);
  });

  test('toolNames 中包含 skill_tools_map（已注册到 MCP）', () => {
    assert.ok(toolNames.has('skill_tools_map'), '工具 skill_tools_map 应在 toolNames 中');
  });
});

// ============================================================
// skill_consistency_check（v1.9.3+ Skill-MCP 一致性批量校验，不依赖外部文件）
// ============================================================

describe('skill_consistency_check', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'skill_consistency_check.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'skill_consistency_check');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 mode 枚举（strict/warn）与可选 skillName 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'skill_consistency_check.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.mode);
    assert.equal(props.mode.type, 'string');
    assert.ok(props.mode.enum.includes('strict'), 'mode 应包含 strict');
    assert.ok(props.mode.enum.includes('warn'), 'mode 应包含 warn');
    assert.equal(props.mode.default, 'strict');
    assert.ok(props.skillName);
    assert.equal(props.skillName.type, 'string');
    // skillName 是可选（不在 required 中）
    assert.ok(!schema.inputSchema.required || !schema.inputSchema.required.includes('skillName'), 'skillName 应为可选');
  });

  test('toolNames 中包含 skill_consistency_check（已注册到 MCP）', () => {
    assert.ok(toolNames.has('skill_consistency_check'), '工具 skill_consistency_check 应在 toolNames 中');
  });
});
