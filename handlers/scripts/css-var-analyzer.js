'use strict';

/**
 * CSS 变量分析器 - OSS 版本
 */

/**
 * 分析 CSS 文本中的变量声明和使用
 * @param {string} cssText - CSS 文本内容
 * @param {string} [filePath='inline'] - 来源文件路径
 * @returns {Object}
 */
function analyzeCSS(cssText, filePath = 'inline') {
  const declarations = [];
  const references = [];
  const declaredSet = new Set();
  const referencedSet = new Set();

  const lines = cssText.split('\n');
  for (const line of lines) {
    // 检测变量声明: --name: value;
    const declMatch = line.match(/--([\w-]+)\s*:/);
    if (declMatch) {
      const name = '--' + declMatch[1];
      declarations.push({ name, line: line.trim(), source: filePath });
      declaredSet.add(name);
    }

    // 检测变量引用: var(--name, ...)
    const refMatches = line.matchAll(/var\((--[\w-]+)/g);
    for (const m of refMatches) {
      references.push({ name: m[1], line: line.trim(), source: filePath });
      referencedSet.add(m[1]);
    }
  }

  const unused = [...declaredSet].filter(v => !referencedSet.has(v));

  return {
    ok: true,
    totalLines: lines.length,
    declarations: declarations.length,
    references: references.length,
    uniqueDeclared: declaredSet.size,
    uniqueReferenced: referencedSet.size,
    unusedVariables: unused,
    hasIssues: unused.length > 0,
    summary: `定义 ${declaredSet.size} 个变量，引用 ${referencedSet.size} 个，${unused.length} 个未使用`,
    details: { declarations, references, unused }
  };
}

module.exports = { analyzeCSS };
