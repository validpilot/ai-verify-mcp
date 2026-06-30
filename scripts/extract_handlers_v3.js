/**
 * Robust extraction: Find all case blocks between switch start and default.
 * Handles both braced and non-braced case syntax.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PROJ_DIR = path.join(__dirname, '..');
const SRC = path.join(PROJ_DIR, 'server.js');
const LINES = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);

// First, find the switch statement boundaries
let switchLine = -1;
let defaultLine = -1;
let switchCloseLine = -1;

for (let i = 0; i < LINES.length; i++) {
  if (LINES[i] === '    switch (name) {') {
    switchLine = i;
    console.log(`Found switch at line ${i + 1}`);
  }
  // The outer switch's default: is at 4-space indent (indented same as case)
  if (switchLine >= 0 && LINES[i] === '    default:' && i > switchLine + 100) {
    // This is the switch's default - find the closing brace after it
    defaultLine = i;
    // The closing brace of the switch is one line after the default's return
    for (let j = i + 1; j < LINES.length; j++) {
      if (LINES[j].startsWith('    }') && LINES[j].trim() === '}') {
        switchCloseLine = j;
        break;
      }
    }
    break;
  }
}

if (switchLine < 0 || defaultLine < 0) {
  console.error('Could not find switch boundaries');
  process.exit(1);
}

console.log(`switch: ${switchLine + 1} -> ${switchCloseLine + 1} (default at ${defaultLine + 1})`);

// Now find all case statements between switchLine+1 and defaultLine
// Only match cases at 4-space indent (siblings of the switch's own default)
const caseStarts = [];
for (let i = switchLine + 1; i < defaultLine; i++) {
  const line = LINES[i];
  if (line.startsWith('    case \'') && line.includes('\':')) {
    const match = line.match(/case '([^']+)':/);
    if (match) {
      caseStarts.push({ name: match[1], line: i });
    }
  }
}

console.log(`Found ${caseStarts.length} case statements`);

// Extract each case block
const caseBlocks = {};
for (let idx = 0; idx < caseStarts.length; idx++) {
  const cs = caseStarts[idx];
  const nextLine = (idx + 1 < caseStarts.length) ? caseStarts[idx + 1].line : defaultLine;
  const block = LINES.slice(cs.line, nextLine).join('\n');
  caseBlocks[cs.name] = block;
}

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

// Find detectMaliciousPatterns function - search backwards from switch
let detectMaliciousFn = null;
for (let i = switchLine - 1; i > switchLine - 200; i--) {
  if (i < 0) break;
  if (LINES[i].includes('function detectMaliciousPatterns')) {
    let fnStart = i;
    let braceDepth = 0;
    let started = false;
    for (let j = i; j < switchLine; j++) {
      const trimmed = LINES[j].trim();
      for (const ch of trimmed) {
        if (ch === '{') { braceDepth++; started = true; }
        if (ch === '}') braceDepth--;
      }
      if (started && braceDepth === 0) {
        detectMaliciousFn = LINES.slice(fnStart, j + 1).join('\n');
        console.log(`Found detectMaliciousPatterns at lines ${fnStart + 1}-${j + 1}`);
        break;
      }
    }
    break;
  }
}

// Write handler files
const HANDLERS_DIR = path.join(PROJ_DIR, 'handlers');
if (!fs.existsSync(HANDLERS_DIR)) fs.mkdirSync(HANDLERS_DIR);

function convertCaseToIf(caseBlock, toolName) {
  const lines = caseBlock.split('\n');
  let result = '';
  let i = 1; // Always skip the case line itself
  
  result += `  // ====== ${toolName} ======\n`;
  
  // Check if this is a braced case: the case line ends with ' {'
  let haveBraces = lines[0] && lines[0].trim().endsWith(' {');
  
  if (haveBraces) {
    // For format "case 'name':\n{" the opening brace is on the next line
    if (i < lines.length && lines[i].trim() === '{') {
      i = 2; // Skip the separate brace line
    }
  }
  
  result += `  if (name === '${toolName}') {\n`;
  
  // Add body lines with indentation adjustment
  // The case body starts at 6-space indent, we want min 2-space for handler body
  // Simply remove first 2 characters from each non-empty line
  for (; i < lines.length; i++) {
    let line = lines[i];
    
    // Check for closing brace of case block (at same indent as case statement)
    if (haveBraces && line.trim() === '}') {
      break;
    }
    
    if (!haveBraces && line.trim() === '') {
      continue; // Skip empty lines between non-braced cases
    }
    
    // Remove first 2 chars of indentation (from 6-space to 4-space min, etc.)
    if (line.length >= 2 && line[0] === ' ' && line[1] === ' ') {
      line = line.substring(2);
    } else if (line.trim() === '') {
      line = '';
    }
    
    result += line + '\n';
  }
  
  // Close the if block
  result += `  }\n`;
  
  return result;
}

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
    // Re-indent detectMaliciousPatterns for handler scope
    content += detectMaliciousFn.split('\n').map(l => {
      if (l.startsWith('      ')) return '  ' + l.substring(6);
      return '  ' + l.trimStart();
    }).join('\n') + '\n\n';
  }

  for (const toolName of toolNames) {
    const block = caseBlocks[toolName];
    if (!block) {
      console.warn(`WARNING: ${toolName} not found in switch cases, skipping`);
      continue;
    }
    content += convertCaseToIf(block, toolName) + '\n';
  }

  content += `  return { isError: true, content: [{ type: 'text', text: \`未知工具（${filename.replace('.js', '')}）: \${name}\` }] };\n}\n\nmodule.exports = { tools, handle };\n`;

  fs.writeFileSync(handlerPath, content, 'utf8');
  console.log(`Wrote ${filename} (${toolNames.length} tools)`);
}

console.log('\nDone!');
