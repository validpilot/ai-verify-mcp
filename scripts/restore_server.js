const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const cacheDir = 'C:\\Users\\Administrator\\AppData\\Local\\npm-cache\\_npx\\f17577b0de46c2d2';
const pkgDir = path.join(cacheDir, 'node_modules', '@validpilot', 'ai-verify-mcp');

console.log('Checking cache directory:', cacheDir);

try {
  if (fs.existsSync(cacheDir)) {
    console.log('Deleting cache directory...');
    fs.rmSync(cacheDir, { recursive: true, force: true });
    console.log('Cache directory deleted!');
  } else {
    console.log('Cache directory does not exist');
  }
  
} catch (err) {
  console.error('Failed to delete cache:', err.message);
  process.exit(1);
}