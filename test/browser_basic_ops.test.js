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
// browser_open
// ============================================================

describe('browser_open', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_open.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_open');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 url 为必填，headless 为可选布尔', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_open.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.url);
    assert.equal(props.url.type, 'string');
    assert.ok(schema.inputSchema.required.includes('url'), 'url 应为必填');
    assert.ok(props.headless);
    assert.equal(props.headless.type, 'boolean');
  });

  test('toolNames 中包含 browser_open（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_open'), '工具 browser_open 应在 toolNames 中');
  });
});

// ============================================================
// browser_click
// ============================================================

describe('browser_click', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_click.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_click');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 selector 为必填', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_click.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.selector);
    assert.equal(props.selector.type, 'string');
    assert.ok(schema.inputSchema.required.includes('selector'), 'selector 应为必填');
  });

  test('toolNames 中包含 browser_click（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_click'), '工具 browser_click 应在 toolNames 中');
  });
});

// ============================================================
// browser_click_audit
// ============================================================

describe('browser_click_audit', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_click_audit.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_click_audit');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 selector/text/waitMs/autoReturn/label 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_click_audit.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.selector);
    assert.equal(props.selector.type, 'string');
    assert.ok(props.text);
    assert.equal(props.text.type, 'string');
    assert.ok(props.waitMs);
    assert.equal(props.waitMs.type, 'number');
    assert.ok(props.autoReturn);
    assert.equal(props.autoReturn.type, 'boolean');
    assert.ok(props.label);
    assert.equal(props.label.type, 'string');
  });

  test('toolNames 中包含 browser_click_audit（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_click_audit'), '工具 browser_click_audit 应在 toolNames 中');
  });
});

// ============================================================
// browser_type
// ============================================================

describe('browser_type', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_type.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_type');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 selector 和 text 为必填', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_type.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.selector);
    assert.equal(props.selector.type, 'string');
    assert.ok(props.text);
    assert.equal(props.text.type, 'string');
    assert.ok(schema.inputSchema.required.includes('selector'), 'selector 应为必填');
    assert.ok(schema.inputSchema.required.includes('text'), 'text 应为必填');
  });

  test('toolNames 中包含 browser_type（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_type'), '工具 browser_type 应在 toolNames 中');
  });
});

// ============================================================
// browser_hover
// ============================================================

describe('browser_hover', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_hover.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_hover');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 selector 为必填', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_hover.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.selector);
    assert.equal(props.selector.type, 'string');
    assert.ok(schema.inputSchema.required.includes('selector'), 'selector 应为必填');
  });

  test('toolNames 中包含 browser_hover（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_hover'), '工具 browser_hover 应在 toolNames 中');
  });
});

// ============================================================
// browser_press_key
// ============================================================

describe('browser_press_key', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_press_key.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_press_key');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 key 为必填，selector 为可选参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_press_key.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.key);
    assert.equal(props.key.type, 'string');
    assert.ok(schema.inputSchema.required.includes('key'), 'key 应为必填');
    assert.ok(props.selector);
    assert.equal(props.selector.type, 'string');
  });

  test('toolNames 中包含 browser_press_key（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_press_key'), '工具 browser_press_key 应在 toolNames 中');
  });
});

// ============================================================
// browser_snapshot
// ============================================================

describe('browser_snapshot', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_snapshot.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_snapshot');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 无必填参数，properties 为空对象', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_snapshot.json'), 'utf8'));
    assert.deepEqual(schema.inputSchema.properties, {});
    assert.ok(Array.isArray(schema.inputSchema.required) || schema.inputSchema.required === undefined);
  });

  test('toolNames 中包含 browser_snapshot（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_snapshot'), '工具 browser_snapshot 应在 toolNames 中');
  });
});

// ============================================================
// browser_batch
// ============================================================

describe('browser_batch', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_batch.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_batch');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 steps 为必填（数组），maxSteps 为可选数值', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_batch.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.steps);
    assert.equal(props.steps.type, 'array');
    assert.ok(props.steps.items);
    assert.equal(props.steps.items.type, 'object');
    assert.ok(schema.inputSchema.required.includes('steps'), 'steps 应为必填');
    assert.ok(props.maxSteps);
    assert.equal(props.maxSteps.type, 'number');
  });

  test('toolNames 中包含 browser_batch（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_batch'), '工具 browser_batch 应在 toolNames 中');
  });
});

// ============================================================
// browser_dom
// ============================================================

describe('browser_dom', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_dom.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_dom');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 selector 为必填', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_dom.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.selector);
    assert.equal(props.selector.type, 'string');
    assert.ok(schema.inputSchema.required.includes('selector'), 'selector 应为必填');
  });

  test('toolNames 中包含 browser_dom（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_dom'), '工具 browser_dom 应在 toolNames 中');
  });
});

// ============================================================
// browser_select
// ============================================================

describe('browser_select', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_select.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_select');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 selector 为必填，value/label/index 为可选参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_select.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.selector);
    assert.equal(props.selector.type, 'string');
    assert.ok(schema.inputSchema.required.includes('selector'), 'selector 应为必填');
    assert.ok(props.value);
    assert.equal(props.value.type, 'string');
    assert.ok(props.label);
    assert.equal(props.label.type, 'string');
    assert.ok(props.index);
    assert.equal(props.index.type, 'number');
  });

  test('toolNames 中包含 browser_select（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_select'), '工具 browser_select 应在 toolNames 中');
  });
});

// ============================================================
// browser_navigate
// ============================================================

describe('browser_navigate', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_navigate.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_navigate');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 action 为必填且具有 enum 值，waitUntil 和 timeout 为可选', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_navigate.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.action);
    assert.equal(props.action.type, 'string');
    assert.ok(Array.isArray(props.action.enum));
    assert.ok(props.action.enum.includes('forward'), 'action.enum 应包含 forward');
    assert.ok(props.action.enum.includes('back'), 'action.enum 应包含 back');
    assert.ok(props.action.enum.includes('refresh'), 'action.enum 应包含 refresh');
    assert.ok(props.action.enum.includes('reload'), 'action.enum 应包含 reload');
    assert.ok(schema.inputSchema.required.includes('action'), 'action 应为必填');
    assert.ok(props.waitUntil);
    assert.equal(props.waitUntil.type, 'string');
    assert.ok(Array.isArray(props.waitUntil.enum));
    assert.ok(props.timeout);
    assert.equal(props.timeout.type, 'number');
  });

  test('toolNames 中包含 browser_navigate（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_navigate'), '工具 browser_navigate 应在 toolNames 中');
  });
});

// ============================================================
// browser_wait
// ============================================================

describe('browser_wait', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_wait.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_wait');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 selector/state/text/urlContains/loadState/ms/timeout 等参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_wait.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.selector);
    assert.equal(props.selector.type, 'string');
    assert.ok(props.state);
    assert.equal(props.state.type, 'string');
    assert.ok(props.text);
    assert.equal(props.text.type, 'string');
    assert.ok(props.urlContains);
    assert.equal(props.urlContains.type, 'string');
    assert.ok(props.loadState);
    assert.equal(props.loadState.type, 'string');
    assert.ok(props.ms);
    assert.equal(props.ms.type, 'number');
    assert.ok(props.timeout);
    assert.equal(props.timeout.type, 'number');
  });

  test('toolNames 中包含 browser_wait（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_wait'), '工具 browser_wait 应在 toolNames 中');
  });
});

// ============================================================
// browser_assert
// ============================================================

describe('browser_assert', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_assert.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_assert');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 urlContains/textContains/selectorVisible/selectorHidden/noErrors/includeErrors/timeout 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_assert.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.urlContains);
    assert.equal(props.urlContains.type, 'string');
    assert.ok(props.textContains);
    assert.equal(props.textContains.type, 'string');
    assert.ok(props.selectorVisible);
    assert.equal(props.selectorVisible.type, 'string');
    assert.ok(props.selectorHidden);
    assert.equal(props.selectorHidden.type, 'string');
    assert.ok(props.noErrors);
    assert.equal(props.noErrors.type, 'boolean');
    assert.ok(props.includeErrors);
    assert.equal(props.includeErrors.type, 'boolean');
    assert.ok(props.timeout);
    assert.equal(props.timeout.type, 'number');
  });

  test('toolNames 中包含 browser_assert（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_assert'), '工具 browser_assert 应在 toolNames 中');
  });
});

// ============================================================
// browser_flow
// ============================================================

describe('browser_flow', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_flow.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_flow');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 steps 为必填，clearErrors/continueOnError/headless 为可选参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_flow.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.steps);
    assert.equal(props.steps.type, 'array');
    assert.ok(props.steps.items);
    assert.equal(props.steps.items.type, 'object');
    assert.ok(schema.inputSchema.required.includes('steps'), 'steps 应为必填');
    assert.ok(props.clearErrors);
    assert.equal(props.clearErrors.type, 'boolean');
    assert.ok(props.continueOnError);
    assert.equal(props.continueOnError.type, 'boolean');
    assert.ok(props.headless);
    assert.equal(props.headless.type, 'boolean');
  });

  test('toolNames 中包含 browser_flow（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_flow'), '工具 browser_flow 应在 toolNames 中');
  });
});

// ============================================================
// browser_instrument
// ============================================================

describe('browser_instrument', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_instrument.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_instrument');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 headless 为可选布尔参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_instrument.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.headless);
    assert.equal(props.headless.type, 'boolean');
  });

  test('toolNames 中包含 browser_instrument（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_instrument'), '工具 browser_instrument 应在 toolNames 中');
  });
});

// ============================================================
// browser_events
// ============================================================

describe('browser_events', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_events.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_events');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema 包含 type/urlContains/method/statusMin/since/limit 参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_events.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.type);
    assert.equal(props.type.type, 'string');
    assert.ok(props.urlContains);
    assert.equal(props.urlContains.type, 'string');
    assert.ok(props.method);
    assert.equal(props.method.type, 'string');
    assert.ok(props.statusMin);
    assert.equal(props.statusMin.type, 'number');
    assert.ok(props.since);
    assert.equal(props.since.type, 'string');
    assert.ok(props.limit);
    assert.equal(props.limit.type, 'number');
  });

  test('toolNames 中包含 browser_events（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_events'), '工具 browser_events 应在 toolNames 中');
  });
});

// ============================================================
// browser_events_clear
// ============================================================

describe('browser_events_clear', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const filePath = path.join(TOOLS_DIR, 'browser_events_clear.json');
    assert.ok(fs.existsSync(filePath));
    const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(schema.name, 'browser_events_clear');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
  });

  test('schema properties 为空对象，无必填参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_events_clear.json'), 'utf8'));
    assert.deepEqual(schema.inputSchema.properties, {});
  });

  test('toolNames 中包含 browser_events_clear（已注册到 MCP）', () => {
    assert.ok(toolNames.has('browser_events_clear'), '工具 browser_events_clear 应在 toolNames 中');
  });
});
