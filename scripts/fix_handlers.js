/**
 * Fix handler files: remove broken bridge code, apply correct globalThis bridge.
 */
const fs = require('fs');
const path = require('path');

const handlersDir = path.join(__dirname, '..', 'handlers');
const files = fs.readdirSync(handlersDir).filter(f => f.endsWith('.js') && f !== 'state.js');

for (const file of files) {
  const filePath = path.join(handlersDir, file);
  let lines = fs.readFileSync(filePath, 'utf8').split('\n');

  // Step 1: Remove broken prologue (lines starting from "// === Bridge deps")
  let bridgeStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('// === Bridge deps into scope via globalThis ===')) {
      bridgeStart = i;
      break;
    }
  }

  if (bridgeStart >= 0) {
    // Find the "try {" line that follows the prologue
    let tryLine = -1;
    for (let i = bridgeStart; i < Math.min(bridgeStart + 10, lines.length); i++) {
      if (lines[i].trim() === 'try {') {
        tryLine = i;
        break;
      }
    }
    // Remove prologue lines (bridgeStart through tryLine)
    if (tryLine >= 0) {
      lines.splice(bridgeStart, tryLine - bridgeStart + 1);
    }
  }

  // Step 2: Remove broken epilogue
  let finallyStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('// Write mutated state back to deps')) {
      // Go back to find the "} finally {" line
      for (let j = i - 1; j >= 0; j--) {
        if (lines[j].trim().endsWith('finally {')) {
          finallyStart = j;
          break;
        }
      }
      break;
    }
  }

  if (finallyStart >= 0) {
    // Find the closing "}" of the finally block
    let finallyEnd = -1;
    let braceDepth = 0;
    for (let i = finallyStart; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      // Count braces in this line
      for (const ch of trimmed) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }
      if (braceDepth === 0 && i > finallyStart) {
        finallyEnd = i;
        break;
      }
    }
    if (finallyEnd >= 0) {
      lines.splice(finallyStart, finallyEnd - finallyStart + 1);
    }
  }

  // Step 3: Apply correct bridge code

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
  let fallbackReturn = -1;
  for (let i = moduleExports - 1; i > handleStart; i--) {
    if (/^\s*return \{ isError: true,\s*content:/.test(lines[i])) {
      fallbackReturn = i;
      break;
    }
  }

  if (fallbackReturn < 0) {
    console.error(`Could not find final fallback return in ${file}`);
    continue;
  }

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
  lines.splice(handleStart + 1, 0, ...prologue);

  // Adjust indices after insertion
  const shift = prologue.length;
  fallbackReturn += shift;

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
  console.log(`Fixed: ${file}`);
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
    const err = e.stderr ? e.stderr.toString().trim() : e.message;
    console.log(`  FAIL: ${file} - ${err}`);
  }
}
