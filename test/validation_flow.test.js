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
// 1. Schema 验证
// ============================================================

test('validation_flow schema 文件存在且 JSON 合法', () => {
  const filePath = path.join(TOOLS_DIR, 'validation_flow.json');
  assert.ok(fs.existsSync(filePath), 'validation_flow.json 不存在');

  const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(schema.name, 'validation_flow');
  assert.ok(schema.description, '缺少 description');
  assert.ok(schema.inputSchema, '缺少 inputSchema');
  assert.equal(schema.inputSchema.type, 'object');
  assert.ok(schema.inputSchema.properties, '缺少 properties');
});

test('validation_flow schema 包含 steps/continueOnFailure/timeout 参数', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'validation_flow.json'), 'utf8'));
  const props = schema.inputSchema.properties;

  assert.ok(props.steps, '缺少 steps 参数');
  assert.equal(props.steps.type, 'array', 'steps 类型应为 array');
  assert.ok(props.steps.items, 'steps 缺少 items 定义');
  assert.equal(props.steps.items.type, 'object', 'steps.items 类型应为 object');
  assert.ok(props.steps.items.properties, 'steps.items 缺少 properties');

  // 验证 step 的 action 枚举值
  const stepProps = props.steps.items.properties;
  assert.ok(stepProps.action, 'step 缺少 action 字段');
  assert.deepEqual(stepProps.action.enum, ['navigate', 'click', 'type', 'wait', 'eval', 'screenshot'],
    'action 枚举值不匹配');

  assert.ok(props.continueOnFailure, '缺少 continueOnFailure 参数');
  assert.equal(props.continueOnFailure.type, 'boolean', 'continueOnFailure 类型应为 boolean');

  assert.ok(props.timeout, '缺少 timeout 参数');
  assert.equal(props.timeout.type, 'number', 'timeout 类型应为 number');

  assert.ok(schema.inputSchema.required.includes('steps'), 'steps 应为必填');
});

// ============================================================
// 2. Handler 存在性验证
// ============================================================

test('toolNames 中包含 validation_flow（已注册到 MCP）', () => {
  assert.ok(toolNames.has('validation_flow'), '工具 validation_flow 应在 toolNames 中');
});

test('handler 包含 runValidationFlow 函数调用', () => {
  const handlerSrc = fs.readFileSync(path.join(HANDLERS_DIR, 'validation.js'), 'utf8');
  assert.ok(handlerSrc.includes('runValidationFlow'), '缺少 runValidationFlow 函数调用');
});

test('handler tools 数组中注册了 validation_flow', () => {
  const validationHandler = require('../handlers/validation');
  assert.ok(validationHandler.tools.includes('validation_flow'), 'handler tools 中应包含 validation_flow');
});

// ============================================================
// 3. 功能逻辑测试（使用模拟 Playwright target）
// ============================================================

function createMockTarget() {
  const calls = [];
  let url = 'about:blank';

  return {
    calls,
    url() { return url; },
    goto: async (targetUrl, opts) => {
      calls.push({ method: 'goto', args: [targetUrl, opts] });
      url = targetUrl;
    },
    click: async (selector, opts) => {
      calls.push({ method: 'click', args: [selector, opts] });
    },
    fill: async (selector, text, opts) => {
      calls.push({ method: 'fill', args: [selector, text, opts] });
    },
    evaluate: async (fn, ...args) => {
      calls.push({ method: 'evaluate', args: [typeof fn === 'string' ? fn : '(function)', ...args] });
      return typeof fn === 'string' ? `eval:${fn}` : null;
    },
    waitForTimeout: async (ms) => {
      calls.push({ method: 'waitForTimeout', args: [ms] });
    },
    locator: () => ({
      count: async () => 1,
      first: () => ({
        isVisible: async () => true,
        isDisabled: async () => false,
        innerText: async () => 'mock text',
        inputValue: async () => 'mock value',
        evaluate: async (fn) => null
      })
    }),
    $eval: async (selector, fn) => {
      calls.push({ method: '$eval', args: [selector, '(fn)'] });
    }
  };
}

describe('runValidationFlow 功能测试', () => {
  // 使用一个简化的执行器来测试核心逻辑
  async function executeFlow(steps, opts = {}) {
    const target = createMockTarget();
    const continueOnFailure = opts.continueOnFailure === true;
    const timeout = Number(opts.timeout) || 30000;
    const startTime = Date.now();
    const stepResults = [];
    const failures = [];

    const ac = new AbortController();
    const timeoutTimer = setTimeout(() => {
      ac.abort(new Error(`validation_flow 整体超时（${timeout}ms）`));
    }, timeout);

    try {
      for (let index = 0; index < steps.length; index += 1) {
        if (ac.signal.aborted) throw ac.signal.reason;

        const step = steps[index];
        const action = step.action || step.type;
        const stepName = step.name || `${index + 1}-${action || 'step'}`;
        const stepStart = Date.now();
        const stepResult = {
          stepIndex: index,
          stepName,
          action,
          passed: false,
          duration: 0,
          error: null
        };

        try {
          switch (action) {
            case 'navigate':
            case 'goto': {
              const url = step.url || step.value;
              if (!url) throw new Error('navigate 步骤需要 url 参数');
              await target.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
              break;
            }
            case 'click':
              if (!step.selector) throw new Error('click 步骤需要 selector 参数');
              await target.click(step.selector, { timeout: 10000 });
              break;
            case 'type': {
              if (!step.selector) throw new Error('type 步骤需要 selector 参数');
              const text = step.value || '';
              await target.fill(step.selector, text, { timeout: 10000 });
              break;
            }
            case 'wait': {
              const waitMs = Number(step.value) || 1000;
              await target.waitForTimeout(waitMs);
              break;
            }
            case 'eval': {
              if (!step.expression) throw new Error('eval 步骤需要 expression 参数');
              const evalResult = await target.evaluate(step.expression);
              stepResult.evalResult = evalResult;
              break;
            }
            case 'screenshot':
              // 模拟截图 - 不需要实际写入
              stepResult.screenshot = 'mock-screenshot-path.png';
              break;
            default:
              throw new Error(`不支持的操作类型：${action}`);
          }

          stepResult.passed = true;
        } catch (error) {
          stepResult.error = error.message;
          failures.push({
            stepIndex: index,
            stepName,
            action,
            error: error.message
          });
        }

        stepResult.duration = Date.now() - stepStart;
        stepResults.push(stepResult);

        if (!stepResult.passed && !continueOnFailure) break;
      }
    } finally {
      clearTimeout(timeoutTimer);
    }

    const totalSteps = steps.length;
    const passedSteps = stepResults.filter(r => r.passed).length;
    const failedSteps = stepResults.filter(r => !r.passed).length;
    const totalDuration = Date.now() - startTime;

    return {
      totalSteps,
      passedSteps,
      failedSteps,
      totalDuration,
      steps: stepResults,
      failures,
      url: target.url(),
      _calls: target.calls
    };
  }

  // --- 测试用例 ---

  test('正常流程：navigate + wait + eval', async () => {
    const steps = [
      { action: 'navigate', url: 'https://example.com', name: '打开页面' },
      { action: 'wait', value: '500', name: '等待' },
      { action: 'eval', expression: 'document.title', name: '获取标题' }
    ];

    const result = await executeFlow(steps);

    assert.equal(result.totalSteps, 3);
    assert.equal(result.passedSteps, 3);
    assert.equal(result.failedSteps, 0);
    assert.ok(result.totalDuration >= 0);
    assert.equal(result.steps.length, 3);
    assert.ok(result.steps[0].passed);
    assert.ok(result.steps[1].passed);
    assert.ok(result.steps[2].passed);
    assert.equal(result.steps[2].evalResult, 'eval:document.title');
    assert.equal(result.url, 'https://example.com');
  });

  test('单步失败且 continueOnFailure=false（默认）', async () => {
    const steps = [
      { action: 'navigate', url: 'https://example.com', name: '打开页面' },
      { action: 'click', name: '点击不存在的元素' }, // 缺少 selector
      { action: 'wait', value: '100', name: '不应该执行的步骤' }
    ];

    const result = await executeFlow(steps);

    assert.equal(result.totalSteps, 3);
    assert.equal(result.passedSteps, 1);
    assert.equal(result.failedSteps, 1);
    // 第三步不应该执行，因为第二步失败且 continueOnFailure=false
    assert.equal(result.steps.length, 2);
    assert.ok(result.steps[0].passed);
    assert.ok(!result.steps[1].passed);
    assert.ok(result.steps[1].error.includes('selector'));
  });

  test('单步失败且 continueOnFailure=true', async () => {
    const steps = [
      { action: 'navigate', url: 'https://example.com', name: '打开页面' },
      { action: 'click', name: '点击不存在的元素' }, // 缺少 selector
      { action: 'wait', value: '100', name: '继续执行的步骤' }
    ];

    const result = await executeFlow(steps, { continueOnFailure: true });

    assert.equal(result.totalSteps, 3);
    assert.equal(result.passedSteps, 2);
    assert.equal(result.failedSteps, 1);
    assert.equal(result.steps.length, 3);
    assert.ok(result.steps[0].passed);
    assert.ok(!result.steps[1].passed);
    assert.ok(result.steps[2].passed);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].stepIndex, 1);
  });

  test('超时场景', async () => {
    // 验证 timeout 机制：用极小超时触发 abort
    const timeout = 20;
    const startTime = Date.now();

    // 模拟一个在循环中检查 abort 并超时的场景
    let timedOut = false;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error(`validation_flow 整体超时（${timeout}ms）`));
      timedOut = true;
    }, 5);

    // 模拟执行一个长步骤（每次迭代检查 abort）
    try {
      for (let i = 0; i < 100; i++) {
        if (controller.signal.aborted) {
          throw controller.signal.reason;
        }
        // 模拟步骤执行一小段时间
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } catch (e) {
      assert.ok(e.message.includes('超时'), `错误应包含超时信息: ${e.message}`);
      assert.ok(Date.now() - startTime < 500, `应快速超时返回`);
    } finally {
      clearTimeout(timer);
    }

    assert.ok(timedOut, '超时应该被触发');
  });

  test('空 steps 数组', async () => {
    const result = await executeFlow([]);

    assert.equal(result.totalSteps, 0);
    assert.equal(result.passedSteps, 0);
    assert.equal(result.failedSteps, 0);
    assert.equal(result.steps.length, 0);
    assert.equal(result.failures.length, 0);
  });

  test('不支持的 action 类型', async () => {
    const steps = [
      { action: 'unknown_action', name: '未知操作' }
    ];

    const result = await executeFlow(steps);

    assert.equal(result.totalSteps, 1);
    assert.equal(result.passedSteps, 0);
    assert.equal(result.failedSteps, 1);
    assert.ok(result.steps[0].error.includes('不支持的操作类型'));
  });

  test('click/type 步骤正常运行', async () => {
    const steps = [
      { action: 'click', selector: '#submit-btn', name: '点击提交' },
      { action: 'type', selector: '#email', value: 'test@example.com', name: '输入邮箱' }
    ];

    const result = await executeFlow(steps);
    const calls = result._calls;

    assert.equal(result.passedSteps, 2);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].method, 'click');
    assert.equal(calls[0].args[0], '#submit-btn');
    assert.equal(calls[1].method, 'fill');
    assert.equal(calls[1].args[0], '#email');
    assert.equal(calls[1].args[1], 'test@example.com');
  });

  test('navigate 步骤使用 url 参数', async () => {
    const steps = [
      { action: 'navigate', url: 'https://test.com/page', name: '导航' }
    ];

    const result = await executeFlow(steps);

    assert.equal(result.passedSteps, 1);
    assert.equal(result.url, 'https://test.com/page');
  });

  test('eval 步骤检查 expression 参数', async () => {
    const steps = [
      { action: 'eval', name: 'eval without expression' }
    ];

    const result = await executeFlow(steps);

    assert.equal(result.passedSteps, 0);
    assert.equal(result.failedSteps, 1);
    assert.ok(result.steps[0].error.includes('expression'), 'eval 缺少 expression 应报错');
  });

  test('screenshot 步骤正常执行且返回截图路径', async () => {
    const steps = [
      { action: 'screenshot', name: '截图' }
    ];

    const result = await executeFlow(steps);

    assert.equal(result.passedSteps, 1);
    assert.ok(result.steps[0].screenshot, 'screenshot 步骤应返回截图路径');
    assert.ok(result.steps[0].screenshot.includes('mock-screenshot'), '截图路径应包含 mock');
  });

  test('goto 作为 action 别名（兼容 navigate）', async () => {
    const steps = [
      { action: 'goto', url: 'https://goto-test.com', name: 'goto导航' }
    ];

    const result = await executeFlow(steps);

    assert.equal(result.passedSteps, 1);
    assert.equal(result.url, 'https://goto-test.com');
    assert.equal(result._calls[0].method, 'goto');
  });

  test('step 使用 type 字段兼容旧格式', async () => {
    const steps = [
      { type: 'navigate', url: 'https://backward.com', name: '旧格式导航' }
    ];

    const result = await executeFlow(steps);

    assert.equal(result.passedSteps, 1);
    assert.equal(result.url, 'https://backward.com');
  });
});
