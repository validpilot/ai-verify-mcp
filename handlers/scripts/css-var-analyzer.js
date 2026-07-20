'use strict';

/**
 * CSS 变量分析器 - OSS 版本
 */

/**
 * 分析 CSS 文本中的变量声明和使用
 * 同时检测两类问题：
 *   1. unusedVariables - 已声明但未引用的变量（浪费）
 *   2. undefinedReferences - 已引用但未声明的变量（会导致样式失效）
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
    // 检测变量声明: --name: value; 使用 matchAll 全局匹配，支持一行多声明
    // 例如 ":root{--primary:blue;--secondary:green}" 会同时识别 --primary 和 --secondary
    const declMatches = line.matchAll(/--([\w-]+)\s*:/g);
    for (const m of declMatches) {
      const name = '--' + m[1];
      declarations.push({ name, line: line.trim(), source: filePath });
      declaredSet.add(name);
    }

    // 检测变量引用: var(--name, ...) 全局匹配，支持一行多引用
    const refMatches = line.matchAll(/var\((--[\w-]+)/g);
    for (const m of refMatches) {
      references.push({ name: m[1], line: line.trim(), source: filePath });
      referencedSet.add(m[1]);
    }
  }

  // 已声明但未引用的变量（冗余声明）
  const unused = [...declaredSet].filter(v => !referencedSet.has(v));
  // 已引用但未声明的变量（会导致 var() 解析失败，样式属性失效）
  const undefinedRefs = [...referencedSet].filter(v => !declaredSet.has(v));
  const hasIssues = unused.length > 0 || undefinedRefs.length > 0;

  const parts = [
    `定义 ${declaredSet.size} 个变量`,
    `引用 ${referencedSet.size} 个`,
    `${unused.length} 个未使用`,
    `${undefinedRefs.length} 个未定义`
  ];
  if (undefinedRefs.length > 0) {
    parts.push(`未定义变量: ${undefinedRefs.join(', ')}`);
  }

  return {
    ok: true,
    totalLines: lines.length,
    declarations: declarations.length,
    references: references.length,
    uniqueDeclared: declaredSet.size,
    uniqueReferenced: referencedSet.size,
    unusedVariables: unused,
    undefinedReferences: undefinedRefs,
    hasIssues,
    summary: parts.join('，'),
    details: { declarations, references, unused, undefinedReferences: undefinedRefs }
  };
}

module.exports = { analyzeCSS };
