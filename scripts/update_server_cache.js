const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, '../server.js');
const dstDir = 'C:\\Users\\Administrator\\AppData\\Local\\npm-cache\\_npx\\f17577b0de46c2d2\\node_modules\\@validpilot\\ai-verify-mcp';
const dstFile = path.join(dstDir, 'server.js');

console.log('Source:', srcFile);
console.log('Destination:', dstFile);

try {
  const content = fs.readFileSync(srcFile, 'utf8');
  fs.writeFileSync(dstFile, content);
  console.log('server.js updated successfully!');
  
  const pkg = JSON.parse(fs.readFileSync(path.join(dstDir, 'package.json'), 'utf8'));
  console.log('Package version:', pkg.version);
  
} catch (err) {
  console.error('Failed to update:', err.message);
  process.exit(1);
}