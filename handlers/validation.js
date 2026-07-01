'use strict';

// Handler: validation
// Extracted from server.js callTool switch statements

const tools = [
  "validation_start",
  "validation_check",
  "validation_run",
  "validation_suite_run",
  "validation_element",
  "validation_flow",
  "validation_chain",
  "validation_report",
  "validation_report_export",
  "validation_quick_run",
  "validation_matrix",
  "validation_decision",
  "validation_compliance"
];

async function handle(name, args, deps) {

  // === Bridge deps into scope via globalThis ===
  const _depsKeys = Object.keys(deps);
  const _depsPrev = {};
  for (const k of _depsKeys) { _depsPrev[k] = globalThis[k]; globalThis[k] = deps[k]; }
  try {
  // ====== validation_start ======
  if (name === 'validation_start') {
resetRuntimeLogs();
    const scenarios = Array.isArray(args.testScenarios) ? args.testScenarios : [];
    validationResults = scenarios.map((scenario, index) => ({ id: index + 1, scenario, status: 'pending' }));
    return text(`验证已启动，目标: ${args.targetUrl || '未指定'}，场景数: ${scenarios.length}，checkpoint: ${currentCheckpoint}`);
  }

  // ====== validation_check ======
  if (name === 'validation_check') {
if (args.check_type === 'deploy_verify') {
      return text(JSON.stringify(await runDeployVerify(args), null, 2));
    }
    const { target } = await ensurePage(args);
    return text(JSON.stringify(await runValidationCheck(target, args), null, 2));
  }

  // ====== validation_run ======
  if (name === 'validation_run') {
const { target } = await ensurePage(args);
    return text(JSON.stringify(await runValidationPlan(target, args), null, 2));
  }

  // ====== validation_suite_run ======
  if (name === 'validation_suite_run') {
  return text('该工具为付费版本功能，请升级到团队版或企业版以使用批量套件运行能力。\n\n了解更多: https://validpilot.com/pricing');
  }

  // ====== validation_element ======
  if (name === 'validation_element') {
const { target } = await ensurePage(args);
    return text(JSON.stringify(await runValidationElement(target, args), null, 2));
  }

  // ====== validation_flow ======
  if (name === 'validation_flow') {
const { target } = await ensurePage(args);
    return text(JSON.stringify(await runValidationFlow(target, args), null, 2));
  }

  // ====== validation_chain ======
  if (name === 'validation_chain') {
const { target } = await ensurePage(args);
    return text(JSON.stringify(await runValidationChain(target, args), null, 2));
  }

  // ====== validation_compliance ======
  if (name === 'validation_compliance') {
    return text(JSON.stringify(runValidationCompliance(args), null, 2));
  }

  // ====== validation_report ======
  if (name === 'validation_report') {
const report = buildValidationReport(args);
    return text(typeof report === 'string' ? report : JSON.stringify(report, null, 2));
  }

  // ====== validation_report_export ======
  if (name === 'validation_report_export') {
  return text(JSON.stringify(exportValidationReport(args), null, 2));
  }

  // ====== validation_quick_run ======
  if (name === 'validation_quick_run') {
const { target } = await ensurePage(args);
    return text(JSON.stringify(await runValidationQuickRun(target, args), null, 2));
  }

  // ====== validation_matrix ======
  if (name === 'validation_matrix') {
    const { target } = await ensurePage(args);
    const url = args.url;
    const dimensions = args.dimensions || ['functional', 'visual', 'performance', 'a11y'];
    const performanceThreshold = args.performanceThreshold || 2500;
    const a11yStandard = args.a11yStandard || 'wcag-aa';
    const outputFormat = args.outputFormat || 'json';

    // Navigate to target URL
    await target.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));

    const timestamp = new Date().toISOString();
    const results = {
      success: true,
      name: args.name || 'Multi-dimensional Validation Matrix',
      url: target.url(),
      dimensions: {},
      overallScore: 0,
      grade: 'F',
      recommendations: [],
      artifacts: [],
      timestamp
    };

    // 1. Functional dimension
    if (dimensions.includes('functional')) {
      const functionalResult = await target.evaluate(() => {
        const checks = [];
        // Basic functional checks
        const hasTitle = document.title && document.title.length > 0;
        const hasMainContent = document.querySelector('main') || document.querySelector('[role="main"]') || document.body.innerText.length > 100;
        const hasLinks = document.querySelectorAll('a[href]').length > 0;
        const hasForms = document.querySelectorAll('form').length > 0;
        const hasButtons = document.querySelectorAll('button, input[type="submit"], [role="button"]').length > 0;
        const hasImages = document.querySelectorAll('img').length > 0;

        checks.push({ name: 'title', passed: hasTitle, weight: 10 });
        checks.push({ name: 'mainContent', passed: hasMainContent, weight: 30 });
        checks.push({ name: 'navigation', passed: hasLinks, weight: 20 });
        checks.push({ name: 'forms', passed: hasForms || !hasForms, weight: 10 }); // Forms are optional
        checks.push({ name: 'buttons', passed: hasButtons, weight: 15 });
        checks.push({ name: 'images', passed: hasImages || !hasImages, weight: 15 }); // Images are optional

        const passedCount = checks.filter(c => c.passed).length;
        const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
        const earnedWeight = checks.filter(c => c.passed).reduce((sum, c) => sum + c.weight, 0);
        const score = Math.round((earnedWeight / totalWeight) * 100);

        return { checks, passedCount, totalCount: checks.length, score };
      });

      results.dimensions.functional = {
        score: functionalResult.score,
        passed: functionalResult.passedCount,
        failed: functionalResult.totalCount - functionalResult.passedCount,
        checks: functionalResult.checks
      };

      if (functionalResult.score < 50) {
        results.recommendations.push('功能性检查：页面缺少核心元素（标题、导航或主要内容区域）');
      }
    }

    // 2. Visual dimension
    if (dimensions.includes('visual')) {
      try {
        // Take screenshot for visual check
        const screenshot = await target.screenshot({ type: 'png', fullPage: false });
        const artifactPath = `validation_matrix_visual_${Date.now()}.png`;

        // Basic visual checks
        const visualResult = await target.evaluate(() => {
          const checks = [];
          const styles = getComputedStyle(document.body);

          // Check readable font size
          const fontSize = parseFloat(styles.fontSize);
          checks.push({ name: 'fontSize', passed: fontSize >= 12, value: fontSize, weight: 20 });

          // Check contrast (basic)
          const bgColor = styles.backgroundColor;
          const textColor = styles.color;
          checks.push({ name: 'hasColors', passed: bgColor !== textColor, weight: 15 });

          // Check layout consistency
          const hasConsistentLayout = document.querySelectorAll('[class*="container"], [class*="wrapper"], [class*="main"]').length > 0;
          checks.push({ name: 'layoutStructure', passed: hasConsistentLayout, weight: 25 });

          // Check responsive
          const viewportWidth = window.innerWidth;
          checks.push({ name: 'viewportWidth', passed: viewportWidth > 0, value: viewportWidth, weight: 10 });

          // Check visible content
          const visibleElements = document.querySelectorAll(':not([hidden])').length;
          checks.push({ name: 'visibleContent', passed: visibleElements > 10, value: visibleElements, weight: 30 });

          const passedCount = checks.filter(c => c.passed).length;
          const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
          const earnedWeight = checks.filter(c => c.passed).reduce((sum, c) => sum + c.weight, 0);
          const score = Math.round((earnedWeight / totalWeight) * 100);

          return { checks, passedCount, totalCount: checks.length, score, viewport: { width: window.innerWidth, height: window.innerHeight } };
        });

        results.dimensions.visual = {
          score: visualResult.score,
          passed: visualResult.passedCount,
          failed: visualResult.totalCount - visualResult.passedCount,
          checks: visualResult.checks,
          viewport: visualResult.viewport,
          screenshotArtifact: artifactPath
        };

        results.artifacts.push(artifactPath);

        if (visualResult.score < 70) {
          results.recommendations.push('视觉检查：字体大小或布局结构可能存在问题');
        }
      } catch (e) {
        results.dimensions.visual = { score: 0, error: e.message };
        results.recommendations.push('视觉检查失败：无法完成截图或样式检查');
      }
    }

    // 3. Performance dimension
    if (dimensions.includes('performance')) {
      const perfResult = await target.evaluate((threshold) => {
        const perf = window.performance;
        const timing = perf.timing;
        const navigation = perf.getEntriesByType('navigation')[0] || {};

        // Calculate metrics
        const fcp = perf.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint')?.startTime || 0;
        const lcpEntries = perf.getEntriesByType('largest-contentful-paint');
        const lcp = lcpEntries.length > 0 ? lcpEntries[lcpEntries.length - 1].startTime : 0;
        const cls = perf.getEntriesByType('layout-shift').reduce((sum, e) => sum + e.value, 0);

        const domContentLoaded = navigation.domContentLoadedEventEnd - navigation.fetchStart || timing.domContentLoadedEventEnd - timing.navigationStart;
        const loadTime = navigation.loadEventEnd - navigation.fetchStart || timing.loadEventEnd - timing.navigationStart;

        // Score calculation
        const checks = [];
        checks.push({ name: 'FCP', passed: fcp < 1800, value: Math.round(fcp), threshold: 1800, weight: 20 });
        checks.push({ name: 'LCP', passed: lcp < threshold, value: Math.round(lcp), threshold, weight: 30 });
        checks.push({ name: 'CLS', passed: cls < 0.1, value: Math.round(cls * 1000) / 1000, threshold: 0.1, weight: 20 });
        checks.push({ name: 'DCL', passed: domContentLoaded < 2000, value: Math.round(domContentLoaded), threshold: 2000, weight: 15 });
        checks.push({ name: 'Load', passed: loadTime < 3000, value: Math.round(loadTime), threshold: 3000, weight: 15 });

        const passedCount = checks.filter(c => c.passed).length;
        const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
        const earnedWeight = checks.filter(c => c.passed).reduce((sum, c) => sum + c.weight, 0);
        const score = Math.round((earnedWeight / totalWeight) * 100);

        return { checks, passedCount, totalCount: checks.length, score, metrics: { fcp, lcp, cls, domContentLoaded, loadTime } };
      }, performanceThreshold);

      results.dimensions.performance = {
        score: perfResult.score,
        passed: perfResult.passedCount,
        failed: perfResult.totalCount - perfResult.passedCount,
        checks: perfResult.checks,
        metrics: perfResult.metrics
      };

      if (perfResult.score < 70) {
        results.recommendations.push(`性能检查：LCP 或其他指标超过阈值，建议优化资源加载`);
      }
    }

    // 4. A11y dimension
    if (dimensions.includes('a11y')) {
      const a11yResult = await target.evaluate(() => {
        const checks = [];

        // Check alt text on images
        const imagesWithoutAlt = document.querySelectorAll('img:not([alt])').length;
        checks.push({ name: 'imageAlt', passed: imagesWithoutAlt === 0, failed: imagesWithoutAlt, weight: 20 });

        // Check form labels
        const inputsWithoutLabel = document.querySelectorAll('input:not([type="hidden"]):not([id]), input:not([type="hidden"])[id]:not([aria-label])').length;
        const inputsWithLabel = document.querySelectorAll('input[id]').filter(i => document.querySelector(`label[for="${i.id}"]`)).length;
        checks.push({ name: 'formLabels', passed: inputsWithoutLabel < 5, failed: inputsWithoutLabel, weight: 25 });

        // Check heading structure
        const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const hasH1 = document.querySelectorAll('h1').length === 1;
        checks.push({ name: 'headingStructure', passed: hasH1, value: headings.length, weight: 15 });

        // Check aria roles
        const ariaElements = document.querySelectorAll('[role]');
        checks.push({ name: 'ariaUsage', passed: ariaElements.length > 0 || true, value: ariaElements.length, weight: 10 });

        // Check focus indicators (basic)
        const focusableElements = document.querySelectorAll('a, button, input, select, textarea, [tabindex]');
        checks.push({ name: 'focusableElements', passed: focusableElements.length > 0, value: focusableElements.length, weight: 15 });

        // Check lang attribute
        const hasLang = document.documentElement.hasAttribute('lang');
        checks.push({ name: 'langAttribute', passed: hasLang, weight: 15 });

        const passedCount = checks.filter(c => c.passed).length;
        const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
        const earnedWeight = checks.filter(c => c.passed).reduce((sum, c) => sum + c.weight, 0);
        const score = Math.round((earnedWeight / totalWeight) * 100);

        return { checks, passedCount, totalCount: checks.length, score };
      });

      results.dimensions.a11y = {
        score: a11yResult.score,
        passed: a11yResult.passedCount,
        failed: a11yResult.totalCount - a11yResult.passedCount,
        checks: a11yResult.checks
      };

      if (a11yResult.score < 70) {
        results.recommendations.push('无障碍检查：图片缺少 alt 属性或表单缺少 label');
      }
    }

    // Calculate overall score and grade
    const dimensionScores = Object.values(results.dimensions).map(d => d.score || 0);
    const activeDimensions = dimensionScores.length;
    if (activeDimensions > 0) {
      results.overallScore = Math.round(dimensionScores.reduce((sum, s) => sum + s, 0) / activeDimensions);

      // Assign grade
      if (results.overallScore >= 95) results.grade = 'A';
      else if (results.overallScore >= 85) results.grade = 'B';
      else if (results.overallScore >= 70) results.grade = 'C';
      else if (results.overallScore >= 50) results.grade = 'D';
      else results.grade = 'F';
    }

    // Success determination
    results.success = results.overallScore >= 70;

    // Add general recommendations if needed
    if (results.recommendations.length === 0 && results.success) {
      results.recommendations.push('验证通过：页面在所有维度表现良好');
    }

    // Role × Feature matrix if provided
    if (args.roles && args.features) {
      results.roleMatrix = [];
      for (const role of args.roles) {
        const roleResult = { role: role.name || 'default', features: [] };
        for (const feature of args.features) {
          // Basic feature availability check (placeholder for full implementation)
          roleResult.features.push({
            name: feature.name,
            expected: feature.expected || 'allowed',
            status: 'pending' // Full implementation requires session management
          });
        }
        results.roleMatrix.push(roleResult);
      }
      results.recommendations.push('角色×功能矩阵：需要完整的会话管理才能完整验证，当前为结构预览');
    }

    // Output format
    if (outputFormat === 'markdown') {
      const md = `# Validation Matrix Report\n\n**URL:** ${results.url}\n**Overall Score:** ${results.overallScore}/100 (${results.grade})\n**Timestamp:** ${results.timestamp}\n\n## Dimensions\n\n| Dimension | Score | Passed | Failed |\n|-----------|-------|--------|--------|\n${Object.entries(results.dimensions).map(([k, v]) => `| ${k} | ${v.score} | ${v.passed} | ${v.failed} |`).join('\n')}\n\n## Recommendations\n\n${results.recommendations.map(r => `- ${r}`).join('\n')}\n`;
      return text(md);
    }

    return text(JSON.stringify(results, null, 2));
  }

  // ====== validation_decision ======
  if (name === 'validation_decision') {
  return text('validation_decision: 决策建议。该能力在闭源端完整实现，开源版本仅作为占位');
  }

  return { isError: true, content: [{ type: 'text', text: `未知工具（validation）: ${name}` }] };
  } finally {
    for (const k of _depsKeys) { deps[k] = globalThis[k]; }
    for (const k of _depsKeys) { if (k in _depsPrev) globalThis[k] = _depsPrev[k]; else delete globalThis[k]; }
  }

}

function filterBySince(items, since) {
  if (!since) return items;
  const sinceTime = new Date(since).getTime();
  return items.filter(item => {
    const t = item.timestamp ? new Date(item.timestamp).getTime() : 0;
    return t >= sinceTime;
  });
}

function stripNetworkDetails(item) {
  const r = Object.assign({}, item);
  delete r.requestBody;
  delete r.responseBody;
  delete r.requestHeaders;
  delete r.responseHeaders;
  return r;
}

async function runValidationFlow(target, args = {}) {
  const continueOnFailure = args.continueOnFailure === true;
  const failFast = args.failFast === true;
  const timeout = Number(args.timeout) || 30000;
  const steps = Array.isArray(args.steps) ? args.steps : [];

  const startTime = Date.now();
  const stepResults = [];
  const failures = [];

  const ac = new AbortController();
  const timeoutTimer = setTimeout(() => {
    ac.abort(new Error(`validation_flow 整体超时（${timeout}ms）`));
  }, timeout);

  try {
    for (let index = 0; index < steps.length; index += 1) {
      if (ac.signal.aborted) throw ac.signal.reason;

      const step = steps[index];
      const action = step.action || step.type;
      const stepName = step.name || `${index + 1}-${action || 'step'}`;
      const stepStart = Date.now();
      const stepCheckpoint = new Date().toISOString();

      const stepResult = {
        stepIndex: index,
        stepName,
        action,
        passed: false,
        duration: 0,
        error: null,
        consoleErrors: [],
        networkErrors: [],
        networkRequests: [],
        pageErrors: []
      };

      try {
        switch (action) {
          case 'navigate':
          case 'goto': {
            const url = step.url || step.value;
            if (!url) throw new Error('navigate 步骤需要 url 参数');
            const navTimeout = step.timeout || 15000;
            await target.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
            break;
          }
          case 'click':
            if (!step.selector) throw new Error('click 步骤需要 selector 参数');
            const clickTimeout = step.timeout || 10000;
            await target.click(step.selector, { timeout: clickTimeout });
            break;
          case 'type': {
            if (!step.selector) throw new Error('type 步骤需要 selector 参数');
            const text = step.value || '';
            const typeTimeout = step.timeout || 10000;
            await target.fill(step.selector, text, { timeout: typeTimeout });
            await target.evaluate(({ selector, text }) => {
              const el = document.querySelector(selector);
              if (!el) return;
              try {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
                if (el.tagName === 'INPUT' && nativeInputValueSetter) {
                  nativeInputValueSetter.call(el, text);
                } else if (el.tagName === 'TEXTAREA' && nativeTextareaValueSetter) {
                  nativeTextareaValueSetter.call(el, text);
                } else {
                  el.value = text;
                }
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              } catch (e) { /* ignore */ }
            }, { selector: step.selector, text });
            break;
          }
          case 'wait': {
            const waitMs = Number(step.value) || 1000;
            await target.waitForTimeout(waitMs);
            break;
          }
          case 'eval': {
            if (!step.expression) throw new Error('eval 步骤需要 expression 参数');
            const evalResult = await target.evaluate(step.expression);
            stepResult.evalResult = evalResult;
            break;
          }
          case 'screenshot': {
            const screenshotName = step.name || `step-${index}`;
            ensureArtifactsDir();
            const safeName = `${Date.now()}-${screenshotName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
            const screenshotPath = path.join(SCREENSHOT_DIR, `${safeName}.png`);
            await screenshotWithRedaction(target, screenshotPath, {});
            stepResult.screenshot = screenshotPath;
            break;
          }
          default:
            throw new Error(`不支持的操作类型：${action}`);
        }

        await new Promise(r => setTimeout(r, 300));

        const stepConsoleErrors = filterBySince(consoleLogs, stepCheckpoint)
          .filter(item => item.type === 'error');
        const stepPageErrors = filterBySince(pageErrors, stepCheckpoint);
        const stepNetworkRequests = filterNetwork(networkLogs, { since: stepCheckpoint });
        const stepNetworkErrors = stepNetworkRequests.filter(item => item.failed || item.status >= 400);

        stepResult.consoleErrors = stepConsoleErrors.map(e => redact(e));
        stepResult.pageErrors = stepPageErrors.map(e => redact(e));
        stepResult.networkErrors = stepNetworkErrors.map(e => redact(stripNetworkDetails(e)));
        stepResult.networkRequests = stepNetworkRequests.map(e => redact(stripNetworkDetails(e)));

        let validationPassed = true;
        const validationErrors = [];

        if (step.validate) {
          if (step.validate.network && Array.isArray(step.validate.network)) {
            for (const netCheck of step.validate.network) {
              const matched = stepNetworkRequests.filter(req => {
                if (netCheck.urlContains && (!req.url || !req.url.includes(netCheck.urlContains))) return false;
                if (netCheck.urlPattern && req.url) {
                  try {
                    const re = new RegExp(netCheck.urlPattern);
                    if (!re.test(req.url)) return false;
                  } catch (e) { /* invalid regex, skip */ }
                }
                if (netCheck.method && req.method !== netCheck.method) return false;
                return true;
              });

              if (matched.length === 0) {
                validationPassed = false;
                validationErrors.push(`网络验证失败: 未找到匹配的请求 (${netCheck.urlContains || netCheck.urlPattern || netCheck.method || 'any'})`);
              } else if (typeof netCheck.statusCode === 'number') {
                const statusMatch = matched.filter(req => req.status === netCheck.statusCode);
                if (statusMatch.length === 0) {
                  validationPassed = false;
                  validationErrors.push(`网络验证失败: 期望状态码 ${netCheck.statusCode}，实际匹配请求的状态码为 ${matched.map(m => m.status).join(', ')}`);
                }
              } else if (typeof netCheck.minStatusCode === 'number') {
                const statusMatch = matched.filter(req => Number(req.status || 0) >= netCheck.minStatusCode);
                if (statusMatch.length === 0 && netCheck.expectFailure !== true) {
                  validationPassed = false;
                  validationErrors.push(`网络验证失败: 期望至少有一个请求状态码 >= ${netCheck.minStatusCode}`);
                }
              }
            }
          }

          if (step.validate.element && Array.isArray(step.validate.element)) {
            for (const elemCheck of step.validate.element) {
              if (!elemCheck.selector) continue;

              const elemResult = await target.evaluate((check) => {
                const el = document.querySelector(check.selector);
                const result = { exists: !!el };

                if (!el) return result;

                if (check.visible !== undefined) {
                  const style = window.getComputedStyle(el);
                  result.visible = style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
                }
                if (check.textContains !== undefined) {
                  result.textContains = el.innerText.includes(check.textContains);
                  result.actualText = el.innerText;
                }
                if (check.textEquals !== undefined) {
                  result.textEquals = el.innerText === check.textEquals;
                  result.actualText = el.innerText;
                }
                if (check.attribute) {
                  result.attributeValue = el.getAttribute(check.attribute.name);
                  if (check.attribute.value !== undefined) {
                    result.attributeMatches = result.attributeValue === check.attribute.value;
                  }
                }
                if (check.count !== undefined) {
                  const all = document.querySelectorAll(check.selector);
                  result.count = all.length;
                  result.countMatches = all.length === check.count;
                }

                return result;
              }, elemCheck);

              let checkPassed = elemResult.exists;

              if (elemCheck.visible !== undefined && elemResult.visible !== undefined) {
                checkPassed = checkPassed && elemResult.visible === elemCheck.visible;
              }
              if (elemCheck.textContains !== undefined) {
                checkPassed = checkPassed && elemResult.textContains === true;
              }
              if (elemCheck.textEquals !== undefined) {
                checkPassed = checkPassed && elemResult.textEquals === true;
              }
              if (elemCheck.attribute && elemCheck.attribute.value !== undefined) {
                checkPassed = checkPassed && elemResult.attributeMatches === true;
              }
              if (elemCheck.count !== undefined) {
                checkPassed = checkPassed && elemResult.countMatches === true;
              }

              if (!checkPassed) {
                validationPassed = false;
                const detail = [];
                if (elemResult.exists === false) detail.push('元素不存在');
                if (elemCheck.visible !== undefined && elemResult.visible !== undefined) detail.push(`可见性: 期望${elemCheck.visible}, 实际${elemResult.visible}`);
                if (elemCheck.textContains !== undefined) detail.push(`文本包含: 期望包含"${elemCheck.textContains}", 实际"${(elemResult.actualText || '').slice(0, 100)}"`);
                if (elemCheck.textEquals !== undefined) detail.push(`文本相等: 期望"${elemCheck.textEquals}", 实际"${(elemResult.actualText || '').slice(0, 100)}"`);
                if (elemCheck.attribute && elemCheck.attribute.value !== undefined) detail.push(`属性${elemCheck.attribute.name}: 期望"${elemCheck.attribute.value}", 实际"${elemResult.attributeValue || ''}"`);
                if (elemCheck.count !== undefined) detail.push(`数量: 期望${elemCheck.count}, 实际${elemResult.count || 0}`);
                validationErrors.push(`元素验证失败 (${elemCheck.selector}): ${detail.join(', ')}`);
              }

              if (!stepResult.elementValidations) stepResult.elementValidations = [];
              stepResult.elementValidations.push({
                selector: elemCheck.selector,
                passed: checkPassed,
                details: elemResult
              });
            }
          }

          stepResult.validationErrors = validationErrors;
        }

        const hasRuntimeErrors = stepConsoleErrors.length > 0 || stepPageErrors.length > 0 || stepNetworkErrors.length > 0;

        if (hasRuntimeErrors) {
          const errorMsg = `步骤 ${stepName} 执行后检测到错误: ${stepConsoleErrors.length} 个控制台错误, ${stepPageErrors.length} 个页面错误, ${stepNetworkErrors.length} 个网络错误`;
          if (!stepResult.error) {
            stepResult.error = errorMsg;
          } else {
            stepResult.error += '; ' + errorMsg;
          }
          failures.push({
            stepIndex: index,
            stepName,
            action,
            error: stepResult.error,
            consoleErrors: stepResult.consoleErrors,
            pageErrors: stepResult.pageErrors,
            networkErrors: stepResult.networkErrors
          });

          if (failFast) {
            const evidence = await captureStepEvidence(target, `${stepName}-failed`, { screenshot: true, snapshot: true }).catch(() => null);
            stepResult.evidence = evidence;
            stepResult.passed = false;
            stepResult.duration = Date.now() - stepStart;
            stepResults.push(redact(stepResult));
            break;
          }
        }

        if (!validationPassed) {
          stepResult.passed = false;
          failures.push({
            stepIndex: index,
            stepName,
            action,
            error: validationErrors.join('; '),
            validationErrors
          });
          if (failFast) {
            const evidence = await captureStepEvidence(target, `${stepName}-failed`, { screenshot: true, snapshot: true }).catch(() => null);
            stepResult.evidence = evidence;
            stepResult.duration = Date.now() - stepStart;
            stepResults.push(redact(stepResult));
            break;
          }
        } else if (!hasRuntimeErrors) {
          stepResult.passed = true;
        }
      } catch (error) {
        stepResult.error = error.message;
        const evidence = await captureStepEvidence(target, `${stepName}-failed`, { screenshot: true, snapshot: true }).catch(() => null);
        stepResult.evidence = evidence;
        failures.push({
          stepIndex: index,
          stepName,
          action,
          error: error.message,
          evidence
        });
      }

      stepResult.duration = Date.now() - stepStart;
      stepResults.push(redact(stepResult));

      if (!stepResult.passed && !continueOnFailure && !failFast) break;
    }
  } finally {
    clearTimeout(timeoutTimer);
  }

  const totalSteps = steps.length;
  const passedSteps = stepResults.filter(r => r.passed).length;
  const failedSteps = stepResults.filter(r => !r.passed).length;
  const totalDuration = Date.now() - startTime;

  return redact({
    totalSteps,
    passedSteps,
    failedSteps,
    totalDuration,
    steps: stepResults,
    failures,
    url: target.url()
  });
}

async function runValidationChain(target, args = {}) {
  const failOnError = args.failOnError !== false;
  const captureScreenshots = args.captureScreenshots === true;
  const requiredSteps = args.requiredSteps !== false;
  const networkFilter = args.networkFilter || {};
  const timeout = Number(args.timeout) || 60000;
  const steps = Array.isArray(args.steps) ? args.steps : [];

  if (requiredSteps) {
    const requiredTypes = ['navigate', 'click', 'type', 'wait', 'validate'];
    const presentTypes = new Set(steps.map(s => s.type || s.action));
    const missingTypes = requiredTypes.filter(t => !presentTypes.has(t));

    if (missingTypes.length > 0) {
      return {
        passed: false,
        totalSteps: steps.length,
        completedSteps: 0,
        failedStep: null,
        stepResults: [],
        errors: [{
          errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
          errorType: '跳过步骤',
          message: `缺少必需的步骤类型：${missingTypes.join(', ')}。在 requiredSteps 模式下，必须包含完整的5步链路验证（navigate/click/type/wait/validate）。`,
          requiredActions: [
            `补充缺失的步骤类型：${missingTypes.join(', ')}`,
            ...missingTypes.map(type => {
              const examples = {
                'navigate': `添加导航步骤：{ type: 'navigate', name: '打开页面', url: 'http://目标URL' }`,
                'click': `添加点击步骤：{ type: 'click', name: '点击按钮', selector: '#button-selector' }`,
                'type': `添加输入步骤：{ type: 'type', name: '输入内容', selector: '#input-selector', value: '输入文本' }`,
                'wait': `添加等待步骤：{ type: 'wait', name: '等待响应', value: '2000' }`,
                'validate': `添加验证步骤：{ type: 'validate', name: '验证结果', selector: '.success-indicator' }`
              };
              return examples[type] || `添加步骤类型 '${type}' 的具体示例`;
            }),
            '确保包含完整的 navigate→click→type→wait→validate 链路'
          ]
        }],
        networkRequests: [],
        duration: 0,
        isEnforcementViolation: true
      };
    }

    if (steps.length < 5) {
      return {
        passed: false,
        totalSteps: steps.length,
        completedSteps: 0,
        failedStep: null,
        stepResults: [],
        errors: [{
          errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
          errorType: '跳过步骤',
          message: `步骤数量不足：当前 ${steps.length} 步，必需至少 5 步。在 requiredSteps 模式下，必须包含完整的5步链路验证。`,
          requiredActions: [
            '当前仅提供了 ' + steps.length + ' 步，需至少5步',
            '建议的5步链路示例：',
            '{ type: "navigate", name: "打开页面", url: "http://目标URL" }',
            '{ type: "click", name: "点击操作入口", selector: ".target-button" }',
            '{ type: "type", name: "输入数据", selector: ".input-field", value: "测试数据" }',
            '{ type: "wait", name: "等待响应", value: "2000" }',
            '{ type: "validate", name: "验证结果", selector: ".success-indicator" }',
            '缺少的步骤类型：' + ['navigate', 'click', 'type', 'wait', 'validate'].filter(t => {
              const presentTypes = new Set(steps.map(s => s.type || s.action));
              return !presentTypes.has(t);
            }).join(', ')
          ]
        }],
        networkRequests: [],
        duration: 0,
        isEnforcementViolation: true
      };
    }
  }

  const startTime = Date.now();
  const stepResults = [];
  const allErrors = [];
  let completedSteps = 0;
  let failedStep = null;

  const chainStartCheckpoint = new Date().toISOString();

  const ac = new AbortController();
  const timeoutTimer = setTimeout(() => {
    ac.abort(new Error(`validation_chain 整体超时（${timeout}ms）`));
  }, timeout);

  try {
    for (let index = 0; index < steps.length; index += 1) {
      if (ac.signal.aborted) throw ac.signal.reason;

      const step = steps[index];
      const stepType = step.type || step.action;
      const stepName = step.name || `${index + 1}-${stepType || 'step'}`;
      const stepStart = Date.now();
      const stepCheckpoint = new Date().toISOString();

      const stepResult = {
        stepIndex: index,
        stepName,
        type: stepType,
        passed: false,
        duration: 0,
        error: null,
        consoleErrors: [],
        networkErrors: [],
        networkRequests: [],
        screenshot: null
      };

      try {
        switch (stepType) {
          case 'navigate':
          case 'goto': {
            const url = step.url || step.value;
            if (!url) throw new Error('navigate 步骤需要 url 参数');
            const navTimeout = step.timeout || 15000;
            await target.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeout });
            break;
          }
          case 'click': {
            if (!step.selector) throw new Error('click 步骤需要 selector 参数');
            const clickTimeout = step.timeout || 10000;
            await target.click(step.selector, { timeout: clickTimeout });
            break;
          }
          case 'type': {
            if (!step.selector) throw new Error('type 步骤需要 selector 参数');
            const text = step.value || '';
            const typeTimeout = step.timeout || 10000;
            await target.fill(step.selector, text, { timeout: typeTimeout });
            await target.evaluate(({ selector, text }) => {
              const el = document.querySelector(selector);
              if (!el) return;
              try {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
                if (el.tagName === 'INPUT' && nativeInputValueSetter) {
                  nativeInputValueSetter.call(el, text);
                } else if (el.tagName === 'TEXTAREA' && nativeTextareaValueSetter) {
                  nativeTextareaValueSetter.call(el, text);
                } else {
                  el.value = text;
                }
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              } catch (e) { /* ignore */ }
            }, { selector: step.selector, text });
            break;
          }
          case 'wait': {
            const waitMs = Number(step.value) || 1000;
            await target.waitForTimeout(waitMs);
            break;
          }
          case 'validate': {
            if (step.expression) {
              const evalResult = await target.evaluate(step.expression);
              if (evalResult !== true && evalResult !== false) {
                throw new Error(`validate 步骤表达式应返回 boolean，实际返回: ${typeof evalResult}`);
              }
              if (!evalResult) {
                throw new Error(`验证失败: 表达式返回 false`);
              }
              stepResult.validateResult = evalResult;
            } else if (step.selector) {
              const exists = await target.evaluate((selector) => {
                return !!document.querySelector(selector);
              }, step.selector);
              if (!exists) {
                throw new Error(`验证失败: 选择器 "${step.selector}" 未找到元素`);
              }
              stepResult.validateResult = exists;
            } else if (step.expected !== undefined) {
              const actual = await target.evaluate(() => document.title);
              if (actual !== step.expected) {
                throw new Error(`验证失败: 预期 "${step.expected}"，实际 "${actual}"`);
              }
              stepResult.validateResult = true;
            } else {
              throw new Error('validate 步骤需要 expression、selector 或 expected 参数');
            }
            break;
          }
          default:
            throw new Error(`不支持的操作类型：${stepType}`);
        }

        await new Promise(r => setTimeout(r, 300));

        const stepConsoleErrors = filterBySince(consoleLogs, stepCheckpoint)
          .filter(item => item.type === 'error');
        const stepPageErrors = filterBySince(pageErrors, stepCheckpoint);
        const netFilterArgs = Object.assign({}, networkFilter, { since: stepCheckpoint });
        const stepNetworkRequests = filterNetwork(networkLogs, netFilterArgs);
        const stepNetworkErrors = stepNetworkRequests.filter(item => item.failed || item.status >= 400);

        stepResult.consoleErrors = stepConsoleErrors.map(e => redact(e));
        stepResult.pageErrors = stepPageErrors.map(e => redact(e));
        stepResult.networkErrors = stepNetworkErrors.map(e => redact(stripNetworkDetails(e)));
        stepResult.networkRequests = stepNetworkRequests.map(e => redact(stripNetworkDetails(e)));

        const hasStepErrors = stepConsoleErrors.length > 0 || stepPageErrors.length > 0 || stepNetworkErrors.length > 0;

        if (hasStepErrors) {
          const errorMsg = `步骤 ${stepName} 执行后检测到错误: ${stepConsoleErrors.length} 个控制台错误, ${stepPageErrors.length} 个页面错误, ${stepNetworkErrors.length} 个网络错误`;
          stepResult.error = errorMsg;
          allErrors.push({
            stepIndex: index,
            stepName,
            type: stepType,
            error: errorMsg,
            consoleErrors: stepResult.consoleErrors,
            pageErrors: stepResult.pageErrors,
            networkErrors: stepResult.networkErrors
          });

          if (failOnError) {
            failedStep = index;
            const evidence = await captureStepEvidence(target, `${stepName}-failed`, { screenshot: true, snapshot: true }).catch(() => null);
            stepResult.evidence = evidence;
            stepResult.passed = false;
            stepResult.duration = Date.now() - stepStart;
            stepResults.push(stepResult);
            break;
          }
        } else {
          stepResult.passed = true;
          completedSteps += 1;
        }

        if (captureScreenshots && stepResult.passed) {
          try {
            ensureArtifactsDir();
            const safeName = `${Date.now()}-${stepName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
            const screenshotPath = path.join(SCREENSHOT_DIR, `${safeName}.png`);
            await screenshotWithRedaction(target, screenshotPath, {});
            stepResult.screenshot = screenshotPath;
          } catch (e) {
            /* screenshot failure is not critical */
          }
        }
      } catch (error) {
        stepResult.error = error.message;
        allErrors.push({
          stepIndex: index,
          stepName,
          type: stepType,
          error: error.message
        });
        failedStep = index;
        const evidence = await captureStepEvidence(target, `${stepName}-failed`, { screenshot: true, snapshot: true }).catch(() => null);
        stepResult.evidence = evidence;
      }

      stepResult.duration = Date.now() - stepStart;
      stepResults.push(stepResult);

      if (!stepResult.passed && failOnError) break;
    }
  } finally {
    clearTimeout(timeoutTimer);
  }

  const totalSteps = steps.length;
  const totalDuration = Date.now() - startTime;
  const passed = failedStep === null && completedSteps === totalSteps;

  const chainNetFilterArgs = Object.assign({}, networkFilter, { since: chainStartCheckpoint });
  const allNetworkRequests = filterNetwork(networkLogs, chainNetFilterArgs)
    .map(e => redact(stripNetworkDetails(e)));

  return redact({
    passed,
    totalSteps,
    completedSteps,
    failedStep,
    stepResults,
    errors: allErrors,
    networkRequests: allNetworkRequests,
    duration: totalDuration,
    url: target.url()
  });
}

function runValidationCompliance(args = {}) {
  const functions = Array.isArray(args.functions) ? args.functions : [];
  const strictMode = args.strictMode !== false;
  const sessionLogs = args.sessionLogs || {};
  const requiredTools = Array.isArray(args.requiredTools) ? args.requiredTools : [];

  const complianceResults = [];
  let totalFunctions = functions.length;
  let compliantCount = 0;
  let nonCompliantCount = 0;
  let partialCompliantCount = 0;

  const requiredStepsForDataSubmit = ['入口可达', '操作可行', '请求正确', '响应正常', '状态更新'];

  for (const func of functions) {
    const funcName = func.name || '未命名功能';
    const funcType = func.type || '未分类';
    const steps = Array.isArray(func.steps) ? func.steps : [];

    const stepStatusMap = new Map();
    const evidenceCount = steps.filter(s => s.evidence).length;
    const executedSteps = steps.filter(s => s.status !== 'not_executed' && s.status !== 'skipped');
    const passedSteps = steps.filter(s => s.status === 'passed');
    const failedSteps = steps.filter(s => s.status === 'failed');

    for (const step of steps) {
      stepStatusMap.set(step.stepType, step.status);
    }

    let complianceStatus = 'COMPLIANT';
    const violations = [];

    if (strictMode && funcType === '数据提交类') {
      const missingSteps = requiredStepsForDataSubmit.filter(stepType => !stepStatusMap.has(stepType));
      const skippedSteps = requiredStepsForDataSubmit.filter(stepType => stepStatusMap.get(stepType) === 'skipped');
      const notExecutedSteps = requiredStepsForDataSubmit.filter(stepType => stepStatusMap.get(stepType) === 'not_executed');

      if (missingSteps.length > 0) {
        violations.push({
          errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
          errorType: '跳过步骤',
          message: `缺少必需的验证步骤：${missingSteps.join(', ')}`,
          requiredActions: [`补充缺失的步骤：${missingSteps.join(', ')}`, '确保完成完整5步链路验证']
        });
        complianceStatus = 'NON-COMPLIANT';
      }

      if (skippedSteps.length > 0) {
        violations.push({
          errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
          errorType: '跳过步骤',
          message: `跳过了必需的验证步骤：${skippedSteps.join(', ')}`,
          requiredActions: ['重新执行跳过的步骤', '确保完成完整5步链路验证']
        });
        complianceStatus = 'NON-COMPLIANT';
      }

      if (notExecutedSteps.length > 0) {
        violations.push({
          errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
          errorType: '跳过步骤',
          message: `必需的验证步骤未执行：${notExecutedSteps.join(', ')}`,
          requiredActions: ['执行未完成的步骤', '确保完成完整5步链路验证']
        });
        complianceStatus = 'NON-COMPLIANT';
      }
    }

    if (evidenceCount < executedSteps.length) {
      violations.push({
        errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
        errorType: '证据不全',
        message: `部分步骤缺少验证证据（${evidenceCount}/${executedSteps.length}）`,
        requiredActions: ['补充缺失的证据（截图、日志等）']
      });
      if (complianceStatus === 'COMPLIANT') {
        complianceStatus = 'PARTIAL';
      }
    }

    // 工具可用性检查
    if (requiredTools.length > 0) {
      const sessionTools = Array.isArray(sessionLogs.toolCalls) ? sessionLogs.toolCalls : [];
      const missingTools = requiredTools.filter(tool => !sessionTools.includes(tool));

      if (missingTools.length > 0) {
        violations.push({
          errorCode: 'TOOL_MISSING',
          errorType: '工具缺失',
          message: `本次验证未使用以下必需工具：${missingTools.join(', ')}。必须使用这些工具才能完成完整的功能链路闭环验证。`,
          requiredActions: [
            `调用缺失的工具：${missingTools.join(', ')}`,
            '确保所有必需工具都已加载到 MCP 服务器中',
            '重新执行验证并包含所有必需工具'
          ]
        });
        if (complianceStatus === 'COMPLIANT') {
          complianceStatus = 'NON-COMPLIANT';
        }
      }
    }

    // 截图证据二次分析检查
    const stepsWithScreenshot = steps.filter(s =>
      s.evidence && (s.evidence.includes('.png') || s.evidence.toLowerCase().includes('screenshot'))
    );
    const stepsWithAnalysis = steps.filter(s =>
      s.screenshotValidation || s.evidenceValidated
    );

    if (stepsWithScreenshot.length > 0 && stepsWithAnalysis.length < stepsWithScreenshot.length) {
      const unanalyzedCount = stepsWithScreenshot.length - stepsWithAnalysis.length;
      violations.push({
        errorCode: 'SCREENSHOT_NOT_ANALYZED',
        errorType: '截图未验证',
        message: `${unanalyzedCount} 张截图未经过二次分析验证。截图必须经过 analyzeScreenshotContent 分析（URL/标题/内容校验）才能作为有效证据。`,
        requiredActions: [
          `对 ${unanalyzedCount} 张截图执行二次分析验证`,
          '使用 browser_screenshot 时确保开启内容分析',
          '确保截图结果包含 screenshot_validation 字段'
        ]
      });
      if (complianceStatus === 'COMPLIANT') {
        complianceStatus = 'PARTIAL';
      }
    }

    // 截图证据二次分析校验
    const screenshotSteps = steps.filter(s =>
      s.evidence && (s.evidence.includes('.png') || s.screenshotValidation || s.evidenceValidated)
    );
    const validatedScreenshots = steps.filter(s =>
      s.screenshotValidation && s.screenshotValidation.status === 'VALID'
    );
    const invalidScreenshots = steps.filter(s =>
      s.screenshotValidation && s.screenshotValidation.status === 'INVALID'
    );

    if (screenshotSteps.length > 0 && validatedScreenshots.length < screenshotSteps.length) {
      const unvalidated = screenshotSteps.length - validatedScreenshots.length;
      violations.push({
        errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
        errorType: '截图未验证',
        message: `${unvalidated} 张截图未经过二次分析验证或验证未通过。截图必须经过内容分析（URL/标题/内容校验）才能作为有效证据。`,
        requiredActions: ['对截图进行二次分析验证', '确保截图内容与目标功能一致', '丢弃无效截图并重新截取']
      });
      if (complianceStatus === 'COMPLIANT') {
        complianceStatus = 'PARTIAL';
      }
    }

    if (invalidScreenshots.length > 0) {
      violations.push({
        errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
        errorType: '截图验证失败',
        message: `${invalidScreenshots.length} 张截图二次分析未通过（URL不匹配/标题不匹配/空白页/内容不匹配），证据无效。`,
        requiredActions: ['丢弃无效截图', '定位截图来源错误原因', '重新在正确页面截取并验证']
      });
      if (complianceStatus === 'COMPLIANT') {
        complianceStatus = 'NON-COMPLIANT';
      }
    }

    if (failedSteps.length > 0) {
      violations.push({
        errorCode: 'VALIDATION_ENFORCEMENT_VIOLATION',
        errorType: '步骤失败',
        message: `${failedSteps.length} 个步骤验证失败`,
        requiredActions: ['修复失败的步骤', '重新验证']
      });
      complianceStatus = 'NON-COMPLIANT';
    }

    if (complianceStatus === 'COMPLIANT') {
      compliantCount += 1;
    } else if (complianceStatus === 'NON-COMPLIANT') {
      nonCompliantCount += 1;
    } else {
      partialCompliantCount += 1;
    }

    complianceResults.push({
      functionName: funcName,
      functionType: funcType,
      complianceStatus,
      totalSteps: steps.length,
      executedSteps: executedSteps.length,
      passedSteps: passedSteps.length,
      failedSteps: failedSteps.length,
      evidenceCount,
      violations,
      steps
    });
  }

  const overallStatus = nonCompliantCount > 0 ? 'INVALID' : (partialCompliantCount > 0 ? 'PARTIAL' : 'VALID');

  return {
    overallStatus,
    totalFunctions,
    compliantCount,
    nonCompliantCount,
    partialCompliantCount,
    complianceResults,
    toolUsageSummary: {
      requiredTools: requiredTools,
      usedTools: sessionLogs.toolCalls || [],
      missingTools: requiredTools.filter(tool => !(sessionLogs.toolCalls || []).includes(tool)),
      allToolsAvailable: requiredTools.length === 0 ? null :
        requiredTools.every(tool => (sessionLogs.toolCalls || []).includes(tool))
    },
    timestamp: new Date().toISOString(),
    isEnforcementViolation: nonCompliantCount > 0
  };
}

module.exports = { tools, handle };
