'use strict';

const assert = require('assert');

console.log('=== Testing findElement function signature ===');

const fs = require('fs');
const serverJs = fs.readFileSync('./server.js', 'utf-8');

const hasSelectorParam = serverJs.includes('const selector = args.selector || \'\';');
const hasSelectorBranch = serverJs.includes('if (selector) {');
const hasTextAndSelectorCheck = serverJs.includes('if (!text && !selector)');

console.log(`Has selector param: ${hasSelectorParam}`);
console.log(`Has selector branch: ${hasSelectorBranch}`);
console.log(`Has text && selector check: ${hasTextAndSelectorCheck}`);

if (!hasSelectorParam) {
  console.error('ERROR: selector param not found in findElement');
  process.exit(1);
}

if (!hasSelectorBranch) {
  console.error('ERROR: selector branch not found in findElement');
  process.exit(1);
}

console.log('\n✓ findElement function has selector support');
console.log('✓ All checks passed');