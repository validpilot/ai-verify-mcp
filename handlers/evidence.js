'use strict';

// Handler: evidence
// Extracted from server.js callTool switch statements

const tools = [
  "browser_screenshot",
  "browser_screenshot_element",
  "browser_artifacts",
  "browser_artifacts_clear",
  "browser_har_export",
  "browser_step",
  "browser_trace_start",
  "browser_trace_stop"
];

async function handle(name, args, deps) {

  // === Bridge deps into scope via globalThis ===
  const _depsKeys = Object.keys(deps);
  const _depsPrev = {};
  for (const k of _depsKeys) { _depsPrev[k] = globalThis[k]; globalThis[k] = deps[k]; }
  try {
  // ====== browser_screenshot ======
  if (name === 'browser_screenshot') {
const { target } = await ensurePage();
    ensureArtifactsDir();
    const safeName = (args.name || `screenshot-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(SCREENSHOT_DIR, `${safeName}.png`);
    await screenshotWithRedaction(target, filePath, args);

    // 截图后二次分析错误
    const analysis = await analyzeScreenshotForErrors(target, filePath);

    if (analysis.hasErrors) {
      return text(JSON.stringify({
        image: filePath,
        success: true,
        error_analysis: {
          has_errors: true,
          visible_error_count: analysis.visibleErrors.length,
          console_error_count: analysis.consoleErrors.length,
          total_errors: analysis.errorCount,
          visible_errors: analysis.visibleErrors.map(e => ({ selector: e.selector, text: e.text.slice(0, 100) })),
          console_errors: analysis.consoleErrors.map(e => e.text)
        },
        tip: '截图检测到错误，请使用 browser_errors 查看完整错误详情'
      }, null, 2));
    }

    return text(JSON.stringify({ image: filePath, success: true, error_analysis: { has_errors: false } }, null, 2));
  }

  // ====== browser_screenshot_element ======
  if (name === 'browser_screenshot_element') {
const { target } = await ensurePage();
    ensureArtifactsDir();
    const selector = args.selector;
    if (!selector) {
      return { isError: true, content: [{ type: 'text', text: 'browser_screenshot_element 需要提供 selector 参数' }] };
    }
    const padding = args.padding || 0;
    const safeName = (args.name || `element-screenshot-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(SCREENSHOT_DIR, `${safeName}.png`);

    try {
      const element = await target.$(selector);
      if (!element) {
        return { isError: true, content: [{ type: 'text', text: `未找到选择器 "${selector}" 对应的元素` }] };
      }
      
      const box = await element.boundingBox();
      if (!box) {
        return { isError: true, content: [{ type: 'text', text: `元素 "${selector}" 不可见或尺寸为0` }] };
      }

      const clip = {
        x: Math.max(0, box.x - padding),
        y: Math.max(0, box.y - padding),
        width: box.width + padding * 2,
        height: box.height + padding * 2
      };

      await target.screenshot({ path: filePath, clip, omitBackground: false });

      return text(JSON.stringify({
        image: filePath,
        success: true,
        selector,
        elementSize: { width: box.width, height: box.height },
        screenshotSize: { width: clip.width, height: clip.height },
        padding
      }, null, 2));
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: `元素截图失败: ${e.message}` }] };
    }
  }

  // ====== browser_artifacts ======
  if (name === 'browser_artifacts') {
  return text(JSON.stringify(getArtifacts(), null, 2));
  }

  // ====== browser_artifacts_clear ======
  if (name === 'browser_artifacts_clear') {
  return text(JSON.stringify(clearArtifacts(args), null, 2));
  }

  // ====== browser_har_export ======
  if (name === 'browser_har_export') {
  return text(JSON.stringify(exportHar(args), null, 2));
  }

  // ====== browser_step ======
  if (name === 'browser_step') {
const { target } = await ensurePage();
    return text(JSON.stringify(await captureStepEvidence(target, args.label || 'manual-step', args), null, 2));
  }

  // ====== browser_trace_start ======
  if (name === 'browser_trace_start') {
const { target } = await ensurePage(args);
    return text(JSON.stringify(await startTrace(target, args), null, 2));
  }

  // ====== browser_trace_stop ======
  if (name === 'browser_trace_stop') {
const { target } = await ensurePage(args);
    return text(JSON.stringify(await stopTrace(target, args), null, 2));
  }

  return { isError: true, content: [{ type: 'text', text: `未知工具（evidence）: ${name}` }] };
  } finally {
    for (const k of _depsKeys) { deps[k] = globalThis[k]; }
    for (const k of _depsKeys) { if (k in _depsPrev) globalThis[k] = _depsPrev[k]; else delete globalThis[k]; }
  }

}

module.exports = { tools, handle };
