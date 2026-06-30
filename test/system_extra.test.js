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
// skill_mcp_sync
// ============================================================

describe('skill_mcp_sync', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'skill_mcp_sync.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'skill_mcp_sync');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 skillName 为必填，及 dryRun 布尔参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'skill_mcp_sync.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.skillName);
    assert.equal(props.skillName.type, 'string');
    assert.ok(schema.inputSchema.required.includes('skillName'), 'skillName 应为必填');
    assert.ok(props.dryRun);
    assert.equal(props.dryRun.type, 'boolean');
  });

  test('toolNames 中包含 skill_mcp_sync（已注册到 MCP）', () => {
    assert.ok(toolNames.has('skill_mcp_sync'), '工具 skill_mcp_sync 应在 toolNames 中');
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
// backend_logs
// ============================================================

describe('backend_logs', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'backend_logs.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'backend_logs');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 traceId 为必填，及 service/since/lines 可选参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'backend_logs.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.traceId);
    assert.equal(props.traceId.type, 'string');
    assert.ok(schema.inputSchema.required.includes('traceId'), 'traceId 应为必填');
    assert.ok(props.service);
    assert.equal(props.service.type, 'string');
    assert.ok(props.since);
    assert.equal(props.since.type, 'string');
    assert.ok(props.lines);
    assert.equal(props.lines.type, 'number');
  });

  test('toolNames 中包含 backend_logs（已注册到 MCP）', () => {
    assert.ok(toolNames.has('backend_logs'), '工具 backend_logs 应在 toolNames 中');
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
// browser_deep_interact
// ============================================================

describe('browser_deep_interact', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_deep_interact.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_deep_interact');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 mode 枚举/url/workflow/fillFields/submit/maxActions/interactModals/visible 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_deep_interact.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.mode);
    assert.equal(props.mode.type, 'string');
    assert.ok(props.mode.enum.includes('detect'), 'mode 应包含 detect');
    assert.ok(props.mode.enum.includes('form'), 'mode 应包含 form');
    assert.ok(props.mode.enum.includes('workflow'), 'mode 应包含 workflow');
    assert.ok(props.mode.enum.includes('explore'), 'mode 应包含 explore');
    assert.ok(props.url);
    assert.equal(props.url.type, 'string');
    assert.ok(props.workflow);
    assert.equal(props.workflow.type, 'array');
    assert.ok(props.fillFields);
    assert.equal(props.fillFields.type, 'boolean');
    assert.ok(props.submit);
    assert.equal(props.submit.type, 'boolean');
    assert.ok(props.maxActions);
    assert.equal(props.maxActions.type, 'number');
    assert.ok(props.interactModals);
    assert.equal(props.interactModals.type, 'boolean');
    assert.ok(props.visible);
    assert.equal(props.visible.type, 'boolean');
  });

  test('toolNames 中包含 browser_deep_interact（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_deep_interact'), '工具 browser_deep_interact 应在 toolNames 中');
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
// benchmark_run（占位工具，仅验证注册）
// ============================================================

describe('benchmark_run', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'benchmark_run.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'benchmark_run');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 名称为 benchmark_run 且包含 description 和 inputSchema', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'benchmark_run.json'), 'utf8'));
    assert.equal(schema.name, 'benchmark_run');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 benchmark_run（已注册到 MCP）', () => {
    assert.ok(toolNames.has('benchmark_run'), '工具 benchmark_run 应在 toolNames 中');
  });
});

// ============================================================
// ai_debug_investigate（占位工具，仅验证注册）
// ============================================================

describe('ai_debug_investigate', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'ai_debug_investigate.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'ai_debug_investigate');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 名称为 ai_debug_investigate 且包含 description 和 inputSchema', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'ai_debug_investigate.json'), 'utf8'));
    assert.equal(schema.name, 'ai_debug_investigate');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('toolNames 中包含 ai_debug_investigate（已注册到 MCP）', () => {
    assert.ok(toolNames.has('ai_debug_investigate'), '工具 ai_debug_investigate 应在 toolNames 中');
  });
});

// ============================================================
// auto_fix_pipeline
// ============================================================

describe('auto_fix_pipeline', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'auto_fix_pipeline.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'auto_fix_pipeline');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 url/maxIterations/autoConfirm 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'auto_fix_pipeline.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.url);
    assert.equal(props.url.type, 'string');
    assert.ok(props.maxIterations);
    assert.equal(props.maxIterations.type, 'number');
    assert.ok(props.autoConfirm);
    assert.equal(props.autoConfirm.type, 'boolean');
  });

  test('toolNames 中包含 auto_fix_pipeline（已注册到 MCP）', () => {
    assert.ok(toolNames.has('auto_fix_pipeline'), '工具 auto_fix_pipeline 应在 toolNames 中');
  });
});

// ============================================================
// fix_verify
// ============================================================

describe('fix_verify', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'fix_verify.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'fix_verify');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 url/beforeSummary/afterSummary/timeout/captureScreenshots/checkDomElements 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'fix_verify.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.url);
    assert.equal(props.url.type, 'string');
    assert.ok(props.beforeSummary);
    assert.equal(props.beforeSummary.type, 'object');
    assert.ok(props.afterSummary);
    assert.equal(props.afterSummary.type, 'object');
    assert.ok(props.timeout);
    assert.equal(props.timeout.type, 'number');
    assert.ok(props.captureScreenshots);
    assert.equal(props.captureScreenshots.type, 'boolean');
    assert.ok(props.checkDomElements);
    assert.equal(props.checkDomElements.type, 'array');
  });

  test('toolNames 中包含 fix_verify（已注册到 MCP）', () => {
    assert.ok(toolNames.has('fix_verify'), '工具 fix_verify 应在 toolNames 中');
  });
});
