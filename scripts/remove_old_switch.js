'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'server.js');
let content = fs.readFileSync(SRC, 'utf8');

// Find the new handler routing code
const routingMarker = 'return await handler.handle(name, args, deps);';
const routingIdx = content.indexOf(routingMarker);
if (routingIdx < 0) {
  console.error('ERROR: Could not find handler routing');
  process.exit(1);
}

// The old code starts right after the routing line
const oldCodeStart = routingIdx + routingMarker.length;

// Find the catch block
const catchPattern = '\n  } catch (error) {';
const catchIdx = content.indexOf(catchPattern, oldCodeStart);
if (catchIdx < 0) {
  console.error('ERROR: Could not find catch block');
  process.exit(1);
}

// Remove everything between oldCodeStart and catchIdx (exclusive)
const beforeOld = content.substring(0, oldCodeStart);
const afterOld = content.substring(catchIdx);

// Clean up: ensure proper whitespace between routing and catch
const cleanedContent = beforeOld + '\n' + afterOld;

fs.writeFileSync(SRC, cleanedContent, 'utf8');
console.log('Successfully removed old switch block');
console.log(`Old size: ${content.length}, New size: ${cleanedContent.length}`);
console.log(`Removed: ${content.length - cleanedContent.length} chars`);
