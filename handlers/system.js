'use strict';

// Handler: system
// Extracted from server.js callTool switch statements

const { mcpError, mcpParamMissing } = require('../core/mcp-error');

const tools = [
  "project_audit",
  "css_var_check",
  "skill_validate",
  "browser_full_regression",
  "browser_form_fill",
  "browser_links",
  "browser_traverse_menu",
  "mcp_diag",
  "dev_workflow"
];

async function handle(name, args, deps) {

  // === Destructure deps into local scope (replacing globalThis bridge) ===
  let { page, browser, browserSessionId, consoleLogs, networkLogs, pageErrors, currentCheckpoint, eventCheckpoint, lastAction, sessions, activeSessionName, sessionCounter, traceLogs, traceActive, currentTraceName, backendProbeResults, instrumentationEnabled, imageErrors, lastImageErrorCheckpoint, validationResults, lastQualityChecks, lastValidationRun, requestStartTimes, stateManager } = deps;
  const { MAX_SESSIONS, SCREENSHOT_DIR, HAR_DIR, VISUAL_DIR, VISUAL_BASELINE_DIR, VISUAL_ACTUAL_DIR, VISUAL_DIFF_DIR, VALIDATIONS_DIR, REPORT_DIR, LOG_FILE, PROJECT_ROOT, TOOLS_DIR, logger, ensurePage, text, log, resetRuntimeLogs, getPageLinks, postActionErrorCheck, probeKnownEndpoints, getUnifiedErrors, closeBrowserSession, listBrowserSessions, filterNetwork, filterNetworkDetails, getStorageSnapshot, buildDebugReport, captureStepEvidence, waitForCondition, assertPage, runFlow, installInstrumentation, getBrowserEvents, clearBrowserEvents, startTrace, stopTrace, getArtifacts, clearArtifacts, ensureArtifactsDir, getBackendProbeEndpoints, isCloudApiProbeTarget, screenshotWithRedaction, safeArtifactName, analyzeScreenshotForErrors, exportHar, runFullAudit, visualBaseline, visualCompare, visualReport, runA11yCheck, runPerformanceCheck, runLighthouseAudit, findElement, findPage, suggestLocator, validateLocator, mcpHealthCheck, projectAudit, mcpSelfTest, runValidationCheck, runValidationPlan, runValidationElement, runValidationFlow, buildValidationReport, exportValidationReport, runValidationQuickRun, runDeployVerify, investigateDebug, runBrowserFullRegression, traverseMenu, fetchBackendLogs, buildTraceChain, detectSilentFailures, redact, redactString, isSensitiveKey, trimTraceLogs, genSpanId, genTraceId, browserOperator, evidenceCollector, deepInteractor, errorAggregator, path, fs, execSync, callTool } = deps;
  try {
  // ====== project_audit ======
  if (name === 'project_audit') {
  const _auditResult = await projectAudit(args);
  return text(JSON.stringify({ ..._auditResult, nextSteps: ['使用 browser_full_audit 执行完整审计', '使用 browser_performance { mode: \'check\' } 检查性能'] }, null, 2));
  }

  // ====== css_var_check ======
  if (name === 'css_var_check') {
const cssAnalyzer = require('./scripts/css-var-analyzer');
    const css = args.css;
    if (!css) {
      return text(JSON.stringify({ error: '缺少 css 参数' }, null, 2));
    }
    const _cssResult = cssAnalyzer.analyzeCSS(css, args.filePath || 'inline');
    return text(JSON.stringify({ ..._cssResult, nextSteps: ['使用 project_audit 执行项目审计', '使用 browser_screenshot 截图验证'] }, null, 2));
  }

  // ====== skill_validate ======
  // v1.9.5 起合并 skill_validate mode=consistency/mcp_validate/tools_map
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
    if (mode === 'task_recommend') {
      const skillMap = require('./skill_map');
      const { taskType, url } = args;
      if (!taskType) {
        return text(JSON.stringify({
          ok: false,
          error: '缺少必需参数: taskType',
          availableTaskTypes: skillMap.getAllTaskTypes(),
          hint: '请传入 taskType 参数（login/form/crud/bugfix 等），或使用 dev_workflow 工具获取完整验证流程'
        }, null, 2));
      }
      const workflow = skillMap.getTaskWorkflow(taskType, url);
      if (!workflow) {
        return text(JSON.stringify({
          ok: false,
          error: `未知的任务类型: ${taskType}`,
          availableTaskTypes: skillMap.getAllTaskTypes()
        }, null, 2));
      }
      // 复用 dev_workflow 的推荐逻辑，但增加 skill 一致性校验
      let skillConsistency = null;
      if (workflow.recommendedSkill) {
        const skillTools = skillMap.getSkillTools(workflow.recommendedSkill);
        if (skillTools) {
          // 通过读取 tools/ 目录获取可用工具列表（不依赖 deps.toolNames）
          let availableToolNames = [];
          try {
            const path = require('path');
            const fs = require('fs');
            const toolsDir = path.join(__dirname, '..', 'tools');
            availableToolNames = fs.readdirSync(toolsDir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
          } catch (_e) {
            // 读取失败时跳过一致性校验
          }
          const availableSet = new Set(availableToolNames);
          const missingTools = (skillTools.tools || []).filter(t => !availableSet.has(t.name));
          skillConsistency = {
            skillName: workflow.recommendedSkill,
            totalTools: (skillTools.tools || []).length,
            missingTools: missingTools.map(t => t.name),
            isConsistent: missingTools.length === 0
          };
        }
      }
      return text(JSON.stringify({
        ok: true,
        mode: 'task_recommend',
        taskType,
        url: url || null,
        recommendedSkill: workflow.recommendedSkill,
        skillInfo: workflow.skillInfo,
        skillConsistency,
        flowType: workflow.flowType,
        triggerHint: workflow.triggerHint,
        totalSteps: workflow.totalSteps,
        steps: workflow.steps,
        nextAction: workflow.nextAction,
        warning: '此工具提供验证流程建议。你必须按步骤依次调用推荐的 MCP 工具完成验证。也可直接调用 dev_workflow { taskType, url } 获取等价信息。',
        timestamp: new Date().toISOString()
      }, null, 2));
    }
    return text(JSON.stringify({ error: `未知 mode: ${mode}，可选 consistency / mcp_validate / tools_map / task_recommend` }, null, 2));
  }

  // ====== skill_validate mode=mcp_validate ======
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
      return text(JSON.stringify({ ...result, nextSteps: ['使用 mcp_diag { mode: \'self_test\' } 执行完整自测', '使用 project_audit 执行项目审计'] }, null, 2));
    } catch (err) {
      return text(JSON.stringify({ passed: false, error: err.message }, null, 2));
    }
  }

  // ====== trace_correlate mode=chain ======
  if (name === 'browser_trace_chain') {
const _traceResult = buildTraceChain(args);
    return text(JSON.stringify({ ..._traceResult, nextSteps: ['使用 trace_correlate 关联分析', '使用 evidence { mode: \'pack\' } 打包证据'] }, null, 2));
  }

  // ====== browser_full_regression ======
  if (name === 'browser_full_regression') {
  const _regressionResult = await runBrowserFullRegression(args);
  return text(JSON.stringify({ ..._regressionResult, nextSteps: ['使用 validation_report 查看回归报告', '使用 browser_smoke_test 执行冒烟测试'] }, null, 2));
  }

  // ====== browser_form_fill ======
  // v1.9.5 起合并 browser_form_fill（mode=smart）
  if (name === 'browser_form_fill') {
    const mode = args.mode || 'basic';

    // mode=smart：等价于已废弃的 browser_form_fill
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

    // mode=select：支持下拉框选择和级联选择（Ant Design Select/Cascader, Element UI Select 等）
    if (mode === 'select') {
      const { target } = await ensurePage(args);
      if (!args.selector) {
        return { content: [{ type: 'text', text: JSON.stringify({ success: false, mode: 'select', error: 'select 模式需要 selector 参数指定下拉框容器' }, null, 2) }] };
      }

      const selector = args.selector;
      const waitMs = args.waitMs || 800;

      // 级联选择模式：selectPath 为数组
      if (Array.isArray(args.selectPath) && args.selectPath.length > 0) {
        const path = args.selectPath;
        const steps = [];

        try {
          // 1. 点击 cascader 打开下拉菜单
          const cascaderEl = await target.$(selector);
          if (!cascaderEl) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: false, mode: 'select', error: `元素未找到: ${selector}` }, null, 2) }] };
          }
          await cascaderEl.click();
          await new Promise(r => setTimeout(r, waitMs));
          steps.push({ step: 'open', action: 'click', success: true });

          // 2. 逐级选择
          for (let i = 0; i < path.length; i++) {
            const targetText = String(path[i]);
            await new Promise(r => setTimeout(r, waitMs));

            // 查找当前级别的菜单（排除页面级筛选器 dropdown，取目标 Cascader 的 dropdown）
            const menuItem = await target.evaluate(({ level, text, selector }) => {
              // Ant Design cascader：查找所有可见的 cascader-dropdown
              const allDropdowns = Array.from(document.querySelectorAll('.ant-cascader-dropdown:not(.ant-cascader-dropdown-hidden)'));
              if (allDropdowns.length === 0) return { found: false };

              // 优先通过 input 的 aria-controls 属性关联对应的 dropdown
              const cascaderEl = document.querySelector(selector);
              let targetDropdown = null;
              if (cascaderEl) {
                const input = cascaderEl.querySelector('input[aria-controls]');
                if (input) {
                  const controlsId = input.getAttribute('aria-controls');
                  if (controlsId) {
                    targetDropdown = document.getElementById(controlsId);
                  }
                }
              }

              // 如果无法通过 aria-controls 关联，排除页面级筛选器 dropdown（如 semantic-mark-popup-root），取最后一个
              if (!targetDropdown) {
                const filtered = allDropdowns.filter(d => !d.className.includes('semantic-mark-popup-root'));
                targetDropdown = filtered[filtered.length - 1] || allDropdowns[allDropdowns.length - 1];
              }

              const menus = targetDropdown.querySelectorAll('.ant-cascader-menu');
              if (menus.length === 0) return { found: false };
              const menu = menus[Math.min(level, menus.length - 1)];
              const items = menu.querySelectorAll('.ant-cascader-menu-item');
              for (const item of items) {
                const itemText = item.textContent.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');
                const targetClean = text.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');
                if (itemText === targetClean || itemText.includes(targetClean) || targetClean.includes(itemText)) {
                  item.click();
                  return { found: true, text: item.textContent.trim() };
                }
              }
              return { found: false, availableOptions: Array.from(items).map(i => i.textContent.trim().slice(0, 20)) };
            }, { level: i, text: targetText, selector }).catch(() => ({ found: false }));

            if (!menuItem.found) {
              steps.push({ step: `level_${i}`, target: targetText, success: false, availableOptions: menuItem.availableOptions || [] });
              return { content: [{ type: 'text', text: JSON.stringify({ success: false, mode: 'select', error: `第 ${i} 级未找到选项: "${targetText}"`, steps }, null, 2) }] };
            }
            steps.push({ step: `level_${i}`, target: targetText, success: true, clicked: menuItem.text });
          }

          // 3. 验证最终选中值
          await new Promise(r => setTimeout(r, waitMs));
          const finalValue = await target.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return '';
            // Ant Design 4.x: 选中值存储在 .ant-select-selection-item 的 title 属性或文本内容
            const selectionItem = el.querySelector('.ant-select-selection-item');
            if (selectionItem) {
              return selectionItem.getAttribute('title') || selectionItem.textContent.trim();
            }
            // Ant Design 5.x: 选中值是 .ant-select-content 的直接文本节点（input.value 为空）
            const content = el.querySelector('.ant-select-content');
            if (content) {
              const clone = content.cloneNode(true);
              Array.from(clone.children).forEach(c => c.remove());
              const text = clone.textContent.trim();
              if (text) return text;
            }
            // Element UI: 选中值存储在 .el-select__selected-item 的文本内容
            const selectedItem = el.querySelector('.el-select__selected-item');
            if (selectedItem) return selectedItem.textContent.trim();
            // 原生 input: 选中值存储在 input.value
            const input = el.querySelector('input');
            return input ? input.value : '';
          }, selector).catch(() => '');

          return { content: [{ type: 'text', text: JSON.stringify({ success: true, mode: 'select', selector, selectPath: path, finalValue, steps, allLevelsSelected: true }, null, 2) }] };
        } catch (e) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, mode: 'select', error: e.message, steps }, null, 2) }] };
        }
      }

      // 单选下拉框模式：selectValue 为字符串
      if (args.selectValue !== undefined) {
        const targetValue = String(args.selectValue);
        try {
          // 1. 点击 select 打开下拉菜单
          const selectEl = await target.$(selector);
          if (!selectEl) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: false, mode: 'select', error: `元素未找到: ${selector}` }, null, 2) }] };
          }
          await selectEl.click();
          await new Promise(r => setTimeout(r, waitMs));

          // 2. 查找并点击选项
          const optionResult = await target.evaluate((text) => {
            // Ant Design Select：查找所有可见的 select-dropdown，排除页面级筛选器
            const allDropdowns = Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)'));
            const filtered = allDropdowns.filter(d => !d.className.includes('semantic-mark-popup-root'));
            const targetDropdown = filtered[filtered.length - 1] || allDropdowns[allDropdowns.length - 1];
            const antOptions = targetDropdown ? targetDropdown.querySelectorAll('.ant-select-item-option') : [];
            if (antOptions.length > 0) {
              for (const opt of antOptions) {
                const optText = opt.textContent.trim();
                if (optText === text || optText.includes(text) || text.includes(optText)) {
                  opt.click();
                  return { found: true, library: 'ant-design', text: optText };
                }
              }
              return { found: false, availableOptions: Array.from(antOptions).map(o => o.textContent.trim().slice(0, 30)) };
            }
            // Element UI Select
            const elOptions = document.querySelectorAll('.el-select-dropdown:not([style*="display: none"]) .el-select-dropdown__item');
            if (elOptions.length > 0) {
              for (const opt of elOptions) {
                const optText = opt.textContent.trim();
                if (optText === text || optText.includes(text) || text.includes(optText)) {
                  opt.click();
                  return { found: true, library: 'element-ui', text: optText };
                }
              }
              return { found: false, availableOptions: Array.from(elOptions).map(o => o.textContent.trim().slice(0, 30)) };
            }
            // 原生 select
            const nativeSelect = document.querySelector('select');
            if (nativeSelect) {
              for (const opt of nativeSelect.options) {
                if (opt.text === text || opt.text.includes(text) || text.includes(opt.text)) {
                  opt.selected = true;
                  nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                  return { found: true, library: 'native', text: opt.text };
                }
              }
            }
            return { found: false, availableOptions: [] };
          }, targetValue).catch(() => ({ found: false }));

          if (!optionResult.found) {
            return { content: [{ type: 'text', text: JSON.stringify({ success: false, mode: 'select', selector, selectValue: targetValue, error: `未找到选项: "${targetValue}"`, availableOptions: optionResult.availableOptions || [] }, null, 2) }] };
          }

          // 3. 验证选中值
          await new Promise(r => setTimeout(r, waitMs));
          const finalValue = await target.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return '';
            // 原生 select: 选中值存储在 select.value 或 options[selectedIndex].text
            const nativeSelect = el.tagName === 'SELECT' ? el : el.querySelector('select');
            if (nativeSelect) {
              const opt = nativeSelect.options[nativeSelect.selectedIndex];
              return opt ? (opt.text || opt.value) : nativeSelect.value;
            }
            // Ant Design 4.x: 选中值存储在 .ant-select-selection-item 的 title 属性或文本内容
            const selectionItem = el.querySelector('.ant-select-selection-item');
            if (selectionItem) {
              return selectionItem.getAttribute('title') || selectionItem.textContent.trim();
            }
            // Ant Design 5.x: 选中值是 .ant-select-content 的直接文本节点（input.value 为空）
            const content = el.querySelector('.ant-select-content');
            if (content) {
              // 克隆节点并移除 input 等子元素，获取纯文本
              const clone = content.cloneNode(true);
              Array.from(clone.children).forEach(c => c.remove());
              const text = clone.textContent.trim();
              if (text) return text;
            }
            // Element UI: 选中值存储在 .el-select__selected-item 的文本内容
            const selectedItem = el.querySelector('.el-select__selected-item');
            if (selectedItem) return selectedItem.textContent.trim();
            // 原生 input: 选中值存储在 input.value
            const input = el.querySelector('input');
            return input ? input.value : '';
          }, selector).catch(() => '');

          return { content: [{ type: 'text', text: JSON.stringify({ success: true, mode: 'select', selector, selectValue: targetValue, finalValue, library: optionResult.library, clickedOption: optionResult.text }, null, 2) }] };
        } catch (e) {
          return { content: [{ type: 'text', text: JSON.stringify({ success: false, mode: 'select', error: e.message }, null, 2) }] };
        }
      }

      return { content: [{ type: 'text', text: JSON.stringify({ success: false, mode: 'select', error: 'select 模式需要 selectValue（单选）或 selectPath（级联）参数' }, null, 2) }] };
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
    // scope 参数：限定填充范围（SPA 多表单场景，如 ".el-tab-pane.is-active"）
    const scope = args.scope || '';
    const scopePrefix = scope ? scope + ' ' : '';
    const selectorResults = [];
    // selector → input.name/id 映射，用于同步到 nameFields 防止 autoFillForm 用 mock 数据覆盖用户值
    const selectorFilledNames = {};
    for (const [selector, value] of Object.entries(selectorFields)) {
      try {
        const fullSelector = scopePrefix + selector;
        const locator = target.locator(fullSelector).first();
        await locator.fill(String(value), { timeout: 10000 });
        // React/Vue 受控组件需要 input+change 事件才能更新内部状态
        await locator.dispatchEvent('input');
        await locator.dispatchEvent('change');
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
    // scope 优先：有 scope 时用 scope 作为表单容器选择器
    const formSelector = scope || args.selector || 'form';
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
      // scope 存在时限定的提交按钮在 scope 范围内查找
      const submitSelector = args.submitSelector ||
        (scopePrefix + 'button[type="submit"], ' + scopePrefix + 'input[type="submit"], ' + scopePrefix + '[class*="submit"], ' + scopePrefix + '[class*="btn-primary"]');
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
      suggestions: [{ type: 'next', tool: 'browser_form_validate', reason: '验证表单填写是否有效' }]
    }, null, 2));
  }

  // ====== browser_links ======
  if (name === 'browser_links') {
  const _linksResult = await getPageLinks(args);
  return text(JSON.stringify({ ..._linksResult, nextSteps: ['使用 browser_click 点击链接验证', '使用 browser_snapshot 查看链接后页面'] }, null, 2));
  }

  // ====== browser_traverse_menu ======
  if (name === 'browser_traverse_menu') {
  const _menuResult = await traverseMenu(args);
  return text(JSON.stringify({ ..._menuResult, nextSteps: ['使用 browser_snapshot 查看菜单后页面', '使用 browser_find { mode: \'element\' } 查找菜单内容'] }, null, 2));
  }

  // ====== mcp_diag ======
  // v1.9.5 起合并 mcp_diag mode=health/self_test
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

  // ====== mcp_diag mode=health ======
  if (name === 'mcp_health_check') {
  const _healthResult = mcpHealthCheck();
  return text(JSON.stringify({ ..._healthResult, nextSteps: ['使用 mcp_diag { mode: \'self_test\' } 执行完整自测'] }, null, 2));
  }

  // ====== mcp_diag mode=self_test ======
  if (name === 'mcp_self_test') {
  const _selfTestResult = await mcpSelfTest(args);
  return text(JSON.stringify({ ..._selfTestResult, nextSteps: ['使用 mcp_diag { mode: \'health\' } 检查服务状态'] }, null, 2));
  }

  // ====== skill_validate mode=tools_map ======
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
      nextSteps: ['使用 skill_validate { mode: \'consistency\' } 校验所有 Skill 工具一致性', '查看 ' + map.docFile + ' 了解完整工作流']
    }, null, 2));
  }
  const skills = skillMap.getToolSkills(toolName);
  return text(JSON.stringify({
    toolName,
    skills,
    total: skills.length,
    nextSteps: ['使用 skillName 参数查看某 Skill 的完整工具链', '使用 skill_validate { mode: \'consistency\' } 校验一致性']
  }, null, 2));
  }

  // ====== skill_validate mode=consistency ======
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
        '使用 skill_validate { mode: \'tools_map\' } 查询具体 Skill↔Tool 映射',
        '使用 mcp_diag { mode: \'self_test\' } 执行完整自测',
        filterSkill ? `如需校验全部 Skill，去掉 skillName 参数` : `如需校验单个 Skill，传入 skillName 参数`
      ]
    }, null, 2));
  } catch (err) {
    return text(JSON.stringify({ passed: false, error: err.message, mode }, null, 2));
  }
  }

  // ====== dev_workflow ======
  // 开发工作流验证引导工具——AI 完成代码修改后的"触发入口"
  // 根据 taskType 推荐对应的 MCP 工具链和验证流程
  if (name === 'dev_workflow') {
    const { taskType, url, taskDescription } = args;
    if (!taskType) {
      return text(JSON.stringify({
        ok: false,
        error: '缺少必需参数: taskType',
        availableTaskTypes: require('./skill_map').getAllTaskTypes(),
        hint: '请选择最接近当前开发任务的 taskType。完成代码修改后必须调用此工具获取验证建议。'
      }, null, 2));
    }

    const skillMap = require('./skill_map');
    const workflow = skillMap.getTaskWorkflow(taskType, url);

    if (!workflow) {
      return text(JSON.stringify({
        ok: false,
        error: `未知的任务类型: ${taskType}`,
        availableTaskTypes: skillMap.getAllTaskTypes(),
        hint: '请从 availableTaskTypes 中选择一个任务类型'
      }, null, 2));
    }

    // 构建结果
    const result = {
      ok: true,
      taskType,
      url: url || null,
      taskDescription: taskDescription || null,
      recommendedSkill: workflow.recommendedSkill,
      skillInfo: workflow.skillInfo,
      flowType: workflow.flowType,
      triggerHint: workflow.triggerHint,
      totalSteps: workflow.totalSteps,
      steps: workflow.steps,
      nextAction: workflow.nextAction,
      warning: '此工具仅提供验证流程建议。你必须按步骤依次调用推荐的 MCP 工具完成验证。跳过验证 = 违反开发规范。',
      timestamp: new Date().toISOString()
    };

    // 添加下一步建议
    result.nextSteps = [
      `按步骤执行验证：第 1 步调用 ${workflow.steps[0].tool}`,
      `每步操作后检查返回结果中的 errors 字段`,
      `所有步骤完成后调用 evidence { mode: 'pack' } 收集证据`
    ];

    // 添加工具建议
    result.suggestions = workflow.steps.slice(0, 3).map((s, i) => ({
      type: i === 0 ? 'immediate' : 'next',
      tool: s.tool,
      reason: s.triggerHint,
      params: s.params
    }));

    return text(JSON.stringify(redact(result), null, 2));
  }

  return mcpError(`未知工具（system）: ${name}`, { error: 'UNKNOWN_TOOL', toolName: name });
  } finally {
    Object.assign(deps, { page, browser, browserSessionId, consoleLogs, networkLogs, pageErrors, currentCheckpoint, eventCheckpoint, lastAction, sessions, activeSessionName, sessionCounter, traceLogs, traceActive, currentTraceName, backendProbeResults, instrumentationEnabled, imageErrors, lastImageErrorCheckpoint, validationResults, lastQualityChecks, lastValidationRun, requestStartTimes, stateManager });
  }

}

module.exports = { tools, handle };
