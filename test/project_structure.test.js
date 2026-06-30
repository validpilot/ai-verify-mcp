'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

test('server.js 文件存在', () => {
  const filePath = path.join(PROJECT_ROOT, 'server.js');
  assert.ok(fs.existsSync(filePath), 'server.js 应存在于项目根目录');
});

test('package.json 文件存在', () => {
  const filePath = path.join(PROJECT_ROOT, 'package.json');
  assert.ok(fs.existsSync(filePath), 'package.json 应存在于项目根目录');
});