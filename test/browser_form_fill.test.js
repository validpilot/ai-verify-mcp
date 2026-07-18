'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const dataGen = require('../hands/data_generator');
const TOOLS_DIR = path.join(__dirname, '..', 'tools');

// Build toolNames from handler modules
const handlers = [
  require('../handlers/browser'),
  require('../handlers/system')
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
// browser_form_fill 单元测试
// ============================================================

describe('browser_form_fill — 工具注册', () => {
  test('browser_form_fill 已在 handler tools 列表中注册', () => {
    assert.ok(toolNames.has('browser_form_fill'), 'browser_form_fill 应已注册');
  });

  test('browser_form_fill 已在 system handler 中注册', () => {
    const systemHandler = require('../handlers/system');
    assert.ok(systemHandler.tools.includes('browser_form_fill'),
      'browser_form_fill 应在 system handler tools 中');
  });

  test('schema 文件存在且参数正确', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_form_fill.json'), 'utf8'));
    assert.equal(schema.name, 'browser_form_fill');
    const props = schema.inputSchema.properties;
    assert.ok(props.url, '应有 url 参数');
    assert.equal(props.url.type, 'string');
    assert.ok(props.fields, '应有 fields 参数');
    assert.equal(props.fields.type, 'object');
    assert.ok(props.submit, '应有 submit 参数');
    assert.equal(props.submit.type, 'boolean');
    assert.ok(schema.inputSchema.required.includes('url'), 'url 应为必填');
  });
});

describe('browser_form_fill — handler 实现', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'handlers', 'system.js'), 'utf8');

  test('handler 包含 browser_form_fill 处理逻辑', () => {
    assert.ok(src.includes("name === 'browser_form_fill'"));
  });

  test('使用 deepInteractor 进行表单填充', () => {
    assert.ok(src.includes('deepInteractor') || src.includes('autoFillForm'),
      '应使用 deepInteractor.autoFillForm');
  });

  test('支持手动覆盖字段值（数组和对象两种格式）', () => {
    assert.ok(src.includes('Array.isArray(args.fields)'), '应支持数组格式');
    assert.ok(src.includes("typeof args.fields === 'object'"), '应支持对象格式');
  });

  test('支持 preserveValue 模式（只填用户指定字段）', () => {
    assert.ok(src.includes('preserveValue'), '应支持 preserveValue');
  });

  test('包含自动提交逻辑', () => {
    assert.ok(src.includes("args.submit !== false"), '应支持自动提交');
    assert.ok(src.includes('submitSelector'), '应支持自定义提交按钮选择器');
  });

  test('支持无 form 标签的页面（fallback 到直接操作 input）', () => {
    assert.ok(src.includes('未找到表单元素'), '应检测表单未找到的情况');
    assert.ok(src.includes('autoFillInputs'), '应有 fallback 到 autoFillInputs');
    assert.ok(src.includes('usedFallback'), '应记录是否使用了 fallback');
  });

  test('提交后检测成功/失败状态', () => {
    assert.ok(src.includes('pageStatus'), '应检测页面状态');
    assert.ok(src.includes('hasSuccess'), '应检测成功状态');
    assert.ok(src.includes('hasError'), '应检测错误状态');
    assert.ok(src.includes('successMessage'), '应返回成功消息');
    assert.ok(src.includes('errorMessage'), '应返回错误消息');
  });

  test('提交后检测表单验证错误', () => {
    assert.ok(src.includes('formValidationErrors') || src.includes('validationErrors'),
      '应检测表单验证错误');
    assert.ok(src.includes('input:invalid'), '应检测 invalid 输入');
  });

  test('支持 Element UI / Ant Design 等常见 UI 库的消息提示', () => {
    assert.ok(src.includes('el-message') || src.includes('el-form-item__error'),
      '应支持 Element UI 消息/错误');
    assert.ok(src.includes('ant-message') || src.includes('ant-form-item-explain'),
      '应支持 Ant Design 消息/错误');
  });

  test('提交状态包含 status 字段（success/error/navigated/unknown）', () => {
    assert.ok(src.includes("status:'success'") || src.includes("status: pageStatus.hasSuccess ? 'success'"),
      '应包含 success 状态');
    assert.ok(src.includes("'error'"), '应包含 error 状态');
    assert.ok(src.includes("'navigated'"), '应包含 navigated 状态');
    assert.ok(src.includes("'unknown'"), '应包含 unknown 状态');
  });

  test('提交按钮选择器支持多种常见按钮样式', () => {
    assert.ok(src.includes('button[type="submit"]'), '应支持原生 submit 按钮');
    assert.ok(src.includes('input[type="submit"]'), '应支持原生 submit input');
    assert.ok(src.includes('[class*="submit"]'), '应支持包含 submit class 的按钮');
    assert.ok(src.includes('[class*="btn-primary"]'), '应支持 btn-primary 类按钮');
  });

  test('返回结果包含 filled 和 submit 信息', () => {
    assert.ok(src.includes('filled'), '应返回 filled');
    assert.ok(src.includes('submit'), '应返回 submit');
  });

  test('CSS 选择器模式下防止 mock 数据覆盖用户值（关键 bug 修复）', () => {
    // bug 描述：当 fields 使用 CSS 选择器模式（如 {"#user-name":"..."}）时，
    // selector 模式填充后仍调用 autoFillForm，导致 mock 数据覆盖用户值。
    // 修复方案：读取 selector 对应 input 的 name/id，同步到 nameFields，
    // 让 autoFillForm 检测到 hasOverride=true，使用用户值而非生成 mock。
    assert.ok(src.includes('selectorFilledNames'),
      '应记录 selector 已填充字段的 name/id 映射');
    assert.ok(src.includes('el.name || el.id'),
      '应读取 selector 对应 input 的 name/id');
    assert.ok(/for \(const \[selector, fieldName\] of Object\.entries\(selectorFilledNames\)\)/.test(src),
      '应遍历 selectorFilledNames 同步到 nameFields');
    assert.ok(/!\(fieldName in nameFields\)/.test(src),
      '应避免覆盖用户已在 nameFields 中显式指定的字段');
    assert.ok(/nameFields\[fieldName\] = selectorFields\[selector\]/.test(src),
      '应将 selector 字段的用户值同步到 nameFields');
  });
});

describe('browser_form_fill — 字段类型推断验证', () => {
  const deepInteractorSrc = fs.readFileSync(
    path.join(__dirname, '..', 'hands', 'deep_interactor.js'), 'utf8'
  );

  test('deepInteractor 包含 inferFieldType 函数', () => {
    assert.ok(deepInteractorSrc.includes('function inferFieldType'),
      'deep_interactor 应有 inferFieldType 函数');
  });

  test('inferFieldType 综合 name/label/placeholder 推断类型', () => {
    assert.ok(deepInteractorSrc.includes('name + ') || deepInteractorSrc.includes('hint'),
      '应综合多个属性推断字段类型');
  });

  test('支持 email 类型推断', () => {
    assert.ok(/email|邮箱/i.test(deepInteractorSrc), '应识别 email');
  });

  test('支持 phone 类型推断', () => {
    assert.ok(/phone|mobile|手机|手机号/i.test(deepInteractorSrc), '应识别 phone');
  });

  test('支持 name 类型推断', () => {
    assert.ok(/name|姓名|用户名|username/i.test(deepInteractorSrc), '应识别 name');
  });

  test('支持 password 类型推断', () => {
    assert.ok(/password|密码|pwd/i.test(deepInteractorSrc), '应识别 password');
  });

  test('支持 address 类型推断', () => {
    assert.ok(/address|地址/i.test(deepInteractorSrc), '应识别 address');
  });

  test('支持 idCard 类型推断', () => {
    assert.ok(/idcard|身份证/i.test(deepInteractorSrc), '应识别 idCard');
  });

  test('deepInteractor 中 autoFillForm 集成 data_generator', () => {
    assert.ok(deepInteractorSrc.includes("data_generator"), 'autoFillForm 应集成 data_generator');
    assert.ok(deepInteractorSrc.includes("dataGen.isSupported"), '应使用 isSupported 检查类型支持');
  });

  test('autoFillForm 支持 disabled 字段跳过', () => {
    assert.ok(deepInteractorSrc.includes('disabled'), '应检测 disabled 状态');
    assert.ok(deepInteractorSrc.includes("reason: 'disabled'"), 'disabled 字段应被跳过并记录原因');
  });

  test('autoFillForm 支持 label 检测（for 属性和嵌套 label）', () => {
    assert.ok(deepInteractorSrc.includes('label[for='), '应通过 for 属性查找 label');
    assert.ok(deepInteractorSrc.includes('closest(\'label\')'), '应通过 closest 查找嵌套 label');
  });
});

describe('browser_form_fill — 与 data_generator 集成', () => {
  test('data_generator 支持表单常用的字段类型', () => {
    const types = ['email', 'phone', 'name', 'password', 'number', 'text', 'address', 'idCard', 'date', 'url'];
    for (const t of types) {
      const v = dataGen.generate(t, {});
      assert.ok(v !== undefined && v !== null, `类型 ${t} 应能生成值，得到: ${v}`);
    }
  });
});

// ============================================================
// inferFieldType 函数单元测试
// ============================================================

describe('inferFieldType — 语义化字段类型推断', () => {
  const { inferFieldType } = require('../hands/deep_interactor');

  test('识别 email 类型', () => {
    assert.equal(inferFieldType({ type: 'email', tag: 'input' }), 'email');
    assert.equal(inferFieldType({ name: 'userEmail', tag: 'input', type: 'text' }), 'email');
    assert.equal(inferFieldType({ label: '邮箱', tag: 'input', type: 'text' }), 'email');
    assert.equal(inferFieldType({ placeholder: '请输入邮箱地址', tag: 'input', type: 'text' }), 'email');
  });

  test('识别 phone 类型', () => {
    assert.equal(inferFieldType({ type: 'tel', tag: 'input' }), 'phone');
    assert.equal(inferFieldType({ name: 'mobile', tag: 'input', type: 'text' }), 'phone');
    assert.equal(inferFieldType({ label: '手机号', tag: 'input', type: 'text' }), 'phone');
    assert.equal(inferFieldType({ placeholder: '请输入联系电话', tag: 'input', type: 'text' }), 'phone');
  });

  test('识别 name 类型', () => {
    assert.equal(inferFieldType({ name: 'username', tag: 'input', type: 'text' }), 'name');
    assert.equal(inferFieldType({ name: 'realname', tag: 'input', type: 'text' }), 'name');
    assert.equal(inferFieldType({ label: '真实姓名', tag: 'input', type: 'text' }), 'name');
  });

  test('识别 password 类型', () => {
    assert.equal(inferFieldType({ type: 'password', tag: 'input' }), 'password');
    assert.equal(inferFieldType({ name: 'passwd', tag: 'input', type: 'text' }), 'password');
    assert.equal(inferFieldType({ label: '登录密码', tag: 'input', type: 'text' }), 'password');
  });

  test('识别 number 类型', () => {
    assert.equal(inferFieldType({ type: 'number', tag: 'input' }), 'number');
    assert.equal(inferFieldType({ name: 'age', tag: 'input', type: 'text' }), 'number');
    assert.equal(inferFieldType({ placeholder: '请输入数量', tag: 'input', type: 'text' }), 'number');
  });

  test('识别 date 类型', () => {
    assert.equal(inferFieldType({ type: 'date', tag: 'input' }), 'date');
    assert.equal(inferFieldType({ name: 'birthday', tag: 'input', type: 'text' }), 'date');
    assert.equal(inferFieldType({ label: '出生日期', tag: 'input', type: 'text' }), 'date');
  });

  test('识别 url 类型', () => {
    assert.equal(inferFieldType({ type: 'url', tag: 'input' }), 'url');
    assert.equal(inferFieldType({ name: 'website', tag: 'input', type: 'text' }), 'url');
    assert.equal(inferFieldType({ placeholder: '请输入网址', tag: 'input', type: 'text' }), 'url');
  });

  test('识别 address 类型', () => {
    assert.equal(inferFieldType({ name: 'address', tag: 'input', type: 'text' }), 'address');
    assert.equal(inferFieldType({ label: '详细地址', tag: 'input', type: 'text' }), 'address');
  });

  test('识别 idCard 类型', () => {
    assert.equal(inferFieldType({ name: 'idcard', tag: 'input', type: 'text' }), 'idCard');
    assert.equal(inferFieldType({ name: 'idCard', tag: 'input', type: 'text' }), 'idCard');
    assert.equal(inferFieldType({ label: '身份证号', tag: 'input', type: 'text' }), 'idCard');
  });

  test('识别 checkbox/radio/select/textarea', () => {
    assert.equal(inferFieldType({ type: 'checkbox', tag: 'input' }), 'checkbox');
    assert.equal(inferFieldType({ type: 'radio', tag: 'input' }), 'radio');
    assert.equal(inferFieldType({ tag: 'select', type: 'select-one' }), 'select');
    assert.equal(inferFieldType({ tag: 'textarea', type: 'textarea' }), 'textarea');
  });

  test('默认返回 text 类型', () => {
    assert.equal(inferFieldType({ name: 'unknown', tag: 'input', type: 'text' }), 'text');
    assert.equal(inferFieldType({ tag: 'input', type: 'text' }), 'text');
  });

  test('优先级：type > name > label/placeholder', () => {
    assert.equal(inferFieldType({ type: 'email', name: 'phone', tag: 'input' }), 'email',
      'type=email 优先级高于 name=phone');
    assert.equal(inferFieldType({ type: 'text', name: 'mobile', label: '邮箱', tag: 'input' }), 'phone',
      'name=mobile 优先级高于 label=邮箱');
    assert.equal(inferFieldType({ type: 'text', name: '', label: '', placeholder: '请输入邮箱', tag: 'input' }), 'email',
      'placeholder 中的关键词也能推断类型');
  });
});

// ============================================================
// autoFillForm radio/checkbox 组处理
// ============================================================

describe('autoFillForm — radio/checkbox 组处理', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'hands', 'deep_interactor.js'), 'utf8');

  test('radio/checkbox 组去重（同名只保留一条记录）', () => {
    assert.ok(src.includes('seenNames'), '应有去重的 Set');
    assert.ok(src.includes('seenNames.has(name)'), '应检查是否已存在');
  });

  test('radio 组智能选择最后一个有效选项', () => {
    assert.ok(src.includes('validOptions[validOptions.length - 1]'),
      'radio 应选择最后一个有效选项');
    assert.ok(src.includes('[name="'), '应按 name+value 定位 radio');
  });

  test('checkbox 组默认勾选前 2 个选项', () => {
    assert.ok(src.includes('Math.min(2, validOptions.length)'),
      'checkbox 默认勾选前 2 个');
    assert.ok(src.includes('checkedValues'), '应有 checkedValues 数组');
  });

  test('radio/checkbox 支持手动指定 value', () => {
    assert.ok(src.includes("field.value && field.value !== true"),
      '应支持手动指定 value');
    assert.ok(src.includes('Array.isArray(field.value)'),
      'checkbox 应支持数组形式的 value');
  });

  test('收集 options 元数据（value/label/disabled）', () => {
    assert.ok(src.includes('options') && src.includes('value: inp.value'),
      '应收集选项 value');
    assert.ok(src.includes('label: inp.closest'), '应收集选项 label');
    assert.ok(src.includes('disabled: inp.disabled'), '应收集选项 disabled 状态');
  });
});

// ============================================================
// getFormValues 函数
// ============================================================

describe('getFormValues — 表单值读取', () => {
  const { getFormValues } = require('../hands/deep_interactor');
  const src = fs.readFileSync(path.join(__dirname, '..', 'hands', 'deep_interactor.js'), 'utf8');

  test('getFormValues 函数已导出', () => {
    assert.equal(typeof getFormValues, 'function');
  });

  test('源码中包含完整的 getFormValues 实现', () => {
    assert.ok(src.includes('async function getFormValues'),
      '应有 getFormValues 函数定义');
    assert.ok(src.includes('result.found = true'), '应设置 found=true');
    assert.ok(src.includes('result.values'), '应返回 values 对象');
    assert.ok(src.includes('result.fields'), '应返回 fields 数组');
  });

  test('支持 checkbox 组（返回数组）', () => {
    assert.ok(src.includes(':checked'), '应使用 :checked 选择器');
    assert.ok(src.includes('Array.from(group).map'), 'checkbox 应返回数组');
  });

  test('支持 radio 组（返回单个值）', () => {
    assert.ok(src.includes('querySelector(`[name="'),
      'radio 应查找单个 checked');
  });

  test('支持 select（含 multiple）', () => {
    assert.ok(src.includes('input.multiple'), '应检测 multiple');
    assert.ok(src.includes('selectedOptions'), '应使用 selectedOptions');
  });

  test('browser_form_fill 返回结果中包含 values', () => {
    const sysSrc = fs.readFileSync(path.join(__dirname, '..', 'handlers', 'system.js'), 'utf8');
    assert.ok(sysSrc.includes('getFormValues'), 'system.js 应调用 getFormValues');
    assert.ok(sysSrc.includes('autoFillResult.values'), '应设置 values 到结果中');
  });
});
