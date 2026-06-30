/**
 * Smart extraction: Parse switch cases from server.js directly.
 * Finds callTool function, parses case blocks, groups into handler files.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PROJ_DIR = path.join(__dirname, '..');
const SRC = path.join(PROJ_DIR, 'server.js');
const LINES = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);

// Tool category grouping
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

// Find callTool function boundaries
let callToolStart = -1;
let callToolEnd = -1;
for (let i = 0; i < LINES.length; i++) {
  if (LINES[i].includes('async function callTool(name, args')) {
    callToolStart = i;
  }
  if (callToolStart >= 0 && LINES[i].trim() === '}' && i > callToolStart + 5) {
    // Check if this is the closing brace of callTool (not an inner block)
    // Count indentation: callTool's closing brace should be at column 0
    if (LINES[i].startsWith('}') && !LINES[i].startsWith('  }')) {
      callToolEnd = i;
      break;
    }
  }
}

if (callToolStart < 0 || callToolEnd < 0) {
  console.error('Could not find callTool function');
  process.exit(1);
}

console.log(`callTool: lines ${callToolStart + 1} to ${callToolEnd + 1}`);

// Find the switch statement inside callTool
let switchStart = -1;
let switchEnd = -1;
let braceDepth = 0;
for (let i = callToolStart; i < callToolEnd; i++) {
  const trimmed = LINES[i].trim();
  if (switchStart < 0 && trimmed.startsWith('switch (name)')) {
    switchStart = i;
    braceDepth = 0;
    continue;
  }
  if (switchStart >= 0) {
    for (const ch of trimmed) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }
    // switch ends when we return to depth 0 (the switch's own closing brace)
    // The switch is indented under callTool's try block
    if (braceDepth === 0 && i > switchStart + 2 && trimmed === '}') {
      // Verify this is the switch closing brace (indented 4 spaces)
      if (LINES[i].startsWith('    }')) {
        switchEnd = i;
        break;
      }
    }
  }
}

if (switchStart < 0 || switchEnd < 0) {
  console.error('Could not find switch statement');
  process.exit(1);
}

console.log(`switch: lines ${switchStart + 1} to ${switchEnd + 1}`);

// Now parse each case block
// A case block starts with "case 'tool_name':" and goes to the next case/default
const caseBlocks = {};
let currentCase = null;
let currentCaseStart = -1;
let currentBraceDepth = -1; // -1 means not counting yet
let caseOpenBraces = 0;

for (let i = switchStart + 1; i < switchEnd; i++) {
  const line = LINES[i];
  const trimmed = line.trim();

  // Detect case statement
  if (trimmed.startsWith("case '") && trimmed.includes("': {")) {
    const match = trimmed.match(/^case '([^']+)': \{/);
    if (match) {
      if (currentCase) {
        caseBlocks[currentCase] = LINES.slice(currentCaseStart, i).join('\n');
      }
      currentCase = match[1];
      currentCaseStart = i;
      caseOpenBraces = 0;
      currentBraceDepth = 0;
      // Count braces in this line (the case line has one '{')
      for (const ch of trimmed) {
        if (ch === '{') caseOpenBraces++;
        if (ch === '}') caseOpenBraces--;
      }
      continue;
    }
  }
  
  // Detect default case
  if (currentCase && trimmed.startsWith('default:')) {
    caseBlocks[currentCase] = LINES.slice(currentCaseStart, i).join('\n');
    currentCase = null;
    currentCaseStart = -1;
    currentBraceDepth = -1;
    continue;
  }

  // Track brace depth for the current case block
  if (currentCase) {
    for (const ch of trimmed) {
      if (ch === '{') caseOpenBraces++;
      if (ch === '}') caseOpenBraces--;
    }
  }
}

// Add the last case if any
if (currentCase) {
  caseBlocks[currentCase] = LINES.slice(currentCaseStart, switchEnd).join('\n');
}

console.log(`Found ${Object.keys(caseBlocks).length} case blocks`);

// Find detectMaliciousPatterns function (lines before switch, within callTool try block)
let detectMaliciousFn = null;
let inDetectFn = false;
let detectFnStart = -1;
let detectFnEnd = -1;
for (let i = switchStart - 1; i > callToolStart; i--) {
  if (LINES[i].includes('function detectMaliciousPatterns')) {
    detectFnStart = i;
    // Find the closing brace
    let fnBraceDepth = 0;
    for (let j = i; j < switchStart; j++) {
      const trimmed = LINES[j].trim();
      for (const ch of trimmed) {
        if (ch === '{') fnBraceDepth++;
        if (ch === '}') fnBraceDepth--;
      }
      if (fnBraceDepth === 0 && j > i) {
        detectFnEnd = j;
        break;
      }
    }
    if (detectFnEnd > detectFnStart) {
      detectMaliciousFn = LINES.slice(detectFnStart, detectFnEnd + 1).map(l => l.replace(/^      /, '  ')).join('\n');
      console.log(`Found detectMaliciousPatterns at lines ${detectFnStart + 1}-${detectFnEnd + 1}`);
    }
    break;
  }
}

// Write handler files
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
    content += detectMaliciousFn + '\n\n';
  }

  for (const toolName of toolNames) {
    const block = caseBlocks[toolName];
    if (!block) {
      console.warn(`WARNING: ${toolName} not found in switch cases, skipping`);
      continue;
    }

    // Convert the case block to an if block
    const lines = block.split('\n');
    let ifBlock = '';
    let i = 0;
    
    // Skip the case line itself (first line)
    // The first line is "    case 'tool_name': {"
    if (lines[0].includes(`case '${toolName}'`)) {
      i = 1;
    }

    // Add the if statement header
    ifBlock += `  // ====== ${toolName} ======\n`;
    ifBlock += `  if (name === '${toolName}') {\n`;
    
    // Add the body lines (with proper indentation adjustment)
    for (; i < lines.length; i++) {
      let line = lines[i];
      // Remove 4 spaces of indentation (the switch block indentation)
      if (line.startsWith('        ')) {
        line = '  ' + line.substring(8);
      } else if (line.startsWith('      ')) {
        line = '  ' + line.substring(6);
      } else if (line.startsWith('    ')) {
        line = '  ' + line.substring(4);
      } else if (line.trim() === '') {
        line = '';
      }
      ifBlock += line + '\n';
    }
    
    content += ifBlock + '\n';
  }

  content += `  return { isError: true, content: [{ type: 'text', text: \`未知工具（${filename.replace('.js', '')}）: \${name}\` }] };\n}\n\nmodule.exports = { tools, handle };\n`;

  fs.writeFileSync(handlerPath, content, 'utf8');
  console.log(`Wrote ${filename} (${toolNames.length} tools)`);
}

console.log('\nDone!');
