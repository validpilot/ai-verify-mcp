'use strict';

// Handler: locator
// Extracted from server.js callTool switch statements

const tools = [
  "browser_find_element",
  "browser_find_page",
  "browser_locator_suggest",
  "browser_locator_validate"
];

async function handle(name, args, deps) {

  // === Bridge deps into scope via globalThis ===
  const _depsKeys = Object.keys(deps);
  const _depsPrev = {};
  for (const k of _depsKeys) { _depsPrev[k] = globalThis[k]; globalThis[k] = deps[k]; }
  try {
  // ====== browser_find_element ======
  if (name === 'browser_find_element') {
const { target } = await ensurePage();
    return text(JSON.stringify(await findElement(target, args), null, 2));
  }

  // ====== browser_find_page ======
  if (name === 'browser_find_page') {
  return text(JSON.stringify(await findPage(args.target, args), null, 2));
  }

  // ====== browser_locator_suggest ======
  if (name === 'browser_locator_suggest') {
const { target } = await ensurePage(args);
    return text(JSON.stringify(await suggestLocator(target, args), null, 2));
  }

  // ====== browser_locator_validate ======
  if (name === 'browser_locator_validate') {
const { target } = await ensurePage(args);
    return text(JSON.stringify(await validateLocator(target, args), null, 2));
  }

  return { isError: true, content: [{ type: 'text', text: `未知工具（locator）: ${name}` }] };
  } finally {
    for (const k of _depsKeys) { deps[k] = globalThis[k]; }
    for (const k of _depsKeys) { if (k in _depsPrev) globalThis[k] = _depsPrev[k]; else delete globalThis[k]; }
  }

}

module.exports = { tools, handle };
