'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');

test('all tool schemas are valid JSON with required fields', () => {
  const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
  assert.ok(files.length > 50, `expected at least 50 tools, got ${files.length}`);

  for (const file of files) {
    const filePath = path.join(TOOLS_DIR, file);
    let schema;
    try {
      schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      assert.fail(`${file}: invalid JSON - ${e.message}`);
    }

    assert.ok(schema.name, `${file}: missing "name"`);
    assert.ok(schema.description, `${file}: missing "description"`);
    assert.ok(schema.inputSchema, `${file}: missing "inputSchema"`);
    assert.strictEqual(schema.inputSchema.type, 'object', `${file}: inputSchema.type should be "object"`);
    assert.ok(schema.inputSchema.properties, `${file}: missing "inputSchema.properties"`);

    const baseName = file.replace('.json', '');
    assert.strictEqual(schema.name, baseName, `${file}: name "${schema.name}" does not match filename`);
  }
});

test('server.js has handlers for all tools', () => {
  const files = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
  const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  const missing = [];
  for (const file of files) {
    const name = file.replace('.json', '');
    const hasHandler = serverSrc.includes(`case \`${name}\``) ||
                       serverSrc.includes(`case "${name}"`) ||
                       serverSrc.includes(`case '${name}'`);
    if (!hasHandler) missing.push(name);
  }

  assert.strictEqual(missing.length, 0, `Missing handlers for: ${missing.join(', ')}`);
});
