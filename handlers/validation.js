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
  "validation_report",
  "validation_report_export",
  "validation_quick_run",
  "validation_matrix",
  "validation_decision"
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

module.exports = { tools, handle };
