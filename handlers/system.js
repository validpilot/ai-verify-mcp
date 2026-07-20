'use strict';

// Handler: system
// Extracted from server.js callTool switch statements

const { mcpError, mcpParamMissing } = require('../core/mcp-error');

const tools = [
  "project_audit",
  "css_var_check",
  "skill_validate",
  "skill_mcp_validate",
  "browser_trace_chain",
  "browser_full_regression",
  "browser_form_fill",
  "browser_links",
  "browser_traverse_menu",
  "mcp_diag",
  "mcp_health_check",
  "mcp_self_test",
  "skill_tools_map",
  "skill_consistency_check"
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

  // ====== skill_validate ======
  // v1.9.5 起合并 skill_consistency_check / skill_mcp_validate / skill_tools_map
  if (name === 'skill_validate') {
    const mode = args.mode || 'consistency';
    if (mode === 'consistency') {
      const { strictMode = 'strict', skillName: filterSkill } = args;
      return handle('skill_consistency_check', { mode: strictMode, skillName: filterSkill }, deps);
    }
    if (mode === 'mcp_validate') {
      const { skillName, strictMode = 'strict' } = args;
      return handle('skill_mcp_validate', { skillName, mode: strictMode }, deps);
    }
    if (mode === 'tools_map') {
      const { skillName, toolName, includeDetails } = args;
      return handle('skill_tools_map', { skillName, toolName, includeDetails }, deps);
    }
    return text(JSON.stringify({ error: `未知 mode: ${mode}，可选 consistency / mcp_validate / tools_map` }, null, 2));
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
  // v1.9.5 起合并 browser_smart_fill（mode=smart）
  if (name === 'browser_form_fill') {
    const mode = args.mode || 'basic';

    // mode=smart：等价于已废弃的 browser_smart_fill
    if (mode === 'smart') {
      const { target } = await ensurePage(args);
      if (!args.selector) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, mode: 'smart', error: 'smart 模式需要 selector 参数' }, null, 2) }] };
      }
      const dataGen = require('../hands/data_generator');
      const fieldType = args.fieldType || 'text';
      if (!dataGen.isSupported(fieldType)) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, mode: 'smart', error: `不支持的字段类型: ${fieldType}。支持: ${dataGen.getSupportedTypes().join(', ')}` }, null, 2) }] };
      }
      const generatedValue = dataGen.generate(fieldType, args.options || {});
      const el = await target.$(args.selector);
      if (!el) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, mode: 'smart', error: `元素未找到: ${args.selector}` }, null, 2) }] };
      }
      await el.click();
      await el.fill('');
      await el.fill(generatedValue);
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, mode: 'smart', selector: args.selector, fieldType, value: generatedValue }, null, 2) }] };
    }

    // mode=basic（默认）：原有逻辑
    const { target } = await ensurePage();
    const url = args.url;
    if (!url) return mcpParamMissing('url', name, '请提供目标页面 URL');
    if (url) {
      await target.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(r => setTimeout(r, 1500));
    }

    // 支持两种 fields 格式：
    // 1. 对象模式 {fieldName: value} - 用字段 name/id 匹配（传给 autoFillForm）
    // 2. 数组模式 [{name, value}] - 转为对象后处理
    let rawFields = {};
    if (Array.isArray(args.fields)) {
      for (const f of args.fields) {
        if (f && f.name) rawFields[f.name] = f.value;
      }
    } else if (typeof args.fields === 'object') {
      rawFields = args.fields || {};
    }

    // preserveValue 模式：只填用户指定字段，跳过自动生成
    const preserveValue = args.preserveValue === true;
    if (preserveValue) {
      rawFields._preserveOnly = true;
    }

    const selectorFields = {};   // CSS 选择器模式的字段
    const nameFields = {};       // 字段 name 模式的字段（传给 autoFillForm）
    const isSimpleIdentifier = /^[a-zA-Z_][a-zA-Z0-9_\-]*$/;
    for (const [key, val] of Object.entries(rawFields)) {
      if (key === '_preserveOnly') continue;
      if (isSimpleIdentifier.test(key)) {
        nameFields[key] = val;
      } else {
        selectorFields[key] = val;
      }
    }

    // 先处理 CSS 选择器模式的字段（直接用 Playwright 定位）
    const selectorResults = [];
    // selector → input.name/id 映射，用于同步到 nameFields 防止 autoFillForm 用 mock 数据覆盖用户值
    const selectorFilledNames = {};
    for (const [selector, value] of Object.entries(selectorFields)) {
      try {
        const locator = target.locator(selector).first();
        await locator.fill(String(value), { timeout: 10000 });
        selectorResults.push({ selector, value, filled: true });
        // 读取该 selector 对应 input 的 name/id，避免 autoFillForm 用 mock 数据覆盖用户指定的值
        try {
          const fieldName = await locator.evaluate(el => el.name || el.id || '').catch(() => '');
          if (fieldName) selectorFilledNames[selector] = fieldName;
        } catch (_) { /* ignore read error — 字段已填，仅无法同步 name */ }
      } catch (e) {
        const msg = String(e?.message || e);
        if (/timeout|Timeout/i.test(msg)) {
          selectorResults.push({ selector, value, filled: false, error: `元素未找到或不可交互: ${selector}` });
        } else {
          selectorResults.push({ selector, value, filled: false, error: msg });
        }
      }
    }

    // 将 selector 已填充的字段同步到 nameFields（用用户指定的值），防止 autoFillForm 用 mock 数据覆盖
    // 原理：autoFillForm 扫描表单时检测到 hasOverride=true，会使用 override 值而非生成 mock
    for (const [selector, fieldName] of Object.entries(selectorFilledNames)) {
      if (!(fieldName in nameFields)) {
        nameFields[fieldName] = selectorFields[selector];
      }
    }

    // 再处理字段 name 模式的字段（通过 autoFillForm 自动发现并填充）
    const formSelector = args.selector || 'form';
    let autoFillResult = await deepInteractor.autoFillForm(target, formSelector, nameFields);

    // 无 form 标签的页面（fallback 到直接操作 input）
    let usedFallback = false;
    if (autoFillResult.error && autoFillResult.error.includes('未找到表单元素')) {
      usedFallback = true;
      autoFillResult = await deepInteractor.autoFillInputs(target, preserveValue ? { ...nameFields, _preserveOnly: true } : nameFields);
    }

    // 读取表单当前值（getFormValues）
    let formValues = null;
    try {
      const valuesResult = await deepInteractor.getFormValues(target, formSelector);
      if (valuesResult.found) {
        formValues = valuesResult.values;
        autoFillResult.values = formValues;
      }
    } catch (_) { /* getFormValues failed, keep formValues=null */ }

    let submitResult = null;
    if (args.submit !== false) {
      // 提交按钮选择器支持多种常见按钮样式
      const submitSelector = args.submitSelector ||
        'button[type="submit"], input[type="submit"], [class*="submit"], [class*="btn-primary"]';
      try {
        await target.locator(submitSelector).first().click({ timeout: 5000 });
        await new Promise(r => setTimeout(r, 1500));

        // 提交后检测成功/失败状态
        const pageStatus = await target.evaluate(() => {
          const body = document.body.innerHTML.toLowerCase();
          const hasSuccess = body.includes('success') || body.includes('成功') ||
            !!document.querySelector('.el-message--success, .ant-message-success, .success-message, [class*="success"]');
          const hasError = body.includes('error') || body.includes('失败') || body.includes('错误') ||
            !!document.querySelector('.el-message--error, .ant-message-error, .error-message, [class*="error"]');
          const successMessage = (document.querySelector('.el-message--success, .ant-message-success, .success-message, .alert-success')?.textContent || '').trim();
          const errorMessage = (document.querySelector('.el-message--error, .ant-message-error, .error-message, .alert-danger, .el-form-item__error, .ant-form-item-explain-error')?.textContent || '').trim();

          // 检测表单验证错误
          const invalidInputs = document.querySelectorAll('input:invalid, select:invalid, textarea:invalid');
          const formValidationErrors = Array.from(invalidInputs).map(el => ({
            name: el.name || el.id,
            validationMessage: el.validationMessage
          }));

          // Element UI / Ant Design 等常见 UI 库的消息提示
          const uiLibraryMessages = [];
          const elMessages = document.querySelectorAll('.el-message, .el-form-item__error');
          const antMessages = document.querySelectorAll('.ant-message, .ant-form-item-explain');
          uiLibraryMessages.push(
            ...Array.from(elMessages).map(el => ({ library: 'element-ui', text: el.textContent.trim() })),
            ...Array.from(antMessages).map(el => ({ library: 'ant-design', text: el.textContent.trim() }))
          );

          return { hasSuccess, hasError, successMessage, errorMessage, formValidationErrors, uiLibraryMessages };
        });

        const urlBefore = url;
        const urlAfter = target.url();
        const navigated = urlBefore !== urlAfter;

        submitResult = {
          clicked: submitSelector,
          status: pageStatus.hasSuccess ? 'success' : pageStatus.hasError ? 'error' : navigated ? 'navigated' : 'unknown',
          urlAfterSubmit: urlAfter,
          titleAfterSubmit: await target.title().catch(() => ''),
          pageStatus,
        };
      } catch (e) {
        submitResult = { clicked: submitSelector, status: 'error', error: e.message };
      }
    }
    return text(JSON.stringify({
      selectorFilled: selectorResults.length > 0 ? selectorResults : undefined,
      filled: autoFillResult,
      values: autoFillResult.values,
      usedFallback,
      submit: submitResult,
      nextSteps: ['使用 browser_click 提交表单', '使用 browser_form_validate 验证表单'],
      suggestions: [{ type: 'next', tool: 'browser_form_validate', reason: '验证表单填写是否有效' }],
      paidUpgradeHint: '需要智能表单填写、自动生成测试数据、多表单批量填充？升级到 Pro 版本获取智能表单能力。'
    }, null, 2));
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

  // ====== mcp_diag ======
  // v1.9.5 起合并 mcp_health_check/mcp_self_test
  if (name === 'mcp_diag') {
    const mode = args.mode || 'health';
    if (mode === 'health') {
      return handle('mcp_health_check', args, deps);
    }
    if (mode === 'self_test' || mode === 'selftest') {
      return handle('mcp_self_test', args, deps);
    }
    return text(JSON.stringify({ error: `未知的 mode 值：${mode}`, validModes: ['health', 'self_test'] }, null, 2));
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

  // ====== skill_tools_map ======
  if (name === 'skill_tools_map') {
  const skillMap = require('./skill_map');
  const { skillName, toolName, includeDetails = false } = args || {};
  if (!skillName && !toolName) {
    return text(JSON.stringify({ error: 'skillName 或 toolName 至少需提供一项', availableSkills: skillMap.getAllSkillToolsMap().map(s => s.skillName) }, null, 2));
  }
  if (skillName) {
    const map = skillMap.getSkillTools(skillName);
    if (!map) {
      return text(JSON.stringify({ error: `Unknown skill: ${skillName}`, availableSkills: skillMap.getAllSkillToolsMap().map(s => s.skillName) }, null, 2));
    }
    const toolsList = includeDetails ? map.tools : map.tools.map(t => t.name);
    return text(JSON.stringify({
      skillName: map.skillName,
      promptName: map.promptName,
      docFile: map.docFile,
      tools: toolsList,
      total: toolsList.length,
      nextSteps: ['使用 skill_consistency_check 校验所有 Skill 工具一致性', '查看 ' + map.docFile + ' 了解完整工作流']
    }, null, 2));
  }
  const skills = skillMap.getToolSkills(toolName);
  return text(JSON.stringify({
    toolName,
    skills,
    total: skills.length,
    nextSteps: ['使用 skillName 参数查看某 Skill 的完整工具链', '使用 skill_consistency_check 校验一致性']
  }, null, 2));
  }

  // ====== skill_consistency_check ======
  if (name === 'skill_consistency_check') {
  const skillMap = require('./skill_map');
  const handlerPrompts = require('./prompts');
  const { mode = 'strict', skillName: filterSkill } = args || {};
  try {
    const toolFiles = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
    const availableTools = toolFiles.map(f => path.basename(f, '.json'));
    const result = skillMap.validateConsistency({
      availableTools,
      prompts: handlerPrompts.PROMPTS,
      filterSkill
    });
    const passed = mode === 'strict' ? result.passed : true;
    return text(JSON.stringify({
      ...result,
      passed,
      mode,
      availableToolsCount: availableTools.length,
      nextSteps: [
        '使用 skill_tools_map 查询具体 Skill↔Tool 映射',
        '使用 mcp_self_test 执行完整自测',
        filterSkill ? `如需校验全部 Skill，去掉 skillName 参数` : `如需校验单个 Skill，传入 skillName 参数`
      ]
    }, null, 2));
  } catch (err) {
    return text(JSON.stringify({ passed: false, error: err.message, mode }, null, 2));
  }
  }

  return mcpError(`未知工具（system）: ${name}`, { error: 'UNKNOWN_TOOL', toolName: name });
  } finally {
    Object.assign(deps, { page, browser, browserSessionId, consoleLogs, networkLogs, pageErrors, currentCheckpoint, eventCheckpoint, lastAction, sessions, activeSessionName, sessionCounter, traceLogs, traceActive, currentTraceName, backendProbeResults, instrumentationEnabled, imageErrors, lastImageErrorCheckpoint, validationResults, lastQualityChecks, lastValidationRun, requestStartTimes, stateManager });
  }

}

module.exports = { tools, handle };
