'use strict';

const fs = require('fs');
const path = require('path');

const WRONG_PATTERNS = [
  /@validpilot\/@validpilot\/@validpilot\/@validpilot\/ai-verify-mcp/g,
  /@validpilot\/@validpilot\/@validpilot\/ai-verify-mcp/g,
  /@validpilot\/@validpilot\/ai-verify-mcp/g,
];

const CORRECT_NAME = '@validpilot/ai-verify-mcp';

function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    let changed = false;
    let count = 0;

    for (const pattern of WRONG_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        content = content.replace(pattern, CORRECT_NAME);
        count += matches.length;
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`✅ 修复: ${filePath} (${count} 处)`);
      return true;
    }
    return false;
  } catch (e) {
    console.error(`❌ 读取文件失败: ${filePath} - ${e.message}`);
    return false;
  }
}

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  let fixedCount = 0;

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'local-test') {
        fixedCount += scanDir(fullPath);
      }
    } else if (file.endsWith('.md') || file.endsWith('.js') || file.endsWith('.json')) {
      if (fixFile(fullPath)) {
        fixedCount++;
      }
    }
  }

  return fixedCount;
}

console.log('开始扫描并修复 npm 包名错误...\n');
const count = scanDir(path.join(__dirname, '..'));
console.log(`\n修复完成，共修复 ${count} 个文件`);
