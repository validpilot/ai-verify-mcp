'use strict';

const { DualChainOrchestrator } = require('./orchestrator/dual_chain_orchestrator');

function log(level, message, data) {
  console.log(`[${level}] ${message}`, data || '');
}

async function callTool(name, args) {
  console.log(`[ToolCall] ${name}`, JSON.stringify(args).slice(0, 100));
  
  if (name === 'browser_navigate') {
    return { url: args.url };
  }
  if (name === 'browser_wait') {
    await new Promise(r => setTimeout(r, args.ms || 1000));
    return { success: true };
  }
  if (name === 'browser_snapshot') {
    return { elements: [{ text: 'Example Domain', selector: 'h1' }] };
  }
  if (name === 'browser_dom') {
    return { nodes: [{ text: 'Example Domain', tag: 'h1' }] };
  }
  if (name === 'browser_links') {
    return { links: [{ text: 'More information...', href: '/about' }] };
  }
  if (name === 'browser_find_element') {
    return { elements: [{ text: 'More information...', selector: 'a' }], count: 1 };
  }
  if (name === 'browser_click') {
    return { success: true };
  }
  if (name === 'browser_type') {
    return { success: true };
  }
  if (name === 'browser_screenshot') {
    return { imageData: 'base64-encoded-image' };
  }
  if (name === 'browser_errors') {
    return { errors: [] };
  }
  if (name === 'browser_network') {
    return { requests: [{ url: 'https://example.com/', status: 200, method: 'GET' }] };
  }
  if (name === 'browser_console') {
    return { logs: [] };
  }
  if (name === 'browser_network_detail') {
    return { url: 'https://example.com/', status: 200, method: 'GET' };
  }
  if (name === 'browser_har_export') {
    return { path: '/tmp/test.har' };
  }
  if (name === 'browser_smart_fill') {
    return { success: true };
  }
  if (name === 'browser_eval') {
    return 'test-value';
  }
  if (name === 'backend_logs') {
    return { logs: [], upgradeRequired: true };
  }
  if (name === 'error_summary_md') {
    return null;
  }
  if (name === 'auto_fix_pipeline') {
    return { status: 'completed', findings: args.findings };
  }

  return { success: true };
}

async function main() {
  console.log('========================================');
  console.log('Dual Chain Explore Core Logic Test');
  console.log('========================================\n');

  try {
    const orchestrator = new DualChainOrchestrator({
      callTool: callTool,
      log: log,
      maxIterations: 3
    });

    console.log('🚀 Starting dual chain exploration...\n');
    
    const result = await orchestrator.execute('https://example.com', {
      chains: ['functional', 'technical'],
      explorationMode: 'normal',
      autoFix: false
    });

    console.log('\n✅ Dual chain exploration completed!');
    console.log('========================================');
    console.log('Session ID:', result.sessionId);
    console.log('Target:', result.target);
    console.log('\n=== Chain Results ===');
    console.log('Functional:', result.chains.functional?.status || 'N/A');
    console.log('  - Features:', result.chains.functional?.features || 0);
    console.log('  - Findings:', result.chains.functional?.findings || 0);
    console.log('Technical:', result.chains.technical?.status || 'N/A');
    console.log('  - Features:', result.chains.technical?.features || 0);
    console.log('  - Findings:', result.chains.technical?.findings || 0);
    
    console.log('\n=== Cross Validation ===');
    console.log('Verdict:', result.crossValidation?.verdict?.label || 'N/A');
    console.log('Description:', result.crossValidation?.verdict?.description || 'N/A');
    console.log('Total Breaks:', result.crossValidation?.summary?.totalBreaks || 0);
    console.log('Critical:', result.crossValidation?.summary?.critical || 0);
    console.log('High:', result.crossValidation?.summary?.high || 0);
    
    console.log('\n=== Synthesis ===');
    console.log('Total Findings:', result.synthesis?.report?.totalFindings || 0);
    console.log('By Severity:', JSON.stringify(result.synthesis?.report?.bySeverity || {}));
    
    console.log('\n=== Timing ===');
    console.log('Total:', result.timing?.totalMs || 0, 'ms');
    
    console.log('\n========================================');
    console.log('✅ Dual Chain Core Logic Test PASSED');
    console.log('========================================');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();