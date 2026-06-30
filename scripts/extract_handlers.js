'use strict';

// Robust extraction: case-by-case using original server.js line ranges
const fs = require('fs');
const path = require('path');

const PROJ_DIR = path.join(__dirname, '..');
const SRC = path.join(PROJ_DIR, 'server.js');
const LINES = fs.readFileSync(SRC, 'utf8').split('\n');

// Read a range of lines (1-indexed) as a string
function readLines(start, end) {
  return LINES.slice(start - 1, end).join('\n');
}

// All tool case locations: { name, startLine, endLine }
// hand-collected from server.js grep output
const cases = {
  browser_open: [6362, 6401],
  browser_click: [6402, 6463],
  browser_click_audit: [6464, 6623],
  browser_type: [6624, 6688],
  browser_hover: [6689, 6694],
  browser_scroll: [6695, 6710],
  browser_press_key: [6711, 6737],
  browser_snapshot: [6738, 6804],
  browser_batch: [6805, 6864],
  browser_network: [6865, 6866],
  browser_network_detail: [6867, 6868],
  browser_har_export: [6869, 6870],
  debug_investigate: [6871, 6875],
  browser_console: [6876, 6881],
  browser_errors: [6882, 6905],
  browser_errors_clear: [6906, 6908],
  // detectMaliciousPatterns: 6915-6955 (attached to browser_eval)
  browser_eval: [6957, 6997],
  browser_dom: [6998, 7038],
  browser_highlight: [7039, 7048],
  browser_select: [7049, 7075],
  browser_storage: [7076, 7079],
  browser_debug_report: [7080, 7083],
  browser_screenshot: [7084, 7111],
  browser_screenshot_element: [7112, 7154],
  browser_navigate: [7155, 7186],
  browser_step: [7187, 7190],
  browser_wait: [7191, 7194],
  browser_assert: [7195, 7198],
  browser_flow: [7199, 7202],
  browser_instrument: [7203, 7206],
  browser_events: [7207, 7210],
  browser_events_clear: [7211, 7214],
  browser_trace_start: [7215, 7218],
  browser_trace_stop: [7219, 7222],
  browser_artifacts: [7223, 7224],
  browser_visual_baseline: [7225, 7228],
  browser_visual_compare: [7229, 7232],
  browser_visual_report: [7233, 7234],
  browser_a11y_check: [7235, 7238],
  browser_performance_check: [7239, 7242],
  browser_lighthouse_audit: [7243, 7245],
  browser_locator_validate: [7246, 7249],
  browser_locator_suggest: [7250, 7253],
  browser_artifacts_clear: [7254, 7255],
  browser_sessions: [7256, 7257],
  browser_session_create: [7258, 7268],
  browser_session_switch: [7269, 7288],
  browser_session_close: [7289, 7290],
  mcp_health_check: [7291, 7292],
  project_audit: [7293, 7294],
  mcp_self_test: [7295, 7296],
  validation_start: [7297, 7302],
  validation_check: [7303, 7309],
  validation_run: [7310, 7313],
  validation_suite_run: [7314, 7315],
  validation_element: [7316, 7319],
  validation_flow: [7320, 7323],
  validation_report: [7324, 7327],
  validation_report_export: [7328, 7329],
  validation_quick_run: [7330, 7333],
  validation_matrix: [7334, 7335],
  validation_decision: [7336, 7337],
  css_var_check: [7338, 7346],
  error_fix_suggestion: [7347, 7603],
  fix_verify: [7604, 7710],
  browser_verify_fix: [7711, 7961],
  ai_debug_investigate: [7962, 7963],
  benchmark_run: [7964, 7965],
  browser_find_element: [7966, 7969],
  browser_find_page: [7970, 7971],
  browser_cookies: [7972, 8015],
  browser_diagnose: [8016, 8279],
  browser_element_status: [8280, 8422],
  browser_quick_fix: [8423, 8743],
  browser_links: [8744, 8745],
  browser_traverse_menu: [8746, 8747],
  browser_full_regression: [8748, 8749],
  browser_deep_interact: [8750, 8775],
  auto_fix_pipeline: [8776, 8929],
  skill_mcp_validate: [8930, 8982],
  skill_mcp_sync: [8983, 9030],
  browser_trace_chain: [9031, 9034],
  backend_logs: [9035, 9039],
  // special: top-of-switch cases
  browser_errors_aggregate: [6349, 6352],
  browser_full_audit: [6353, 6355],
  error_summary_md: [6356, 6359],
  screenshot_diff: [6360, 6361],
};

// detectMaliciousPatterns function
const detectMaliciousCode = readLines(6915, 6955);

// Handler groupings (non-overlapping)
const handlers = {
  'browser.js': [
    'browser_open', 'browser_click', 'browser_click_audit', 'browser_type',
    'browser_hover', 'browser_scroll', 'browser_press_key', 'browser_snapshot',
    'browser_batch', 'browser_eval', 'browser_dom', 'browser_highlight',
    'browser_select', 'browser_navigate', 'browser_wait',
    'browser_assert', 'browser_flow', 'browser_instrument',
    'browser_events', 'browser_events_clear'
  ],
  'session.js': [
    'browser_sessions', 'browser_session_create', 'browser_session_switch',
    'browser_session_close'
  ],
  'evidence.js': [
    'browser_screenshot', 'browser_screenshot_element', 'browser_artifacts',
    'browser_artifacts_clear', 'browser_har_export', 'browser_step',
    'browser_trace_start', 'browser_trace_stop'
  ],
  'network.js': [
    'browser_network', 'browser_network_detail', 'browser_console',
    'browser_errors', 'browser_errors_clear', 'browser_storage',
    'browser_cookies'
  ],
  'validation.js': [
    'validation_start', 'validation_check', 'validation_run',
    'validation_suite_run', 'validation_element', 'validation_flow',
    'validation_report', 'validation_report_export', 'validation_quick_run',
    'validation_matrix', 'validation_decision'
  ],
  'diagnose.js': [
    'browser_diagnose', 'browser_debug_report', 'browser_element_status',
    'browser_quick_fix', 'browser_verify_fix', 'browser_errors_aggregate',
    'error_fix_suggestion', 'error_summary_md', 'debug_investigate'
  ],
  'visual.js': [
    'browser_visual_baseline', 'browser_visual_compare', 'browser_visual_report',
    'browser_a11y_check', 'screenshot_diff', 'browser_full_audit',
    'browser_performance_check', 'browser_lighthouse_audit'
  ],
  'locator.js': [
    'browser_find_element', 'browser_find_page', 'browser_locator_suggest',
    'browser_locator_validate'
  ],
  'system.js': [
    'project_audit', 'css_var_check', 'skill_mcp_validate', 'skill_mcp_sync',
    'browser_trace_chain', 'backend_logs', 'browser_full_regression',
    'browser_deep_interact', 'browser_links', 'browser_traverse_menu',
    'mcp_health_check', 'mcp_self_test', 'benchmark_run',
    'ai_debug_investigate', 'auto_fix_pipeline', 'fix_verify'
  ]
};

// Write each handler
for (const [filename, toolNames] of Object.entries(handlers)) {
  const handlerPath = path.join(PROJ_DIR, 'handlers', filename);
  
  let content = `'use strict';

// Handler: ${filename.replace('.js', '')}
// Extracted from server.js callTool switch statements

const tools = ${JSON.stringify(toolNames, null, 2)};

async function handle(name, args, deps) {
`;

  // Include detectMaliciousPatterns for the browser handler (used by browser_eval)
  if (filename === 'browser.js') {
    const fnLines = detectMaliciousCode.split('\n');
    for (const line of fnLines) {
      content += `  ${line}\n`;
    }
    content += '\n';
  }

  for (const name of toolNames) {
    const range = cases[name];
    if (!range) {
      console.warn(`WARNING: ${name} has no line range`);
      content += `\n  // ====== ${name} (MISSING) ======\n`;
      content += `  if (name === '${name}') {\n`;
      content += `    return deps.text('TODO: ${name} not extracted');\n`;
      content += `  }\n`;
      continue;
    }

    const caseLines = readLines(range[0], range[1]);
    // Remove the leading `    case 'xxx': ` / `    case 'xxx': {` part
    let body = caseLines.replace(/^    case\s+'[^']+':\s*\{?\s*/, '');
    // Remove trailing `    }` if present (closing brace of case block)
    body = body.replace(/\n    \}\s*$/, '');
    body = body.trimEnd();

    content += `\n  // ====== ${name} ======\n`;
    content += `  if (name === '${name}') {\n`;

    if (body) {
      const bodyLines = body.split('\n');
      for (const line of bodyLines) {
        if (line.trim() === '') {
          content += '\n';
        } else {
          // Dedent by 6 chars (original case body indentation)
          const dedented = line.replace(/^      /, '');
          content += `  ${dedented}\n`;
        }
      }
    }

    content += `  }\n`;
  }

  content += `
  return { isError: true, content: [{ type: 'text', text: \`未知工具（${filename.replace('.js', '')}）: \${name}\` }] };
}

module.exports = { tools, handle };
`;

  fs.writeFileSync(handlerPath, content, 'utf8');
  console.log(`Wrote ${handlerPath} (${toolNames.length} tools)`);
}

console.log('\nDone!');
