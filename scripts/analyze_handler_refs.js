const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'handlers');

// Known external variables from server.js scope (not local to handler)
const externals = [
  'page','browser','browserSessionId','consoleLogs','networkLogs','pageErrors',
  'currentCheckpoint','lastAction','eventCheckpoint','sessions','activeSessionName',
  'sessionCounter','traceLogs','traceActive','currentTraceName','backendProbeResults',
  'instrumentationEnabled','imageErrors','lastImageErrorCheckpoint','validationResults',
  'lastQualityChecks','lastValidationRun','requestStartTimes',
  'ensurePage','text','log','redact','resetRuntimeLogs','probeKnownEndpoints',
  'getUnifiedErrors','closeBrowserSession','listBrowserSessions','filterNetwork',
  'filterNetworkDetails','getStorageSnapshot','buildDebugReport','captureStepEvidence',
  'waitForCondition','assertPage','runFlow','installInstrumentation','getBrowserEvents',
  'clearBrowserEvents','startTrace','stopTrace','getArtifacts','clearArtifacts',
  'ensureArtifactsDir','screenshotWithRedaction','safeArtifactName',
  'analyzeScreenshotForErrors','analyzeScreenshotContent','exportHar','runFullAudit','visualBaseline',
  'visualCompare','visualReport','runA11yCheck','runPerformanceCheck','runLighthouseAudit',
  'findElement','findPage','suggestLocator','validateLocator','mcpHealthCheck',
  'projectAudit','mcpSelfTest','runValidationCheck','runValidationPlan',
  'runValidationElement','runValidationFlow','buildValidationReport','exportValidationReport',
  'runValidationQuickRun','runDeployVerify','investigateDebug','runBrowserFullRegression',
  'traverseMenu','fetchBackendLogs','buildTraceChain','detectSilentFailures',
  'browserOperator','evidenceCollector','deepInteractor','errorAggregator',
  'MAX_SESSIONS','SCREENSHOT_DIR','HAR_DIR','VISUAL_DIR','VISUAL_BASELINE_DIR',
  'VISUAL_ACTUAL_DIR','VISUAL_DIFF_DIR','TRACE_DIR','REPORT_DIR','VALIDATIONS_DIR',
  'PROJECT_ROOT','TOOLS_DIR','getPageLinks','postActionErrorCheck',
  'detectMaliciousPatterns'
];

// In the handler, these are local variables (not external):
// - name, args, deps (parameters)
// - detectMaliciousPatterns (defined locally in browser.js)
// - tools (module export)

const results = {};
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.js') || file === 'state.js') continue;
  const content = fs.readFileSync(path.join(dir, file), 'utf8');
  const lines = content.split('\n');
  const found = new Set();
  for (const line of lines) {
    // Skip comment lines
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    for (const ext of externals) {
      const re = new RegExp('\\b' + ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
      if (re.test(line)) found.add(ext);
    }
  }
  results[file] = [...found].sort();
}

for (const [file, refs] of Object.entries(results)) {
  console.log(file + ':');
  console.log('  ' + refs.join(', '));
  console.log();
}
