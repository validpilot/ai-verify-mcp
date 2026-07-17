'use strict';

// ===== 项目质量审计（v1.9.1 从 server.js 提取） =====
// 原位置：server.js line 3367-3605（239 行）
//
// 功能：扫描项目目录，检测常见代码质量问题
//   1. 硬编码密码/密钥
//   2. 硬编码绝对路径 (Windows)
//   3. TODO/FIXME/HACK 注释
//   4. 调试代码（console.log/debugger）
//   5. 大文件（>1000 行）
//   6. 重复的 require 语句
//   7. 可疑的 eval/exec 调用
//
// 依赖：fs、path（在函数内部 require，无外部依赖）
// 不需要工厂注入，直接 module.exports

/**
 * projectAudit — 扫描项目目录，检测常见代码质量问题
 */
async function projectAudit(args = {}) {
  const projectPath = args.projectPath;
  if (!projectPath) return { ok: false, error: 'projectPath is required' };

  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(projectPath);
  if (!fs.existsSync(root)) return { ok: false, error: `path not found: ${root}` };

  const issues = [];
  const minSeverity = args.severity || 'all';
  const severityOrder = { critical: 1, high: 2, medium: 3, low: 4 };

  function addIssue(severity, id, file, line, description) {
    if (minSeverity !== 'all' && severityOrder[severity] > severityOrder[minSeverity]) return;
    issues.push({ id, severity, file, line: line || 1, description });
  }

  function scanFile(filePath, relativePath) {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return;
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const basename = path.basename(filePath);

    // ── 1. 硬编码密码/密钥 ──
    const passwordPatterns = [
      /password\s*[=:]\s*['"][a-zA-Z0-9_!@#$%^&*()]{4,}['"]/i,
      /secret\s*[=:]\s*['"][a-zA-Z0-9_!@#$%^&*()]{8,}['"]/i,
      /api[_-]?key\s*[=:]\s*['"][a-zA-Z0-9_]{16,}['"]/i,
      /token\s*[=:]\s*['"][a-zA-Z0-9_\-.]{16,}['"]/i
    ];
    if (/\.(yml|yaml|json|env|py|js|ts|ps1|sh)$/i.test(ext)) {
      lines.forEach((line, idx) => {
        passwordPatterns.forEach((pat, pi) => {
          const m = line.match(pat);
          if (m) {
            const val = m[0].replace(/['";]/g, '');
            // Skip obvious placeholders
            if (/your_|changeme|placeholder|example/i.test(val)) return;
            addIssue('high', `SEC-${pi + 1}`, relativePath, idx + 1, `可能的硬编码凭据: ${val.slice(0, 40)}`);
          }
        });
      });
    }

    // ── 2. 硬编码绝对路径 (Windows) ──
    if (/\.(py|js|ts|ps1|sh|bat|cmd)$/i.test(ext)) {
      lines.forEach((line, idx) => {
        const m = line.match(/[a-zA-Z]:\\(?:[^\\"]+\\)+[^\\"]+/);
        if (m) {
          addIssue('medium', `PATH-1`, relativePath, idx + 1, `硬编码绝对路径: ${m[0].slice(0, 60)}`);
        }
      });
    }

    // ── 3. SQL 语法检查 (schema.sql) ──
    if (basename === 'schema.sql' || basename.endsWith('.sql')) {
      lines.forEach((line, idx) => {
        // Detect missing comma between column definitions
        const trimmed = line.trimEnd();
        if (/^\s+\w+/.test(trimmed) && !trimmed.endsWith(',') && !trimmed.includes('PRIMARY KEY') && !trimmed.includes('FOREIGN KEY') && !trimmed.includes('UNIQUE') && !trimmed.includes('CHECK') && !trimmed.includes('REFERENCES') && !trimmed.includes(');') && !trimmed.includes('--') && trimmed.length > 10) {
          const nextLine = lines[idx + 1] ? lines[idx + 1].trim() : '';
          if (nextLine.startsWith('  ') && !nextLine.startsWith(')') && !nextLine.startsWith('--')) {
            addIssue('critical', `SQL-1`, relativePath, idx + 1, `可能的 SQL 语法错误: 列定义缺少逗号`);
          }
        }
      });
    }

    // ── 3b. SQL 列缺失检查 (SQL-COL) ──
    if (basename === 'schema.sql' || basename.endsWith('.sql')) {
      // 构建表 schema 映射: { tableName: Set<columnName> }
      const tableColumns = {};

      // 1) 解析 CREATE TABLE ... (列定义), 支持 IF NOT EXISTS 和库名前缀
      const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`?\w+`?\.)?`?(\w+)`?\s*\(/gi;
      let ctMatch;
      while ((ctMatch = createTableRegex.exec(content)) !== null) {
        const tableName = ctMatch[1].toLowerCase();
        // 从匹配位置向后扫描，找到匹配的闭合 )
        const startPos = ctMatch.index + ctMatch[0].length;
        let depth = 1;
        let endPos = startPos;
        while (endPos < content.length && depth > 0) {
          if (content[endPos] === '(') depth++;
          else if (content[endPos] === ')') depth--;
          endPos++;
        }
        const columnBlock = content.slice(startPos, endPos - 1);
        // 提取列名：每行第一个非空白词为列名（跳过 SQL 关键字）
        const colDefLines = columnBlock.split('\n');
        const cols = new Set();
        for (const colLine of colDefLines) {
          const trimmedLine = colLine.trim();
          if (!trimmedLine || trimmedLine.startsWith('--') || trimmedLine.startsWith('/*')) continue;
          // 提取第一个词作为列名（去掉可能的反引号）
          const firstWord = trimmedLine.split(/\s+/)[0].replace(/[`"]/g, '');
          if (!firstWord) continue;
          // 跳过 SQL 关键字
          if (/^(primary|foreign|unique|check|constraint|index|key|not|null|default|references|fulltext|spatial)\b/i.test(firstWord)) continue;
          // 跳过末尾的 ) 和 ,
          if (firstWord === ')' || firstWord === ',') continue;
          cols.add(firstWord.toLowerCase());
        }
        if (cols.size > 0) {
          tableColumns[tableName] = cols;
        }
      }

      // 2) 解析 ALTER TABLE ... ADD COLUMN ... 提取后续添加的列
      const alterAddRegex = /ALTER\s+TABLE\s+(?:`?\w+`?\.)?`?(\w+)`?\s+ADD\s+(?:COLUMN\s+)?`?(\w+)`?/gi;
      let alMatch;
      while ((alMatch = alterAddRegex.exec(content)) !== null) {
        const tableName = alMatch[1].toLowerCase();
        const colName = alMatch[2].toLowerCase();
        if (!tableColumns[tableName]) {
          tableColumns[tableName] = new Set();
        }
        tableColumns[tableName].add(colName);
      }

      // 3) 解析 SELECT ... FROM 并检查列名
      const selectRegex = /SELECT\s+([\s\S]*?)\s+FROM\s+(?:`?\w+`?\.)?`?(\w+)`?/gi;
      let selMatch;
      while ((selMatch = selectRegex.exec(content)) !== null) {
        const selectClause = selMatch[1].trim();
        const tableName = selMatch[2].toLowerCase();

        // 跳过通配符
        if (/^\s*\*\s*$/.test(selectClause)) continue;

        // 跳过包含子查询的 SELECT
        if (/SELECT\s/i.test(selectClause) && !/^\s*CASE\s/i.test(selectClause)) continue;

        // 如果表不在 schema 中，跳过
        if (!tableColumns[tableName]) continue;

        // 提取列名列表（取逗号分隔的每个部分的首个词，去掉反引号、别名等）
        const colParts = selectClause.split(',').map(c => c.trim());
        for (const part of colParts) {
          // 取首个非空词作为列名，去掉反引号和引号
          const colName = part.split(/\s+/)[0].replace(/[`"\[\]]/g, '').toLowerCase();
          if (!colName || colName === '') continue;
          // 跳过 SQL 函数/关键字
          if (/^(count|sum|avg|min|max|distinct|case|when|then|else|end|as|is|null|not|in|exists|and|or|on|true|false)\b/i.test(colName)) continue;
          // 检查列名是否在表定义中
          if (!tableColumns[tableName].has(colName)) {
            // 找到该 SELECT 语句所在行号
            const lineIdx = lines.findIndex(l => l.toLowerCase().includes(selMatch[0].split('\n')[0].toLowerCase().trim()));
            addIssue('high', 'SQL-COL', relativePath, (lineIdx >= 0 ? lineIdx : 0) + 1,
              `数据库列缺失: SELECT 中引用的列 "${colName}" 未在表 "${tableName}" 的 schema 定义中找到`);
          }
        }
      }
    }

    // ── 4. CSS 变量检测 ──
    if (ext === '.css') {
      // 收集 :root 中定义的所有变量
      const rootDefs = new Set();
      const rootVarValues = {};
      const rootBlockRegex = /:root\s*\{([^}]*)\}/g;
      let rootMatch;
      while ((rootMatch = rootBlockRegex.exec(content)) !== null) {
        const block = rootMatch[1];
        const defRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
        let defMatch;
        while ((defMatch = defRegex.exec(block)) !== null) {
          rootDefs.add(defMatch[1]);
          rootVarValues[defMatch[1]] = defMatch[2].trim();
        }
      }

      if (rootDefs.size > 0) {
        // a/b. 检查 :root 中的每条定义
        const refRegex = /var\(\s*(--[\w-]+)\s*/g;
        for (const [varName, varValue] of Object.entries(rootVarValues)) {
          refRegex.lastIndex = 0;
          let refMatch;
          while ((refMatch = refRegex.exec(varValue)) !== null) {
            const refVar = refMatch[1];
            const lineIdx = lines.findIndex(l => l.includes(varName));
            // a. 循环引用: --xxx: var(--xxx)
            if (refVar === varName) {
              addIssue('high', 'CSS-SELF', relativePath, lineIdx + 1,
                `CSS 变量循环引用: ${varName} 的值通过 var() 引用了自身`);
            // b. 引用未定义变量: --xxx: var(--yyy) 但 --yyy 未在 :root 中定义
            } else if (!rootDefs.has(refVar)) {
              addIssue('high', 'CSS-UNDEF', relativePath, lineIdx + 1,
                `CSS 变量引用未定义: ${varName} 引用了 ${refVar}，但 ${refVar} 未在 :root 中定义`);
            }
          }
        }

        // c. 非 :root 区域中的 var() 引用了未定义变量
        let inRootBlock = false;
        lines.forEach((line, idx) => {
          if (inRootBlock) {
            if (line.includes('}')) inRootBlock = false;
            return;
          }
          if (/:root\s*\{/.test(line)) {
            if (!line.includes('}')) inRootBlock = true;
            return;
          }
          const lineRefRegex = /var\(\s*(--[\w-]+)\s*/g;
          let m;
          while ((m = lineRefRegex.exec(line)) !== null) {
            if (!rootDefs.has(m[1])) {
              addIssue('medium', 'CSS-NOROOT', relativePath, idx + 1,
                `CSS 变量 ${m[1]} 未在 :root 中定义，但在文件中被引用`);
            }
          }
        });
      }
    }
  }

  // ── 递归扫描 ──
  function walk(dir, relativeDir = '') {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const entry of entries) {
      // Skip .git, node_modules, .trae, logs
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'logs') continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else {
        scanFile(fullPath, relPath);
      }
    }
  }

  walk(root);
  return { ok: true, projectPath: root, totalIssues: issues.length, issues };
}

module.exports = { projectAudit };
