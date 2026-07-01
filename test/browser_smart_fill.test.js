'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const dataGen = require('../hands/data_generator');
const TOOLS_DIR = path.join(__dirname, '..', 'tools');

// Build toolNames from handler modules
const handlers = [
  require('../handlers/browser')
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
// data_generator 模块功能测试
// ============================================================

describe('data_generator — email', () => {
  test('生成有效邮箱格式（包含 @）', () => {
    const v = dataGen.generate('email');
    assert.ok(v.includes('@'), '邮箱应包含 @');
    assert.ok(v.length > 5);
  });

  test('支持自定义域名', () => {
    const v = dataGen.generate('email', { domain: 'mycompany.cn' });
    assert.ok(v.endsWith('@mycompany.cn'), `应使用自定义域名 mycompany.cn，得到: ${v}`);
  });
});

describe('data_generator — phone', () => {
  test('生成11位手机号', () => {
    const v = dataGen.generate('phone');
    assert.equal(v.length, 11, `手机号应为11位，得到: ${v}`);
    assert.ok(v.startsWith('1'), '手机号应以1开头');
  });
});

describe('data_generator — name', () => {
  test('生成中文姓名（2-3个汉字）', () => {
    const v = dataGen.generate('name');
    assert.ok(v.length >= 2, `姓名至少2个字，得到: ${v}`);
    // 中文字符的 Unicode 范围
    const chineseChars = v.split('').filter(c => c >= '\u4e00' && c <= '\u9fff');
    assert.equal(chineseChars.length, v.length, `姓名应全为中文，得到: ${v}`);
  });
});

describe('data_generator — address', () => {
  test('生成地址包含 市/区/街 结构', () => {
    const v = dataGen.generate('address');
    assert.ok(v.includes('市') || v.includes('区'), `地址应包含市区，得到: ${v}`);
    assert.ok(v.includes('号'), '地址应包含门牌号');
  });
});

describe('data_generator — idCard', () => {
  test('生成18位身份证号', () => {
    const v = dataGen.generate('idCard');
    assert.equal(v.length, 18, `身份证号应为18位，得到: ${v}`);
  });
});

describe('data_generator — number', () => {
  test('生成指定范围的数字', () => {
    const v = dataGen.generate('number', { min: 10, max: 50 });
    assert.ok(v >= 10 && v <= 50, `数字应在10-50之间，得到: ${v}`);
  });
});

describe('data_generator — url', () => {
  test('生成有效 URL 格式', () => {
    const v = dataGen.generate('url');
    assert.ok(v.startsWith('https://'), `URL应以 https:// 开头，得到: ${v}`);
    assert.ok(v.length > 10);
  });
});

describe('data_generator — date', () => {
  test('生成有效日期格式 YYYY-MM-DD', () => {
    const v = dataGen.generate('date');
    assert.match(v, /^\d{4}-\d{2}-\d{2}$/, `日期格式应为YYYY-MM-DD，得到: ${v}`);
  });
});

describe('data_generator — password', () => {
  test('生成密码至少8位', () => {
    const v = dataGen.generate('password');
    assert.ok(v.length >= 8, `密码长度应≥8，得到: ${v}`);
    assert.match(v, /[A-Z]/, '应包含大写字母');
    assert.match(v, /[a-z]/, '应包含小写字母');
    assert.match(v, /[0-9]/, '应包含数字');
    assert.match(v, /[!@#$%^&*]/, '应包含特殊字符');
  });
});

describe('data_generator — isSupported', () => {
  test('isSupported 正确识别支持的类型', () => {
    assert.ok(dataGen.isSupported('email'));
    assert.ok(dataGen.isSupported('phone'));
    assert.ok(dataGen.isSupported('name'));
    assert.ok(dataGen.isSupported('address'));
    assert.ok(dataGen.isSupported('idCard'));
    assert.ok(dataGen.isSupported('number'));
    assert.ok(dataGen.isSupported('text'));
    assert.ok(dataGen.isSupported('url'));
    assert.ok(dataGen.isSupported('date'));
    assert.ok(dataGen.isSupported('password'));
    assert.equal(dataGen.isSupported('unsupported_type'), false);
  });

  test('getSupportedTypes 返回所有10种类型', () => {
    const types = dataGen.getSupportedTypes();
    assert.equal(types.length, 10, '应支持10种字段类型');
  });

  test('不支持的字段类型回退到 text 生成', () => {
    const v = dataGen.generate('invalid_type');
    assert.ok(typeof v === 'string', '回退生成应为字符串');
    assert.ok(v.length >= 10);
  });
});

// ============================================================
// browser_smart_fill schema + 注册
// ============================================================

describe('browser_smart_fill schema', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_smart_fill.json'), 'utf8'));
    assert.equal(schema.name, 'browser_smart_fill');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
    assert.ok(schema.inputSchema.properties);
  });

  test('已注册到 MCP（toolNames 中包含）', () => {
    assert.ok(toolNames.has('browser_smart_fill'), 'browser_smart_fill 应已注册');
  });

  test('schema 包含 selector 和 fieldType 为必填参数', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_smart_fill.json'), 'utf8'));
    const props = schema.inputSchema.properties;
    assert.ok(props.selector);
    assert.equal(props.selector.type, 'string');
    assert.ok(props.fieldType);
    assert.equal(props.fieldType.type, 'string');
    assert.ok(props.fieldType.enum, 'fieldType 应有枚举值');
    assert.ok(props.fieldType.enum.includes('email'), '应包含 email 类型');
    assert.ok(props.fieldType.enum.includes('phone'), '应包含 phone 类型');
    assert.equal(props.fieldType.enum.length, 10, '应支持10种字段类型枚举');
    assert.ok(schema.inputSchema.required.includes('selector'), 'selector 应为必填');
    assert.ok(schema.inputSchema.required.includes('fieldType'), 'fieldType 应为必填');
  });

  test('handler 包含 browser_smart_fill 处理逻辑', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'handlers', 'browser.js'), 'utf8');
    assert.ok(src.includes("name === 'browser_smart_fill'"));
    assert.ok(src.includes('data_generator'), 'handler 引用 data_generator 模块');
    assert.ok(src.includes('el.fill'), '使用 Playwright fill API');
  });

  test('描述中提及能力补齐方案 P0-2', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_smart_fill.json'), 'utf8'));
    assert.ok(schema.description.includes('P0-2') || schema.description.includes('10+'), '描述应提及智能表单填充能力');
  });
});
