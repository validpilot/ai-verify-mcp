#!/usr/bin/env node
'use strict';

/**
 * CSS Variable Analyzer
 * Analyzes CSS files for missing variable definitions and generates suggested fixes.
 *
 * Usage:
 *   node scripts/css-var-analyzer.js --test        Run self-tests
 *   node scripts/css-var-analyzer.js <file.css>     Analyze a CSS file
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 核心分析逻辑
// ============================================================

/**
 * 根据变量名推断建议值
 * @param {string} varName - CSS 变量名（如 --primary）
 * @returns {string} 建议的 CSS 值
 */
function inferValueFromName(varName) {
  const name = varName.replace(/^--/, '').toLowerCase();

  // 先检查复合名称（如 border-radius）避免与 colorMap 冲突
  if (/\b(border-radius|radius|br)\b/.test(name)) return '4px';
  if (/\b(border-color)\b/.test(name)) return '#dee2e6';
  if (/\b(border-style)\b/.test(name)) return 'solid';
  if (/\b(border-width)\b/.test(name)) return '1px';
  if (/\b(font-size|fs)\b/.test(name)) return '16px';
  if (/\b(font-family|ff)\b/.test(name)) return 'inherit';
  if (/\b(line-height|lh)\b/.test(name)) return '1.5';
  if (/\b(font-weight|fw)\b/.test(name)) return '400';
  if (/\b(spacing|margin|padding|gap)\b/.test(name)) return '0';
  if (/\b(width|height|size|min-width|max-width)\b/.test(name)) return 'auto';
  if (/\b(z-index|z)\b/.test(name)) return '1';
  if (/\b(opacity|op)\b/.test(name)) return '1';
  if (/\b(transition|duration)\b/.test(name)) return '0.3s';
  if (/\b(shadow|box-shadow)\b/.test(name)) return 'none';
  if (/\b(transform)\b/.test(name)) return 'none';
  if (/\b(outline)\b/.test(name)) return 'none';
  if (/\b(animation)\b/.test(name)) return 'none';
  if (/\b(content)\b/.test(name)) return "''";

  // 颜色变量
  const colorMap = {
    'primary': '#176b87',
    'secondary': '#64ccc5',
    'accent': '#ffb703',
    'success': '#28a745',
    'warning': '#ffc107',
    'danger': '#dc3545',
    'error': '#dc3545',
    'info': '#17a2b8',
    'light': '#f8f9fa',
    'dark': '#343a40',
    'white': '#ffffff',
    'black': '#000000',
    'muted': '#6c757d',
    'text': '#333333',
    'background': '#ffffff',
    'bg': '#ffffff',
    'border': '#dee2e6',
    'link': '#176b87',
    'hover': '#125a6b',
    'active': '#0e4d5a',
    'disabled': '#adb5bd',
    'focus': '#176b87',
    'placeholder': '#adb5bd',
    'highlight': '#fff3cd'
  };

  for (const [key, value] of Object.entries(colorMap)) {
    if (name === key || name.endsWith('-' + key) || name.startsWith(key + '-') || name.includes('-' + key + '-')) {
      return value;
    }
  }

  // 默认返回占位值
  return '#176b87';
}

/**
 * 提取所有 CSS 变量定义
 * @param {string} css - CSS 内容
 * @returns {Array<{name: string, value: string, selector: string, line: number, column: number}>}
 */
function extractDefinitions(css) {
  const definitions = [];
  // 匹配 --var-name: value; 模式
  const regex = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = regex.exec(css)) !== null) {
    const line = css.substring(0, match.index).split('\n').length;
    // 向前查找选择器
    const beforeText = css.substring(0, match.index);
    const lines = beforeText.split('\n');
    let selector = '';
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineTrim = lines[i].trim();
      if (lineTrim.endsWith('{') || lineTrim.endsWith('}')) {
        if (lineTrim.endsWith('{')) {
          selector = lineTrim.replace(/\s*\{\s*$/, '').trim();
        }
        break;
      }
    }
    definitions.push({
      name: match[1].trim(),
      value: match[2].trim(),
      selector: selector || ':root',
      line,
      column: match.index - css.lastIndexOf('\n', match.index) - 1
    });
  }
  return definitions;
}

/**
 * 提取所有 CSS 变量引用
 * @param {string} css - CSS 内容
 * @returns {Array<{name: string, line: number, column: number}>}
 */
function extractReferences(css) {
  const references = [];
  // 匹配 var(--name) 和 var(--name, default) 模式
  const regex = /var\(\s*(--[\w-]+)/g;
  let match;
  while ((match = regex.exec(css)) !== null) {
    const line = css.substring(0, match.index).split('\n').length;
    references.push({
      name: match[1].trim(),
      line,
      column: match.index - css.lastIndexOf('\n', match.index) - 1
    });
  }
  return references;
}

/**
 * 分析并查找 :root 块中变量引用了未定义的变量
 * @param {string} css - CSS 内容
 * @returns {Array} 缺失变量条目
 */
function analyzeMissingVariables(css) {
  const definitions = extractDefinitions(css);
  const references = extractReferences(css);
  const definedNames = new Set(definitions.map(d => d.name));
  const entries = [];

  // 按选择器分组定义
  const defsBySelector = {};
  for (const def of definitions) {
    if (!defsBySelector[def.selector]) defsBySelector[def.selector] = [];
    defsBySelector[def.selector].push(def);
  }

  // 查找 :root 块中的定义，检测其中引用了未定义的变量
  const rootDefs = defsBySelector[':root'] || [];
  const nonRootDefs = definitions.filter(d => d.selector !== ':root');

  // 在 :root 块内，检查每个定义的值中是否引用了未定义的变量
  for (const def of rootDefs) {
    const valueRefs = extractReferences(def.value);
    for (const ref of valueRefs) {
      if (!definedNames.has(ref.name)) {
        // 该变量在 :root 块中被引用但未定义
        // 检查该引用是否已经在非 :root 选择器中定义了
        const definedInNonRoot = nonRootDefs.some(d => d.name === ref.name);
        if (!definedInNonRoot) {
          entries.push({
            variable: ref.name,
            usedIn: def.name,
            selector: ':root',
            line: def.line,
            column: def.column,
            value: def.value,
            suggestedFix: {
              value: inferValueFromName(ref.name),
              insertAfter: def.name
            }
          });
        }
      }
    }
  }

  // 也检测 :root 以外的区域引用未定义变量
  for (const ref of references) {
    if (!definedNames.has(ref.name)) {
      // 检查是否已经在 entries 中
      const alreadyReported = entries.some(e => e.variable === ref.name && e.line === ref.line);
      if (!alreadyReported) {
        // 查找引用处的上下文
        const lines = css.split('\n');
        const contextLine = lines[ref.line - 1] || '';
        const match = contextLine.match(/var\(\s*(--[\w-]+)/);
        let usedIn = ref.name;
        if (match && match[1] === ref.name) {
          // 尝试找出这个 var() 在哪个属性值中
          const propMatch = contextLine.match(/([\w-]+)\s*:\s*[^;]*var\(\s*--[\w-]+/);
          if (propMatch) usedIn = propMatch[1];
        }

        entries.push({
          variable: ref.name,
          usedIn,
          selector: 'unknown',
          line: ref.line,
          column: ref.column,
          value: `var(${ref.name})`,
          suggestedFix: {
            value: inferValueFromName(ref.name),
            insertAfter: null
          }
        });
      }
    }
  }

  return entries;
}

/**
 * 完整的 CSS 变量分析
 * @param {string} css - CSS 内容
 * @param {string} filePath - 文件路径（可选）
 * @returns {Object} 分析结果
 */
function analyzeCSS(css, filePath) {
  const definitions = extractDefinitions(css);
  const references = extractReferences(css);
  const definedNames = new Set(definitions.map(d => d.name));
  const missing = analyzeMissingVariables(css);

  // 检测循环引用
  const circularRefs = detectCircularReferences(definitions);

  const result = {
    file: filePath || '<inline>',
    summary: {
      totalDefinitions: definitions.length,
      totalReferences: references.length,
      missingVariables: missing.length,
      circularReferences: circularRefs.length
    },
    definitions: definitions.map(d => ({
      name: d.name,
      value: d.value,
      selector: d.selector,
      line: d.line
    })),
    entries: missing.map(e => ({
      variable: e.variable,
      usedIn: e.usedIn,
      selector: e.selector,
      line: e.line,
      column: e.column,
      severity: 'warning',
      message: `变量 ${e.variable} 在 ${e.selector || '未知选择器'} 中被引用但未定义`,
      suggestedFix: {
        value: e.suggestedFix.value,
        insertAfter: e.suggestedFix.insertAfter
      }
    })),
    circularReferences: circularRefs
  };

  // 添加缺失变量总览
  if (missing.length > 0) {
    const missingNames = [...new Set(missing.map(e => e.variable))];
    result.missingVarOverview = missingNames.map(name => {
      const entry = missing.find(e => e.variable === name);
      return {
        variable: name,
        count: missing.filter(e => e.variable === name).length,
        suggestedValue: entry ? entry.suggestedFix.value : inferValueFromName(name)
      };
    });
  }

  return result;
}

/**
 * 检测循环引用
 */
function detectCircularReferences(definitions) {
  const graph = {};
  for (const def of definitions) {
    const refs = extractReferences(def.value).map(r => r.name);
    if (refs.length > 0) {
      graph[def.name] = refs;
    }
  }

  const circular = [];
  const visited = new Set();
  const recursionStack = new Set();

  function dfs(node, path) {
    if (recursionStack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart !== -1) {
        circular.push({
          cycle: path.slice(cycleStart).concat(node),
          message: `循环引用: ${path.slice(cycleStart).concat(node).join(' -> ')}`
        });
      }
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    recursionStack.add(node);
    const neighbors = graph[node] || [];
    for (const neighbor of neighbors) {
      dfs(neighbor, [...path, neighbor]);
    }
    recursionStack.delete(node);
  }

  for (const node of Object.keys(graph)) {
    dfs(node, [node]);
  }

  return circular;
}

// ============================================================
// 测试模式
// ============================================================

function runTests() {
  let passed = 0;
  let failed = 0;
  const tests = [];

  function assert(condition, name) {
    if (condition) {
      passed++;
      tests.push(`  ✓ ${name}`);
    } else {
      failed++;
      tests.push(`  ✗ ${name}`);
    }
  }

  function assertEqual(actual, expected, name) {
    const ok = actual === expected;
    if (ok) {
      passed++;
      tests.push(`  ✓ ${name}`);
    } else {
      failed++;
      tests.push(`  ✗ ${name} (expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)})`);
    }
  }

  // Test 1: 基础缺失变量检测
  (function testBasicMissing() {
    const css = `
:root {
  --primary: #176b87;
  --accent: var(--secondary);
}
body {
  color: var(--primary);
  background: var(--bg-color);
}
`;
    const result = analyzeCSS(css);
    const missingVarNames = result.entries.map(e => e.variable);
    assert(missingVarNames.includes('--secondary'), 'Test 1a: 检测到 --secondary 缺失');
    assert(missingVarNames.includes('--bg-color'), 'Test 1b: 检测到 --bg-color 缺失');
    assert(result.summary.missingVariables >= 2, 'Test 1c: 正确统计缺失变量数');
  })();

  // Test 2: :root 中引用了未定义的变量
  (function testRootRefUndefined() {
    const css = `
:root {
  --primary: #176b87;
  --accent: var(--secondary);
  --button-bg: var(--primary);
}
`;
    const result = analyzeCSS(css);
    const entry = result.entries.find(e => e.variable === '--secondary');
    assert(!!entry, 'Test 2a: 检测到 :root 中 --secondary 缺失');
    assert(entry && entry.suggestedFix && !!entry.suggestedFix.value, 'Test 2b: suggestedFix 包含 value');
    assert(entry && entry.suggestedFix && !!entry.suggestedFix.insertAfter, 'Test 2c: suggestedFix 包含 insertAfter');
  })();

  // Test 3: 变量建议值推断
  (function testInferValue() {
    assertEqual(inferValueFromName('--primary'), '#176b87', 'Test 3a: --primary → #176b87');
    assertEqual(inferValueFromName('--secondary'), '#64ccc5', 'Test 3b: --secondary → #64ccc5');
    assertEqual(inferValueFromName('--font-size'), '16px', 'Test 3c: --font-size → 16px');
    assertEqual(inferValueFromName('--border-radius'), '4px', 'Test 3d: --border-radius → 4px');
    assertEqual(inferValueFromName('--spacing-md'), '0', 'Test 3e: --spacing-md → 0');
    assertEqual(inferValueFromName('--unknown-var'), '#176b87', 'Test 3f: 未知变量返回默认值');
  })();

  // Test 4: 正常 CSS（无缺失）
  (function testNoMissing() {
    const css = `
:root {
  --primary: #176b87;
  --secondary: #64ccc5;
  --bg: #ffffff;
}
body {
  color: var(--primary);
  background: var(--bg);
}
`;
    const result = analyzeCSS(css);
    assertEqual(result.summary.missingVariables, 0, 'Test 4: 正常 CSS 无缺失变量');
  })();

  // Test 5: 循环引用检测
  (function testCircularRef() {
    const css = `
:root {
  --a: var(--b);
  --b: var(--c);
  --c: var(--a);
}
`;
    const result = analyzeCSS(css);
    assert(result.circularReferences.length > 0, 'Test 5: 检测到循环引用');
  })();

  // Test 6: 定义的变量在 :root 外部
  (function testDefinedOutsideRoot() {
    const css = `
:root {
  --primary: #176b87;
}
.container {
  --secondary: #64ccc5;
  color: var(--primary);
  border: 1px solid var(--secondary);
}
.footer {
  background: var(--secondary);
  color: var(--danger);
}
`;
    const result = analyzeCSS(css);
    const missing = result.entries.map(e => e.variable);
    assert(!missing.includes('--secondary'), 'Test 6a: --secondary 已在 .container 中定义');
    assert(missing.includes('--danger'), 'Test 6b: --danger 未定义');
  })();

  // Test 7: suggestedFix 输出字段完整性
  (function testSuggestedFixFields() {
    const css = `
:root {
  --primary: #176b87;
  --accent: var(--highlight);
}
`;
    const result = analyzeCSS(css);
    const entry = result.entries[0];
    assert(!!entry, 'Test 7a: 存在缺失变量条目');
    assert(entry && entry.suggestedFix && typeof entry.suggestedFix.value === 'string', 'Test 7b: suggestedFix.value 是字符串');
    assert(entry && entry.suggestedFix && (entry.suggestedFix.insertAfter === null || typeof entry.suggestedFix.insertAfter === 'string'), 'Test 7c: suggestedFix.insertAfter 是字符串或 null');
    assert(entry && typeof entry.variable === 'string', 'Test 7d: entry 包含 variable');
    assert(entry && typeof entry.severity === 'string', 'Test 7e: entry 包含 severity');
    assert(entry && typeof entry.message === 'string', 'Test 7f: entry 包含 message');
  })();

  // 输出结果
  console.log(`\nCSS Variable Analyzer Tests (${passed + failed} total)`);
  console.log(tests.join('\n'));
  console.log(`\n结果: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// ============================================================
// 主入口
// ============================================================

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    runTests();
    return;
  }

  if (args.length === 0) {
    console.error('用法: node scripts/css-var-analyzer.js <file.css>');
    console.error('      node scripts/css-var-analyzer.js --test');
    process.exit(1);
  }

  const filePath = args[0];
  if (!fs.existsSync(filePath)) {
    console.error(`文件不存在: ${filePath}`);
    process.exit(1);
  }

  const css = fs.readFileSync(filePath, 'utf8');
  const result = analyzeCSS(css, filePath);
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  analyzeCSS,
  extractDefinitions,
  extractReferences,
  analyzeMissingVariables,
  inferValueFromName,
  detectCircularReferences
};
