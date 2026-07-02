'use strict';

const fs = require('fs');
const path = require('path');

function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const beforeLength = content.length;
    
    content = content.replace(/[^\u0000-\u007F]/g, '');
    content = content.replace(/+/g, '');
    
    if (content.length !== beforeLength) {
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`✅ 修复: ${filePath} (移除 ${beforeLength - content.length} 个乱码字符)`);
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
    } else if (file.endsWith('.md') || file.endsWith('.js')) {
      if (fixFile(fullPath)) {
        fixedCount++;
      }
    }
  }
  
  return fixedCount;
}

console.log('开始扫描并修复编码乱码问题...\n');
const count = scanDir(path.join(__dirname, '..'));
console.log(`\n修复完成，共修复 ${count} 个文件`);