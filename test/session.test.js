'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const HANDLERS_DIR = path.join(__dirname, '..', 'handlers');

// Build toolNames from handler modules
const handlers = [
  require('../handlers/browser'),
  require('../handlers/session'),
  require('../handlers/evidence'),
  require('../handlers/network'),
  require('../handlers/validation'),
  require('../handlers/diagnose'),
  require('../handlers/visual'),
  require('../handlers/locator'),
  require('../handlers/system'),
];

function buildToolNames() {
  const names = new Set();
  for (const h of handlers) {
    for (const name of h.tools) {
      names.add(name);
    }
  }
  return names;
}

const toolNames = buildToolNames();

// ============================================================
// browser_sessions
// ============================================================

// v1.10.0: browser_sessions 已移除（别名 → browser_session mode=list）

// ============================================================
// browser_session_create
// ============================================================

// v1.10.0: browser_session_create 已移除（别名 → browser_session mode=create）

// ============================================================
// browser_session_switch
// ============================================================

// v1.10.0: browser_session_switch 已移除（别名 → browser_session mode=switch）

// ============================================================
// browser_session_close
// ============================================================

// v1.10.0: browser_session_close 已移除（别名 → browser_session mode=close）
