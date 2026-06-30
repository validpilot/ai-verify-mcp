'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'server.js');
const FULL_TEXT = fs.readFileSync(SRC, 'utf8');

// Expected tools
const ALL_TOOLS = new Set([
  'browser_open','browser_click','browser_click_audit','browser_type',
  'browser_hover','browser_scroll','browser_press_key','browser_snapshot',
  'browser_batch','browser_eval','browser_dom','browser_highlight',
  'browser_select','browser_navigate','browser_wait','browser_assert',
  'browser_flow','browser_instrument','browser_events','browser_events_clear',
  'browser_sessions','browser_session_create','browser_session_switch','browser_session_close',
  'browser_screenshot','browser_screenshot_element','browser_artifacts',
  'browser_artifacts_clear','browser_har_export','browser_step',
  'browser_trace_start','browser_trace_stop',
  'browser_network','browser_network_detail','browser_console',
  'browser_errors','browser_errors_clear','browser_storage','browser_cookies',
  'validation_start','validation_check','validation_run',
  'validation_suite_run','validation_element','validation_flow',
  'validation_report','validation_report_export','validation_quick_run',
  'validation_matrix','validation_decision',
  'browser_diagnose','browser_debug_report','browser_element_status',
  'browser_quick_fix','browser_verify_fix','browser_errors_aggregate',
  'error_fix_suggestion','error_summary_md','debug_investigate',
  'browser_visual_baseline','browser_visual_compare','browser_visual_report',
  'browser_a11y_check','screenshot_diff','browser_full_audit',
  'browser_performance_check','browser_lighthouse_audit',
  'browser_find_element','browser_find_page','browser_locator_suggest','browser_locator_validate',
  'project_audit','css_var_check','skill_mcp_validate','skill_mcp_sync',
  'browser_trace_chain','backend_logs','browser_full_regression',
  'browser_deep_interact','browser_links','browser_traverse_menu',
  'mcp_health_check','mcp_self_test','benchmark_run',
  'ai_debug_investigate','auto_fix_pipeline','fix_verify'
]);

console.log(`Expected tools: ${ALL_TOOLS.size}`);

const switchStart = FULL_TEXT.indexOf('\n    switch (name) {');
const defaultIdx = FULL_TEXT.indexOf('\n    default:', switchStart);
const afterDefault = FULL_TEXT.indexOf('\n    }', defaultIdx + 20);

console.log(`switch at ${switchStart}, default at ${defaultIdx}, closing at ${afterDefault}`);

const caseRegex = /    case '([^']+)':/g;
let match;
const matches = [];
while ((match = caseRegex.exec(FULL_TEXT)) !== null) {
  if (match.index > switchStart && match.index < afterDefault) {
    matches.push({ name: match[1], index: match.index, line: FULL_TEXT.substring(0, match.index).split('\n').length });
  }
}

console.log(`\nTotal cases matched: ${matches.length}`);
console.log(`\nUnexpected cases (matched but not in tool list):`);
const unexpected = matches.filter(m => !ALL_TOOLS.has(m.name));
for (const m of unexpected) {
  console.log(`  line ${m.line}: '${m.name}'`);
}

console.log(`\nMissing expected tools (in tool list but not matched):`);
const matchedNames = new Set(matches.map(m => m.name));
for (const t of ALL_TOOLS) {
  if (!matchedNames.has(t)) console.log(`  MISSING: '${t}'`);
}

// Check if unexpected cases are inside another case body
for (const u of unexpected) {
  // Find which expected case this is inside
  let insideCase = 'unknown';
  for (const m of matches) {
    if (ALL_TOOLS.has(m.name) && m.index < u.index) {
      insideCase = m.name;
    }
  }
  console.log(`  '${u.name}' at line ${u.line} is inside '${insideCase}' case body`);
}
