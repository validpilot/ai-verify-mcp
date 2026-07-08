'use strict';

// Handler: evidence
// Extracted from server.js callTool switch statements

const { mcpError, mcpParamMissing, mcpPageNotFound, mcpElementNotFound } = require('../core/mcp-error');

const tools = [
  "browser_screenshot",
  "browser_screenshot_element",
  "browser_artifacts",
  "browser_artifacts_clear",
  "browser_har_export",
  "browser_step",
  "browser_trace_start",
  "browser_trace_stop",
  "evidence_pack",
  "evidence_index",
  "trace_correlate"
];

function safeEvidenceName(name) {
  return String(name || `evidence-pack-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function extractApiResponses(networkEntries, limit = 10) {
  const apiResponses = [];
  for (const entry of networkEntries) {
    if (!entry.url || !entry.status) continue;
    const urlObj = new URL(entry.url);
    if (!urlObj.pathname.startsWith('/api/')) continue;
    let responseData = null;
    if (entry.responseBody && typeof entry.responseBody === 'string') {
      try { responseData = JSON.parse(entry.responseBody); } catch (_) { responseData = entry.responseBody.slice(0, 500); }
    }
    let traceId = entry.traceId || null;
    if (!traceId && typeof findTraceId === 'function') {
      const tp = findTraceId(entry.requestHeaders) || findTraceId(entry.responseHeaders);
      if (tp) traceId = tp.traceId;
    }
    apiResponses.push({
      url: entry.url,
      path: urlObj.pathname,
      method: entry.method || 'GET',
      status: entry.status,
      traceId,
      duration: entry.duration,
      responseData,
      responseSize: entry.responseBody ? entry.responseBody.length : 0
    });
    if (apiResponses.length >= limit) break;
  }
  return apiResponses;
}

function computeDataDiff(beforeData, afterData, path = '') {
  const diffs = [];
  if (beforeData === undefined || afterData === undefined) return diffs;
  if (typeof beforeData !== typeof afterData) {
    diffs.push({ path, before: beforeData, after: afterData, change: 'type_change' });
    return diffs;
  }
  if (Array.isArray(beforeData) && Array.isArray(afterData)) {
    diffs.push({ path, before: beforeData.length, after: afterData.length, change: 'length_change' });
    return diffs;
  }
  if (typeof beforeData === 'object' && beforeData !== null && afterData !== null) {
    const allKeys = new Set([...Object.keys(beforeData), ...Object.keys(afterData)]);
    for (const key of allKeys) {
      const childPath = path ? `${path}.${key}` : key;
      if (!(key in beforeData)) diffs.push({ path: childPath, before: undefined, after: afterData[key], change: 'added' });
      else if (!(key in afterData)) diffs.push({ path: childPath, before: beforeData[key], after: undefined, change: 'removed' });
      else if (JSON.stringify(beforeData[key]) !== JSON.stringify(afterData[key])) {
        if (typeof beforeData[key] === 'object' && beforeData[key] !== null && typeof afterData[key] === 'object') {
          diffs.push(...computeDataDiff(beforeData[key], afterData[key], childPath));
        } else {
          diffs.push({ path: childPath, before: beforeData[key], after: afterData[key], change: 'modified' });
        }
      }
    }
  } else if (beforeData !== afterData) {
    diffs.push({ path, before: beforeData, after: afterData, change: 'modified' });
  }
  return diffs;
}

function aggregateErrors(errors) {
  if (!errors) return { totalErrors: 0, byType: {}, byStatus: {}, topPatterns: [] };
  const consoleErrs = errors.consoleErrors || errors.console || [];
  const pageErrs = errors.pageErrors || [];
  const networkErrs = errors.networkErrors || errors.network || [];
  const totalErrors = consoleErrs.length + pageErrs.length + networkErrs.length;

  const byType = {
    console: consoleErrs.length,
    page: pageErrs.length,
    network: networkErrs.length
  };

  const byStatus = {};
  for (const e of networkErrs) {
    const status = e.status || 'unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  const patternMap = {};
  const allErrs = [
    ...consoleErrs.map(e => ({ text: typeof e === 'string' ? e : (e.text || e.message || JSON.stringify(e)), source: 'console' })),
    ...pageErrs.map(e => ({ text: typeof e === 'string' ? e : (e.message || e.text || JSON.stringify(e)), source: 'page' })),
    ...networkErrs.map(e => ({ text: `${e.method || 'GET'} ${e.url || ''} -> ${e.status}`, source: 'network' }))
  ];
  for (const e of allErrs) {
    const pattern = e.text.replace(/[0-9a-f]{8,}/g, '{id}').replace(/\d+/g, '{n}').slice(0, 120);
    const key = `${e.source}:${pattern}`;
    patternMap[key] = (patternMap[key] || 0) + 1;
  }
  const topPatterns = Object.entries(patternMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pattern, count]) => ({ pattern, count }));

  return { totalErrors, byType, byStatus, topPatterns };
}

async function buildEvidencePack(target, args = {}) {
  ensureArtifactsDir();
  const runId = args.runId || `vp-run-${Date.now()}`;
  const stepId = args.stepId || args.label || 'manual';
  const safeName = safeEvidenceName(`${runId}-${stepId}`);
  const stepEvidence = args.captureStep === false
    ? null
    : await captureStepEvidence(target, safeName, {
      screenshot: args.screenshot !== false,
      snapshot: args.snapshot !== false,
      includeWarnings: args.includeWarnings === true,
      autoAnalyze: args.autoAnalyze !== false
    }).catch(error => ({ error: error.message }));
  const har = args.har === true ? exportHar({ name: safeName, currentOnly: args.currentOnly !== false }) : null;

  const allNetwork = filterNetwork(networkLogs, { currentOnly: args.currentOnly !== false });
  const apiResponses = extractApiResponses(allNetwork, args.apiResponseLimit || 10);

  const uniqueTraceIds = new Set();
  for (const entry of allNetwork) {
    if (entry.traceId) uniqueTraceIds.add(entry.traceId);
  }

  let dataDiff = null;
  if (args.beforeData && args.afterData) {
    dataDiff = computeDataDiff(args.beforeData, args.afterData);
  }

  const rawErrors = getUnifiedErrors({ currentOnly: args.currentOnly !== false, includeWarnings: args.includeWarnings === true });
  const errorAggregation = aggregateErrors(rawErrors);

  const pack = redact({
    type: 'evidence_pack',
    version: '2.1',
    runId,
    stepId,
    traceId: args.traceId || null,
    traceIds: Array.from(uniqueTraceIds),
    timestamp: new Date().toISOString(),
    url: target.url(),
    stepEvidence,
    errors: rawErrors,
    errorAggregation,
    network: allNetwork.slice(-(args.networkLimit || 30)).map(e => {
      const { requestHeaders, responseHeaders, responseBody, ...rest } = e;
      return rest;
    }),
    apiResponses,
    dataDiff,
    console: consoleLogs.slice(-(args.consoleLimit || 30)),
    pageErrors: pageErrors.slice(-(args.pageErrorLimit || 10)),
    har,
    artifacts: getArtifacts(),
    beforeState: args.beforeState || null,
    afterState: args.afterState || null
  });
  const filePath = path.join(REPORT_DIR, `${safeName}.evidence.json`);
  fs.writeFileSync(filePath, JSON.stringify(pack, null, 2), 'utf8');
  return Object.assign({ success: true, filePath }, pack);
}

function buildEvidenceIndex(args = {}) {
  if (!fs.existsSync(REPORT_DIR)) {
    return { tool: 'evidence_index', runId: args.runId || null, timeline: [], totalPacks: 0, message: 'reports 目录不存在' };
  }
  const files = fs.readdirSync(REPORT_DIR).filter(f => f.endsWith('.evidence.json'));
  const packs = [];
  for (const f of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, f), 'utf8'));
      if (content.type !== 'evidence_pack') continue;
      if (args.runId && content.runId !== args.runId) continue;
      packs.push({
        file: f,
        filePath: path.join(REPORT_DIR, f),
        runId: content.runId,
        stepId: content.stepId,
        traceId: content.traceId,
        traceIds: content.traceIds || [],
        timestamp: content.timestamp,
        url: content.url,
        version: content.version || '1.0',
        errorCount: content.errors && content.errors.summary ? content.errors.summary.consoleErrorCount + content.errors.summary.pageErrorCount + content.errors.summary.networkErrorCount : (content.errorAggregation ? content.errorAggregation.totalErrors : 0),
        errorAggregation: content.errorAggregation || null,
        hasApiResponses: !!(content.apiResponses && content.apiResponses.length),
        hasDataDiff: !!(content.dataDiff && content.dataDiff.length),
        apiResponseCount: content.apiResponses ? content.apiResponses.length : 0,
        dataDiffCount: content.dataDiff ? content.dataDiff.length : 0,
        networkCount: content.network ? content.network.length : 0
      });
    } catch (_) {}
  }
  packs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const runIds = [...new Set(packs.map(p => p.runId))];
  const allTraceIds = [...new Set(packs.flatMap(p => p.traceIds.length > 0 ? p.traceIds : (p.traceId ? [p.traceId] : [])))];
  const totalErrors = packs.reduce((sum, p) => sum + (p.errorCount || 0), 0);
  return {
    tool: 'evidence_index',
    runId: args.runId || null,
    timeline: packs,
    totalPacks: packs.length,
    runIds: args.runId ? null : runIds,
    totalRuns: args.runId ? null : runIds.length,
    totalTraceIds: allTraceIds.length,
    traceIds: args.includeTraceIds ? allTraceIds : undefined,
    totalErrors,
    summary: {
      packsAnalyzed: packs.length,
      uniqueRuns: runIds.length,
      uniqueTraceIds: allTraceIds.length,
      totalErrors,
      hasDriftEvidence: packs.some(p => p.hasDataDiff),
      hasApiEvidence: packs.some(p => p.hasApiResponses)
    }
  };
}

function detectBackendLogPath() {
  const candidates = [
    path.join(process.cwd(), 'logs', 'app.log'),
    path.join(process.cwd(), 'logs', 'server.log'),
    path.join(process.cwd(), 'app.log'),
    path.join(process.cwd(), 'server.log'),
    path.join(process.cwd(), 'api-server', 'logs', 'app.log'),
    path.join(process.cwd(), 'backend', 'logs', 'app.log')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  if (process.env.BACKEND_LOG_PATH && fs.existsSync(process.env.BACKEND_LOG_PATH)) {
    return process.env.BACKEND_LOG_PATH;
  }
  return null;
}

async function traceCorrelate(args = {}) {
  const traceIds = Array.isArray(args.traceIds) ? args.traceIds : (args.traceId ? [args.traceId] : []);
  if (traceIds.length === 0) {
    return { tool: 'trace_correlate', error: '请提供 traceIds 或 traceId 参数' };
  }
  const backendLogPath = args.backendLogPath;
  const useSshBackend = args.useSshBackend === true;
  const fetchBackendLogsFn = typeof fetchBackendLogs === 'function' ? fetchBackendLogs : null;
  const buildTraceChainFn = typeof buildTraceChain === 'function' ? buildTraceChain : null;

  const frontendEvidence = [];
  if (fs.existsSync(REPORT_DIR)) {
    const files = fs.readdirSync(REPORT_DIR).filter(f => f.endsWith('.evidence.json'));
    for (const f of files) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, f), 'utf8'));
        if (content.type !== 'evidence_pack') continue;
        const packTraceIds = content.traceIds || (content.traceId ? [content.traceId] : []);
        const matched = traceIds.filter(t => packTraceIds.includes(t));
        if (matched.length === 0) continue;
        frontendEvidence.push({
          evidenceFile: f,
          runId: content.runId,
          stepId: content.stepId,
          timestamp: content.timestamp,
          url: content.url,
          matchedTraceIds: matched,
          apiResponses: (content.apiResponses || []).filter(r => matched.includes(r.traceId)).map(r => ({
            path: r.path, method: r.method, status: r.status, traceId: r.traceId
          })),
          dataDiff: content.dataDiff || null,
          errors: content.errors && content.errors.summary ? {
            consoleErrors: content.errors.summary.consoleErrorCount,
            pageErrors: content.errors.summary.pageErrorCount,
            networkErrors: content.errors.summary.networkErrorCount
          } : null
        });
      } catch (_) {}
    }
  }

  const backendCorrelation = [];
  const autoLogPath = backendLogPath || detectBackendLogPath();
  for (const traceId of traceIds) {
    const entry = { traceId, backendFound: false, services: [], logs: [], traceChain: null };
    if (autoLogPath && fs.existsSync(autoLogPath)) {
      const logContent = fs.readFileSync(autoLogPath, 'utf8');
      const lines = logContent.split('\n').filter(l => l.includes(traceId));
      entry.backendFound = lines.length > 0;
      entry.logs = lines.slice(0, 10);
      const serviceSet = new Set();
      for (const line of lines) {
        const m = line.match(/service[=:"]\s*"?([a-zA-Z0-9_-]+)/i) || line.match(/\[([a-zA-Z0-9_-]+)\]/);
        if (m) serviceSet.add(m[1]);
      }
      entry.services = Array.from(serviceSet);
    } else if (useSshBackend && fetchBackendLogsFn) {
      try {
        const result = await fetchBackendLogsFn({ traceId, lines: args.backendLogLines || 10 });
        entry.backendFound = result.logs && result.logs.length > 0;
        entry.logs = (result.logs || []).slice(0, 10);
        entry.services = [...new Set((result.logs || []).map(l => l.service).filter(Boolean))];
      } catch (e) {
        entry.error = e.message;
      }
    }
    if (buildTraceChainFn) {
      try { entry.traceChain = await buildTraceChainFn({ traceId }); } catch (_) {}
    }
    backendCorrelation.push(entry);
  }

  const totalBackendFound = backendCorrelation.filter(b => b.backendFound).length;
  const allServices = [...new Set(backendCorrelation.flatMap(b => b.services))];
  return {
    tool: 'trace_correlate',
    traceIds,
    frontendEvidence,
    backendCorrelation,
    summary: {
      traceIdsQueried: traceIds.length,
      frontendEvidenceCount: frontendEvidence.length,
      backendMatched: totalBackendFound,
      backendCorrelation: traceIds.length > 0 ? Math.round(totalBackendFound / traceIds.length * 100) + '%' : '0%',
      servicesInvolved: allServices,
      totalServices: allServices.length,
      hasFullChain: frontendEvidence.length > 0 && totalBackendFound > 0
    }
  };
}

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
    
    if (args.autoWait !== false) {
      await target.waitForLoadState('domcontentloaded');
      await new Promise(r => setTimeout(r, 500));
    }
    
    const safeName = (args.name || `screenshot-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(SCREENSHOT_DIR, `${safeName}.png`);
    
    const startTime = Date.now();
    await screenshotWithRedaction(target, filePath, args);
    const captureTime = Date.now() - startTime;
    
    const fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    const sizeLabel = fileSize < 1024 * 100 ? '小' : fileSize < 1024 * 500 ? '中' : '大';
    
    let pageInfo = null;
    try {
      pageInfo = await target.evaluate(() => ({
        width: window.innerWidth,
        height: document.body.scrollHeight,
        title: document.title,
        url: window.location.href
      }));
    } catch (e) { /* ignore */ }
    
    const analysis = await analyzeScreenshotForErrors(target, filePath);
    
    const overlayAnalysis = await target.evaluate(() => {
      const results = [];
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const viewportArea = viewportWidth * viewportHeight;
      
      const elements = document.querySelectorAll('body *');
      elements.forEach(el => {
        const style = window.getComputedStyle(el);
        if (!style || style.display === 'none' || style.visibility === 'hidden') return;
        
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return;
        
        const zIndex = parseInt(style.zIndex) || 0;
        const position = style.position;
        const opacity = parseFloat(style.opacity) || 1;
        
        const viewportOverlapWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
        const viewportOverlapHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
        const overlapArea = viewportOverlapWidth * viewportOverlapHeight;
        const coveragePercent = Math.round((overlapArea / viewportArea) * 100);
        
        let isOverlay = false;
        let overlayType = 'unknown';
        
        if (zIndex >= 1000) { isOverlay = true; overlayType = 'high-zindex'; }
        if (position === 'fixed' && coveragePercent >= 10) { isOverlay = true; overlayType = 'fixed-overlay'; }
        if (position === 'absolute' && zIndex > 0 && coveragePercent >= 20) { isOverlay = true; overlayType = 'absolute-overlay'; }
        if (opacity < 1 && opacity > 0.3 && coveragePercent >= 30) { isOverlay = true; overlayType = 'semi-transparent-mask'; }
        
        const className = typeof el.className === 'string' ? el.className : '';
        const id = typeof el.id === 'string' ? el.id : '';
        
        const classLower = className.toLowerCase();
        if (classLower.includes('cookie') || classLower.includes('banner') || 
            classLower.includes('consent') || classLower.includes('modal') ||
            classLower.includes('popup') || classLower.includes('dialog') ||
            classLower.includes('overlay')) {
          isOverlay = true;
          overlayType = 'detected-by-class';
        }
        
        if ((el.tagName === 'DIV' || el.tagName === 'SPAN') && 
            rect.width >= viewportWidth * 0.8 && 
            rect.height >= viewportHeight * 0.5) {
          isOverlay = true;
          overlayType = 'fullscreen-overlay';
        }
        
        if (isOverlay) {
          results.push({
            tagName: el.tagName.toLowerCase(),
            className: className.slice(0, 100),
            id: id.slice(0, 50),
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
            zIndex,
            position,
            opacity: Math.round(opacity * 100) / 100,
            coveragePercent,
            overlayType,
            text: el.innerText.slice(0, 100).trim()
          });
        }
      });
      
      return results.sort((a, b) => b.coveragePercent - a.coveragePercent);
    });
    
    const hasBlockingOverlay = overlayAnalysis.some(o => 
      o.coveragePercent >= 50 || 
      o.overlayType === 'fullscreen-overlay' || 
      o.overlayType === 'semi-transparent-mask'
    );
    const totalCoverage = overlayAnalysis.reduce((sum, o) => sum + o.coveragePercent, 0);
    
    const resultData = {
      status: hasBlockingOverlay ? 'warning' : 'success',
      image: filePath,
      fileName: `${safeName}.png`,
      fileSize,
      fileSizeLabel: sizeLabel,
      captureTime,
      pageInfo,
      autoWaitApplied: args.autoWait !== false,
      redactionApplied: args.redact !== false,
      errorAnalysis: {
        hasErrors: analysis.hasErrors,
        visibleErrorCount: analysis.visibleErrors.length,
        consoleErrorCount: analysis.consoleErrors.length,
        totalErrors: analysis.errorCount,
        visibleErrors: analysis.visibleErrors.map(e => ({ selector: e.selector, text: e.text.slice(0, 100) })),
        consoleErrors: analysis.consoleErrors.map(e => e.text)
      },
      overlayAnalysis: {
        hasBlockingOverlay,
        totalOverlays: overlayAnalysis.length,
        totalCoveragePercent: Math.min(totalCoverage, 100),
        overlays: overlayAnalysis.slice(0, 5)
      },
      nextSteps: hasBlockingOverlay ? [
        '调用 browser_overlay_dismiss 尝试自动关闭遮挡物',
        '调用 browser_click 手动点击关闭按钮',
        '重新调用 browser_screenshot 获取无遮挡截图',
        '调用 browser_overlay_detect 详细分析遮挡物'
      ] : [
        '调用 screenshot_diff 进行视觉回归对比',
        '调用 browser_assert 验证截图中的关键元素',
        '调用 evidence_pack 打包所有证据',
        '调用 browser_visual_compare 与设计稿对比'
      ],
      suggestions: [
        { type: hasBlockingOverlay ? 'fix' : 'next', tool: 'browser_overlay_dismiss', reason: hasBlockingOverlay ? '尝试自动关闭遮挡物' : '继续正常流程' },
        { type: 'next', tool: 'evidence_pack', reason: '打包截图和其他证据生成报告' },
        { type: 'next', tool: hasBlockingOverlay ? 'browser_overlay_detect' : 'screenshot_diff', reason: hasBlockingOverlay ? '详细分析遮挡物' : '与之前截图对比' }
      ],
      paidUpgradeHint: '需要自动检测并移除所有遮挡物、生成无遮挡测试环境？升级到 Pro 版本获取完整遮挡物处理能力。'
    };
    
    let response = `📸 截图成功：${filePath}\n\n`;
    response += `📐 文件大小：${(fileSize / 1024).toFixed(1)} KB（${sizeLabel}）\n`;
    response += `⏱️ 捕获耗时：${captureTime}ms\n`;
    if (pageInfo) response += `🖥️ 页面尺寸：${pageInfo.width} × ${pageInfo.height}\n`;
    response += `🔐 脱敏：${resultData.redactionApplied ? '已启用' : '已禁用'}\n`;
    
    if (hasBlockingOverlay) {
      response += `\n⚠️ ⚠️ ⚠️ 检测到遮挡物！截图可能被遮挡！\n`;
      response += `   遮挡物数量：${overlayAnalysis.length} 个\n`;
      response += `   总遮挡覆盖率：${Math.min(totalCoverage, 100)}%\n`;
      response += `\n   遮挡物详情：\n`;
      overlayAnalysis.slice(0, 5).forEach((o, i) => {
        response += `   ${i + 1}. [${o.overlayType}] ${o.tagName}.${o.className.split(' ')[0]} | 覆盖率: ${o.coveragePercent}%\n`;
      });
      response += `\n   🚀 建议：先调用 browser_overlay_dismiss 关闭遮挡物，再重新截图\n`;
    }
    
    if (analysis.hasErrors) {
      response += `\n⚠️ 检测到 ${analysis.errorCount} 个潜在问题：\n`;
      response += `   - 页面可见错误：${analysis.visibleErrors.length} 个\n`;
      response += `   - 控制台错误：${analysis.consoleErrors.length} 个\n`;
      response += `   → 使用 browser_errors 查看详情\n`;
    }
    
    response += `\n🚀 下一步建议：\n`;
    if (hasBlockingOverlay) {
      response += `   1. browser_overlay_dismiss → 尝试自动关闭遮挡物\n`;
      response += `   2. browser_click → 手动点击关闭按钮\n`;
      response += `   3. browser_screenshot → 重新截图\n`;
    } else {
      response += `   1. screenshot_diff → 视觉回归对比\n`;
      response += `   2. evidence_pack → 打包证据\n`;
      response += `   3. browser_visual_compare → 与设计稿对比\n`;
    }
    
    return text(JSON.stringify(resultData, null, 2));
  }

  // ====== browser_screenshot_element ======
  if (name === 'browser_screenshot_element') {
const { target } = await ensurePage();
    ensureArtifactsDir();
    const selector = args.selector;
    if (!selector) {
      return mcpParamMissing(name, 'selector');
    }
    const padding = args.padding || 0;
    const safeName = (args.name || `element-screenshot-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(SCREENSHOT_DIR, `${safeName}.png`);

    try {
      const element = await target.$(selector);
      if (!element) {
        return mcpElementNotFound(selector, name);
      }
      
      const box = await element.boundingBox();
      if (!box) {
        return mcpError(`元素 "${selector}" 不可见或尺寸为0`, { error: 'ELEMENT_NOT_VISIBLE', reason: `元素 "${selector}" 存在于 DOM 中但不可见`, suggestion: '请检查元素是否在可视区域内或被遮挡', toolName: name });
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
        padding,
        nextSteps: [
          '调用 browser_screenshot 进行全页截图对比',
          '调用 browser_visual_compare 对截图进行视觉比对'
        ],
        suggestions: [
          { type: 'next', tool: 'browser_screenshot', reason: '全页截图对比整体页面布局' },
          { type: 'next', tool: 'browser_visual_compare', reason: '与基线截图进行视觉比对' }
        ],
        paidUpgradeHint: '需要更强大的视觉比对能力？升级到 Pro 版本获取 AI 驱动的视觉回归分析。'
      }, null, 2));
    } catch (e) {
      return mcpError(`元素截图失败: ${e.message}`, { error: 'SCREENSHOT_FAILED', reason: `元素截图过程中发生错误: ${e.message}`, suggestion: '请检查元素是否在可视区域内，或使用 browser_screenshot 截取全屏截图', toolName: name });
    }
  }

  // ====== browser_artifacts ======
  if (name === 'browser_artifacts') {
    const artifacts = getArtifacts();
    const result = {
      artifacts,
      total: Array.isArray(artifacts) ? artifacts.length : 0,
      nextSteps: [
        '调用 evidence_pack 打包工件为结构化证据包',
        '调用 browser_screenshot 补充页面截图作为视觉证据'
      ],
      suggestions: [
        { type: 'next', tool: 'evidence_pack', reason: '打包所有工件为结构化证据包' },
        { type: 'next', tool: 'browser_screenshot', reason: '补充页面截图作为视觉证据' }
      ],
      paidUpgradeHint: '需要自动化的完整证据链管理？升级到 Pro 版本获取智能证据编排与自动归档能力。'
    };
    return text(JSON.stringify(result, null, 2));
  }

  // ====== browser_artifacts_clear ======
  if (name === 'browser_artifacts_clear') {
    const result = clearArtifacts(args);
    const enhancedResult = {
      ...(typeof result === 'object' && result !== null ? result : { result }),
      nextSteps: [
        '调用 browser_screenshot 重新截图捕获最新状态',
        '调用 browser_artifacts 查看当前工件列表确认清理结果'
      ],
      suggestions: [
        { type: 'next', tool: 'browser_screenshot', reason: '清理后重新截图捕获最新页面状态' },
        { type: 'next', tool: 'browser_artifacts', reason: '确认清理结果并查看现有工件' }
      ],
      paidUpgradeHint: '需要自动化的证据生命周期管理？升级到 Pro 版本获取智能自动清理与归档策略。'
    };
    return text(JSON.stringify(enhancedResult, null, 2));
  }

  // ====== browser_har_export ======
  if (name === 'browser_har_export') {
    const result = exportHar(args);
    const enhancedResult = {
      ...(typeof result === 'object' && result !== null ? result : { result }),
      nextSteps: [
        '调用 browser_network 分析导出的网络请求详情',
        '调用 browser_performance_check 基于 HAR 数据进行性能分析'
      ],
      suggestions: [
        { type: 'next', tool: 'browser_network', reason: '分析网络请求详情和请求链路' },
        { type: 'next', tool: 'browser_performance_check', reason: '基于 HAR 数据进行页面性能分析' }
      ],
      paidUpgradeHint: '需要深入的网络性能分析？升级到 Pro 版本获取自动化性能瓶颈诊断与优化建议。'
    };
    return text(JSON.stringify(enhancedResult, null, 2));
  }

  // ====== browser_step ======
  if (name === 'browser_step') {
const { target } = await ensurePage();
    const result = await captureStepEvidence(target, args.label || 'manual-step', args);
    const enhancedResult = {
      ...(typeof result === 'object' && result !== null ? result : { result }),
      nextSteps: [
        '调用 browser_errors 查看执行过程中的错误信息',
        '调用 browser_snapshot 查看当前页面 DOM 快照状态'
      ],
      suggestions: [
        { type: 'next', tool: 'browser_errors', reason: '检查步骤执行中产生的错误' },
        { type: 'next', tool: 'browser_snapshot', reason: '查看步骤执行后的页面状态快照' }
      ],
      paidUpgradeHint: '需要智能化的步骤录制与回放？升级到 Pro 版本获取 AI 驱动的智能步骤录制和自动修复。'
    };
    return text(JSON.stringify(enhancedResult, null, 2));
  }

  // ====== browser_trace_start ======
  if (name === 'browser_trace_start') {
const { target } = await ensurePage(args);
    const result = await startTrace(target, args);
    const enhancedResult = {
      ...(typeof result === 'object' && result !== null ? result : { result }),
      nextSteps: [
        '执行操作后调用 browser_trace_stop 停止追踪',
        '调用 trace_correlate 对追踪数据进行关联分析'
      ],
      suggestions: [
        { type: 'next', tool: 'browser_trace_stop', reason: '完成操作后停止追踪以收集数据' },
        { type: 'next', tool: 'trace_correlate', reason: '对采集的追踪数据进行关联分析' }
      ],
      paidUpgradeHint: '需要端到端的分布式追踪能力？升级到 Pro 版本获取全链路追踪与自动关联分析。'
    };
    return text(JSON.stringify(enhancedResult, null, 2));
  }

  // ====== browser_trace_stop ======
  if (name === 'browser_trace_stop') {
const { target } = await ensurePage(args);
    const result = await stopTrace(target, args);
    const enhancedResult = {
      ...(typeof result === 'object' && result !== null ? result : { result }),
      nextSteps: [
        '调用 trace_correlate 对追踪数据进行前后端关联分析',
        '调用 browser_performance_check 基于追踪数据进行性能检查'
      ],
      suggestions: [
        { type: 'next', tool: 'trace_correlate', reason: '对追踪数据进行前后端关联分析' },
        { type: 'next', tool: 'browser_performance_check', reason: '基于追踪数据分析页面性能' }
      ],
      paidUpgradeHint: '需要更深度的分布式追踪能力？升级到 Pro 版本获取全链路追踪、服务地图和自动根因分析。'
    };
    return text(JSON.stringify(enhancedResult, null, 2));
  }

  // ====== evidence_pack ======
  if (name === 'evidence_pack') {
const { target } = await ensurePage(args);
    const result = await buildEvidencePack(target, args);
    const enhancedResult = {
      ...(typeof result === 'object' && result !== null ? result : { result }),
      nextSteps: [
        '调用 trace_correlate 关联追踪数据进行端到端分析',
        '调用 evidence_index 索引管理所有证据包'
      ],
      suggestions: [
        { type: 'next', tool: 'trace_correlate', reason: '关联追踪数据进行端到端分析' },
        { type: 'next', tool: 'evidence_index', reason: '索引管理所有证据包便于检索' }
      ],
      paidUpgradeHint: '需要更强大的证据管理能力？升级到 Pro 版本获取智能证据链分析、自动差异比对和报告生成。'
    };
    return text(JSON.stringify(enhancedResult, null, 2));
  }

  // ====== evidence_index ======
  if (name === 'evidence_index') {
    const result = buildEvidenceIndex(args);
    const enhancedResult = {
      ...(typeof result === 'object' && result !== null ? result : { result }),
      nextSteps: [
        '调用 evidence_pack 创建新的证据包补充证据链',
        '调用 trace_correlate 对索引中的追踪 ID 进行关联分析'
      ],
      suggestions: [
        { type: 'next', tool: 'evidence_pack', reason: '创建新的证据包补充完整证据链' },
        { type: 'next', tool: 'trace_correlate', reason: '对索引中的追踪 ID 进行前后端关联分析' }
      ],
      paidUpgradeHint: '需要完整的关联分析能力？升级到 Pro 版本获取跨证据包的智能关联分析、趋势检测和自动化报告。'
    };
    return text(JSON.stringify(enhancedResult, null, 2));
  }

  // ====== trace_correlate ======
  if (name === 'trace_correlate') {
    const result = await traceCorrelate(args);
    const enhancedResult = {
      ...(typeof result === 'object' && result !== null ? result : { result }),
      nextSteps: [
        '调用 evidence_pack 基于关联结果打包完整证据链',
        '调用 evidence_index 更新证据索引以包含关联分析结果'
      ],
      suggestions: [
        { type: 'next', tool: 'evidence_pack', reason: '基于关联结果打包完整证据链' },
        { type: 'next', tool: 'evidence_index', reason: '更新证据索引以包含关联分析结果' }
      ],
      paidUpgradeHint: '需要端到端的全链路关联分析？升级到 Pro 版本获取全链路追踪、服务拓扑映射和自动根因定位。'
    };
    return text(JSON.stringify(enhancedResult, null, 2));
  }

  return mcpError(`未知工具（evidence）: ${name}`, { error: 'TOOL_NOT_FOUND', toolName: name });
  } finally {
    for (const k of _depsKeys) { deps[k] = globalThis[k]; }
    for (const k of _depsKeys) { if (k in _depsPrev) globalThis[k] = _depsPrev[k]; else delete globalThis[k]; }
  }

}

module.exports = { tools, handle };
