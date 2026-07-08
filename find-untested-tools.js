const fs = require('fs');
const path = require('path');

const testedTools = new Set([
  'mcp_health_check', 'mcp_self_test', 'project_audit', 'css_var_check', 'browser_links',
  'browser_open', 'browser_snapshot', 'browser_dom', 'browser_find_element', 'browser_find_page',
  'browser_screenshot', 'browser_screenshot_element', 'browser_network', 'browser_network_detail',
  'browser_console', 'browser_errors', 'browser_errors_clear', 'browser_storage', 'browser_cookies',
  'browser_navigate', 'browser_wait', 'browser_eval', 'browser_type', 'browser_hover', 'browser_scroll',
  'browser_press_key', 'browser_select', 'browser_highlight', 'browser_assert', 'browser_batch',
  'browser_instrument', 'browser_events', 'browser_events_clear', 'browser_form_validate', 'browser_chain',
  'browser_aria_snapshot', 'browser_aria_click', 'browser_aria_type', 'browser_smart_fill', 'browser_matrix_test',
  'browser_overlay_detect', 'browser_overlay_dismiss', 'browser_trace_chain', 'browser_full_regression',
  'browser_form_fill', 'browser_traverse_menu', 'browser_click_audit',
  'validation_check', 'validation_quick_run', 'validation_start', 'validation_run', 'validation_element',
  'validation_flow', 'validation_chain', 'validation_report', 'validation_report_export', 'browser_smoke_test',
  'browser_counterfactual_analyze', 'validation_matrix', 'validation_decision', 'validation_compliance',
  'validation_data_integrity', 'validation_permission', 'state_diff_assert', 'chain_spec_run', 'chain_list_templates',
  'trace_correlation_check',
  'evidence_index', 'evidence_pack', 'browser_artifacts', 'browser_artifacts_clear', 'browser_har_export',
  'browser_step', 'browser_trace_start', 'browser_trace_stop', 'trace_correlate',
  'asset_routes_discover', 'asset_endpoint_enum', 'asset_endpoint_probe',
  'browser_locator_suggest', 'browser_locator_validate',
  'browser_diagnose', 'browser_anti_bot_detect', 'browser_debug_report', 'browser_element_status',
  'browser_quick_fix', 'browser_verify_fix', 'browser_errors_aggregate', 'error_fix_suggestion',
  'error_summary_md', 'debug_investigate',
  'arch_reverse_probe',
  'atl_learn', 'atl_fix',
  'correlate_triple_check', 'bypass_login',
  'exploration_quick', 'business_loop_validate',
  'browser_data_compare', 'dual_chain_explore', 'memory_recall', 'skill_mcp_validate'
]);

const handlersDir = path.join(__dirname, 'handlers');
const allTools = new Set();

fs.readdirSync(handlersDir).forEach(file => {
  if (file.endsWith('.js')) {
    const content = fs.readFileSync(path.join(handlersDir, file), 'utf8');
    const match = content.match(/const tools = \[([\s\S]*?)\];/);
    if (match) {
      const toolArrayStr = match[1];
      const toolNames = toolArrayStr.match(/"([^"]+)"/g);
      if (toolNames) {
        toolNames.forEach(name => {
          allTools.add(name.replace(/"/g, ''));
        });
      }
    }
  }
});

const untested = [...allTools].filter(t => !testedTools.has(t)).sort();
console.log('Total registered tools:', allTools.size);
console.log('Tested tools:', testedTools.size);
console.log('Untested tools:', untested.length);
console.log('\nUntested tool list:');
untested.forEach(t => console.log('  -', t));