'use strict';
const fs = require('fs');
const path = require('path');

const HANDLERS_DIR = path.join(__dirname, '..', 'handlers');

const HANDLER_FILES = [
  'browser.js', 'session.js', 'evidence.js', 'network.js',
  'validation.js', 'diagnose.js', 'visual.js', 'locator.js', 'system.js'
];

const BRIDGE_HEADER = `  // === Bridge deps into scope via globalThis ===
  const _depsKeys = Object.keys(deps);
  const _depsPrev = {};
  for (const k of _depsKeys) { _depsPrev[k] = globalThis[k]; globalThis[k] = deps[k]; }
  try {
`;

const BRIDGE_FOOTER = `  } finally {
    for (const k of _depsKeys) { deps[k] = globalThis[k]; }
    for (const k of _depsKeys) { if (k in _depsPrev) globalThis[k] = _depsPrev[k]; else delete globalThis[k]; }
  }
`;

for (const filename of HANDLER_FILES) {
  const filePath = path.join(HANDLERS_DIR, filename);
  let content = fs.readFileSync(filePath, 'utf8');

  // Find the handle function body start (after "async function handle(name, args, deps) {")
  const handleStart = content.indexOf('async function handle(name, args, deps) {');
  if (handleStart < 0) {
    console.error(`ERROR: Could not find handle function in ${filename}`);
    continue;
  }

  // Find the opening brace of the handle function
  const braceOpen = content.indexOf('{', handleStart);
  if (braceOpen < 0) {
    console.error(`ERROR: Could not find opening brace in ${filename}`);
    continue;
  }

  // Find the first non-empty line after the opening brace (skip leading whitespace/newlines)
  const afterBrace = content.substring(braceOpen + 1);
  const bodyMatch = afterBrace.match(/[^\n]/);
  const bodyStart = braceOpen + 1 + (bodyMatch ? bodyMatch.index : 0);

  // Find the closing of the handle function - it's the last '}' before the 'module.exports'
  const moduleExportsIdx = content.lastIndexOf('module.exports');
  if (moduleExportsIdx < 0) {
    console.error(`ERROR: Could not find module.exports in ${filename}`);
    continue;
  }

  // Find the return statement and closing brace right before module.exports
  const beforeExports = content.substring(0, moduleExportsIdx).trimEnd();
  // The last character should be '}' (closing handle function)
  const handleClose = beforeExports.lastIndexOf('\n}');
  if (handleClose < 0) {
    console.error(`ERROR: Could not find handle closing in ${filename}`);
    continue;
  }

  // Build the new content
  const headerPart = content.substring(0, bodyStart);
  const bodyPart = content.substring(bodyStart, handleClose);
  const footerPart = content.substring(handleClose);

  // Remove trailing empty lines from bodyPart and leading from footerPart
  const bodyTrimmed = bodyPart.replace(/\n+$/, '\n').replace(/^\n+/, '');

  const newContent = headerPart + '\n' + BRIDGE_HEADER + bodyTrimmed + '\n' + BRIDGE_FOOTER + footerPart;

  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log(`Injected bridge: ${filename}`);
}

console.log('\nDone!');
