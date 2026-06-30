/**
 * Transform handler files to use globalThis bridge pattern.
 * Wraps handle() body in try/finally that injects deps into globalThis and restores after.
 */
const fs = require('fs');
const path = require('path');

const handlersDir = path.join(__dirname, '..', 'handlers');

// Get all handler files (excluding state.js)
const files = fs.readdirSync(handlersDir).filter(f => f.endsWith('.js') && f !== 'state.js');

for (const file of files) {
  const filePath = path.join(handlersDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Find the handle function opening line
  let handleStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*async function handle\(/.test(lines[i])) {
      handleStart = i;
      break;
    }
  }
  if (handleStart < 0) {
    console.error(`Could not find handle function in ${file}`);
    continue;
  }

  // Find module.exports line
  let moduleExports = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*module\.exports\s*=/.test(lines[i])) {
      moduleExports = i;
      break;
    }
  }

  // Find the LAST return { isError: true, ... } before module.exports
  // This is the final fallback return
  let fallbackReturn = -1;
  for (let i = moduleExports - 1; i > handleStart; i--) {
    if (/^\s*return \{ isError: true,\s*content:/ .test(lines[i])) {
      fallbackReturn = i;
      break;
    }
  }

  if (fallbackReturn < 0) {
    console.error(`Could not find final fallback return in ${file}`);
    continue;
  }

  // Get original indentation of the fallback return
  const returnIndent = lines[fallbackReturn].match(/^(\s*)/)[1];
  const returnLine = lines[fallbackReturn];

  // Insert prologue after handle function opening line
  const prologue = [
    '  // === Bridge deps into scope via globalThis ===',
    '  const _depsKeys = Object.keys(deps);',
    '  const _depsPrev = {};',
    '  for (const k of _depsKeys) { _depsPrev[k] = globalThis[k]; globalThis[k] = deps[k]; }',
    '  try {'
  ];

  // Add prologue lines after handle start
  lines.splice(handleStart + 1, 0, ...prologue);

  // Adjust indices after insertion
  const shift = prologue.length;
  fallbackReturn += shift;
  moduleExports += shift;

  // Replace the fallback return line with epilogue + return
  const epilogue = [
    `${returnIndent}} finally {`,
    `${returnIndent}  // Write mutated state back to deps`,
    `${returnIndent}  for (const k of _depsKeys) { deps[k] = globalThis[k]; }`,
    `${returnIndent}  // Restore globalThis to previous state`,
    `${returnIndent}  for (const k of _depsKeys) { if (k in _depsPrev) globalThis[k] = _depsPrev[k]; else delete globalThis[k]; }`,
    `${returnIndent}}`,
  ];

  lines.splice(fallbackReturn, 1, ...epilogue, returnLine);

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  console.log(`Transformed: ${file}`);
}

// Verify syntax
console.log('\n--- Syntax Verification ---');
const { execSync } = require('child_process');
for (const file of files) {
  const filePath = path.join(handlersDir, file);
  try {
    execSync(`node -c "${filePath}"`, { stdio: 'pipe' });
    console.log(`  OK: ${file}`);
  } catch (e) {
    console.log(`  FAIL: ${file}`);
    console.log(`    ${e.stderr ? e.stderr.toString().trim() : e.message}`);
  }
}
