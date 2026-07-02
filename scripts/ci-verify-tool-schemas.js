'use strict';

const fs = require('fs');
const path = require('path');

const toolsDir = path.join(__dirname, '..', 'tools');
const serverPath = path.join(__dirname, '..', 'server.js');

const tools = fs.readdirSync(toolsDir).filter(f => f.endsWith('.json'));
const src = fs.readFileSync(serverPath, 'utf8');

const handlerFiles = fs.readdirSync(path.join(__dirname, '..', 'handlers'))
  .filter(f => f.endsWith('.js'));

let allHandlerSrc = src;
for (const hf of handlerFiles) {
  allHandlerSrc += fs.readFileSync(path.join(__dirname, '..', 'handlers', hf), 'utf8');
}

let missing = [];
for (const t of tools) {
  const name = t.replace('.json', '');
  if (!allHandlerSrc.includes(name)) {
    missing.push(name);
  }
}

console.log('Total tools:', tools.length);
if (missing.length > 0) {
  console.log('Missing handlers:', missing);
  process.exit(1);
} else {
  console.log('All tools have handlers');
}
