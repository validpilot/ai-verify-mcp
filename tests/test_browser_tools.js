'use strict';

const assert = require('assert');

console.log('=== Browser Tools Validation Tests ===');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}: ${e.message}`);
  }
}

test('browser_find_element - schema has selector parameter', () => {
  const schema = require('../tools/browser_find_element.json');
  assert.strictEqual(typeof schema.inputSchema.properties.selector, 'object');
  assert.strictEqual(schema.inputSchema.properties.selector.description, 'CSS选择器（与text二选一，优先使用selector）');
  assert.strictEqual(Array.isArray(schema.inputSchema.required), true);
  assert.strictEqual(schema.inputSchema.required.length, 0);
});

test('browser_find_element - schema has text parameter', () => {
  const schema = require('../tools/browser_find_element.json');
  assert.strictEqual(typeof schema.inputSchema.properties.text, 'object');
  assert.strictEqual(schema.inputSchema.properties.text.description, '要查找的元素文本（与selector二选一）');
});

test('browser_eval - schema has code alias', () => {
  const schema = require('../tools/browser_eval.json');
  assert.strictEqual(typeof schema.inputSchema.properties.code, 'object');
  assert.strictEqual(schema.inputSchema.properties.code.description, 'expression 的别名，要执行的 JavaScript 代码');
});

test('browser_eval - schema has script alias', () => {
  const schema = require('../tools/browser_eval.json');
  assert.strictEqual(typeof schema.inputSchema.properties.script, 'object');
  assert.strictEqual(schema.inputSchema.properties.script.description, 'expression 的别名，要执行的 JavaScript 脚本');
});

test('browser_eval - handler supports code alias', () => {
  const fs = require('fs');
  const browserJs = fs.readFileSync('./handlers/browser.js', 'utf-8');
  assert.strictEqual(browserJs.includes("args.expression || args.script || args.code"), true);
});

test('perf_analyzer - has SPA detection', () => {
  const perfAnalyzer = require('../hands/perf_analyzer');
  assert.strictEqual(typeof perfAnalyzer.analyzePerformance, 'function');
});

test('perf_analyzer - has waitForSPARouteStable', () => {
  const fs = require('fs');
  const perfJs = fs.readFileSync('./hands/perf_analyzer.js', 'utf-8');
  assert.strictEqual(perfJs.includes('waitForSPARouteStable'), true);
});

test('perf_analyzer - has detectSPAFramework', () => {
  const fs = require('fs');
  const perfJs = fs.readFileSync('./hands/perf_analyzer.js', 'utf-8');
  assert.strictEqual(perfJs.includes('detectSPAFramework'), true);
});

test('browser_snapshot - framework detection enhanced', () => {
  const fs = require('fs');
  const browserJs = fs.readFileSync('./handlers/browser.js', 'utf-8');
  assert.strictEqual(browserJs.includes(", 'framework')"), true);
  assert.strictEqual(browserJs.includes(", 'css-framework')"), true);
  assert.strictEqual(browserJs.includes(", 'ui-library')"), true);
  assert.strictEqual(browserJs.includes(", 'build-tool')"), true);
});

test('browser_snapshot - detects more frameworks', () => {
  const fs = require('fs');
  const browserJs = fs.readFileSync('./handlers/browser.js', 'utf-8');
  assert.strictEqual(browserJs.includes('SvelteKit'), true);
  assert.strictEqual(browserJs.includes('Solid.js'), true);
  assert.strictEqual(browserJs.includes('Chakra UI'), true);
  assert.strictEqual(browserJs.includes('shadcn/ui'), true);
  assert.strictEqual(browserJs.includes('Radix UI'), true);
});

test('browser_snapshot - detects state management', () => {
  const fs = require('fs');
  const browserJs = fs.readFileSync('./handlers/browser.js', 'utf-8');
  assert.strictEqual(browserJs.includes('Redux'), true);
  assert.strictEqual(browserJs.includes('Zustand'), true);
  assert.strictEqual(browserJs.includes('Pinia'), true);
});

test('browser_snapshot - framework detection returns structured result', () => {
  const fs = require('fs');
  const browserJs = fs.readFileSync('./handlers/browser.js', 'utf-8');
  assert.strictEqual(browserJs.includes('mainFramework'), true);
  assert.strictEqual(browserJs.includes('mainCSS'), true);
  assert.strictEqual(browserJs.includes('mainUI'), true);
  assert.strictEqual(browserJs.includes('buildTool'), true);
});

console.log('\n=== Validation Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}