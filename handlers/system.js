'use strict';

// Handler: system
// Extracted from server.js callTool switch statements

const tools = [
  "project_audit",
  "css_var_check",
  "skill_mcp_validate",
  "skill_mcp_sync",
  "browser_trace_chain",
  "backend_logs",
  "browser_full_regression",
  "browser_form_fill",
  "browser_deep_interact",
  "browser_links",
  "browser_traverse_menu",
  "mcp_health_check",
  "mcp_self_test",
  "benchmark_run",
  "ai_debug_investigate",
  "auto_fix_pipeline",
  "fix_verify"
];

async function handle(name, args, deps) {

  // === Bridge deps into scope via globalThis ===
  const _depsKeys = Object.keys(deps);
  const _depsPrev = {};
  for (const k of _depsKeys) { _depsPrev[k] = globalThis[k]; globalThis[k] = deps[k]; }
  try {
  // ====== project_audit ======
  if (name === 'project_audit') {
  return text(JSON.stringify(await projectAudit(args), null, 2));
  }

  // ====== css_var_check ======
  if (name === 'css_var_check') {
const cssAnalyzer = require('./scripts/css-var-analyzer');
    const css = args.css;
    if (!css) {
      return text(JSON.stringify({ error: '缺少 css 参数' }, null, 2));
    }
    const result = cssAnalyzer.analyzeCSS(css, args.filePath || 'inline');
    return text(JSON.stringify(result, null, 2));
  }

  // ====== skill_mcp_validate ======
  if (name === 'skill_mcp_validate') {
  try {
      const { skillName: validateSkillName, mode = 'strict' } = args;
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
      return text(JSON.stringify(result, null, 2));
    } catch (err) {
      return text(JSON.stringify({ passed: false, error: err.message }, null, 2));
    }
  }

  // ====== skill_mcp_sync ======
  if (name === 'skill_mcp_sync') {
  try {
      const { skillName: syncSkillName, dryRun = true } = args;
      const skillToolsPath = path.join(PROJECT_ROOT, '.trae', 'skills', syncSkillName, 'SKILL.tools.json');
      if (!fs.existsSync(skillToolsPath)) {
        return text(JSON.stringify({ passed: false, error: `Skill ${syncSkillName} 的 SKILL.tools.json 不存在` }, null, 2));
      }
      const skillTools = JSON.parse(fs.readFileSync(skillToolsPath, 'utf8'));
      const toolFiles = fs.readdirSync(TOOLS_DIR).filter(f => f.endsWith('.json'));
      const actualTools = toolFiles.map(f => path.basename(f, '.json'));
      const actualSet = new Set(actualTools);
      const skillToolsList = Object.keys(skillTools.tools);
      const newTools = actualTools.filter(t => !skillToolsList.includes(t));
      const removedTools = skillToolsList.filter(t => !actualSet.has(t));
      const diff = {
        skillName: syncSkillName,
        toolsInSkill: skillToolsList.length,
        toolsInMcp: actualTools.length,
        added: newTools,
        removed: removedTools,
        hasChanges: newTools.length > 0 || removedTools.length > 0
      };
      if (dryRun) {
        return text(JSON.stringify({ ...diff, dryRun: true, message: 'dryRun=true，仅预览变更，未写入文件' }, null, 2));
      }
      const mappingPath = path.join(PROJECT_ROOT, '.trae', 'mcp-server', 'docs', 'skills', 'skill-mcp-mapping.md');
      if (!fs.existsSync(mappingPath)) {
        return text(JSON.stringify({ ...diff, updated: false, error: `mapping.md 不存在：${mappingPath}` }, null, 2));
      }
      let mapping = fs.readFileSync(mappingPath, 'utf8');
      const now = new Date().toISOString().slice(0, 10);
      mapping = mapping.replace(/> 更新日期: .+/, `> 更新日期: ${now}`);
      if (diff.hasChanges) {
        let summary = '\n\n#### 自动同步变更\n\n';
        summary += `> 同步时间: ${new Date().toISOString()}\n\n`;
        if (diff.added.length > 0) {
          summary += `**新增工具**: ${diff.added.join(', ')}\n\n`;
        }
        if (diff.removed.length > 0) {
          summary += `**移除工具**: ${diff.removed.join(', ')}\n\n`;
        }
        mapping += summary;
      }
      fs.writeFileSync(mappingPath, mapping, 'utf8');
      return text(JSON.stringify({ ...diff, updated: true, dryRun: false, mappingPath }, null, 2));
    } catch (err) {
      return text(JSON.stringify({ passed: false, error: err.message }, null, 2));
    }
  }

  // ====== browser_trace_chain ======
  if (name === 'browser_trace_chain') {
const result = buildTraceChain(args);
    return text(JSON.stringify(result, null, 2));
  }

  // ====== backend_logs ======
  if (name === 'backend_logs') {
if (!args.traceId) return text(JSON.stringify({ error: '缺少 traceId 参数' }, null, 2));
    const result = await fetchBackendLogs(args);
    return text(JSON.stringify(result, null, 2));
  }

  // ====== browser_full_regression ======
  if (name === 'browser_full_regression') {
  return text(JSON.stringify(await runBrowserFullRegression(args), null, 2));
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
    return text(JSON.stringify({ filled: autoFillResult, submit: submitResult }, null, 2));
  }

  // ====== browser_deep_interact ======
  if (name === 'browser_deep_interact') {
// 深层交互工具：检测弹窗/表单、智能填表、执行业务流程、像人类一样探索
    const mode = args.mode || 'detect';
    const { target: page } = await ensurePage(args.visible !== false);
    if (args.url) {
      try { await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 }); await new Promise(r => setTimeout(r, 1500)); } catch (_) {}
    }
    let result = {};
    switch (mode) {
      case 'detect':
        result = await deepInteractor.detectUIState(page);
        break;
      case 'form':
        result = await deepInteractor.interactWithForm(page, { fillFields: args.fillFields !== false, submit: args.submit !== false });
        break;
      case 'workflow':
        result = await deepInteractor.executeWorkflow(page, args.workflow || []);
        break;
      case 'explore':
        result = await deepInteractor.exploreLikeHuman(page, { maxActions: args.maxActions || 15, interactModals: args.interactModals !== false, fillForms: args.fillFields !== false });
        break;
      default:
        result = { error: `未知模式: ${mode}` };
    }
    return text(JSON.stringify(result, null, 2));
  }

  // ====== browser_links ======
  if (name === 'browser_links') {
  return text(JSON.stringify(await getPageLinks(args), null, 2));
  }

  // ====== browser_traverse_menu ======
  if (name === 'browser_traverse_menu') {
  return text(JSON.stringify(await traverseMenu(args), null, 2));
  }

  // ====== mcp_health_check ======
  if (name === 'mcp_health_check') {
  return text(JSON.stringify(mcpHealthCheck(), null, 2));
  }

  // ====== mcp_self_test ======
  if (name === 'mcp_self_test') {
  return text(JSON.stringify(await mcpSelfTest(args), null, 2));
  }

  // ====== benchmark_run ======
  if (name === 'benchmark_run') {
  return text('benchmark_run: 基准测试。该能力在闭源端完整实现，开源版本仅作为占位');
  }

  // ====== ai_debug_investigate ======
  if (name === 'ai_debug_investigate') {
  return text('ai_debug_investigate: AI调试调查。该能力在闭源端完整实现，开源版本建议使用 debug_investigate');
  }

  // ====== auto_fix_pipeline ======
  if (name === 'auto_fix_pipeline') {
const maxIterations = Math.min(args.maxIterations || 3, 3);
    const autoConfirm = args.autoConfirm !== false;

    // 如果传了 url，先打开
    if (args.url) {
      const { target: page } = await ensurePage();
      await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    }

    const { target } = await ensurePage();
    const iterations = [];

    for (let i = 0; i < maxIterations; i++) {
      // STEP 1: 诊断收集
      const diagnosis = {
        consoleErrors: (consoleLogs || []).filter(e => e.type === 'error').slice(-10),
        networkFailures: (networkLogs || []).filter(e => e.status >= 400 || e.failed).slice(-10),
        pageErrors: (pageErrors || []).slice(-5)
      };

      const errorTexts = [
        ...diagnosis.consoleErrors.map(e => e.text || e.message || ''),
        ...diagnosis.pageErrors.map(e => e.message || ''),
        ...diagnosis.networkFailures.map(e => `${e.status || ''}: ${e.url || ''}`)
      ].filter(Boolean).join('\n');

      // 没有错误则提前结束
      if (!errorTexts && i === 0) {
        const snapshot = await target.screenshot({ encoding: 'base64' });
        const artifactDir = path.join(__dirname, 'artifacts', 'auto-fix');
        if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
        const snapshotPath = path.join(artifactDir, `snapshot_${Date.now()}.png`);
        require('fs').writeFileSync(snapshotPath, snapshot, 'base64');

        const finalResult = {
          status: 'healthy',
          message: '未检测到问题，无需修复',
          iterations: [],
          evidencePaths: [snapshotPath]
        };

        return text(JSON.stringify(finalResult, null, 2));
      }

      // STEP 2: 分类匹配
      const matchedIssues = [];
      const allPatterns = [
        { name: 'api_response_html', match: /html.*200|返回了HTML|路由兜底|SPA路由/i, severity: 'blocking' },
        { name: '5xx_server_error', match: /500|502|503|server error|服务器错误|内部错误|服务不可用/i, severity: 'blocking' },
        { name: '404_not_found', match: /404|not found|无法找到|找不到资源/i, severity: 'blocking' },
        { name: 'websocket_error', match: /websocket|WebSocket|ws:[/][/]|wss:[/][/]|socket.*error|连接.*断开/i, severity: 'blocking' },
        { name: 'cors_cross_origin', match: /CORS|cross-origin|跨域|Access-Control|被CORS策略阻止|Script error[\.]?$/i, severity: 'critical' },
        { name: '401_unauthorized', match: /401|unauthorized|未授权|无权限登录|身份验证失败/i, severity: 'critical' },
        { name: '403_forbidden', match: /403|forbidden|禁止访问|访问被拒绝/i, severity: 'critical' },
        { name: 'missing_envVar', match: /environment variable|env.*not set|环境变量.*未|缺少.*环境|process\.env/i, severity: 'critical' },
        { name: 'port_conflict', match: /port.*in use|EADDRINUSE|端口.*占用|address.*already in use/i, severity: 'critical' },
        { name: 'rate_limit', match: /rate limit|429|too many requests|请求过于频繁|请求被限流/i, severity: 'critical' },
        { name: 'timeout', match: /timeout|timed out|ETIMEDOUT|超时|请求超时/i, severity: 'critical' },
        { name: 'type_error_undefined', match: /TypeError|undefined|Cannot read properties|无法读取属性|类型错误/i, severity: 'general' },
        { name: 'element_not_found', match: /element not found|no element matched|找不到元素|元素不存在|没有匹配的元素/i, severity: 'general' },
      ];

      for (const pattern of allPatterns) {
        if (pattern.match.test(errorTexts)) {
          matchedIssues.push({ ...pattern, matchText: errorTexts.match(pattern.match)?.[0] || '' });
        }
      }

      // 按 severity 排序
      const severityOrder = { blocking: 0, critical: 1, general: 2, optimization: 3 };
      matchedIssues.sort((a, b) => (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99));

      // STEP 3: 修复执行
      const attemptedFixes = [];
      if (autoConfirm && matchedIssues.length > 0) {
        for (const issue of matchedIssues.slice(0, 3)) {
          try {
            const fixResult = { issue: issue.name, severity: issue.severity, strategies: [] };

            if (issue.name === '5xx_server_error' || issue.name === 'api_response_html') {
              await target.reload({ waitUntil: 'networkidle', timeout: 15000 });
              await target.waitForTimeout(2000);
              fixResult.strategies.push({ name: 'page_reload', success: true });
            } else if (issue.name === '404_not_found') {
              await target.waitForTimeout(1000);
              fixResult.strategies.push({ name: 'wait_retry', success: true });
            } else if (issue.name === 'timeout' || issue.name === 'cors_cross_origin') {
              await target.reload({ waitUntil: 'load', timeout: 20000 });
              fixResult.strategies.push({ name: 'hard_reload', success: true });
            } else if (issue.name === 'type_error_undefined' || issue.name === 'element_not_found') {
              await target.waitForTimeout(3000);
              fixResult.strategies.push({ name: 'wait_stable', success: true });
            }

            attemptedFixes.push(fixResult);
          } catch (e) {
            attemptedFixes.push({ issue: issue.name, error: e.message, strategies: [{ name: 'failed', success: false, error: e.message }] });
          }
        }
      }

      // STEP 4: 验证对比
      const beforeErrors = (consoleLogs || []).filter(e => e.type === 'error').length + (pageErrors || []).length;
      await target.waitForTimeout(1000);
      const afterErrors = (consoleLogs || []).filter(e => e.type === 'error').length + (pageErrors || []).length;

      // 截图留证
      const artifactDir = path.join(__dirname, 'artifacts', 'auto-fix');
      if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
      const iterationSnapshot = await target.screenshot({ encoding: 'base64' });
      const shotPath = path.join(artifactDir, `iter${i+1}_${Date.now()}.png`);
      require('fs').writeFileSync(shotPath, iterationSnapshot, 'base64');

      const iterationResult = {
        iteration: i + 1,
        diagnosis: {
          consoleErrorCount: diagnosis.consoleErrors.length,
          networkFailureCount: diagnosis.networkFailures.length,
          pageErrorCount: diagnosis.pageErrors.length
        },
        matchedIssues: matchedIssues.map(m => ({ name: m.name, severity: m.severity, matchText: m.matchText })),
        attemptedFixes: attemptedFixes,
        verification: {
          beforeErrors, afterErrors,
          errorDelta: afterErrors - beforeErrors,
          improvement: afterErrors < beforeErrors
        },
        evidencePath: shotPath
      };

      iterations.push(iterationResult);

      // 检查是否需要继续迭代
      if (!autoConfirm || afterErrors === 0 || afterErrors <= beforeErrors) {
        break;
      }

      // 如果本轮修复完全无效，也停止（保护性终止）
      if (matchedIssues.length === 0) break;
    }

    return text(JSON.stringify({
      status: iterations.length > 0 && iterations.some(i => i.verification?.improvement) ? 'improved' : 'no_change',
      totalIterations: iterations.length,
      iterations,
      summary: {
        issuesDetected: iterations.flatMap(i => i.matchedIssues).length,
        fixesApplied: iterations.flatMap(i => i.attemptedFixes).length,
        finalState: iterations.length > 0 ? (iterations[iterations.length-1].verification.afterErrors === 0 ? 'resolved' : 'partial') : 'unknown'
      },
      evidencePaths: iterations.map(i => i.evidencePath).filter(Boolean)
    }, null, 2));
  }

  // ====== fix_verify ======
  if (name === 'fix_verify') {
// 增强版 fix_verify - 支持截图、DOM 检查和修复验证闭环
    const { target } = await ensurePage();

    // 截图自动捕获（修复前）
    const artifactDir = path.join(__dirname, 'artifacts', 'fix-verify');
    if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
    const timestamp = Date.now();
    let beforeShot = null;
    let afterShot = null;

    if (args.captureScreenshots !== false) {
      beforeShot = path.join(artifactDir, `fix_before_${timestamp}.png`);
      await target.screenshot({ path: beforeShot, fullPage: true });
    }

    // 核心 DOM 元素存在性对比（修复前）
    const elementsToCheck = args.checkDomElements || [];
    const beforeDomState = {};
    for (const sel of elementsToCheck) {
      const el = await target.$(sel);
      beforeDomState[sel] = !!el;
    }

    // 记录修复前状态
    const beforeState = {
      url: target.url(),
      errors: getUnifiedErrors({ includeWarnings: false }),
      timestamp: new Date().toISOString()
    };

    // 执行修复（如果有具体操作）
    if (args.beforeSummary && args.afterSummary) {
      const beforeErrors = args.beforeSummary.errors || 0;
      const afterErrors = args.afterSummary.errors || 0;

      // 对比前后摘要
      const comparison = {
        before: args.beforeSummary,
        after: args.afterSummary,
        improved: false,
        details: []
      };

      if (afterErrors < beforeErrors) {
        comparison.improved = true;
        comparison.details.push(`错误数从 ${beforeErrors} 减少到 ${afterErrors}`);
      }

      // 修复后截图
      if (args.captureScreenshots !== false) {
        afterShot = path.join(artifactDir, `fix_after_${timestamp}.png`);
        await target.screenshot({ path: afterShot, fullPage: true });
      }

      // DOM 元素修复后检查
      const afterDomState = {};
      const domChanges = [];
      for (const sel of elementsToCheck) {
        const el = await target.$(sel);
        afterDomState[sel] = !!el;
        domChanges.push({
          selector: sel,
          existed: beforeDomState[sel],
          now: afterDomState[sel],
          changed: beforeDomState[sel] !== afterDomState[sel]
        });
      }
      const domImprovedCount = domChanges.filter(d => d.changed && d.now).length;
      const domTotalCount = domChanges.length;

      // 截图差异计算
      let diffPercent = 0;
      if (beforeShot && afterShot) {
        const beforeSize = fs.statSync(beforeShot).size;
        const afterSize = fs.statSync(afterShot).size;
        diffPercent = beforeSize > 0 ? Math.abs(afterSize - beforeSize) / beforeSize * 100 : 0;
      }

      // improvementScore 计算
      const errorDiff = (beforeErrors - afterErrors);
      const maxErrors = Math.max(beforeErrors, afterErrors, 1);
      const errorScore = (errorDiff / maxErrors) * 50;
      const screenshotScore = diffPercent > 20 ? 20 : (diffPercent / 20) * 20;
      const domScore = domImprovedCount / Math.max(domTotalCount, 1) * 30;
      const improvementScore = Math.max(0, Math.min(100, 50 + errorScore + screenshotScore + domScore));

      return text(JSON.stringify({
        passed: improvementScore >= 60,
        improvementScore: Math.round(improvementScore),
        comparison: {
          errorDiff: { before: beforeErrors, after: afterErrors, change: errorDiff },
          screenshotDiff: { beforeShot, afterShot, diffPercent: Math.round(diffPercent) },
          domChanges
        },
        evidencePaths: { beforeScreenshot: beforeShot, afterScreenshot: afterShot }
      }, null, 2));
    }

    return text(JSON.stringify({
      status: 'recorded',
      message: '已记录修复前状态，请执行修复操作后再次调用以验证',
      beforeState,
      beforeScreenshot: beforeShot,
      beforeDomState
    }, null, 2));
  }

  return { isError: true, content: [{ type: 'text', text: `未知工具（system）: ${name}` }] };
  } finally {
    for (const k of _depsKeys) { deps[k] = globalThis[k]; }
    for (const k of _depsKeys) { if (k in _depsPrev) globalThis[k] = _depsPrev[k]; else delete globalThis[k]; }
  }

}

module.exports = { tools, handle };
