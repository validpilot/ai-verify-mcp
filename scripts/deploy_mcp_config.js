const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../tools');
const targetDir = process.argv[2] || 'c:\\Users\\Administrator\\.trae-cn\\mcps\\s_validpilot-2073eb93\\solo_agent\\mcp_ai-verify-oss';
const dstDir = path.join(targetDir, 'tools');

console.log('Source:', srcDir);
console.log('Destination:', dstDir);

try {
  if (!fs.existsSync(dstDir)) {
    fs.mkdirSync(dstDir, { recursive: true });
    console.log('Created destination directory');
  }

  const files = fs.readdirSync(srcDir);
  let copied = 0;
  
  for (const file of files) {
    if (file.endsWith('.json')) {
      const srcFile = path.join(srcDir, file);
      const dstFile = path.join(dstDir, file);
      
      try {
        fs.copyFileSync(srcFile, dstFile);
        copied++;
        console.log(`Copied: ${file}`);
      } catch (err) {
        console.error(`Failed to copy ${file}:`, err.message);
      }
    }
  }

  const metaData = {
    server_name: 'mcp_ai-verify-oss',
    description: null
  };
  
  const metaPath = path.join(dstDir, '..', 'SERVER_METADATA.json');
  fs.writeFileSync(metaPath, JSON.stringify(metaData, null, 2));
  console.log('Created SERVER_METADATA.json');
  
  console.log(`\nTotal copied: ${copied} files`);
  
} catch (err) {
  console.error('Deployment failed:', err.message);
  process.exit(1);
}