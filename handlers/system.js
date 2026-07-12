'use strict';

// Handler: system
// Extracted from server.js callTool switch statements

const { mcpError } = require('../core/mcp-error');

const tools = [
  "project_audit",
  "css_var_check",
  "skill_mcp_validate",
  "browser_trace_chain",
  "browser_full_regression",
  "browser_form_fill",
  "browser_links",
  "browser_traverse_menu",
  "mcp_health_check",
  "mcp_self_test"
];

async function handle(name, args, deps) {

  // === Destructure deps into local scope (replacing globalThis bridge) ===
  let { page, browser, browserSessionId, consoleLogs, networkLogs, pageErrors, currentCheckpoint, eventCheckpoint, lastAction, sessions, activeSessionName, sessionCounter, traceLogs, traceActive, currentTraceName, backendProbeResults, instrumentationEnabled, imageErrors, lastImageErrorCheckpoint, validationResults, lastQualityChecks, lastValidationRun, requestStartTimes, stateManager } = deps;
  const { MAX_SESSIONS, SCREENSHOT_DIR, HAR_DIR, VISUAL_DIR, VISUAL_BASELINE_DIR, VISUAL_ACTUAL_DIR, VISUAL_DIFF_DIR, VALIDATIONS_DIR, REPORT_DIR, LOG_FILE, PROJECT_ROOT, TOOLS_DIR, logger, ensurePage, text, log, resetRuntimeLogs, getPageLinks, postActionErrorCheck, probeKnownEndpoints, getUnifiedErrors, closeBrowserSession, listBrowserSessions, filterNetwork, filterNetworkDetails, getStorageSnapshot, buildDebugReport, captureStepEvidence, waitForCondition, assertPage, runFlow, installInstrumentation, getBrowserEvents, clearBrowserEvents, startTrace, stopTrace, getArtifacts, clearArtifacts, ensureArtifactsDir, getBackendProbeEndpoints, isCloudApiProbeTarget, screenshotWithRedaction, safeArtifactName, analyzeScreenshotForErrors, exportHar, runFullAudit, visualBaseline, visualCompare, visualReport, runA11yCheck, runPerformanceCheck, runLighthouseAudit, findElement, findPage, suggestLocator, validateLocator, mcpHealthCheck, projectAudit, mcpSelfTest, runValidationCheck, runValidationPlan, runValidationElement, runValidationFlow, buildValidationReport, exportValidationReport, runValidationQuickRun, runDeployVerify, investigateDebug, runBrowserFullRegression, traverseMenu, fetchBackendLogs, buildTraceChain, detectSilentFailures, redact, redactString, isSensitiveKey, trimTraceLogs, genSpanId, genTraceId, browserOperator, evidenceCollector, deepInteractor, errorAggregator, path, fs, execSync, callTool } = deps;
  try {
  // ====== project_audit ======
  if (name === 'project_audit') {
  const _auditResult = await projectAudit(args);
  return text(JSON.stringify({ ..._auditResult, nextSteps: ['使用 browser_full_audit 执行完整审计', '使用 browser_performance_check 检查性能'], paidUpgradeHint: '需要深度项目审计、自动修复建议、合规性检查？升级到 Pro 版本获取完整审计能力。' }, null, 2));
  }

  // ====== css_var_check ======
  if (name === 'css_var_check') {
const cssAnalyzer = require('./scripts/css-var-analyzer');
    const css = args.css;
    if (!css) {
      return text(JSON.stringify({ error: '缺少 css 参数' }, null, 2));
    }
    const _cssResult = cssAnalyzer.analyzeCSS(css, args.filePath || 'inline');
    return text(JSON.stringify({ ..._cssResult, nextSteps: ['使用 project_audit 执行项目审计', '使用 browser_screenshot 截图验证'], paidUpgradeHint: '需要自动 CSS 变量分析、样式冲突检测、主题一致性检查？升级到 Pro 版本获取智能 CSS 分析能力。' }, null, 2));
  }

  // ====== skill_mcp_validate ======
  if (name === 'skill_mcp_validate') {
  try {
      const { skillName: validateSkillName, mode = 'strict' } = args;
      if (!validateSkillName) {
        return text(JSON.stringify({ passed: false, error: '缺少必需参数: skillName' }, null, 2));
      }
      const skillToolsPath = path.join(PROJECT_ROOT, '.trae', 'skills', validateSkillName, 'SKILL.tools.json');
      if (!fs.existsSync(skillToolsPath)) {
        return text(JSON.stringify({ passed: false, error: `Skill ${validateSkillName} 的 SKILL.tools.json 不存在` }, null, 2));
      }
      const skillTools = JSON.parse(fs.readFileSync(skillToolsPath, 'utf8'));
      const toolFiles = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
      const availableTools = toolFiles.map(f => path.basename(f, '.json'));
      const availableSet = new Set(availableTools);
      const missingTools = [];
      const referencedTools = Object.keys(skillTools.tools);
      for (const toolName of referencedTools) {
        if (!availableSet.has(toolName)) {
          missingTools.push({
            toolName,
            phase: skillTools.tools[toolName].phase,
            missingType: availableTools.includes(toolName) ? 'schema_mismatch' : 'not_found'
          });
        }
      }
      const capabilityIssues = [];
      if (skillTools.capabilities) {
        for (const cap of skillTools.capabilities) {
          const capMissing = cap.requiredTools.filter(t => !availableSet.has(t));
          if (capMissing.length > 0) {
            capabilityIssues.push({
              capability: cap.name,
              description: cap.description,
              missingTools: capMissing
            });
          }
        }
      }
      const passed = missingTools.length === 0 && capabilityIssues.length === 0;
      const result = {
        passed: mode === 'strict' ? passed : true,
        mode,
        skillName: validateSkillName,
        missingTools,
        capabilityIssues,
        availableTools,
        totalReferenced: referencedTools.length,
        totalAvailable: availableTools.length
      };
      if (mode === 'warn' && !passed) {
        result.warning = 'Skill-MCP 存在不一致，已标记警告';
      }
      return text(JSON.stringify({ ...result, nextSteps: ['使用 mcp_self_test 执行完整自测', '使用 project_audit 执行项目审计'], paidUpgradeHint: '需要更全面的 MCP 验证、自定义规则、持续集成支持？升级到 Pro 版本获取完整验证能力。' }, null, 2));
    } catch (err) {
      return text(JSON.stringify({ passed: false, error: err.message }, null, 2));
    }
  }

  // ====== browser_trace_chain ======
  if (name === 'browser_trace_chain') {
const _traceResult = buildTraceChain(args);
    return text(JSON.stringify({ ..._traceResult, nextSteps: ['使用 trace_correlate 关联分析', '使用 evidence_pack 打包证据'], paidUpgradeHint: '需要全链路追踪、跨服务关联分析、性能瓶颈自动定位？升级到 Pro 版本获取完整追踪能力。' }, null, 2));
  }

  // ====== browser_full_regression ======
  if (name === 'browser_full_regression') {
  const _regressionResult = await runBrowserFullRegression(args);
  return text(JSON.stringify({ ..._regressionResult, nextSteps: ['使用 validation_report 查看回归报告', '使用 browser_smoke_test 执行冒烟测试'], paidUpgradeHint: '需要完整回归测试套件、AI 驱动测试生成、多环境并行回归？升级到 Team 版本获取企业级回归能力。' }, null, 2));
  }

  // ====== browser_form_fill ======
  if (name === 'browser_form_fill') {
    const { target } = await ensurePage();
    const url = args.url;
    if (url) {
      await target.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 1500));
    }
    // autoFillForm 在 deepInteractor 中
    const autoFillResult = await deepInteractor.autoFillForm(target, args.selector || 'form', args.fields || {});
    let submitResult = null;
    if (args.submit !== false) {
      const submitSelector = args.submitSelector || 'button[type="submit"], input[type="submit"]';
      try {
        await target.locator(submitSelector).first().click({ timeout: 5000 });
        await new Promise(r => setTimeout(r, 1500));
        submitResult = {
          clicked: submitSelector,
          urlAfterSubmit: target.url(),
          titleAfterSubmit: await target.title().catch(() => ''),
        };
      } catch (e) {
        submitResult = { clicked: submitSelector, error: e.message };
      }
    }
    return text(JSON.stringify({ filled: autoFillResult, submit: submitResult, nextSteps: ['使用 browser_click 提交表单', '使用 browser_form_validate 验证表单'], suggestions: [{ type: 'next', tool: 'browser_form_validate', reason: '验证表单填写是否有效' }], paidUpgradeHint: '需要智能表单填写、自动生成测试数据、多表单批量填充？升级到 Pro 版本获取智能表单能力。' }, null, 2));
  }

  // ====== browser_links ======
  if (name === 'browser_links') {
  const _linksResult = await getPageLinks(args);
  return text(JSON.stringify({ ..._linksResult, nextSteps: ['使用 browser_click 点击链接验证', '使用 browser_snapshot 查看链接后页面'], paidUpgradeHint: '需要链接智能分类、死链检测、自动链接验证？升级到 Pro 版本获取智能链接分析能力。' }, null, 2));
  }

  // ====== browser_traverse_menu ======
  if (name === 'browser_traverse_menu') {
  const _menuResult = await traverseMenu(args);
  return text(JSON.stringify({ ..._menuResult, nextSteps: ['使用 browser_snapshot 查看菜单后页面', '使用 browser_find_element 查找菜单内容'], paidUpgradeHint: '需要智能菜单遍历、自动生成菜单结构图、多级菜单深度测试？升级到 Pro 版本获取智能菜单分析能力。' }, null, 2));
  }

  // ====== mcp_health_check ======
  if (name === 'mcp_health_check') {
  const _healthResult = mcpHealthCheck();
  return text(JSON.stringify({ ..._healthResult, nextSteps: ['使用 mcp_self_test 执行完整自测'], paidUpgradeHint: '需要健康监控、自动恢复、性能指标仪表盘？升级到 Pro 版本获取完整监控能力。' }, null, 2));
  }

  // ====== mcp_self_test ======
  if (name === 'mcp_self_test') {
  const _selfTestResult = await mcpSelfTest(args);
  return text(JSON.stringify({ ..._selfTestResult, nextSteps: ['使用 mcp_health_check 检查服务状态'], paidUpgradeHint: '需要全面的 MCP 自测、自动化测试报告、性能基准对比？升级到 Pro 版本获取完整测试能力。' }, null, 2));
  }

  return mcpError(`未知工具（system）: ${name}`, { error: 'UNKNOWN_TOOL', toolName: name });
  } finally {
    Object.assign(deps, { page, browser, browserSessionId, consoleLogs, networkLogs, pageErrors, currentCheckpoint, eventCheckpoint, lastAction, sessions, activeSessionName, sessionCounter, traceLogs, traceActive, currentTraceName, backendProbeResults, instrumentationEnabled, imageErrors, lastImageErrorCheckpoint, validationResults, lastQualityChecks, lastValidationRun, requestStartTimes, stateManager });
  }

}

module.exports = { tools, handle };
