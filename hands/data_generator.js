'use strict';

const crypto = require('crypto');

const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '黄', '赵', '周', '吴', '徐', '孙', '马', '朱', '胡', '林', '郭', '何', '高', '罗'];
const GIVEN_NAMES = ['伟', '芳', '娜', '秀英', '敏', '静', '丽', '强', '磊', '洋', '勇', '军', '杰', '娟', '艳', '涛', '明', '超', '秀兰', '霞'];

const PHONE_PREFIXES = ['130', '131', '132', '133', '135', '136', '137', '138', '139', '150', '151', '152', '153', '155', '156', '157', '158', '159', '170', '176', '177', '178', '180', '181', '182', '183', '185', '186', '187', '188', '189', '190', '191', '192', '195', '196', '197', '198', '199'];

const ADDRESS_CITIES = [
  { city: '北京市', district: ['朝阳区', '海淀区', '东城区', '西城区', '丰台区', '通州区'] },
  { city: '上海市', district: ['浦东新区', '黄埔区', '徐汇区', '静安区', '长宁区', '普陀区'] },
  { city: '广州市', district: ['天河区', '越秀区', '海珠区', '番禺区', '白云区', '荔湾区'] },
  { city: '深圳市', district: ['南山区', '福田区', '宝安区', '罗湖区', '龙岗区', '龙华区'] }
];

const STREETS = ['科技路', '东方路', '人民路', '中山路', '建设路', '和平路', '新华路', '长江路', '解放路', '学院路'];

/**
 * 生成邮箱地址
 */
function email(opts = {}) {
  const domain = opts.domain || 'test.com';
  const localPart = crypto.randomBytes(4).toString('hex');
  return `${localPart}@${domain}`;
}

/**
 * 生成中国大陆手机号
 */
function phone() {
  const prefix = PHONE_PREFIXES[Math.floor(Math.random() * PHONE_PREFIXES.length)];
  const suffix = String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
  return prefix + suffix;
}

/**
 * 生成中文姓名
 */
function nameField() {
  const surname = SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
  const givenName = GIVEN_NAMES[Math.floor(Math.random() * GIVEN_NAMES.length)];
  return `${surname}${givenName}`;
}

/**
 * 生成中国地址
 */
function address() {
  const city = ADDRESS_CITIES[Math.floor(Math.random() * ADDRESS_CITIES.length)];
  const district = city.district[Math.floor(Math.random() * city.district.length)];
  const street = STREETS[Math.floor(Math.random() * STREETS.length)];
  const number = Math.floor(Math.random() * 999) + 1;
  return `${city.city}${district}${street}${number}号`;
}

/**
 * 生成18位身份证号（校验位合法）
 */
function idCard() {
  const prefix = ['110101', '310101', '440101', '440301', '320101', '500101'][Math.floor(Math.random() * 6)];
  const birthDate = date({ start: '1970-01-01', end: '2002-12-31' }).replace(/-/g, '');
  const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
  const base17 = prefix + birthDate + seq;
  // 校验位计算
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += parseInt(base17[i]) * weights[i];
  }
  return base17 + checkCodes[sum % 11];
}

/**
 * 生成指定范围数字
 */
function number(opts = {}) {
  const min = opts.min !== undefined ? opts.min : 0;
  const max = opts.max !== undefined ? opts.max : 999999;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 生成文本
 */
function text(opts = {}) {
  const minLen = opts.minLen || 10;
  const maxLen = opts.maxLen || 200;
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789你好世界ValidPilot验证平台智能表单填充测试数据';
  const len = Math.floor(Math.random() * (maxLen - minLen + 1)) + minLen;
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * 生成URL
 */
function urlField() {
  const domains = ['example.com', 'test.org', 'demo.cn', 'validpilot.dev'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  const path = crypto.randomBytes(3).toString('hex');
  return `https://${domain}/${path}`;
}

/**
 * 生成日期
 */
function date(opts = {}) {
  const startStr = opts.start || '2020-01-01';
  const endStr = opts.end || '2030-12-31';
  const startMs = new Date(startStr).getTime();
  const endMs = new Date(endStr).getTime();
  const randomMs = startMs + Math.random() * (endMs - startMs);
  const d = new Date(randomMs);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/**
 * 生成密码（至少包含大写字母、小写字母、数字、特殊字符各一位）
 */
function password(opts = {}) {
  const minLen = opts.minLen || 8;
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;

  let pwd = upper[Math.floor(Math.random() * upper.length)] +
    lower[Math.floor(Math.random() * lower.length)] +
    digits[Math.floor(Math.random() * digits.length)] +
    special[Math.floor(Math.random() * special.length)];

  for (let i = pwd.length; i < minLen; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }

  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

const generators = {
  email,
  phone,
  name: nameField,
  address,
  idCard,
  number,
  text,
  url: urlField,
  date,
  password
};

/**
 * 根据字段类型生成数据
 * @param {string} fieldType - 字段类型
 * @param {object} options - 生成选项
 * @returns {string} 生成的测试数据
 */
function generate(fieldType, options = {}) {
  const fn = generators[fieldType];
  if (!fn) {
    return text({ minLen: 10, maxLen: 50 });
  }
  return fn(options);
}

/**
 * 判断字段类型是否是受支持的类型
 */
function isSupported(fieldType) {
  return fieldType in generators;
}

/**
 * 获取所有支持的字段类型列表
 */
function getSupportedTypes() {
  return Object.keys(generators);
}

module.exports = { generate, isSupported, getSupportedTypes, generators };
