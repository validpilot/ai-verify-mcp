/**
 * V4: Extract the full switch block as text, replace case->if, split into handlers.
 * This is a simple text transformation, not line-range based.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PROJ_DIR = path.join(__dirname, '..');
const SRC = path.join(PROJ_DIR, 'server.js');
const FULL_TEXT = fs.readFileSync(SRC, 'utf8');

// Extract the try block from callTool (from "try {" to the closing "}" before the catch)
// We know from analysis:
// - switch starts around "    switch (name) {"
// - default: is at "    default:"
// - closing of switch is "    }" (the one just before "  } catch")
// Find the switch block between "    switch (name) {" and the closing "    }" before catch

// Find the switch statement
const switchStart = FULL_TEXT.indexOf('\n    switch (name) {');
if (switchStart < 0) {
  console.error('Could not find switch statement');
  process.exit(1);
}

// Find the default case
const defaultIdx = FULL_TEXT.indexOf('\n    default:', switchStart);
if (defaultIdx < 0) {
  console.error('Could not find default case');
  process.exit(1);
}

// Find the closing brace of the switch (the "    }" after default)
// The default case is followed by the return, then the switch closing brace
const afterDefault = FULL_TEXT.indexOf('\n    }', defaultIdx + 20);
const catchIdx = FULL_TEXT.indexOf('\n  } catch', afterDefault);

// Extract the switch body (everything between switch opening brace and its closing brace)
const switchBodyStart = FULL_TEXT.indexOf('{', switchStart) + 1;
const switchBodyEnd = afterDefault; // the "    }" line before catch

const switchBody = FULL_TEXT.substring(switchBodyStart, switchBodyEnd);

console.log(`Extracted switch body: ${switchBody.length} chars`);

// Now replace each "    case 'tool_name':" with an if-based approach
// We need to handle:
// 1. "    case 'tool_name': {" -> "    if (name === 'tool_name') {"
// 2. "    case 'tool_name':\n      return ..." -> "    if (name === 'tool_name') { ... }"

// Strategy: Find each case statement, determine its body extent, convert to if

// Find all positions of "case '" at the switch's indent level
const casePositions = [];
const caseRegex = /^    case '([^']+)':/gm;
let match;
while ((match = caseRegex.exec(FULL_TEXT)) !== null) {
  if (match.index > switchStart && match.index < afterDefault) {
    casePositions.push({ name: match[1], start: match.index, matchEnd: match.index + match[0].length });
  }
}

console.log(`Found ${casePositions.length} cases`);

// For each case, extract its body
const caseBodies = {};
for (let i = 0; i < casePositions.length; i++) {
  const cp = casePositions[i];
  const bodyStart = cp.matchEnd;
  let bodyEnd;
  
  if (i + 1 < casePositions.length) {
    bodyEnd = casePositions[i + 1].start;
  } else {
    bodyEnd = defaultIdx;
  }
  
  // Trim trailing whitespace/newlines from the body end
  let body = FULL_TEXT.substring(bodyStart, bodyEnd);
  body = body.replace(/\n\s*$/, '');
  
  // Check if this is a braced case (the match ended with ': {' or the next non-whitespace is '{')
  let braced = cp.matchEnd > 0 && FULL_TEXT[cp.matchEnd - 1] === '{';
  if (!braced && body.trim().startsWith('{')) {
    braced = true;
    body = body.replace(/^\s*\{\s*\n?/, '');
    // Also remove the closing brace and trailing newline
    body = body.replace(/\n\s*\}\s*$/, '');
  }
  
  caseBodies[cp.name] = { body, braced };
}

// Now generate handler files
const HANDLER_GROUPS = {
  'browser.js': [
    'browser_open','browser_click','browser_click_audit','browser_type',
    'browser_hover','browser_scroll','browser_press_key','browser_snapshot',
    'browser_batch','browser_eval','browser_dom','browser_highlight',
    'browser_select','browser_navigate','browser_wait','browser_assert',
    'browser_flow','browser_instrument','browser_events','browser_events_clear'
  ],
  'session.js': [
    'browser_sessions','browser_session_create','browser_session_switch','browser_session_close'
  ],
  'evidence.js': [
    'browser_screenshot','browser_screenshot_element','browser_artifacts',
    'browser_artifacts_clear','browser_har_export','browser_step',
    'browser_trace_start','browser_trace_stop'
  ],
  'network.js': [
    'browser_network','browser_network_detail','browser_console',
    'browser_errors','browser_errors_clear','browser_storage','browser_cookies'
  ],
  'validation.js': [
    'validation_start','validation_check','validation_run',
    'validation_suite_run','validation_element','validation_flow',
    'validation_report','validation_report_export','validation_quick_run',
    'validation_matrix','validation_decision'
  ],
  'diagnose.js': [
    'browser_diagnose','browser_debug_report','browser_element_status',
    'browser_quick_fix','browser_verify_fix','browser_errors_aggregate',
    'error_fix_suggestion','error_summary_md','debug_investigate'
  ],
  'visual.js': [
    'browser_visual_baseline','browser_visual_compare','browser_visual_report',
    'browser_a11y_check','screenshot_diff','browser_full_audit',
    'browser_performance_check','browser_lighthouse_audit'
  ],
  'locator.js': [
    'browser_find_element','browser_find_page','browser_locator_suggest','browser_locator_validate'
  ],
  'system.js': [
    'project_audit','css_var_check','skill_mcp_validate','skill_mcp_sync',
    'browser_trace_chain','backend_logs','browser_full_regression',
    'browser_deep_interact','browser_links','browser_traverse_menu',
    'mcp_health_check','mcp_self_test','benchmark_run',
    'ai_debug_investigate','auto_fix_pipeline','fix_verify'
  ]
};

// Extract detectMaliciousPatterns from server.js
let detectMaliciousFn = null;
const detectFnIdx = FULL_TEXT.indexOf('function detectMaliciousPatterns');
if (detectFnIdx >= 0) {
  // Find the closing brace of this function
  let braceDepth = 0;
  let fnStart = detectFnIdx;
  let fnEnd = detectFnIdx;
  let started = false;
  for (let i = detectFnIdx; i < FULL_TEXT.length; i++) {
    if (FULL_TEXT[i] === '{') { braceDepth++; started = true; }
    if (FULL_TEXT[i] === '}') { braceDepth--; }
    if (started && braceDepth === 0) {
      fnEnd = i + 1;
      break;
    }
  }
  if (fnEnd > fnStart) {
    detectMaliciousFn = FULL_TEXT.substring(fnStart, fnEnd);
    console.log(`Found detectMaliciousPatterns (${detectMaliciousFn.length} chars)`);
  }
}

// Re-indent function: remove first 2 spaces from each line
// Case body is at 6-space indent, we want 4-space for if-body
function deindent(text) {
  return text.split('\n').map(line => {
    if (line.startsWith('  ')) return line.substring(2);
    if (line.trim() === '') return '';
    return line;
  }).join('\n');
}

const HANDLERS_DIR = path.join(PROJ_DIR, 'handlers');
if (!fs.existsSync(HANDLERS_DIR)) fs.mkdirSync(HANDLERS_DIR);

for (const [filename, toolNames] of Object.entries(HANDLER_GROUPS)) {
  const handlerPath = path.join(HANDLERS_DIR, filename);
  let content = `'use strict';

// Handler: ${filename.replace('.js', '')}
// Extracted from server.js callTool switch statements

const tools = ${JSON.stringify(toolNames, null, 2)};

async function handle(name, args, deps) {
`;

  // Include detectMaliciousPatterns for browser handler
  if (filename === 'browser.js' && detectMaliciousFn) {
    // Indent detectMaliciousFn for handler scope
    content += '  ' + detectMaliciousFn.replace(/\n/g, '\n  ') + '\n\n';
  }

  for (const toolName of toolNames) {
    const caseInfo = caseBodies[toolName];
    if (!caseInfo) {
      console.warn(`WARNING: ${toolName} not found`);
      continue;
    }

    const deindentedBody = deindent(caseInfo.body);
    
    content += `  // ====== ${toolName} ======\n`;
    if (caseInfo.braced) {
      // Braced case: if block with body
      content += `  if (name === '${toolName}') {\n`;
      content += deindentedBody;
      if (!deindentedBody.endsWith('\n')) content += '\n';
      content += `  }\n`;
    } else {
      // Non-braced case: single statement
      content += `  if (name === '${toolName}') {\n`;
      content += `  ${deindentedBody.trim()}\n`;
      content += `  }\n`;
    }
    content += '\n';
  }

  content += `  return { isError: true, content: [{ type: 'text', text: \`未知工具（${filename.replace('.js', '')}）: \${name}\` }] };\n}\n\nmodule.exports = { tools, handle };\n`;

  fs.writeFileSync(handlerPath, content, 'utf8');
  console.log(`Wrote ${filename} (${toolNames.length} tools)`);
}

console.log('\nDone!');
