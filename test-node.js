const fs = require('fs');
fs.writeFileSync('test-node-out.txt', 'hello from node', 'utf8');
console.log('stdout works');
