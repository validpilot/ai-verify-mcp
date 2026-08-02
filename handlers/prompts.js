'use strict';

// Handler: prompts (MCP Prompts 原语实现)
// 将 ValidPilot 核心 Skill 以斜杠命令形式暴露给 MCP 客户端。
// 每个 prompt 返回多步工作流指令文本，由 AI 模型按序执行。
// 与 docs/skills/ 下的 Skill 文档一一对应。

/**
 * Prompt 定义列表
 * 每个定义包含：
 * - name: prompt 名称（客户端中作为 /<name> 出现）
 * - description: 简短描述
 * - arguments: 参数列表 [{ name, description, required }]
 * - buildMessages: 函数，接收 args，返回 messages 数组
 */
const PROMPTS = [
  {
    name: 'validate-login',
    description: 'Validate a login flow end-to-end with evidence collection. Validates page opening, form filling, submission, redirect, and success state.',
    arguments: [
      { name: 'url', description: 'Login page URL (e.g. https://example.com/login)', required: true },
      { name: 'username', description: 'Test username', required: true },
      { name: 'password', description: 'Test password', required: true },
      { name: 'successIndicator', description: 'Success indicator: URL substring (e.g. "dashboard") or text (e.g. "Welcome")', required: false }
    ],
    buildMessages: (args) => {
      const { url, username, password, successIndicator = 'dashboard' } = args;
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Validate the login flow for ${url} with the following 7-step tool chain. Execute each step in order and verify the expected outcome before proceeding to the next.`,
            ``,
            `**Test credentials**:`,
            `- Username: ${username}`,
            `- Password: ${password}`,
            `- Success indicator: ${successIndicator}`,
            ``,
            `**Step 1: Open the login page**`,
            `Call: \`browser_open({ url: "${url}" })\``,
            `Expected: page loads without errors`,
            ``,
            `**Step 2: Capture page snapshot**`,
            `Call: \`browser_snapshot()\``,
            `Expected: form elements (#username, #password, submit button) are present`,
            ``,
            `**Step 3: Fill the login form**`,
            `Call: \`browser_form_fill({ url: "${url}", fields: { "#username": "${username}", "#password": "${password}" }, submit: false })\``,
            `Expected: fieldsFilled: 2, no errors`,
            ``,
            `**Step 4: Click the submit button**`,
            `Call: \`browser_click({ selector: "button[type='submit']" })\``,
            `Expected: click succeeds, beforeHash !== afterHash (page changed)`,
            ``,
            `**Step 5: Wait for navigation**`,
            `Call: \`browser_wait({ urlContains: "${successIndicator}", timeout: 10000 })\``,
            `Expected: URL changes to include "${successIndicator}"`,
            ``,
            `**Step 6: Assert login success**`,
            `Call: \`browser_assert({ urlContains: "${successIndicator}", noErrors: true, textContains: "${successIndicator}" })\``,
            `Expected: passed: true, all assertions pass`,
            ``,
            `**Step 7: Collect evidence**`,
            `Call: \`evidence({ mode: 'pack', name: "login-validation" })\``,
            `Expected: artifacts include screenshots, trace, HAR`,
            ``,
            `If any step fails, use \`browser_errors\` and \`browser_network({ mode: 'detail' })\` to diagnose. Report the failure with reproduction steps and root cause.`
          ].join('\n')
        }
      }];
    }
  },

  {
    name: 'audit-performance',
    description: 'Run a comprehensive performance audit: Lighthouse 4-dimension scoring, Core Web Vitals, performance trace, and memory leak detection.',
    arguments: [
      { name: 'url', description: 'Target URL to audit (e.g. https://example.com)', required: true },
      { name: 'formFactor', description: 'Device form factor: mobile or desktop (default: mobile)', required: false },
      { name: 'throttling', description: 'Enable 3G network throttling for mobile (default: true)', required: false }
    ],
    buildMessages: (args) => {
      const { url, formFactor = 'mobile', throttling = 'true' } = args;
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Run a comprehensive performance audit for ${url} using the following 5-step tool chain. Execute each step in order and collect all artifacts.`,
            ``,
            `**Audit configuration**:`,
            `- URL: ${url}`,
            `- Form factor: ${formFactor}`,
            `- Throttling: ${throttling} (3G simulation for mobile)`,
            ``,
            `**Step 1: Open the target page**`,
            `Call: \`browser_open({ url: "${url}" })\``,
            `Expected: page loads successfully`,
            ``,
            `**Step 2: Run Lighthouse audit**`,
            `Call: \`browser_lighthouse_audit({ url: "${url}", categories: ["performance", "accessibility", "best_practices", "seo"], formFactor: "${formFactor}", throttling: ${throttling} })\``,
            `Expected: 4 dimension scores (0-100), key metrics (LCP/CLS/FID/TBT/SI), diagnostic advice`,
            ``,
            `**Step 3: Collect Core Web Vitals and compare against budgets**`,
            `Call: \`browser_performance({ mode: 'check', budgets: { lcp: 2500, cls: 0.1, fcp: 1800, load: 3000, longTaskCount: 5 }, slowRequestMs: 1000 })\``,
            `Expected: Core Web Vitals ratings (good/needs-improvement/poor), budget pass/fail per metric`,
            ``,
            `**Step 4: Record full performance trace + HAR**`,
            `Call: \`browser_performance({ mode: 'trace', url: "${url}", categories: ["paint", "timing", "resource"], duration: 10000, enableScreenshots: true, exportHar: true })\``,
            `Expected: HAR file path, trace JSON, screenshots`,
            ``,
            `**Step 5: Detect memory leaks**`,
            `Call: \`browser_memory_check()\``,
            `Expected: leakRisk level (low/medium/high/critical), detached DOM count, JS heap size`,
            ``,
            `**Step 6: Collect evidence**`,
            `Call: \`evidence({ mode: 'pack', name: "performance-audit" })\``,
            `Expected: comprehensive audit report including Lighthouse HTML, HAR, trace, memory report`,
            ``,
            `After execution, summarize: ① Lighthouse scores ② Core Web Vitals rating ③ Memory leak risk ④ Top 3 optimization recommendations.`
          ].join('\n')
        }
      }];
    }
  },

  {
    name: 'audit-security',
    description: 'Run a comprehensive security audit: HTTP security headers, CSP analysis, OWASP Top 10, SQL injection, and XSS vulnerability scanning.',
    arguments: [
      { name: 'url', description: 'Target URL to audit (e.g. https://example.com)', required: true },
      { name: 'injectionUrl', description: 'URL with query parameters for injection testing (e.g. https://example.com/page?id=1)', required: false }
    ],
    buildMessages: (args) => {
      const { url, injectionUrl = url } = args;
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Run a comprehensive security audit for ${url} using the following 5-step tool chain. Only test authorized targets.`,
            ``,
            `**Audit scope**:`,
            `- Target URL: ${url}`,
            `- Injection test URL: ${injectionUrl} (must contain query parameters like ?id=1 or ?q=test)`,
            ``,
            `**Step 1: Check HTTP security response headers**`,
            `Call: \`security_scan({ mode: 'headers', url: "${url}" })\``,
            `Expected: presence and correctness of CSP, X-Content-Type-Options, X-Frame-Options, HSTS, Referrer-Policy`,
            ``,
            `**Step 2: Deep CSP analysis**`,
            `Call: \`security_scan({ mode: 'csp', url: "${url}" })\``,
            `Expected: CSP directive parsing, detection of unsafe-inline/unsafe-eval/wildcard *`,
            ``,
            `**Step 3: OWASP Top 10 quick scan**`,
            `Call: \`security_scan({ mode: 'owasp', url: "${url}" })\``,
            `Expected: risk categories A01-A10 status (pass/warn/fail) and overall risk level`,
            ``,
            `**Step 4: SQL injection scan**`,
            `Call: \`security_scan({ mode: 'sqli', url: "${injectionUrl}" })\``,
            `Expected: 20 SQLi payloads tested, vulnerable: true/false, dbms detection if vulnerable`,
            `Note: injectionUrl must contain query parameters (e.g. ?id=1)`,
            ``,
            `**Step 5: XSS vulnerability scan**`,
            `Call: \`security_scan({ mode: 'xss', url: "${injectionUrl}" })\``,
            `Expected: 26 XSS payloads tested, vulnerable: true/false, reflected payload evidence`,
            ``,
            `**Step 6: Collect evidence**`,
            `Call: \`evidence({ mode: 'pack', name: "security-audit" })\``,
            `Expected: comprehensive security audit report`,
            ``,
            `After execution, summarize findings by severity: ① blocking (must fix before launch) ② critical (strongly recommend) ③ major (short-term) ④ optimization. Include specific remediation for each finding.`
          ].join('\n')
        }
      }];
    }
  },

  {
    name: 'visual-regression',
    description: 'Set up and run visual regression testing: establish baseline, capture actual, compare with diff, generate report.',
    arguments: [
      { name: 'url', description: 'Target page URL (e.g. https://example.com)', required: true },
      { name: 'baselineName', description: 'Baseline name without extension (e.g. "home-page-baseline")', required: true },
      { name: 'selector', description: 'CSS selector for component-level comparison (optional, omit for full page)', required: false },
      { name: 'maxDiffPixelRatio', description: 'Allowed diff pixel ratio, 0-1 (default: 0.01 = 1%)', required: false }
    ],
    buildMessages: (args) => {
      const { url, baselineName, selector, maxDiffPixelRatio = '0.01' } = args;
      const isComponent = !!selector;
      const tool = isComponent ? 'browser_visual_component' : 'browser_visual';
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Run visual regression testing for ${url} using the following tool chain.`,
            ``,
            `**Test configuration**:`,
            `- URL: ${url}`,
            `- Baseline name: ${baselineName}`,
            `- Mode: ${isComponent ? 'component-level' : 'full-page'}`,
            `${isComponent ? `- Component selector: ${selector}` : ''}`,
            `- Max diff pixel ratio: ${maxDiffPixelRatio}`,
            ``,
            `**Step 1: Open the target page**`,
            `Call: \`browser_open({ url: "${url}" })\``,
            `Expected: page loads successfully`,
            ``,
            isComponent
              ? `**Step 2: Component-level visual comparison (one call)**\nCall: \`${tool}({ name: "${baselineName}", selector: "${selector}", maxDiffPixelRatio: ${maxDiffPixelRatio} })\`\nExpected: baseline_created: true (first time) or false (subsequent), diffPixels, diffRatio, passed flag`
              : `**Step 2a: Establish baseline (first time only)**\nCall: \`browser_visual({ mode: 'baseline', name: "${baselineName}", fullPage: true, maskSelectors: [".ad-banner", ".timestamp"] })\`\nExpected: baseline PNG created at visual/baselines/${baselineName}.png`,
            ``,
            !isComponent ? `**Step 2b: Compare against baseline (after UI changes)**\nCall: \`${tool}({ mode: 'compare', name: "${baselineName}", fullPage: true, maskSelectors: [".ad-banner", ".timestamp"], maxDiffPixelRatio: ${maxDiffPixelRatio} })\`\nExpected: diffPixels, diffRatio, passed (diffRatio <= maxDiffPixelRatio)` : '',
            ``,
            `**Step 3: List all visual artifacts**`,
            `Call: \`browser_visual({ mode: 'report' })\``,
            `Expected: list of baselines, actuals, diffs, and recent comparison results`,
            ``,
            `**Step 4: Collect evidence**`,
            `Call: \`evidence({ mode: 'pack', name: "visual-regression" })\``,
            `Expected: baseline PNG, actual PNG, diff PNG (red-highlighted), comparison report`,
            ``,
            `After execution, report: ① passed: true/false ② diffPixels and diffRatio ③ if failed, top 3 areas with most differences ④ recommendation (accept as new baseline / investigate / mask dynamic regions).`
          ].filter(Boolean).join('\n')
        }
      }];
    }
  },

  {
    name: 'debug-page',
    description: 'Diagnose a page issue: collect errors, network failures, console logs, generate root cause hypothesis and fix suggestions.',
    arguments: [
      { name: 'url', description: 'Problem page URL (e.g. https://example.com)', required: true },
      { name: 'symptom', description: 'Problem symptom description (e.g. "page shows blank after clicking login")', required: true },
      { name: 'expected', description: 'Expected behavior (e.g. "should redirect to dashboard")', required: false },
      { name: 'focus', description: 'URL/API keyword to focus on (e.g. /api/login)', required: false }
    ],
    buildMessages: (args) => {
      const { url, symptom, expected = 'normal behavior', focus = '' } = args;
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Diagnose the page issue at ${url} using the following 7-step debugging tool chain.`,
            ``,
            `**Issue description**:`,
            `- URL: ${url}`,
            `- Symptom: ${symptom}`,
            `- Expected: ${expected}`,
            `- Focus: ${focus || '(none)'}`,
            ``,
            `**Step 1: Open the problem page**`,
            `Call: \`browser_open({ url: "${url}" })\``,
            `Expected: page loads (may show error state)`,
            ``,
            `**Step 2: Clear old errors and establish checkpoint**`,
            `Call: \`browser_errors({ mode: 'clear' })\``,
            `Expected: clean checkpoint established`,
            ``,
            `**Step 3: Reproduce the issue**`,
            `Interact with the page to trigger the symptom. Use \`browser_click\`, \`browser_type\`, \`browser_form_fill\` as needed to reproduce the issue.`,
            `Expected: symptom manifests`,
            ``,
            `**Step 4: Run automated diagnosis**`,
            `Call: \`browser_debug({ mode: 'investigate', symptom: "${symptom}", expected: "${expected}", ${focus ? `focus: "${focus}", ` : ''}statusMin: 400, includeStorage: true, includeArtifacts: true })\``,
            `Expected: root cause hypotheses (ranked), evidence chain (errors + network + DOM + storage), next-step suggestions`,
            ``,
            `**Step 5: Review unified errors**`,
            `Call: \`browser_errors({ ${focus ? `urlContains: "${focus}", ` : ''}statusMin: 400, includeWarnings: false })\``,
            `Expected: Console errors, PageErrors, HTTP 4xx/5xx, silent failures`,
            ``,
            `**Step 6: Inspect failed network requests**`,
            `Call: \`browser_network({ mode: 'detail', ${focus ? `urlContains: "${focus}", ` : ''}statusMin: 400 })\``,
            `Expected: request/response headers, body (redacted), duration, failure reason`,
            ``,
            `**Step 7: Get fix suggestions**`,
            `Call: \`error_analyze({ mode: 'fix', errorSummary: "${symptom}", contextFiles: [] })\``,
            `Expected: up to 3 minimal fix suggestions (does NOT auto-modify code)`,
            ``,
            `**Step 8: Collect evidence**`,
            `Call: \`evidence({ mode: 'pack', stepId: "debug-investigation", label: "issue diagnosis evidence" })\``,
            `Expected: comprehensive evidence pack with screenshots, DOM, errors, network, console`,
            ``,
            `After execution, report: ① Top hypothesis (most likely root cause) ② Supporting evidence ③ Recommended fix (from error_analyze) ④ Verification steps to confirm the fix.`
          ].join('\n')
        }
      }];
    }
  },

  {
    name: 'e2e-flow',
    description: 'Run an end-to-end acceptance test with multiple cases: execute validation_run, collect evidence index, generate six-section report, export HTML.',
    arguments: [
      { name: 'url', description: 'Entry URL for the E2E flow (e.g. https://example.com)', required: true },
      { name: 'flowName', description: 'Acceptance plan name (e.g. "user-signup-flow")', required: true },
      { name: 'flowDescription', description: 'Brief flow description (e.g. "user signs up, verifies email, completes profile")', required: false }
    ],
    buildMessages: (args) => {
      const { url, flowName, flowDescription = '' } = args;
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Run an end-to-end acceptance test for the flow starting at ${url}.`,
            ``,
            `**Flow configuration**:`,
            `- Entry URL: ${url}`,
            `- Plan name: ${flowName}`,
            `- Description: ${flowDescription || '(not specified)'}`,
            ``,
            `**Step 1: Design test cases**`,
            `Based on the URL and flow description, design 2-3 test cases:`,
            `  - Happy path: normal user flow should succeed`,
            `  - Error path: invalid input should be rejected with proper error message`,
            `  - Edge case: boundary conditions (empty fields, max length, special characters)`,
            ``,
            `Each case should follow the 5-step link closure criteria:`,
            `  1. Entry accessibility (navigate succeeds)`,
            `  2. Operability (elements are clickable/typeable)`,
            `  3. Correct request (right API calls fire)`,
            `  4. Normal response (expected response received)`,
            `  5. Status update (UI/state changes as expected)`,
            ``,
            `**Step 2: Execute the acceptance plan**`,
            `Call: \`validation_run({`,
            `  name: "${flowName}",`,
            `  cases: [ /* designed cases */ ],`,
            `  clearErrors: true,`,
            `  instrument: true,`,
            `  trace: true,`,
            `  har: true,`,
            `  investigateOnFailure: true,`,
            `  continueOnFailure: true`,
            `})\``,
            `Expected: runId, case pass/fail stats, trace/har/report paths`,
            ``,
            `**Step 3: Build evidence timeline**`,
            `Call: \`evidence({ mode: 'index', includeTraceIds: true })\``,
            `Expected: cross-step evidence timeline linked by runId`,
            ``,
            `**Step 4: Generate six-section Markdown report**`,
            `Call: \`validation_report({ format: "markdown", strictSchema: true })\``,
            `Expected: report with 6 sections: Summary / Toolchain / Findings / NetworkEvidence / Artifacts / Unclassified`,
            ``,
            `**Step 5: Export HTML report**`,
            `Call: \`validation_report({ mode: 'export' })\``,
            `Expected: local HTML report path for archival`,
            ``,
            `After execution, summarize: ① Total cases and pass rate ② Critical/blocking findings (if any) ③ Network evidence highlights ④ Recommendation (pass / fix and retest / block release).`
          ].join('\n')
        }
      }];
    }
  },

  {
    name: 'submit-form',
    description: 'Validate any web form end-to-end: open page, detect validation rules, fill fields, submit, assert feedback, collect evidence. Covers registration, contact, search, and settings forms (not login-specific).',
    arguments: [
      { name: 'url', description: 'Target form page URL (e.g. https://example.com/register)', required: true },
      { name: 'fields', description: 'Field-value mapping object. Keys can be CSS selectors (e.g. "#email") or field names (e.g. "email"). Example: { "#email": "user@test.com", "#password": "Pass1234!" }', required: true },
      { name: 'formSelector', description: 'Form CSS selector (default: "form"). Specify when page has multiple forms.', required: false },
      { name: 'submitSelector', description: 'Submit button selector (default: "button[type=submit]"). Specify when the submit button uses a different selector.', required: false },
      { name: 'expectedText', description: 'Expected success text on the post-submit page (e.g. "Submitted successfully").', required: false },
      { name: 'expectedUrlContains', description: 'Expected URL substring after submission (e.g. "thank-you" or "success").', required: false }
    ],
    buildMessages: (args) => {
      const { url, fields, formSelector = 'form', submitSelector = "button[type='submit']", expectedText = '', expectedUrlContains = '' } = args;
      const fieldsJson = JSON.stringify(fields);
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Validate the form submission flow for ${url} with the following 7-step tool chain. Execute each step in order and verify the expected outcome before proceeding to the next.`,
            ``,
            `**Form configuration**:`,
            `- URL: ${url}`,
            `- Form selector: ${formSelector}`,
            `- Submit selector: ${submitSelector}`,
            `- Fields: ${fieldsJson}`,
            `- Expected text: ${expectedText || '(not specified)'}`,
            `- Expected URL contains: ${expectedUrlContains || '(not specified)'}`,
            ``,
            `**Step 1: Open the form page**`,
            `Call: \`browser_open({ url: "${url}" })\``,
            `Expected: page loads without errors, form is visible`,
            ``,
            `**Step 2: Capture page snapshot**`,
            `Call: \`browser_snapshot()\``,
            `Expected: form elements (${formSelector} and its inputs) are present`,
            ``,
            `**Step 3: Detect form validation rules**`,
            `Call: \`browser_form_validate({ url: "${url}", formSelector: "${formSelector}", checkRequired: true, checkPattern: true, checkLength: true })\``,
            `Expected: list of fields with required/pattern/length rules, any missing-rule issues flagged`,
            ``,
            `**Step 4: Fill the form fields (do NOT auto-submit)**`,
            `Call: \`browser_form_fill({ url: "${url}", fields: ${fieldsJson}, submit: false })\``,
            `Expected: fieldsFilled matches the number of keys in fields, no errors`,
            ``,
            `**Step 5: Click the submit button**`,
            `Call: \`browser_click({ selector: "${submitSelector}" })\``,
            `Expected: click succeeds, page navigates or shows feedback`,
            ``,
            `**Step 6: Assert submission feedback**`,
            `Call: \`browser_assert({ ${expectedUrlContains ? `urlContains: "${expectedUrlContains}", ` : ''}${expectedText ? `textContains: "${expectedText}", ` : ''}noErrors: true })\``,
            `Expected: passed: true, all assertions pass (URL/text/noErrors)`,
            ``,
            `**Step 7: Collect evidence**`,
            `Call: \`evidence({ mode: 'pack', name: "form-submission" })\``,
            `Expected: artifacts include form-before/after screenshots, trace, validation report`,
            ``,
            `If any step fails, use \`browser_errors\` and \`browser_network({ mode: 'detail' })\` to diagnose. Test both paths: ① valid data should submit successfully ② invalid data (empty required fields, wrong format) should be rejected with proper error messages.`
          ].join('\n')
        }
      }];
    }
  }
];

/**
 * List all available prompts (for prompts/list MCP method)
 * @returns {Array} Array of prompt metadata (without buildMessages)
 */
function listPrompts() {
  return PROMPTS.map(p => ({
    name: p.name,
    description: p.description,
    arguments: p.arguments
  }));
}

/**
 * Get a specific prompt with rendered messages (for prompts/get MCP method)
 * @param {string} name - Prompt name
 * @param {Object} args - Arguments object
 * @returns {Object} { messages: [{ role, content: { type, text } }] }
 * @throws {Error} If prompt not found or required arguments missing
 */
function getPrompt(name, args = {}) {
  const prompt = PROMPTS.find(p => p.name === name);
  if (!prompt) {
    throw new Error(`Unknown prompt: ${name}. Available prompts: ${PROMPTS.map(p => p.name).join(', ')}`);
  }

  // Validate required arguments
  const missing = prompt.arguments
    .filter(a => a.required && !args[a.name])
    .map(a => a.name);
  if (missing.length > 0) {
    throw new Error(`Missing required arguments for prompt "${name}": ${missing.join(', ')}`);
  }

  return { messages: prompt.buildMessages(args) };
}

module.exports = {
  PROMPTS,
  listPrompts,
  getPrompt
};
