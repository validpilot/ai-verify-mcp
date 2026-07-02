'use strict';

// Handler: visual
// Extracted from server.js callTool switch statements

const { mcpError } = require('../core/mcp-error');

const tools = [
  "browser_visual_baseline",
  "browser_visual_compare",
  "browser_visual_report",
  "browser_a11y_check",
  "screenshot_diff",
  "browser_full_audit",
  "browser_performance_check",
  "browser_memory_check",
  "browser_visual_component",
  "browser_performance_trace",
  "browser_lighthouse_audit",
  "browser_responsive_test"
];

async function handle(name, args, deps) {

  // === Bridge deps into scope via globalThis ===
  const _depsKeys = Object.keys(deps);
  const _depsPrev = {};
  for (const k of _depsKeys) { _depsPrev[k] = globalThis[k]; globalThis[k] = deps[k]; }
  try {
  // ====== browser_visual_baseline ======
  if (name === 'browser_visual_baseline') {
const { target } = await ensurePage(args);
    const _result = await visualBaseline(target, args);
    return text(JSON.stringify({ ..._result, nextSteps: ['运行 browser_screenshot 确认页面截图', '使用 browser_visual_compare 对比差异', '生成 browser_visual_report 视觉报告'], suggestions: [{ type: 'next', tool: 'browser_screenshot', reason: '确认页面截图' }, { type: 'next', tool: 'browser_visual_compare', reason: '对比视觉差异' }, { type: 'next', tool: 'browser_visual_report', reason: '生成视觉报告' }], paidUpgradeHint: '需要高级视觉分析能力？升级到 Pro 版本获取完整功能。' }, null, 2));
  }

  // ====== browser_visual_compare ======
  if (name === 'browser_visual_compare') {
const { target } = await ensurePage(args);
    const _result = await visualCompare(target, args);
    return text(JSON.stringify({ ..._result, nextSteps: ['运行 browser_screenshot 确认页面截图', '使用 browser_visual_compare 对比差异', '生成 browser_visual_report 视觉报告'], suggestions: [{ type: 'next', tool: 'browser_screenshot', reason: '确认页面截图' }, { type: 'next', tool: 'browser_visual_compare', reason: '对比视觉差异' }, { type: 'next', tool: 'browser_visual_report', reason: '生成视觉报告' }], paidUpgradeHint: '需要高级视觉分析能力？升级到 Pro 版本获取完整功能。' }, null, 2));
  }

  // ====== browser_visual_report ======
  if (name === 'browser_visual_report') {
  const _result = visualReport();
  return text(JSON.stringify({ ..._result, nextSteps: ['运行 browser_screenshot 确认页面截图', '使用 browser_visual_compare 对比差异', '生成 browser_visual_report 视觉报告'], suggestions: [{ type: 'next', tool: 'browser_screenshot', reason: '确认页面截图' }, { type: 'next', tool: 'browser_visual_compare', reason: '对比视觉差异' }, { type: 'next', tool: 'browser_visual_report', reason: '生成视觉报告' }], paidUpgradeHint: '需要高级视觉分析能力？升级到 Pro 版本获取完整功能。' }, null, 2));
  }

  // ====== browser_a11y_check ======
  if (name === 'browser_a11y_check') {
const { target } = await ensurePage(args);
    const _result = await runA11yCheck(target, args);
    return text(JSON.stringify({ ..._result, nextSteps: ['运行 browser_screenshot 确认页面截图', '生成 browser_visual_report 视觉报告'], suggestions: [{ type: 'next', tool: 'browser_screenshot', reason: '确认页面截图' }, { type: 'next', tool: 'browser_visual_report', reason: '生成视觉报告' }], paidUpgradeHint: '需要高级视觉分析能力？升级到 Pro 版本获取完整功能。' }, null, 2));
  }

  // ====== screenshot_diff ======
  if (name === 'screenshot_diff') {
  const _result = await evidenceCollector.screenshotDiff(args);
  return text(JSON.stringify({ ..._result, nextSteps: ['运行 browser_screenshot 确认页面截图', '使用 browser_visual_compare 对比差异', '生成 browser_visual_report 视觉报告'], suggestions: [{ type: 'next', tool: 'browser_screenshot', reason: '确认页面截图' }, { type: 'next', tool: 'browser_visual_compare', reason: '对比视觉差异' }, { type: 'next', tool: 'browser_visual_report', reason: '生成视觉报告' }], paidUpgradeHint: '需要高级视觉分析能力？升级到 Pro 版本获取完整功能。' }, null, 2));
  }

  // ====== browser_full_audit ======
  if (name === 'browser_full_audit') {
  const _result = await runFullAudit(args);
  return text(JSON.stringify({ ..._result, nextSteps: ['运行 browser_screenshot 确认页面截图', '使用 browser_visual_compare 对比差异', '生成 browser_visual_report 视觉报告'], suggestions: [{ type: 'next', tool: 'browser_screenshot', reason: '确认页面截图' }, { type: 'next', tool: 'browser_visual_compare', reason: '对比视觉差异' }, { type: 'next', tool: 'browser_visual_report', reason: '生成视觉报告' }], paidUpgradeHint: '需要高级视觉分析能力？升级到 Pro 版本获取完整功能。' }, null, 2));
  }

  // ====== browser_performance_check ======
  if (name === 'browser_performance_check') {
    const { target } = await ensurePage(args);
    const perfAnalyzer = require('../hands/perf_analyzer');
    const result = await perfAnalyzer.analyzePerformance(target);
    return text(JSON.stringify({ ...result, nextSteps: ['运行 browser_lighthouse_audit 进行 Lighthouse 审计', '使用 browser_performance_check 再次检查性能'], suggestions: [{ type: 'next', tool: 'browser_lighthouse_audit', reason: '进行 Lighthouse 审计' }, { type: 'next', tool: 'browser_performance_check', reason: '再次检查性能' }], paidUpgradeHint: '需要高级性能分析能力？升级到 Pro 版本获取完整功能。' }, null, 2));
  }

  // ====== browser_memory_check ======
  if (name === 'browser_memory_check') {
    const { target } = await ensurePage(args);
    const memoryAnalyzer = require('../hands/memory_analyzer');
    const result = await memoryAnalyzer.detectMemoryLeaks(target);
    return text(JSON.stringify({ ...result, nextSteps: ['运行 browser_performance_check 检查性能', '使用 browser_lighthouse_audit 进行 Lighthouse 审计'], suggestions: [{ type: 'next', tool: 'browser_performance_check', reason: '检查页面性能' }, { type: 'next', tool: 'browser_lighthouse_audit', reason: '进行 Lighthouse 审计' }], paidUpgradeHint: '需要高级性能分析能力？升级到 Pro 版本获取完整功能。' }, null, 2));
  }

  // ====== browser_visual_component ======
  if (name === 'browser_visual_component') {
    const { target } = await ensurePage(args);
    if (!args.name || !args.selector) {
      return text(JSON.stringify({ error: '缺少 name 或 selector 参数' }, null, 2));
    }
    const fs = require('fs');
    const path = require('path');
    const baselineDir = VISUAL_BASELINE_DIR || path.join(process.cwd(), 'artifacts', 'visual', 'baselines');
    const actualDir = VISUAL_ACTUAL_DIR || path.join(process.cwd(), 'artifacts', 'visual', 'actual');
    fs.mkdirSync(baselineDir, { recursive: true });
    fs.mkdirSync(actualDir, { recursive: true });
    const safeName = String(args.name).replace(/[^a-z0-9_.-]/gi, '_');
    const baselinePath = path.join(baselineDir, `${safeName}.png`);
    const actualPath = path.join(actualDir, `${safeName}-${Date.now()}.png`);
    const locator = target.locator(args.selector).first();
    await locator.screenshot({ path: actualPath });
    if (!fs.existsSync(baselinePath)) {
      fs.copyFileSync(actualPath, baselinePath);
      return text(JSON.stringify({ name: args.name, selector: args.selector, baseline_created: true, baselinePath, actualPath, passed: true, nextSteps: ['运行 browser_screenshot 确认页面截图', '使用 browser_visual_compare 对比差异', '生成 browser_visual_report 视觉报告'], suggestions: [{ type: 'next', tool: 'browser_screenshot', reason: '确认页面截图' }, { type: 'next', tool: 'browser_visual_compare', reason: '对比视觉差异' }, { type: 'next', tool: 'browser_visual_report', reason: '生成视觉报告' }], paidUpgradeHint: '需要高级视觉分析能力？升级到 Pro 版本获取完整功能。' }, null, 2));
    }
    const diff = await evidenceCollector.screenshotDiff({ before: baselinePath, after: actualPath, threshold: args.maxDiffPixelRatio ?? 0.01 });
    const diffRatio = diff.diffRatio ?? diff.diffPercentage ?? 0;
    return text(JSON.stringify({ name: args.name, selector: args.selector, baselinePath, actualPath, diffRatio, passed: diffRatio <= (args.maxDiffPixelRatio ?? 0.01), diff, nextSteps: ['运行 browser_screenshot 确认页面截图', '使用 browser_visual_compare 对比差异', '生成 browser_visual_report 视觉报告'], suggestions: [{ type: 'next', tool: 'browser_screenshot', reason: '确认页面截图' }, { type: 'next', tool: 'browser_visual_compare', reason: '对比视觉差异' }, { type: 'next', tool: 'browser_visual_report', reason: '生成视觉报告' }], paidUpgradeHint: '需要高级视觉分析能力？升级到 Pro 版本获取完整功能。' }, null, 2));
  }

  // ====== browser_performance_trace ======
  if (name === 'browser_performance_trace') {
    const { target } = await ensurePage(args);
    const fs = require('fs');
    const path = require('path');

    // Navigate if URL provided
    if (args.url) {
      await target.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    const duration = args.duration || 5000;
    const categories = args.categories || ['navigation', 'resource', 'paint', 'longtask'];

    // Collect performance data using Performance API
    const perfData = await target.evaluate((opts) => {
      const { categories, duration } = opts;
      const perf = window.performance;

      // Get all entry types
      const entries = {};
      if (categories.includes('navigation')) {
        entries.navigation = perf.getEntriesByType('navigation');
      }
      if (categories.includes('resource')) {
        entries.resource = perf.getEntriesByType('resource');
      }
      if (categories.includes('paint')) {
        entries.paint = perf.getEntriesByType('paint');
      }
      if (categories.includes('longtask')) {
        entries.longtask = perf.getEntriesByType('longtask');
      }

      // Get timing data
      const timing = perf.timing;
      const navigation = perf.getEntriesByType('navigation')[0] || {};

      // Calculate metrics
      const fp = perf.getEntriesByType('paint').find(e => e.name === 'first-paint');
      const fcp = perf.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint');
      const lcpEntries = perf.getEntriesByType('largest-contentful-paint');
      const lcp = lcpEntries.length > 0 ? lcpEntries[lcpEntries.length - 1].startTime : 0;

      // CLS calculation
      let cls = 0;
      try {
        const layoutShifts = perf.getEntriesByType('layout-shift');
        cls = layoutShifts.reduce((sum, e) => sum + e.value, 0);
      } catch (e) {}

      // FID / First Input Delay
      const fidEntries = perf.getEntriesByType('first-input');
      const fid = fidEntries.length > 0 ? fidEntries[0].processingStart - fidEntries[0].startTime : 0;

      // Total Blocking Time (TBT)
      const tasks = perf.getEntriesByType('longtask');
      let tbt = 0;
      for (const task of tasks) {
        const blocking = task.duration - 50;
        if (blocking > 0) tbt += blocking;
      }

      // Resource statistics
      const resources = entries.resource || [];
      const resourceStats = {
        count: resources.length,
        byType: {},
        totalSize: 0,
        slowRequests: []
      };

      for (const r of resources) {
        const type = r.initiatorType || 'other';
        resourceStats.byType[type] = (resourceStats.byType[type] || 0) + 1;
        resourceStats.totalSize += r.transferSize || 0;
        if (r.duration > 1000) {
          resourceStats.slowRequests.push({
            url: r.name,
            duration: Math.round(r.duration),
            size: r.transferSize || 0,
            type: type
          });
        }
      }
      resourceStats.slowRequests.sort((a, b) => b.duration - a.duration);

      // Performance grade
      let grade = 'A';
      const lcpScore = lcp < 2500 ? 100 : lcp < 4000 ? 50 : 0;
      const clsScore = cls < 0.1 ? 100 : cls < 0.25 ? 50 : 0;
      const fidScore = fid < 100 ? 100 : fid < 300 ? 50 : 0;
      const tbtScore = tbt < 200 ? 100 : tbt < 600 ? 50 : 0;
      const totalScore = (lcpScore + clsScore + fidScore + tbtScore) / 4;
      if (totalScore < 50) grade = 'F';
      else if (totalScore < 70) grade = 'D';
      else if (totalScore < 85) grade = 'C';
      else if (totalScore < 95) grade = 'B';

      // Recommendations
      const recommendations = [];
      if (lcp > 2500) recommendations.push(`LCP 较慢 (${Math.round(lcp)}ms)：优化 Largest Contentful Paint 元素，考虑预加载关键资源`);
      if (cls > 0.1) recommendations.push(`CLS 较高 (${cls.toFixed(3)})：确保图片和广告有明确尺寸，避免动态内容插入`);
      if (fid > 100) recommendations.push(`FID 较高 (${Math.round(fid)}ms)：减少主线程阻塞，将长任务拆分`);
      if (tbt > 200) recommendations.push(`TBT 较长 (${Math.round(tbt)}ms)：优化第三方脚本，减少 JavaScript 执行时间`);
      if (resourceStats.slowRequests.length > 0) recommendations.push(`${resourceStats.slowRequests.length} 个慢请求（>1s）：考虑压缩、CDN 或缓存策略`);
      if (recommendations.length === 0) recommendations.push('性能指标良好，无需特殊优化');

      return {
        url: window.location.href,
        duration,
        metrics: {
          firstPaint: Math.round(fp?.startTime || 0),
          firstContentfulPaint: Math.round(fcp?.startTime || 0),
          largestContentfulPaint: Math.round(lcp),
          cumulativeLayoutShift: Math.round(cls * 1000) / 1000,
          domContentLoaded: Math.round(navigation.domContentLoadedEventEnd - navigation.fetchStart),
          load: Math.round(navigation.loadEventEnd - navigation.fetchStart),
          firstInputDelay: Math.round(fid),
          totalBlockingTime: Math.round(tbt),
          speedIndex: Math.round(fcp?.startTime || 0)
        },
        resourceCount: resources.length,
        resourceTypes: resourceStats.byType,
        slowRequests: resourceStats.slowRequests.slice(0, 10),
        entries: {
          navigation: navigation ? [{
            name: navigation.name,
            duration: Math.round(navigation.duration),
            domContentLoaded: Math.round(navigation.domContentLoadedEventEnd - navigation.fetchStart),
            load: Math.round(navigation.loadEventEnd - navigation.fetchStart)
          }] : [],
          paint: (entries.paint || []).map(e => ({ name: e.name, startTime: Math.round(e.startTime) })),
          longtask: (entries.longtask || []).map(e => ({ name: e.name, duration: Math.round(e.duration), startTime: Math.round(e.startTime) }))
        },
        grade,
        recommendations
      };
    }, { categories, duration });

    // Generate HAR if requested
    let har = null;
    if (args.exportHar !== false) {
      har = await target.evaluate(() => {
        const entries = performance.getEntriesByType('resource');
        const har = {
          log: {
            version: '1.2',
            creator: { name: 'ValidPilot', version: '1.3.0' },
            entries: entries.map(e => ({
              startedDateTime: new Date(performance.timeOrigin + e.startTime).toISOString(),
              time: Math.round(e.duration),
              request: {
                method: 'GET',
                url: e.name,
                httpVersion: 'HTTP/1.1',
                headers: [],
                queryString: [],
                cookies: [],
                headersSize: -1,
                bodySize: 0
              },
              response: {
                status: 200,
                statusText: 'OK',
                httpVersion: 'HTTP/1.1',
                headers: [],
                cookies: [],
                content: { size: e.transferSize || 0, mimeType: '' },
                redirectURL: '',
                headersSize: -1,
                bodySize: e.transferSize || 0
              },
              cache: {},
              timings: { wait: 0, send: 0, receive: Math.round(e.duration) }
            }))
          }
        };
        return har;
      });
    }

    return text(JSON.stringify({ success: true, ...perfData, har, nextSteps: ['运行 browser_performance_check 检查性能', '使用 browser_lighthouse_audit 进行 Lighthouse 审计'], suggestions: [{ type: 'next', tool: 'browser_performance_check', reason: '检查页面性能' }, { type: 'next', tool: 'browser_lighthouse_audit', reason: '进行 Lighthouse 审计' }], paidUpgradeHint: '需要高级性能分析能力？升级到 Pro 版本获取完整功能。' }, null, 2));
  }

  // ====== browser_lighthouse_audit ======
  if (name === 'browser_lighthouse_audit') {
  const _result = await runLighthouseAudit(args);
  return text(JSON.stringify({ ..._result, nextSteps: ['运行 browser_performance_check 检查性能'], suggestions: [{ type: 'next', tool: 'browser_performance_check', reason: '检查页面性能' }], paidUpgradeHint: '需要高级性能分析能力？升级到 Pro 版本获取完整功能。' }, null, 2));
  }

  // ====== browser_responsive_test ======
  if (name === 'browser_responsive_test') {
    const { target } = await ensurePage();
    const url = args.url;
    await target.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, args.waitMs || 1000));

    const viewportSizes = {
      mobile:  { width: 375, height: 812,  label: 'Mobile (375×812)' },
      tablet:  { width: 768, height: 1024, label: 'Tablet (768×1024)' },
      desktop: { width: 1280, height: 720, label: 'Desktop (1280×720)' },
    };
    const targets = (args.viewports || ['mobile', 'tablet', 'desktop'])
      .map(v => viewportSizes[v])
      .filter(Boolean);

    const screenshots = [];
    for (const vp of targets) {
      await target.setViewportSize({ width: vp.width, height: vp.height });
      await new Promise(r => setTimeout(r, 300));
      const buf = await target.screenshot({ type: 'png', fullPage: args.fullPage !== false });
      screenshots.push({
        viewport: vp.label,
        width: vp.width,
        height: vp.height,
        data: buf.toString('base64').slice(0, 500),
      });
    }

    return text(JSON.stringify({ url, viewportCount: screenshots.length, screenshots, nextSteps: ['运行 browser_screenshot 确认页面截图', '使用 browser_visual_compare 对比差异', '生成 browser_visual_report 视觉报告'], suggestions: [{ type: 'next', tool: 'browser_screenshot', reason: '确认页面截图' }, { type: 'next', tool: 'browser_visual_compare', reason: '对比视觉差异' }, { type: 'next', tool: 'browser_visual_report', reason: '生成视觉报告' }], paidUpgradeHint: '需要高级视觉分析能力？升级到 Pro 版本获取完整功能。' }, null, 2));
  }

  return mcpError(`未知工具（visual）: ${name}`, { error: 'UNKNOWN_TOOL', toolName: name });
  } finally {
    for (const k of _depsKeys) { deps[k] = globalThis[k]; }
    for (const k of _depsKeys) { if (k in _depsPrev) globalThis[k] = _depsPrev[k]; else delete globalThis[k]; }
  }

}

module.exports = { tools, handle };
