'use strict';

// Handler: browser
// Extracted from server.js callTool switch statements
const { mcpError, mcpParamMissing, mcpPageNotFound, mcpElementNotFound } = require('../core/mcp-error');

// DOM-based accessibility snapshot helper (replaces removed page.accessibility.snapshot API)
// Uses page.evaluate() to build AX tree from DOM with reliable bounds via getBoundingClientRect()
async function getA11ySnapshot(target, options = {}) {
  const buildTreeScript = (rootEl) => {
    rootEl = rootEl || document.documentElement;
    function getRole(el) {
      if (el.computedRole) return el.computedRole;
      const role = el.getAttribute && el.getAttribute('role');
      if (role) return role;
      const tag = el.tagName ? el.tagName.toLowerCase() : '';
      const map = {
        a: el.hasAttribute && el.hasAttribute('href') ? 'link' : 'generic',
        button: 'button', input: 'textbox', textarea: 'textbox', select: 'combobox',
        img: 'image', h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading',
        h5: 'heading', h6: 'heading', nav: 'navigation', main: 'main', header: 'banner',
        footer: 'contentinfo', section: 'region', article: 'article', aside: 'complementary',
        form: 'form', label: 'label', ul: 'list', ol: 'list', li: 'listitem',
        table: 'table', tr: 'row', td: 'cell', th: 'columnheader', p: 'paragraph',
        span: 'generic', div: 'generic', html: 'RootWebArea', body: 'generic'
      };
      return map[tag] || 'generic';
    }
    function getName(el) {
      if (el.computedName) return el.computedName;
      if (el.getAttribute && el.getAttribute('aria-label')) return el.getAttribute('aria-label');
      const labelledby = el.getAttribute && el.getAttribute('aria-labelledby');
      if (labelledby) {
        const labelEl = document.getElementById(labelledby);
        if (labelEl) return (labelEl.textContent || '').trim();
      }
      if (el.id) {
        const label = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (label) return (label.textContent || '').trim();
      }
      if (el.title) return el.title;
      if (el.alt) return el.alt;
      const role = getRole(el);
      if (['button', 'link', 'heading', 'image'].indexOf(role) !== -1) {
        return (el.textContent || '').trim().slice(0, 200);
      }
      return '';
    }
    function isVisible(el) {
      if (el.tagName === 'HTML' || el.tagName === 'BODY') return true;
      if (!el.offsetParent && el.tagName !== 'BODY') {
        const s = window.getComputedStyle(el);
        if (s.position === 'fixed') return s.display !== 'none';
        return false;
      }
      const s = window.getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      return true;
    }
    function buildNode(el, depth, maxDepth) {
      if (depth > maxDepth) return null;
      if (!isVisible(el)) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0 && el.tagName !== 'HTML' && el.tagName !== 'BODY') return null;
      const role = getRole(el);
      const name = getName(el);
      const node = {
        role: role,
        name: name,
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        value: (el.value !== undefined && el.value !== '') ? String(el.value).slice(0, 100) : undefined,
        disabled: !!(el.disabled || (el.getAttribute && el.getAttribute('aria-disabled') === 'true')),
        focused: document.activeElement === el,
        children: []
      };
      if (el.children && el.children.length > 0) {
        for (let i = 0; i < el.children.length; i++) {
          const childNode = buildNode(el.children[i], depth + 1, maxDepth);
          if (childNode) node.children.push(childNode);
        }
      }
      return node;
    }
    return buildNode(rootEl, 0, 20);
  };

  if (options.root) {
    return await options.root.evaluate(buildTreeScript);
  }
  return await target.evaluate(buildTreeScript);
}

const tools = [
  "browser_open",
  "browser_click",
  "browser_click_audit",
  "browser_type",
  "browser_hover",
  "browser_scroll",
  "browser_press_key",
  "browser_snapshot",
  "browser_flow",
  "browser_batch",
  "browser_eval",
  "browser_dom",
  "browser_highlight",
  "browser_select",
  "browser_navigate",
  "browser_wait",
  "browser_assert",
  "browser_instrument",
  "browser_events",
  "browser_events_clear",
  "browser_form_validate",
  "browser_chain",
  "browser_aria_snapshot",
  "browser_aria_click",
  "browser_aria_type",
  "browser_smart_fill",
  "browser_matrix_test",
  "browser_overlay",
  "browser_overlay_detect",
  "browser_overlay_dismiss",
  "browser_captcha",
  "browser_captcha_detect",
  "browser_captcha_screenshot",
  "browser_captcha_read"
];

async function handle(name, args, deps) {

  // === Destructure deps into local scope (replacing globalThis bridge) ===
  let { page, browser, browserSessionId, consoleLogs, networkLogs, pageErrors, currentCheckpoint, eventCheckpoint, lastAction, sessions, activeSessionName, sessionCounter, traceLogs, traceActive, currentTraceName, backendProbeResults, instrumentationEnabled, imageErrors, lastImageErrorCheckpoint, validationResults, lastQualityChecks, lastValidationRun, requestStartTimes, stateManager } = deps;
  const { MAX_SESSIONS, SCREENSHOT_DIR, HAR_DIR, VISUAL_DIR, VISUAL_BASELINE_DIR, VISUAL_ACTUAL_DIR, VISUAL_DIFF_DIR, VALIDATIONS_DIR, REPORT_DIR, LOG_FILE, PROJECT_ROOT, TOOLS_DIR, logger, ensurePage, text, log, resetRuntimeLogs, getPageLinks, postActionErrorCheck, probeKnownEndpoints, getUnifiedErrors, closeBrowserSession, listBrowserSessions, filterNetwork, filterNetworkDetails, getStorageSnapshot, buildDebugReport, captureStepEvidence, waitForCondition, assertPage, runFlow, installInstrumentation, getBrowserEvents, clearBrowserEvents, startTrace, stopTrace, getArtifacts, clearArtifacts, ensureArtifactsDir, getBackendProbeEndpoints, isCloudApiProbeTarget, screenshotWithRedaction, safeArtifactName, analyzeScreenshotForErrors, exportHar, runFullAudit, visualBaseline, visualCompare, visualReport, runA11yCheck, runPerformanceCheck, runLighthouseAudit, findElement, findPage, suggestLocator, validateLocator, mcpHealthCheck, projectAudit, mcpSelfTest, runValidationCheck, runValidationPlan, runValidationElement, runValidationFlow, buildValidationReport, exportValidationReport, runValidationQuickRun, runDeployVerify, investigateDebug, runBrowserFullRegression, traverseMenu, fetchBackendLogs, buildTraceChain, detectSilentFailures, redact, redactString, isSensitiveKey, trimTraceLogs, genSpanId, genTraceId, browserOperator, evidenceCollector, deepInteractor, errorAggregator, path, fs, execSync, callTool } = deps;
  try {
  // ====== browser_open ======
  if (name === 'browser_open') {
    const { target, reused, sessionId } = await ensurePage(args);
    page = target;
    try { browser = target.context().browser() || browser; } catch (e) { /* persistent context */ }
    deps.page = page;
    deps.browser = browser;
    const beforeUrl = target.url();
    if (args.url && beforeUrl !== args.url) {
      const timeout = args.timeout || 15000;
      await target.goto(args.url, { waitUntil: args.waitUntil || 'domcontentloaded', timeout });
      currentCheckpoint = new Date().toISOString();
      lastImageErrorCheckpoint = new Date().toISOString();
      probeKnownEndpoints(target).then(results => { backendProbeResults = results; }).catch(() => {});
    }
    lastAction = { type: 'open', url: target.url(), timestamp: new Date().toISOString(), reused };
    
    // 自动提取当前页面的导航链接
    let pageLinks = null;
    try {
      pageLinks = await getPageLinks({ maxLinks: 30 });
    } catch (e) { /* ignore */ }
    
    const action = reused ? '已复用现有浏览器' : '已打开新浏览器';
    let response = `${action}：${target.url()}（session=${sessionId}）`;
    
    // 附加页面导航摘要
    if (pageLinks && pageLinks.total > 0) {
      const navCategories = pageLinks.categories.filter(c => 
        ['导航菜单', '首页', '登录', '注册', '管理', '设置', '用户', '搜索'].includes(c)
      );
      if (navCategories.length > 0) {
        response += `\n\n📋 页面导航摘要（共${pageLinks.total}个链接，其中按钮${pageLinks.linksFromButtons}个）：`;
        response += `\n   分类：${navCategories.join('、')}`;
        response += `\n   如需详细链接列表，请调用 browser_links`;
      } else {
        response += `\n\n📋 页面共有 ${pageLinks.total} 个链接`;
        response += `\n   如需查看，请调用 browser_links`;
      }
    }
    return text(response);
  }

  // ====== browser_click ======
  if (name === 'browser_click') {
const { target } = await ensurePage();
    if (!args.selector) return mcpParamMissing('selector', name);
    const urlBefore = target.url();

    // 先检查匹配元素数量，避免 :has-text() 等多元素匹配时直接超时
    let elementCount = 0;
    try {
      elementCount = await target.locator(args.selector).count();
    } catch (_) { /* 选择器可能在 click 中有效 */ }

    if (elementCount > 1 && (args.index === undefined || args.index === null)) {
      // 多元素匹配：收集元素信息供用户选择
      const elements = [];
      for (let i = 0; i < Math.min(elementCount, 5); i++) {
        try {
          const el = target.locator(args.selector).nth(i);
          const text = await el.textContent({ timeout: 2000 }).catch(() => '');
          const tag = await el.evaluate(e => e.tagName.toLowerCase(), { timeout: 2000 }).catch(() => '');
          const href = await el.getAttribute('href', { timeout: 2000 }).catch(() => null);
          elements.push({ index: i, tag, text: (text || '').trim().substring(0, 80), href });
        } catch (_) { /* 忽略单个元素错误 */ }
      }
      return text(JSON.stringify({
        error: 'MULTIPLE_ELEMENTS',
        message: `选择器 "${args.selector}" 匹配到 ${elementCount} 个元素`,
        reason: 'Playwright 的 click() 在多元素匹配时会超时，需要更精确的选择器',
        suggestion: '使用 nth() 语法（如 "selector >> nth=0"）或更具体的 CSS 选择器，或使用 index 参数指定点击第几个元素',
        matchedCount: elementCount,
        elements: elements,
        hint: '可在 selector 参数中使用 ">> nth=0" 语法点击第一个匹配元素'
      }, null, 2));
    }

    // 支持 index 参数指定点击第几个元素
    const clickSelector = args.index !== undefined && args.index !== null
      ? target.locator(args.selector).nth(args.index)
      : target.locator(args.selector).first();

    try {
      await clickSelector.click({ timeout: 10000 });
    } catch (e) {
      const msg = String(e?.message || e);
      if (/timeout|Timeout/i.test(msg)) {
        return mcpElementNotFound(args.selector, name);
      }
      throw e;
    }
    
    // 检测 URL 是否变化
    let urlAfter;
    try { urlAfter = target.url(); } catch (_) { urlAfter = urlBefore; }
    const navigated = urlBefore !== urlAfter;
    
    // 操作后快速错误捕获
    const postErrors = await postActionErrorCheck(target, 'click', args.selector);
    
    const baseResult = {
      action: 'click',
      selector: args.selector,
      success: true,
      navigated,
      urlBefore,
      urlAfter,
      lastAction
    };
    
    if (postErrors.detected) {
      const errorSummary = [];
      let suggestions = [];
      if (postErrors.console.length > 0) {
        errorSummary.push(`${postErrors.console.length} 个console错误`);
        const hasTypeError = postErrors.console.some(e => (e.text||'').includes('TypeError') || (e.text||'').includes('undefined'));
        if (hasTypeError) suggestions.push('怀疑页面JS未加载完成，请尝试等待后重试');
      }
      if (postErrors.page.length > 0) {
        errorSummary.push(`${postErrors.page.length} 个页面错误`);
        suggestions.push('页面抛出异常，请使用 browser_errors_aggregate 查看聚合分析');
      }
      if (postErrors.network.length > 0) {
        errorSummary.push(`${postErrors.network.length} 个网络错误`);
        const has500 = postErrors.network.some(e => e.status >= 500);
        if (has500) suggestions.push('存在500错误，可能是接口故障或权限不足');
        const has404 = postErrors.network.some(e => e.status === 404);
        if (has404) suggestions.push('发现404资源未找到，请检查页面引用是否正确');
      }
      if (suggestions.length === 0) suggestions.push('请使用 browser_errors 查看完整错误详情');
      
      return text(JSON.stringify({
        ...baseResult,
        error_warning: `点击后检测到 ${postErrors.count} 个新错误（${errorSummary.join('、')}）`,
        suggestions,
        nextSteps: [
          '使用 browser_counterfactual_analyze 分析点击失败原因',
          '使用 browser_errors 查看完整错误详情'
        ],
        paidUpgradeHint: '需要智能点击验证、自动对比点击前后页面变化、自动错误关联分析？升级到 Pro 版本获取智能点击分析能力。',
        errors: {
          count: postErrors.count,
          console: postErrors.console.slice(0, 5),
          page: postErrors.page.slice(0, 3),
          network: postErrors.network.slice(0, 5)
        }
      }, null, 2));
    }
    
    return text(JSON.stringify({
      ...baseResult,
      errors: { count: 0 },
      handledSuggestions: ['点击完成，使用 browser_snapshot 确认页面状态变化'],
      nextSteps: [
        '使用 browser_snapshot 确认页面状态变化',
        '使用 browser_errors 检查页面错误'
      ],
      paidUpgradeHint: '需要智能点击验证、自动对比点击前后页面变化、自动错误关联分析？升级到 Pro 版本获取智能点击分析能力。'
    }, null, 2));
  }

  // ====== browser_click_audit ======
  if (name === 'browser_click_audit') {
const { target } = await ensurePage();
    const label = args.label || args.selector || args.text || 'audit';
    const waitMs = args.waitMs || 1500;
    const autoReturn = args.autoReturn !== false;
    const { PNG } = require('pngjs');
    const pixelmatch = require('pixelmatch').default || require('pixelmatch');
    
    // 如果提供了 text 而不是 selector，用无障碍树定位
    let selector = args.selector;
    if (!selector && args.text) {
      try {
        const found = await target.evaluate((text) => {
          const candidates = document.querySelectorAll('button, a, [role="button"], [tabindex]:not([tabindex="-1"]), input[type="submit"], input[type="button"]');
          for (const el of candidates) {
            if (el.offsetParent === null) continue;
            const elText = (el.textContent || '').trim();
            if (elText === text || elText.includes(text)) {
              if (el.id) return '#' + el.id;
              const cls = Array.from(el.classList).filter(c => !c.startsWith('_')).slice(0, 2).join('.');
              if (cls) return el.tagName.toLowerCase() + '.' + cls;
              return el.tagName.toLowerCase();
            }
          }
          return null;
        }, args.text);
        if (found) selector = found;
      } catch (_) { /* optional, ignore errors */ }
    }
    
    if (!selector) {
      return text(JSON.stringify({ success: false, error: 'No selector or element found for text: ' + (args.text || '') }));
    }
    
    // 1. 点击前截图
    const urlBefore = target.url();
    ensureArtifactsDir();
    const stamp = Date.now();
    const beforePath = path.join(SCREENSHOT_DIR, `click-audit-before-${safeArtifactName(label)}-${stamp}.png`);
    await screenshotWithRedaction(target, beforePath);
    
    // 2. 执行点击
    let clicked = false;
    try {
      await target.click(selector, { timeout: 8000 });
      clicked = true;
    } catch (clickErr) {
      return text(JSON.stringify({
        success: false,
        selector,
        label,
        error: `Click failed: ${clickErr.message}`,
        urlBefore
      }, null, 2));
    }
    
    // 3. 等待稳定
    try {
      await target.waitForLoadState('networkidle', { timeout: Math.min(waitMs + 2000, 8000) });
    } catch (_) {
      await new Promise(r => setTimeout(r, waitMs));
    }
    
    // 4. 点击后截图
    let urlAfter;
    try { urlAfter = target.url(); } catch (_) { urlAfter = urlBefore; }
    const afterPath = path.join(SCREENSHOT_DIR, `click-audit-after-${safeArtifactName(label)}-${stamp}.png`);
    await screenshotWithRedaction(target, afterPath);
    
    // 5. 截图对比（pixelmatch）
    let diffRatio = 0;
    let diffPath = null;
    let visualChanged = false;
    try {
      const beforePng = PNG.sync.read(fs.readFileSync(beforePath));
      const afterPng = PNG.sync.read(fs.readFileSync(afterPath));
      if (beforePng.width === afterPng.width && beforePng.height === afterPng.height) {
        const diff = new PNG({ width: beforePng.width, height: beforePng.height });
        const diffPixels = pixelmatch(beforePng.data, afterPng.data, diff.data, beforePng.width, beforePng.height, { threshold: 0.1 });
        diffRatio = diffPixels / (beforePng.width * beforePng.height);
        visualChanged = diffRatio > 0.05;
        if (visualChanged) {
          diffPath = path.join(SCREENSHOT_DIR, `click-audit-diff-${safeArtifactName(label)}-${stamp}.png`);
          fs.writeFileSync(diffPath, PNG.sync.write(diff));
        }
      } else {
        // 尺寸不同 → 视觉已变化
        visualChanged = true;
        diffRatio = 1;
      }
    } catch (diffErr) {
      // pixelmatch 失败不阻断流程
    }
    
    // 6. 错误捕获
    const postErrors = await postActionErrorCheck(target, 'click_audit', selector);
    const network5xx = networkLogs.filter(e => e.status >= 500 && new Date(e.timestamp || 0).getTime() > new Date(currentCheckpoint).getTime());
    // 响应体静默失败检测（HTTP 2xx/3xx 但 body 含错误）
    const silentFails = detectSilentFailures({})
      .filter(e => new Date(e.timestamp || 0).getTime() > new Date(currentCheckpoint).getTime());
    
    // 7. 导航检测
    const urlNavigated = urlBefore !== urlAfter;
    const spaNavigated = visualChanged && !urlNavigated;
    
    // 8. 自动返回
    let returned = false;
    let returnMethod = 'none';
    if (autoReturn) {
      if (urlNavigated) {
        try {
          await target.goBack({ waitUntil: 'networkidle', timeout: 8000 });
          returned = true;
          returnMethod = 'goBack';
        } catch (_) {
          try { await target.goBack(); returned = true; returnMethod = 'goBack_simple'; } catch (_) { /* optional, ignore errors */ }
        }
      } else if (spaNavigated) {
        try {
          await target.click(selector, { timeout: 5000 });
          await new Promise(r => setTimeout(r, 1000));
          returnMethod = 'toggle_click';
          // 验证状态是否恢复
          const afterReturn = target.url();
          if (afterReturn === urlBefore) returned = true;
        } catch (_) { /* optional, ignore errors */ }
      }
    }
    
    // 9. 组装结果
    const result = {
      success: true,
      selector,
      label,
      navigated: urlNavigated,
      spaNavigated,
      visualChanged,
      diffRatio: parseFloat(diffRatio.toFixed(4)),
      urlBefore,
      urlAfter,
      returned,
      returnMethod,
      errors: {
        count: postErrors.count + network5xx.length + silentFails.length,
        console: postErrors.console.slice(0, 5),
        page: postErrors.page.slice(0, 3),
        network: postErrors.network.slice(0, 5),
        network5xx: network5xx.slice(0, 5).map(e => ({ url: (e.url || '').slice(0, 120), status: e.status })),
        silentFails: silentFails.slice(0, 5).map(e => ({ url: (e.url || '').slice(0, 120), status: e.status, error: e.errorSnippet }))
      },
      screenshots: {
        before: beforePath,
        after: afterPath,
        diff: diffPath
      },
      timestamp: new Date().toISOString()
    };
    
    result.nextSteps = result.success ? [
      '使用 browser_snapshot 确认点击后页面状态',
      '使用 browser_errors 检查点击后错误'
    ] : [
      '使用 browser_counterfactual_analyze 分析失败原因',
      '检查选择器是否正确'
    ];
    result.suggestions = result.success ? [
      { type: 'next', tool: 'browser_snapshot', reason: '查看点击后页面内容' },
      { type: 'next', tool: 'browser_errors', reason: '检查点击后是否出现错误' }
    ] : [
      { type: 'next', tool: 'browser_counterfactual_analyze', reason: '分析点击失败的根因' }
    ];
    result.paidUpgradeHint = '需要智能点击验证、自动对比点击前后页面变化、自动错误关联分析？升级到 Pro 版本获取智能点击分析能力。';
    
    return text(JSON.stringify(redact(result), null, 2));
  }

  // ====== browser_type ======
  if (name === 'browser_type') {
const { target } = await ensurePage();
    if (!args.selector) return mcpParamMissing('selector', name);
    await target.fill(args.selector, args.text || '', { timeout: 10000 });
    await target.evaluate(({ selector, text }) => {
      const el = document.querySelector(selector);
      if (!el) return;
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
    }, { selector: args.selector, text: args.text || '' });
    
    // 操作后快速错误捕获
    const postErrors = await postActionErrorCheck(target, 'type', args.selector);
    
    if (postErrors.detected) {
      const errorSummary = [];
      let suggestions = [];
      if (postErrors.console.length > 0) {
        errorSummary.push(`${postErrors.console.length} 个console错误`);
        suggestions.push('输入触发了验证错误，请检查输入内容格式');
      }
      if (postErrors.page.length > 0) {
        errorSummary.push(`${postErrors.page.length} 个页面错误`);
        suggestions.push('输入后页面抛出异常，请检查字段约束');
      }
      if (postErrors.network.length > 0) {
        errorSummary.push(`${postErrors.network.length} 个网络错误`);
        suggestions.push('输入后发送了失败的请求，可能是表单验证触发的');
      }
      if (suggestions.length === 0) suggestions.push('请使用 browser_errors 查看完整错误详情');
      
      return text(JSON.stringify({
        action: 'type',
        selector: args.selector,
        text: isSensitiveKey(args.selector) ? '******' : redactString(args.text || ''),
        success: true,
        error_warning: `输入后检测到 ${postErrors.count} 个新错误（${errorSummary.join('、')}）`,
        suggestions,
        errors: {
          count: postErrors.count,
          console: postErrors.console.slice(0, 5),
          page: postErrors.page.slice(0, 3),
          network: postErrors.network.slice(0, 5)
        },
        lastAction
      }, null, 2));
    }
    
    return text(JSON.stringify({
      action: 'type',
      selector: args.selector,
      text: isSensitiveKey(args.selector) ? '******' : redactString(args.text || ''),
      success: true,
      errors: { count: 0 },
      lastAction
    }, null, 2));
  }

  // ====== browser_hover ======
  if (name === 'browser_hover') {
const { target } = await ensurePage();
    if (!args.selector) return mcpParamMissing('selector', name);
    await target.hover(args.selector, { timeout: 10000 });
    lastAction = { type: 'hover', selector: args.selector, timestamp: new Date().toISOString() };
    const postErrors = await postActionErrorCheck(target, 'hover', args.selector);
    return text(JSON.stringify({
      action: 'hover',
      selector: args.selector,
      success: true,
      errors: { count: postErrors.count, detected: postErrors.detected },
      lastAction,
      nextSteps: ['调用 browser_click 点击悬浮后出现的元素', '调用 browser_snapshot 查看悬浮后页面变化'],
      suggestions: [{ type: 'next', tool: 'browser_click', reason: '点击悬浮后出现的交互元素' }],
      paidUpgradeHint: '需要 AI 智能悬浮定位、自动检测悬浮后出现的元素、鼠标轨迹模拟？升级到 Pro 版本获取高级交互能力。'
    }, null, 2));
  }

  // ====== browser_scroll ======
  if (name === 'browser_scroll') {
const { target } = await ensurePage();
    if (args.selector) {
      const scrollIntoView = args.scrollIntoView !== false;
      if (scrollIntoView) {
        await target.$eval(args.selector, (el, behavior) => {
          el.scrollIntoView({ behavior: behavior || 'auto', block: 'center', inline: 'center' });
        }, args.behavior || 'auto');
      }
    } else {
      await target.evaluate(({ x, y, behavior }) => {
        window.scrollTo({ left: x || 0, top: y || 0, behavior: behavior || 'auto' });
      }, { x: args.x, y: args.y, behavior: args.behavior || 'auto' });
    }
    return text(JSON.stringify({
      action: 'scroll',
      message: '已滚动',
      selector: args.selector || null,
      position: args.selector ? null : { x: args.x || 0, y: args.y || 0 },
      success: true,
      nextSteps: ['调用 browser_snapshot 确认滚动后页面状态', '调用 browser_find_element 查找滚动后显示的元素'],
      suggestions: [{ type: 'next', tool: 'browser_snapshot', reason: '查看滚动后的页面内容' }],
      paidUpgradeHint: '需要智能滚动定位、自动检测可滚动区域、滚动后元素可见性分析？升级到 Pro 版本获取智能滚动能力。'
    }, null, 2));
  }

  // ====== browser_press_key ======
  if (name === 'browser_press_key') {
const { target } = await ensurePage();
    if (!args.key) return mcpParamMissing('key', name);
    if (args.selector) {
      await target.focus(args.selector);
    }
    await target.keyboard.press(args.key);
    
    // 操作后快速错误捕获
    const postErrors = await postActionErrorCheck(target, 'press_key', args.key);
    
    const result = {
      action: 'press_key',
      key: args.key,
      success: true,
      errors: { count: postErrors.count, detected: postErrors.detected }
    };
    
    if (postErrors.detected) {
      result.error_warning = `按键 ${args.key} 后检测到 ${postErrors.count} 个新错误`;
      result.suggestions = [];
      if (postErrors.console.length > 0) result.suggestions.push('按键触发了控制台错误，请检查页面交互逻辑');
      if (postErrors.network.some(e => e.status >= 400)) result.suggestions.push('按键触发了失败的网络请求');
      if (result.suggestions.length === 0) result.suggestions.push('请使用 browser_errors 查看完整错误详情');
    }
    
    return text(JSON.stringify(result, null, 2));
  }

  // ====== browser_snapshot ======
  if (name === 'browser_snapshot') {
const { target } = await ensurePage();
    const snapshot = await target.evaluate(() => {
      // 计算页面状态哈希：基于可见元素数 + 文本指纹
      let visibleCount = 0;
      const allEls = document.querySelectorAll('body *');
      for (const el of allEls) {
        if (visibleCount >= 500) break;
        try { const s = window.getComputedStyle(el); if (s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null) visibleCount++; } catch (_) { /* optional, ignore errors */ }
      }
      const mainText = (document.body.innerText || '').trim();
      const textHash = mainText.length + '_' + mainText.slice(0, 100).replace(/\s+/g, '');
      const stateHash = visibleCount + '_' + textHash.length + '_' + (mainText.length % 1000);
      
      return {
        url: location.href,
        title: document.title,
        visibleText: document.body.innerText.slice(0, 5000),
        // 页面状态哈希（对比前后变化用，非加密哈希）
        stateHash,
        stateDetail: { visibleCount, textLength: mainText.length },
        // 页面基本信息
        pageInfo: {
          url: location.href,
          title: document.title,
          description: (document.querySelector('meta[name="description"]')?.getAttribute('content') || '').slice(0, 200),
          charset: document.characterSet,
          lang: document.documentElement.lang || '',
          readyState: document.readyState,
          referrer: document.referrer || '',
          viewport: { w: window.innerWidth, h: window.innerHeight },
          scrollPos: { x: window.scrollX, y: window.scrollY }
        },
        // 所有输入表单
        inputs: Array.from(document.querySelectorAll('input, textarea, select')).map(el => {
          const type = (el.getAttribute('type') || '').toLowerCase();
          const sensitive = ['password'].includes(type) || /key|token|secret|password/i.test(`${el.id} ${el.name} ${el.placeholder}`);
          return { tag: el.tagName.toLowerCase(), type, id: el.id || '', name: el.getAttribute('name') || '', placeholder: el.getAttribute('placeholder') || '', value: sensitive ? '******' : el.value };
        }),
        // 按钮与链接
        buttons: Array.from(document.querySelectorAll('button, a')).slice(0, 80).map(el => ({ tag: el.tagName.toLowerCase(), id: el.id || '', text: (el.innerText || el.textContent || '').trim().slice(0, 120), href: el.href || '' })),
        // 导航元素
        navElements: (() => {
          const navs = document.querySelectorAll('nav, [role="navigation"], .nav, .sidebar, .menu');
          return Array.from(navs).slice(0, 5).map(n => ({
            tag: n.tagName.toLowerCase(),
            id: n.id || '',
            links: Array.from(n.querySelectorAll('a, button')).slice(0, 20).map(l => (l.innerText || l.textContent || '').trim().slice(0, 60)).filter(Boolean)
          }));
        })(),
        // 图片统计
        imageCount: document.querySelectorAll('img').length,
        // 表格统计
        tableCount: document.querySelectorAll('table').length,
        // 框架信息
        frameworks: (() => {
          const fw = [];
          if (document.querySelector('#app, #__nuxt, #__next, [data-reactroot]')) fw.push('SPA (React/Vue/Nuxt)');
          if (document.querySelector('[class*="ant-"]')) fw.push('Ant Design');
          if (document.querySelector('[class*="el-"]')) fw.push('Element UI');
          if (document.querySelector('[class*="ivu-"]')) fw.push('iView');
          return fw;
        })()
      };
    });
    return text(JSON.stringify({
      ...redact(snapshot),
      nextSteps: [
        '调用 browser_find_element 搜索页面中特定元素',
        '调用 browser_click 点击按钮或链接进行交互',
        '调用 browser_screenshot 截图留存页面状态'
      ],
      suggestions: [
        { type: 'next', tool: 'browser_find_element', reason: '搜索页面中的特定元素' },
        { type: 'next', tool: 'browser_click', reason: '点击按钮或链接进行交互验证' }
      ],
      paidUpgradeHint: '需要页面变化智能比对、AI 驱动页面分析、自动生成页面摘要？升级到 Pro 版本获取智能页面洞察能力。'
    }, null, 2));
  }

  // ====== browser_batch ======
  if (name === 'browser_batch') {
const { target } = await ensurePage();
    const steps = args.steps || [];
    const maxSteps = args.maxSteps || 20;
    if (steps.length > maxSteps) {
      return text(`批量操作受限：最多 ${maxSteps} 个操作，当前 ${steps.length} 个`);
    }
    const results = [];
    for (const step of steps) {
      // step.type 与 step.action 互为别名，优先 type，回退 action
      const stepType = step.type || step.action;
      try {
        switch (stepType) {
          case 'click':
            await target.click(step.selector, { timeout: 10000 });
            results.push({ type: 'click', selector: step.selector, success: true });
            break;
          case 'type':
            await target.fill(step.selector, step.text || '', { timeout: 10000 });
            results.push({ type: 'type', selector: step.selector, success: true });
            break;
          case 'hover':
            await target.hover(step.selector, { timeout: 10000 });
            results.push({ type: 'hover', selector: step.selector, success: true });
            break;
          case 'scroll':
            if (step.selector) {
              await target.$eval(step.selector, el => el.scrollIntoView());
            } else {
              await target.evaluate(({ x, y }) => window.scrollTo(x || 0, y || 0), { x: 0, y: step.distance || 300 });
            }
            results.push({ type: 'scroll', success: true });
            break;
          case 'screenshot':
            ensureArtifactsDir();
            const safeName = (step.name || `batch-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
            const filePath = path.join(SCREENSHOT_DIR, `${safeName}.png`);
            await target.screenshot({ path: filePath });
            results.push({ type: 'screenshot', file: filePath, success: true });
            break;
          case 'wait':
            await target.waitForTimeout(step.ms || 1000);
            results.push({ type: 'wait', ms: step.ms || 1000, success: true });
            break;
          case 'press_key':
            if (step.selector) await target.focus(step.selector);
            await target.keyboard.press(step.key);
            results.push({ type: 'press_key', key: step.key, success: true });
            break;
          case 'select':
            await target.selectOption(step.selector, step.value || step.label || step.index);
            results.push({ type: 'select', selector: step.selector, success: true });
            break;
          default:
            results.push({ type: stepType, success: false, error: `未知操作类型: ${stepType}` });
        }
      } catch (err) {
        results.push({ type: stepType, selector: step.selector, success: false, error: err.message });
      }
    }
    const hasFailed = results.some(r => !r.success);
    return text(JSON.stringify({
      total: steps.length,
      results,
      nextSteps: hasFailed
        ? ['使用 browser_counterfactual_analyze 分析失败步骤的根因', '检查失败步骤的选择器或参数是否正确']
        : ['使用 browser_snapshot 确认批量操作后的页面状态', '使用 browser_errors 检查批量操作后的错误'],
      suggestions: [
        { type: 'next', tool: 'browser_snapshot', reason: '查看批量操作后的页面状态' }
      ],
      paidUpgradeHint: '需要批量操作智能编排、失败自动重试、操作链路追踪？升级到 Pro 版本获取高级批量操作能力。'
    }, null, 2));
  }

  // ====== browser_eval ======
  if (name === 'browser_eval') {
const { target } = await ensurePage();
    const expression = args.expression || args.script;
    if (!expression) {
      return text(JSON.stringify({ error: '缺少 expression 参数' }, null, 2));
    }
    // 安全限制：表达式长度限制为 10KB
    const MAX_EXPRESSION_LENGTH = 10240;
    if (expression.length > MAX_EXPRESSION_LENGTH) {
      return text(JSON.stringify({ error: `表达式过长（${expression.length}字节），最大允许 ${MAX_EXPRESSION_LENGTH} 字节` }, null, 2));
    }
    // 审计日志
    console.log('[AUDIT] browser_eval executed:', { expressionLength: expression.length, timestamp: new Date().toISOString() });

    // 智能包装表达式：
    // 1. 如果包含 await 但未手动包装在 async IIFE 中，自动包装为 (async () => { ... })()
    // 2. 如果以 return 开头或包含 return，包装在 (function(){ ... })()
    // 3. 否则直接执行
    const trimmed = expression.trim();
    const hasAwait = /\bawait\b/.test(trimmed);
    const hasAsyncIIFE = /\(\s*async\s*\(\s*\)\s*=>/.test(trimmed) || /\(async\s*function\s*\(\s*\)/.test(trimmed);
    let wrapped;
    if (hasAwait && !hasAsyncIIFE) {
      wrapped = `(async () => { ${expression} })()`;
    } else if (trimmed.startsWith('return') || expression.includes('return ')) {
      wrapped = `(function(){${expression}})()`;
    } else {
      wrapped = expression;
    }
    const result = await target.evaluate(expr => {
      try {
        const value = (0, eval)(expr);
        return typeof value === 'undefined' ? null : value;
      } catch (e) {
        if (e instanceof SyntaxError && /return/.test(e.message)) {
          return (0, eval)(`(function(){${expr}})()`);
        }
        throw e;
      }
    }, wrapped);
    return text(JSON.stringify(redact({
      result,
      expressionLength: expression.length,
      nextSteps: [
        '使用 browser_snapshot 查看 eval 执行后的页面状态',
        '使用 browser_dom 检查页面元素变化'
      ],
      suggestions: [
        { type: 'next', tool: 'browser_snapshot', reason: '查看 eval 执行后的页面变化' }
      ],
      paidUpgradeHint: '需要 AI 智能脚本生成、表达式安全性分析、自动结果断言？升级到 Pro 版本获取高级脚本执行能力。'
    }), null, 2));
  }

  // ====== browser_dom ======
  if (name === 'browser_dom') {
const { target } = await ensurePage();
    const selector = args.selector;
    if (!selector) return text(JSON.stringify({ error: '缺少选择器参数' }, null, 2));

    // 先检查元素总数
    const totalCount = await target.locator(selector).count().catch(() => 0);
    if (totalCount === 0) {
      return text(JSON.stringify({ selector, count: 0, elements: [], error: '未找到匹配元素' }, null, 2));
    }

    // 获取所有匹配元素（最多10个）
    const limit = Math.min(typeof args.limit === 'number' ? args.limit : 10, 10);
    const elements = await target.evaluate(({ sel, max }) => {
      const items = [];
      const nodes = document.querySelectorAll(sel);
      const maxCount = Math.min(nodes.length, max);
      for (let i = 0; i < maxCount; i++) {
        const el = nodes[i];
        const rect = el.getBoundingClientRect();
        const type = (el.getAttribute('type') || '').toLowerCase();
        const sensitive = ['password'].includes(type) || /key|token|secret|password/i.test(`${el.id} ${el.name} ${el.placeholder}`);
        const style = getComputedStyle(el);
        items.push({
          index: i,
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          className: typeof el.className === 'string' ? el.className : '',
          text: (el.innerText || el.textContent || '').trim().slice(0, 500),
          value: 'value' in el ? (sensitive ? '******' : el.value) : undefined,
          visible: !!(rect.width || rect.height),
          disabled: !!el.disabled,
          rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
          style: { display: style.display, visibility: style.visibility, opacity: style.opacity }
        });
      }
      return items;
    }, { sel: selector, max: limit });

    const resultData = { selector, count: totalCount, returned: elements.length, elements };
    if (totalCount === 0) {
      resultData.nextSteps = [
        '调用 browser_find_element 智能搜索元素',
        '检查选择器是否正确',
        '调用 browser_snapshot 查看页面完整结构'
      ];
      resultData.suggestions = [
        { type: 'fix', tool: 'browser_find_element', reason: '智能搜索页面元素' }
      ];
      resultData.paidUpgradeHint = '需要 AI 智能元素定位？升级到 Pro 版本获取高级定位能力。';
    } else {
      resultData.nextSteps = [
        '调用 browser_click 点击元素进行交互',
        '调用 browser_type 在输入框中输入文本',
        '调用 browser_highlight 高亮元素确认位置'
      ];
      resultData.suggestions = [
        { type: 'next', tool: 'browser_click', reason: '点击找到的元素进行交互验证' },
        { type: 'next', tool: 'browser_highlight', reason: '高亮元素确认位置' }
      ];
      resultData.paidUpgradeHint = '需要 AI 智能元素定位、自动生成稳定选择器？升级到 Pro 版本获取高级 DOM 分析能力。';
    }
    return text(JSON.stringify(redact(resultData), null, 2));
  }

  // ====== browser_highlight ======
  if (name === 'browser_highlight') {
const { target } = await ensurePage();
    if (!args.selector) return mcpParamMissing('selector', name);
    await target.$eval(args.selector, (el, color) => {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.setAttribute('data-mcp-debug-highlight', 'true');
      el.style.outline = `4px solid ${color || 'red'}`;
      el.style.boxShadow = `0 0 0 6px rgba(255,0,0,.25)`;
    }, args.color || 'red');
    return text(`已高亮元素：${args.selector}`);
  }

  // ====== browser_select ======
  if (name === 'browser_select') {
const { target } = await ensurePage();
    let selectArg = null;
    let selectDesc = '';
    if (args.value !== undefined && args.value !== null) {
      selectArg = args.value;
      selectDesc = `value="${args.value}"`;
    } else if (args.label !== undefined && args.label !== null) {
      selectArg = { label: args.label };
      selectDesc = `label="${args.label}"`;
    } else if (args.index !== undefined && args.index !== null) {
      selectArg = { index: args.index };
      selectDesc = `index=${args.index}`;
    }
    if (selectArg === null) {
      return text(`错误：browser_select 需要提供 value 或 label 或 index 参数，当前参数：${JSON.stringify(args)}`);
    }
    const selectEl = await target.$(args.selector);
    if (!selectEl) {
      return text(`browser_select: 未找到选择器 "${args.selector}" 对应的 select 元素，请确认页面包含该元素`);
    }
    try {
      await target.selectOption(args.selector, selectArg, { timeout: 5000 });
    } catch (e) {
      return text(`browser_select: 操作失败：${e.message}，选择器：${args.selector}，${selectDesc}`);
    }

    // 操作后快速错误捕获
    const postErrors = await postActionErrorCheck(target, 'select', args.selector);

    return text(JSON.stringify({
      action: 'select',
      selector: args.selector,
      selection: selectDesc,
      success: true,
      errors: { count: postErrors.count, detected: postErrors.detected },
      nextSteps: [
        '使用 browser_snapshot 确认选择后的页面状态',
        '使用 browser_errors 检查选择后是否出现错误'
      ],
      suggestions: [
        { type: 'next', tool: 'browser_snapshot', reason: '查看选择后的页面变化' }
      ],
      paidUpgradeHint: '需要 AI 智能选项推荐、自动检测选项变化、跨浏览器选择测试？升级到 Pro 版本获取高级选择能力。'
    }, null, 2));
  }

  // ====== browser_navigate ======
  if (name === 'browser_navigate') {
const { target } = await ensurePage();
    const action = args.action || 'refresh';
    const url = args.url;
    const waitUntil = args.waitUntil || 'domcontentloaded';
    const timeout = args.timeout || 30000;

    try {
      if (url) {
        await target.goto(url, { waitUntil, timeout });
      } else {
        switch (action) {
          case 'forward':
            await target.goForward({ timeout });
            break;
          case 'back':
            await target.goBack({ timeout });
            break;
          case 'refresh':
          case 'reload':
            await target.reload({ waitUntil, timeout });
            break;
          default:
            return mcpError(`不支持的导航操作: ${action}，支持 forward/back/refresh/reload`, { error: 'EXECUTION_ERROR', toolName: name });
        }
      }

      return text(JSON.stringify({
        action: url ? 'goto' : action,
        success: true,
        currentUrl: target.url(),
        waitUntil,
        nextSteps: [
          '使用 browser_snapshot 查看导航后的页面内容',
          '使用 browser_errors 检查导航后是否出现错误'
        ],
        suggestions: [
          { type: 'next', tool: 'browser_snapshot', reason: '查看导航后的页面状态' }
        ],
        paidUpgradeHint: '需要智能页面导航、自动等待页面加载完成、导航链路追踪？升级到 Pro 版本获取高级导航能力。'
      }, null, 2));
    } catch (e) {
      return mcpError(`导航失败: ${e.message}`, { error: 'EXECUTION_ERROR', toolName: name });
    }
  }

  // ====== browser_wait ======
  if (name === 'browser_wait') {
const { target } = await ensurePage();
    const waitResult = await waitForCondition(target, args);
    return text(JSON.stringify({
      ...waitResult,
      nextSteps: [
        '使用 browser_snapshot 查看等待后的页面状态',
        '使用 browser_click 与页面进行交互'
      ],
      suggestions: [
        { type: 'next', tool: 'browser_snapshot', reason: '确认等待条件满足后的页面内容' }
      ],
      paidUpgradeHint: '需要智能等待策略、自动检测页面加载完成、超时自动诊断？升级到 Pro 版本获取高级等待能力。'
    }, null, 2));
  }

  // ====== browser_assert ======
  if (name === 'browser_assert') {
const { target } = await ensurePage();
    const hasAssertion = args.urlContains || args.textContains || args.textEquals
      || args.selectorVisible || args.selectorHidden || args.selectorCount
      || args.noErrors === true;
    if (!hasAssertion) {
      return text(JSON.stringify({
        error: 'PARAM_MISSING',
        message: '未提供任何断言条件',
        reason: 'browser_assert 需要至少一个断言参数',
        suggestion: '请提供以下参数之一：urlContains / textContains / textEquals / selectorVisible / selectorHidden / selectorCount / noErrors',
        supportedAssertions: [
          { param: 'urlContains', type: 'string', desc: '断言当前URL包含该字符串' },
          { param: 'textContains', type: 'string', desc: '断言页面文本包含该内容' },
          { param: 'textEquals', type: 'string', desc: '断言页面文本等于该内容' },
          { param: 'selectorVisible', type: 'string', desc: '断言CSS选择器可见' },
          { param: 'selectorHidden', type: 'string', desc: '断言CSS选择器不可见' },
          { param: 'selectorCount', type: 'object', desc: '断言元素数量 {selector, operator, value}' },
          { param: 'noErrors', type: 'boolean', desc: '断言本轮无错误' }
        ]
      }, null, 2));
    }
    return text(JSON.stringify(await assertPage(target, args), null, 2));
  }

  // ====== browser_flow ======
  // v1.9.5 起合并 browser_chain（mode=chain）和 browser_batch（mode=batch）
  if (name === 'browser_flow') {
    const { target } = await ensurePage(args);
    const mode = args.mode || 'flow';

    if (mode === 'chain') {
      // chain 模式：等价于已废弃的 browser_chain
      // 步骤类型映射：pressKey/press_key → step，evaluate → eval
      const rawSteps = args.steps || args.actions || [];
      const mappedSteps = rawSteps.map((s) => {
        const stepType = s.type || s.action;
        let mappedType = stepType;
        if (stepType === 'pressKey' || stepType === 'press_key') mappedType = 'step';
        else if (stepType === 'evaluate') mappedType = 'eval';
        return { ...s, type: mappedType };
      });
      // stopOnError=true（默认）等价于 continueOnError=false
      const stopOnError = args.stopOnError !== false;
      const chainArgs = {
        steps: mappedSteps,
        continueOnError: !stopOnError,
        clearErrors: args.clearErrors !== false
      };
      const result = await runFlow(target, chainArgs);
      // chain 模式额外提供 consoleErrors/networkErrors 汇总（兼容 browser_chain 输出结构）
      const consoleErrors = (result.errors?.console || []).map((e) => ({
        type: e.type || 'error',
        text: (e.text || '').slice(0, 200)
      }));
      const networkErrors = (result.errors?.network || [])
        .filter((e) => e.status >= 400)
        .map((e) => ({ url: (e.url || '').slice(0, 100), status: e.status }));
      const completedActions = result.results ? result.results.filter((r) => r.ok !== false).length : 0;
      const failedStepIndex = result.results ? result.results.findIndex((r) => r.ok === false) : -1;
      return text(JSON.stringify({
        success: result.passed,
        mode: 'chain',
        totalActions: mappedSteps.length,
        completedActions,
        failedActionIndex: failedStepIndex >= 0 ? failedStepIndex : null,
        actionResults: result.results,
        consoleErrors,
        networkErrors,
        errorMessage: failedStepIndex >= 0 ? `第 ${failedStepIndex + 1} 步操作失败` : null,
        errors: result.errors
      }, null, 2));
    }

    if (mode === 'batch') {
      // batch 模式：等价于已废弃的 browser_batch，受 maxSteps 限制
      const steps = args.steps || [];
      const maxSteps = args.maxSteps || 20;
      if (steps.length > maxSteps) {
        return text(JSON.stringify({
          error: `批量操作受限：最多 ${maxSteps} 个操作，当前 ${steps.length} 个`,
          maxSteps,
          actualSteps: steps.length
        }, null, 2));
      }
      // 步骤类型映射：press_key → step，evaluate → eval
      const mappedSteps = steps.map((s) => {
        const stepType = s.type || s.action;
        let mappedType = stepType;
        if (stepType === 'press_key' || stepType === 'pressKey') mappedType = 'step';
        else if (stepType === 'evaluate') mappedType = 'eval';
        return { ...s, type: mappedType };
      });
      const batchArgs = {
        steps: mappedSteps,
        continueOnError: true,  // batch 模式默认继续执行
        clearErrors: args.clearErrors !== false
      };
      const result = await runFlow(target, batchArgs);
      const results = result.results || [];
      const hasFailed = results.some((r) => r.ok === false);
      return text(JSON.stringify({
        mode: 'batch',
        total: mappedSteps.length,
        results,
        hasFailed,
        passed: result.passed,
        errors: result.errors,
        nextSteps: hasFailed
          ? ['使用 browser_counterfactual_analyze 分析失败步骤的根因', '检查失败步骤的选择器或参数是否正确']
          : ['使用 browser_snapshot 确认批量操作后的页面状态', '使用 browser_errors 检查批量操作后的错误']
      }, null, 2));
    }

    // 默认 flow 模式
    return text(JSON.stringify(await runFlow(target, args), null, 2));
  }

  // ====== browser_instrument ======
  if (name === 'browser_instrument') {
const { target } = await ensurePage(args);
    return text(JSON.stringify(await installInstrumentation(target), null, 2));
  }

  // ====== browser_events ======
  if (name === 'browser_events') {
const { target } = await ensurePage(args);
    const mode = args.mode || 'view';
    if (mode === 'clear') {
      // v1.9.5 起合并 browser_events_clear（mode=clear）
      const result = await clearBrowserEvents(target);
      return text(JSON.stringify({ mode: 'clear', ...result }, null, 2));
    }
    return text(JSON.stringify(await getBrowserEvents(target, args), null, 2));
  }

  // ====== browser_events_clear ======
  if (name === 'browser_events_clear') {
	const { target } = await ensurePage(args);
    return text(JSON.stringify(await clearBrowserEvents(target), null, 2));
  }

  // ====== browser_form_validate ======
  if (name === 'browser_form_validate') {
    const { target } = await ensurePage();

    // Navigate if URL provided
    if (args.url) {
      await target.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    const formSelector = args.formSelector;
    const validateSubmit = args.validateSubmit !== false;
    const checkRequired = args.checkRequired !== false;
    const checkPattern = args.checkPattern !== false;
    const checkLength = args.checkLength !== false;

    // Analyze form
    const formAnalysis = await target.evaluate((opts) => {
      const { formSelector, checkRequired, checkPattern, checkLength } = opts;

      // Find form
      let form = null;
      if (formSelector) {
        form = document.querySelector(formSelector);
      } else {
        form = document.querySelector('form');
      }

      if (!form) {
        return { formFound: false, fields: [], error: 'No form found' };
      }

      const fields = [];
      const inputs = form.querySelectorAll('input, select, textarea');

      for (const input of inputs) {
        const field = {
          name: input.name || '',
          id: input.id || '',
          type: input.type || 'text',
          tagName: input.tagName.toLowerCase(),
          label: '',
          required: input.required,
          pattern: input.pattern || null,
          minLength: input.minLength || null,
          maxLength: input.maxLength || null,
          min: input.min || null,
          max: input.max || null,
          inputType: input.getAttribute('type') || 'text',
          placeholder: input.placeholder || '',
          defaultValue: input.value || '',
          options: [],
          validationRules: [],
          issues: []
        };

        // Get label
        if (input.id) {
          const label = document.querySelector(`label[for="${input.id}"]`);
          if (label) field.label = label.innerText.trim();
        }
        if (!field.label) {
          const parent = input.closest('label');
          if (parent) field.label = parent.innerText.trim();
        }

        // Get select options
        if (input.tagName === 'SELECT') {
          const options = input.querySelectorAll('option');
          field.options = Array.from(options).map(o => o.value || o.innerText.trim()).filter(Boolean);
        }

        // Get radio/checkbox options
        if (input.type === 'radio' || input.type === 'checkbox') {
          const group = form.querySelectorAll(`input[name="${input.name}"]`);
          field.options = Array.from(group).map(r => r.value || r.id || ' unnamed').filter(Boolean);
        }

        // Build validation rules
        if (checkRequired && field.required) {
          field.validationRules.push('必填');
        }
        if (checkPattern && field.pattern) {
          field.validationRules.push(`格式验证: ${field.pattern}`);
        }
        if (checkLength) {
          if (field.minLength) field.validationRules.push(`最小长度: ${field.minLength}`);
          if (field.maxLength) field.validationRules.push(`最大长度: ${field.maxLength}`);
        }
        if (field.min) field.validationRules.push(`最小值: ${field.min}`);
        if (field.max) field.validationRules.push(`最大值: ${field.max}`);

        // Detect common input types
        if (!input.getAttribute('type') || input.getAttribute('type') === 'text') {
          if (input.className.includes('email') || input.name.includes('email')) {
            field.inputType = 'email';
            field.validationRules.push('预期: 邮箱格式');
          }
          if (input.className.includes('tel') || input.name.includes('phone')) {
            field.inputType = 'tel';
            field.validationRules.push('预期: 电话号码格式');
          }
          if (input.className.includes('url') || input.name.includes('url')) {
            field.inputType = 'url';
            field.validationRules.push('预期: URL 格式');
          }
        }

        // Check for common issues
        if (!field.name && !field.id) {
          field.issues.push('字段没有 name 或 id 属性');
        }
        if (field.required && !field.label && !field.placeholder) {
          field.issues.push('必填字段没有标签或占位符');
        }
        if (field.pattern && !field.label && !field.placeholder) {
          field.issues.push('有格式验证的字段没有标签或占位符');
        }

        fields.push(field);
      }

      return { formFound: true, formSelector: formSelector || 'form', fields };
    }, { formSelector, checkRequired, checkPattern, checkLength });

    if (!formAnalysis.formFound) {
      return text(JSON.stringify({ success: false, url: target.url(), formFound: false, error: formAnalysis.error }, null, 2));
    }

    // Try to submit the form to see validation
    let validationResults = null;
    if (validateSubmit) {
      try {
        // Clear fields first
        for (const field of formAnalysis.fields.filter(f => f.type !== 'submit' && f.type !== 'button' && f.type !== 'hidden')) {
          if (field.type === 'radio' || field.type === 'checkbox') continue;
          try {
            await target.fill(`#${field.id}`, '');
          } catch (e) {
            try {
              await target.fill(`[name="${field.name}"]`, '');
            } catch (_) { /* fill fallback failed, skip */ }
          }
        }

        // Try to submit
        await target.click('button[type="submit"]').catch(() => {});
        await new Promise(r => setTimeout(r, 500));

        // Check if validation blocked submission
        const validationMessages = await target.evaluate(() => {
          const messages = [];
          // Check for HTML5 validation messages
          document.querySelectorAll(':invalid').forEach(el => {
            messages.push({
              field: el.name || el.id || el.tagName,
              message: el.validationMessage
            });
          });
          // Check for custom validation
          document.querySelectorAll('.error, .invalid, [class*="error"]').forEach(el => {
            const text = el.innerText.trim();
            if (text) messages.push({ field: el.className, message: text });
          });
          return messages;
        });

        const requiredMissing = formAnalysis.fields.filter(f => f.required && !f.defaultValue).length;
        const patternViolations = validationMessages.filter(m => m.message.includes('pattern')).length;
        const lengthViolations = validationMessages.filter(m => m.message.includes('length')).length;

        validationResults = {
          totalFields: formAnalysis.fields.length,
          requiredFieldsMissing: requiredMissing,
          patternViolations,
          lengthViolations,
          validationMessages: validationMessages.slice(0, 10),
          allPassed: validationMessages.length === 0 && requiredMissing === 0
        };
      } catch (e) {
        validationResults = { error: e.message };
      }
    }

    // Generate recommendations
    const recommendations = [];
    const fieldsWithIssues = formAnalysis.fields.filter(f => f.issues.length > 0);
    if (fieldsWithIssues.length > 0) {
      recommendations.push(`${fieldsWithIssues.length} 个字段存在问题，建议添加 labels 或占位符`);
    }
    const requiredWithoutLabel = formAnalysis.fields.filter(f => f.required && !f.label);
    if (requiredWithoutLabel.length > 0) {
      recommendations.push(`${requiredWithoutLabel.length} 个必填字段缺少标签，建议添加 <label> 元素`);
    }
    if (validationResults && !validationResults.allPassed) {
      recommendations.push('表单提交被验证拦截，请检查必填字段和格式');
    }
    if (recommendations.length === 0) {
      recommendations.push('表单结构良好，验证规则完整');
    }

    return text(JSON.stringify({
      success: true,
      url: target.url(),
      formFound: true,
      formSelector: formAnalysis.formSelector,
      fields: formAnalysis.fields,
      validationResults,
      summary: validationResults
        ? `共 ${validationResults.totalFields} 个字段，${validationResults.requiredFieldsMissing} 个必填字段为空，${validationResults.patternViolations} 个格式违规`
        : `共 ${formAnalysis.fields.length} 个字段，已分析验证规则`,
      recommendations
    }, null, 2));
  }

  // ====== browser_chain ======
  if (name === 'browser_chain') {
const { target } = await ensurePage();
    const actions = args.actions || [];
    const stopOnError = args.stopOnError !== false;
    const includeNetwork = args.includeNetwork !== false;
    const includeConsole = args.includeConsole !== false;

    const actionResults = [];
    let allConsoleErrors = [];
    let allNetworkErrors = [];
    let failedActionIndex = null;
    let errorMessage = null;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      // step.type 与 step.action 互为别名，优先 type，回退 action
      const stepType = action.type || action.action;
      const result = {
        index: i,
        type: stepType,
        success: false,
        consoleErrors: [],
        networkErrors: []
      };

      const stepCheckpoint = new Date().toISOString();

      try {
        switch (stepType) {
          case 'click':
            await target.click(action.selector, { timeout: 10000 });
            result.selector = action.selector;
            result.success = true;
            break;
          case 'type':
            await target.fill(action.selector, action.text || '', { timeout: 10000 });
            result.selector = action.selector;
            result.text = action.text || '';
            result.success = true;
            break;
          case 'hover':
            await target.hover(action.selector, { timeout: 10000 });
            result.selector = action.selector;
            result.success = true;
            break;
          case 'scroll':
            if (action.selector) {
              await target.$eval(action.selector, el => el.scrollIntoView());
              result.selector = action.selector;
            } else {
              await target.evaluate(({ x, y }) => window.scrollTo(x || 0, y || 0), { x: 0, y: action.distance || 300 });
              result.distance = action.distance || 300;
            }
            result.success = true;
            break;
          case 'pressKey':
            if (action.selector) await target.focus(action.selector);
            await target.keyboard.press(action.key);
            result.key = action.key;
            result.success = true;
            break;
          case 'select':
            await target.selectOption(action.selector, action.value || action.label || action.index);
            result.selector = action.selector;
            result.value = action.value || action.label || action.index;
            result.success = true;
            break;
          case 'wait':
            await target.waitForTimeout(action.ms || 1000);
            result.ms = action.ms || 1000;
            result.success = true;
            break;
          case 'evaluate':
            const expression = action.expression || '';
            const wrapped = expression.trim().startsWith('return') || expression.includes('return ')
              ? `(function(){${expression}})()`
              : expression;
            const evalResult = await target.evaluate(expr => {
              try {
                const value = (0, eval)(expr);
                return typeof value === 'undefined' ? null : value;
              } catch (e) {
                if (e instanceof SyntaxError && /return/.test(e.message)) {
                  return (0, eval)(`(function(){${expr}})()`);
                }
                throw e;
              }
            }, wrapped);
            result.result = evalResult;
            result.success = true;
            break;
          default:
            result.error = `未知操作类型: ${stepType}`;
            result.success = false;
        }

        if (result.success) {
          await new Promise(r => setTimeout(r, 300)).catch(() => {});

          if (includeConsole) {
            const newConsoleErrors = stateManager.consoleLogs
              .filter(e => new Date(e.timestamp || 0).getTime() > new Date(stepCheckpoint).getTime())
              .map(e => ({ type: e.type || 'error', text: (e.text || '').slice(0, 200) }));
            result.consoleErrors = newConsoleErrors;
            allConsoleErrors = allConsoleErrors.concat(newConsoleErrors);
          }

          if (includeNetwork) {
            const newNetworkErrors = stateManager.networkLogs
              .filter(e => e.status >= 400 && new Date(e.timestamp || 0).getTime() > new Date(stepCheckpoint).getTime())
              .map(e => ({ url: (e.url || '').slice(0, 100), status: e.status }));
            result.networkErrors = newNetworkErrors;
            allNetworkErrors = allNetworkErrors.concat(newNetworkErrors);
          }

          const hasErrors = result.consoleErrors.length > 0 || result.networkErrors.length > 0;
          if (hasErrors && stopOnError) {
            failedActionIndex = i;
            errorMessage = `第 ${i + 1} 步操作后检测到错误：控制台错误 ${result.consoleErrors.length} 个，网络错误 ${result.networkErrors.length} 个`;
            actionResults.push(result);
            break;
          }
        } else {
          if (stopOnError) {
            failedActionIndex = i;
            errorMessage = result.error || `第 ${i + 1} 步操作失败`;
            actionResults.push(result);
            break;
          }
        }
      } catch (err) {
        result.success = false;
        result.error = err.message;
        if (stopOnError) {
          failedActionIndex = i;
          errorMessage = `第 ${i + 1} 步操作异常: ${err.message}`;
          actionResults.push(result);
          break;
        }
      }

      actionResults.push(result);
    }

    const completedActions = actionResults.filter(r => r.success).length;
    const success = failedActionIndex === null;

    return text(JSON.stringify({
      success,
      totalActions: actions.length,
      completedActions,
      failedActionIndex,
      actionResults,
      consoleErrors: allConsoleErrors,
      networkErrors: allNetworkErrors,
      errorMessage
    }, null, 2));
  }

  // ====== browser_aria_snapshot ======
  if (name === 'browser_aria_snapshot') {
    const { target } = await ensurePage(args);
    const maxDepth = args.maxDepth || 10;
    let rootNode;
    if (args.selector) {
      const el = await target.$(args.selector);
      if (!el) {
        return mcpElementNotFound(args.selector, name);
      }
      rootNode = await getA11ySnapshot(target, { root: el });
    } else {
      rootNode = await getA11ySnapshot(target);
    }
    if (!rootNode) {
      return { content: [{ type: 'text', text: JSON.stringify({ role: 'document', name: 'empty', children: [] }, null, 2) }] };
    }
    let refCounter = 0;
    function assignRefs(node, depth) {
      if (!node || depth > maxDepth) return null;
      const ref = 'ref_' + (refCounter++).toString(36);
      node._ref = ref;
      const result = {
        role: node.role || 'unknown',
        name: (node.name || '').slice(0, 200),
        ref,
        bounds: node.bounds ? {
          x: Math.round(node.bounds.x || 0), y: Math.round(node.bounds.y || 0),
          width: Math.round(node.bounds.width || 0), height: Math.round(node.bounds.height || 0)
        } : null,
        focused: !!node.focused,
        enabled: node.disabled !== undefined ? !node.disabled : undefined,
        value: node.value !== undefined ? String(node.value).slice(0, 100) : undefined
      };
      if (node.children && depth < maxDepth) {
        result.children = node.children.map(child => assignRefs(child, depth + 1)).filter(Boolean);
        if (result.children.length === 0) delete result.children;
      }
      return result;
    }
    const tree = assignRefs(rootNode, 0);
    return { content: [{ type: 'text', text: JSON.stringify(tree, null, 2) }] };
  }

  // ====== findNodeByRef ======
  function findNodeByRef(node, ref) {
    if (!node) return null;
    if (node._ref === ref) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNodeByRef(child, ref);
        if (found) return found;
      }
    }
    return null;
  }

  // ====== browser_aria_click ======
  if (name === 'browser_aria_click') {
    const { target } = await ensurePage(args);
    if (!args.ref) return mcpParamMissing('ref', name);
    const snapshot = await getA11ySnapshot(target);
    if (!snapshot) return mcpError('页面无可访问性信息', { error: 'EXECUTION_ERROR', toolName: name });
    let refCounter = 0;
    (function assign(node, depth) {
      if (!node || depth > 20) return;
      node._ref = 'ref_' + (refCounter++).toString(36);
      if (node.children) node.children.forEach(c => assign(c, depth + 1));
    })(snapshot, 0);
    const node = findNodeByRef(snapshot, args.ref);
    if (!node || !node.bounds) return mcpError(`未找到 ref: ${args.ref}`, { error: 'EXECUTION_ERROR', toolName: name });
    const x = Math.round(node.bounds.x + node.bounds.width / 2);
    const y = Math.round(node.bounds.y + node.bounds.height / 2);
    await target.mouse.click(x, y);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, ref: args.ref, x, y }, null, 2) }] };
  }

  // ====== browser_aria_type ======
  if (name === 'browser_aria_type') {
    const { target } = await ensurePage(args);
    if (!args.ref) return mcpParamMissing('ref', name);
    if (typeof args.text !== 'string') return mcpParamMissing('text', name);
    const snapshot = await getA11ySnapshot(target);
    if (!snapshot) return mcpError('页面无可访问性信息', { error: 'EXECUTION_ERROR', toolName: name });
    let refCounter = 0;
    (function assign(node, depth) {
      if (!node || depth > 20) return;
      node._ref = 'ref_' + (refCounter++).toString(36);
      if (node.children) node.children.forEach(c => assign(c, depth + 1));
    })(snapshot, 0);
    const node = findNodeByRef(snapshot, args.ref);
    if (!node || !node.bounds) return mcpError(`未找到 ref: ${args.ref}`, { error: 'EXECUTION_ERROR', toolName: name });
    const x = Math.round(node.bounds.x + node.bounds.width / 2);
    const y = Math.round(node.bounds.y + node.bounds.height / 2);
    await target.mouse.click(x, y);
    if (node.value !== undefined) { await target.keyboard.press('Control+A'); await target.keyboard.press('Delete'); }
    await target.keyboard.type(args.text);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, ref: args.ref, text: args.text }, null, 2) }] };
  }

  // ====== browser_smart_fill ======
  if (name === 'browser_smart_fill') {
    const { target } = await ensurePage(args);
    if (!args.selector) return mcpParamMissing('selector', name);
    const dataGen = require('../hands/data_generator');
    const fieldType = args.fieldType || 'text';
    if (!dataGen.isSupported(fieldType)) {
      return mcpError(`不支持的字段类型: ${fieldType}。支持: ${dataGen.getSupportedTypes().join(', ')}`, { error: 'EXECUTION_ERROR', toolName: name });
    }
    const generatedValue = dataGen.generate(fieldType, args.options || {});
    const el = await target.$(args.selector);
    if (!el) {
      return mcpElementNotFound(args.selector, name);
    }
    await el.click();
    await el.fill('');
    await el.fill(generatedValue);
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, selector: args.selector, fieldType, value: generatedValue }, null, 2) }] };
  }

  // ====== browser_matrix_test ======
  if (name === 'browser_matrix_test') {
    const { chromium, firefox, webkit } = require('playwright');
    const engines = { chromium, firefox, webkit };
    const browserTypes = Array.isArray(args.browsers) && args.browsers.length > 0 ? args.browsers : ['chromium', 'firefox'];
    const steps = Array.isArray(args.steps) ? args.steps : [];
    const headless = args.headless !== false;
    const timeout = args.timeout || 15000;

    if (steps.length === 0) {
      return mcpError('缺少必需参数: steps', { error: 'EXECUTION_ERROR', toolName: name });
    }

    const results = {};

    for (const browserType of browserTypes) {
      const engine = engines[browserType];
      if (!engine) {
        results[browserType] = { status: 'error', error: `不支持的浏览器类型: ${browserType}` };
        continue;
      }

      // 为每个浏览器创建独立实例
      let browser, page;
      try {
        browser = await engine.launch({ headless });
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        page = await context.newPage();
      } catch (e) {
        results[browserType] = { status: 'error', error: `浏览器启动失败: ${e.message}` };
        continue;
      }

      const stepResults = [];
      let browserStatus = 'passed';

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        // step.action 与 step.type 互为别名，优先 action，回退 type
        const stepAction = step.action || step.type;
        const stepResult = { action: stepAction, index: i };

        try {
          switch (stepAction) {
            case 'navigate': {
              if (!step.url) stepResult.error = 'navigate 需要 url';
              else await page.goto(step.url, { waitUntil: 'domcontentloaded', timeout });
              break;
            }
            case 'click': {
              if (!step.target) stepResult.error = 'click 需要 target';
              else await page.click(step.target, { timeout });
              break;
            }
            case 'type': {
              if (!step.target) stepResult.error = 'type 需要 target';
              else await page.fill(step.target, step.value || '', { timeout });
              break;
            }
            case 'screenshot': {
              const name = step.name || `step-${i}`;
              const screenshot = await page.screenshot({ encoding: 'base64', fullPage: true });
              stepResult.screenshot = `data:image/png;base64,${screenshot}`;
              break;
            }
            case 'evaluate': {
              if (!step.value) stepResult.error = 'evaluate 需要 value';
              else stepResult.result = await page.evaluate(step.value);
              break;
            }
            default:
              stepResult.error = `不支持的操作: ${stepAction}`;
          }
        } catch (e) {
          stepResult.error = e.message;
          browserStatus = 'failed';
        }

        stepResult.status = stepResult.error ? 'error' : 'ok';
        stepResults.push(stepResult);
      }

      // 关闭浏览器
      try {
        await browser.close();
      } catch (e) { /* 忽略 */ }

      results[browserType] = {
        status: browserStatus,
        steps: stepResults
      };
    }

    const summary = { total: browserTypes.length, passed: 0, failed: 0 };
    for (const bt of browserTypes) {
      if (results[bt] && results[bt].status === 'passed') summary.passed++;
      else summary.failed++;
    }

    return { content: [{ type: 'text', text: JSON.stringify({ results, summary }, null, 2) }] };
  }

  // ====== browser_overlay ======
  // v1.9.5 起合并 browser_overlay_detect/dismiss
  if (name === 'browser_overlay') {
    const mode = args.mode || 'detect';
    if (mode === 'detect') {
      return handle('browser_overlay_detect', args, deps);
    }
    if (mode === 'dismiss') {
      return handle('browser_overlay_dismiss', args, deps);
    }
    return mcpParamMissing('mode', name);
  }

  // ====== browser_overlay_detect ======
  if (name === 'browser_overlay_detect') {
    const { target } = await ensurePage();
    
    const overlayAnalysis = await target.evaluate(() => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const viewportArea = viewportWidth * viewportHeight;
      const overlays = [];
      
      document.querySelectorAll('body *').forEach(el => {
        const style = window.getComputedStyle(el);
        if (!style || style.display === 'none' || style.visibility === 'hidden') return;
        
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return;
        
        const zIndex = parseInt(style.zIndex) || 0;
        const position = style.position;
        const opacity = parseFloat(style.opacity) || 1;
        const className = typeof el.className === 'string' ? el.className : '';
        const classLower = className.toLowerCase();
        const id = el.id || '';
        const tagName = el.tagName.toLowerCase();
        
        // 不检测 body、html 自身
        if (tagName === 'body' || tagName === 'html') return;
        
        // 计算覆盖面积
        const overlapW = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
        const overlapH = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
        const coverage = Math.round((overlapW * overlapH / viewportArea) * 100);
        
        // 筛选：覆盖面积 >= 5% 才考虑（忽略极小元素）
        if (coverage < 5) return;
        
        let isOverlay = false;
        let type = 'unknown';
        
        // 高 z-index 元素
        if (zIndex >= 1000 && coverage >= 10) { isOverlay = true; type = 'high-zindex'; }
        // fixed 定位且覆盖面积大
        if (position === 'fixed' && coverage >= 15) { isOverlay = true; type = 'fixed-overlay'; }
        // absolute 定位且高 z-index
        if (position === 'absolute' && zIndex > 0 && coverage >= 20) { isOverlay = true; type = 'absolute-overlay'; }
        // 半透明遮罩
        if (opacity < 1 && opacity > 0.2 && coverage >= 25) { isOverlay = true; type = 'semi-transparent-mask'; }
        // sticky 顶部/底部导航
        if (position === 'sticky' && coverage >= 20) { isOverlay = true; type = 'sticky-overlay'; }
        // class 名称匹配常见弹窗
        if (classLower.includes('cookie') || classLower.includes('banner') || classLower.includes('modal') ||
            classLower.includes('popup') || classLower.includes('dialog') || classLower.includes('overlay') ||
            classLower.includes('mask') || classLower.includes('toast') || classLower.includes('alert')) {
          isOverlay = true; type = 'detected-by-class';
        }
        // 全屏覆盖（遮挡大部分视口）
        if ((tagName === 'div' || tagName === 'section' || tagName === 'aside') && 
            rect.top <= 10 && rect.left <= 10 &&
            rect.width >= viewportWidth * 0.8 && rect.height >= viewportHeight * 0.5 &&
            zIndex >= 100) {
          isOverlay = true; type = 'fullscreen-overlay';
        }
        
        if (isOverlay) {
          overlays.push({
            tagName,
            className: className.slice(0, 80),
            id: id.slice(0, 40),
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
            zIndex,
            position,
            opacity: Math.round(opacity * 100) / 100,
            coveragePercent: coverage,
            overlayType: type,
            text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 200)
          });
        }
      });
      
      // 按覆盖率降序排列
      overlays.sort((a, b) => b.coveragePercent - a.coveragePercent);
      
      const totalCoverage = overlays.reduce((sum, o) => sum + o.coveragePercent, 0);
      const hasBlockingOverlay = overlays.some(o => 
        o.coveragePercent >= 50 || o.overlayType === 'fullscreen-overlay' || o.overlayType === 'semi-transparent-mask'
      );
      
      // 统计类型
      const typeCounts = {};
      overlays.forEach(o => { typeCounts[o.overlayType] = (typeCounts[o.overlayType] || 0) + 1; });
      
      return {
        hasBlockingOverlay,
        totalOverlays: overlays.length,
        totalCoveragePercent: Math.min(totalCoverage, 100),
        typeCounts,
        overlays: overlays.slice(0, 10),
        viewportInfo: { width: viewportWidth, height: viewportHeight }
      };
    }).catch(e => ({ error: e.message }));
    
    if (overlayAnalysis.error) {
      return mcpError(overlayAnalysis.error, { error: 'OVERLAY_DETECT_FAILED', toolName: name });
    }
    
    const status = overlayAnalysis.hasBlockingOverlay ? 'warning' : 'success';
    
    const resultData = {
      status,
      ...overlayAnalysis,
      nextSteps: overlayAnalysis.hasBlockingOverlay ? [
        '调用 browser_overlay_dismiss 自动关闭遮挡物',
        '关闭后调用 browser_screenshot 重新截图',
        '确认遮挡消失后重新运行测试'
      ] : [
        '调用 browser_screenshot 截图留存证据',
        '继续正常测试流程'
      ],
      suggestions: overlayAnalysis.hasBlockingOverlay ? [
        { type: 'fix', tool: 'browser_overlay_dismiss', reason: '自动关闭遮挡物' },
        { type: 'next', tool: 'browser_screenshot', reason: '确认遮挡消失后截图' }
      ] : [
        { type: 'next', tool: 'browser_screenshot', reason: '截图留存证据' }
      ],
      paidUpgradeHint: '需要智能遮挡物识别、自动关闭策略优化、多场景兼容测试？升级到 Pro 版本获取高级遮挡物处理能力。'
    };
    
    // format=html 输出
    if (args.format === 'html') {
      const { buildOverlayHtml } = require('../core/report-html');
      return text(buildOverlayHtml({
        ...overlayAnalysis,
        url: target.url(),
        timestamp: new Date().toISOString()
      }));
    }
    
    return text(JSON.stringify(resultData, null, 2));
  }

  // ====== browser_overlay_dismiss ======
  if (name === 'browser_overlay_dismiss') {
    const { target } = await ensurePage();
    
    const dismissButtonPatterns = [
      // 常见关闭按钮选择器
      '[aria-label="Close"]', '[aria-label="close"]', '[aria-label="关闭"]',
      '[aria-label="Dismiss"]', '[aria-label="dismiss"]',
      'button.close', '.close', '.btn-close', 
      '[data-dismiss="modal"]', '[data-bs-dismiss="modal"]',
      'button[class*="close"]', 'button[class*="Close"]',
      'button[class*="dismiss"]', 'button[class*="Dismiss"]',
      // 接受/同意按钮
      '.accept', '.btn-accept', '#accept', 'button:has-text("Accept")',
      'button:has-text("Accept All")', 'button:has-text("同意")',
      'button:has-text("接受")', 'button:has-text("确定")',
      'button:has-text("OK")', 'button:has-text("Got it")',
      'button:has-text("我知道了")',
      // 拒绝/取消
      'button:has-text("Reject")', 'button:has-text("Decline")',
      'button:has-text("拒绝")', 'button:has-text("取消")',
      // modal/overlay 专用
      '.modal .close', '.modal-footer .btn-secondary',
      '.popup-close', '.overlay-close',
      // 通用 x 按钮  
      'button[aria-hidden="true"]', 'svg[aria-hidden="true"] + button',
      // Cookie banner
      '#cookie-banner button', '.cookie-banner button',
      '.cookie-consent button', '#cookie-consent button',
      '.CookieConsent button',
    ];
    
    const overlaysBefore = await target.evaluate(() => {
      let count = 0;
      document.querySelectorAll('body *').forEach(el => {
        const style = window.getComputedStyle(el);
        if (!style || style.display === 'none') return;
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return;
        const zIndex = parseInt(style.zIndex) || 0;
        const position = style.position;
        const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
        if (zIndex >= 1000 || position === 'fixed' || 
            className.includes('modal') || className.includes('popup') || 
            className.includes('overlay') || className.includes('cookie') ||
            className.includes('banner') || className.includes('dialog')) {
          if (rect.width >= 100 && rect.height >= 50) count++;
        }
      });
      return count;
    }).catch(() => 0);
    
    const dismissed = [];
    let clickErrors = 0;
    
    for (const pattern of dismissButtonPatterns) {
      try {
        const buttons = await target.$$(pattern);
        for (const btn of buttons) {
          try {
            await btn.click({ timeout: 2000 });
            // 等待关闭动画
            await new Promise(r => setTimeout(r, 300));
            dismissed.push({ selector: pattern, success: true });
          } catch (e) {
            clickErrors++;
          }
        }
      } catch (e) {
        // 选择器无效，跳过
      }
    }
    
    // 重新检测剩余遮挡物
    const remainingAnalysis = await target.evaluate(() => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const viewportArea = viewportWidth * viewportHeight;
      const remaining = [];
      
      document.querySelectorAll('body *').forEach(el => {
        const style = window.getComputedStyle(el);
        if (!style || style.display === 'none' || style.visibility === 'hidden') return;
        const rect = el.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) return;
        const zIndex = parseInt(style.zIndex) || 0;
        const position = style.position;
        const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
        const overlapW = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
        const overlapH = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
        const coverage = Math.round((overlapW * overlapH / viewportArea) * 100);
        
        let isOverlay = false;
        if (zIndex >= 1000 && coverage >= 10) isOverlay = true;
        if (position === 'fixed' && coverage >= 15) isOverlay = true;
        if (className.includes('modal') || className.includes('popup')) isOverlay = true;
        
        if (isOverlay && coverage >= 5) {
          remaining.push({ tagName: el.tagName.toLowerCase(), className: className.slice(0, 50), coveragePercent: coverage });
        }
      });
      return { remaining, count: remaining.length, hasBlocking: remaining.some(o => o.coveragePercent >= 50) };
    }).catch(() => ({ remaining: [], count: 0, hasBlocking: false }));
    
    const status = dismissed.length > 0 && !remainingAnalysis.hasBlocking ? 'success' 
      : dismissed.length > 0 ? 'partial' : 'warning';
    
    const resultData = {
      status,
      success: dismissed.length > 0,
      dismissedCount: dismissed.length,
      totalAttempted: dismissButtonPatterns.length,
      dismissResults: dismissed.slice(0, 10),
      remainingOverlays: remainingAnalysis.count,
      hasBlockingOverlay: remainingAnalysis.hasBlocking,
      remainingOverlayDetails: remainingAnalysis.remaining.slice(0, 5),
      nextSteps: dismissed.length > 0 && !remainingAnalysis.hasBlocking ? [
        '调用 browser_screenshot 重新截图（无遮挡）',
        '继续测试流程',
        '调用 browser_smoke_test 重新冒烟测试'
      ] : dismissed.length > 0 ? [
        '剩余遮挡物需手动处理',
        '调用 browser_overlay_detect 查看剩余遮挡物详情',
        '调用 browser_screenshot 查看当前页面状态'
      ] : [
        '调用 browser_overlay_detect 详细分析遮挡物',
        '考虑手动点击关闭按钮',
        '调用 browser_screenshot 查看页面状态'
      ],
      suggestions: [
        { type: 'next', tool: 'browser_screenshot', reason: dismissed.length > 0 ? '确认遮挡已关闭后截图' : '查看页面当前状态' },
        { type: remainingAnalysis.hasBlocking ? 'fix' : 'next', tool: 'browser_overlay_detect', reason: '检查剩余遮挡物' }
      ],
      paidUpgradeHint: '需要智能自动关闭、多场景 Cookie banner 处理、验证码自动识别？升级到 Pro 版本获取高级弹窗处理能力。'
    };
    
    // format=html 输出
    if (args.format === 'html') {
      const { buildOverlayHtml } = require('../core/report-html');
      return text(buildOverlayHtml({
        overlays: remainingAnalysis.remaining || [],
        totalCoveragePercent: remainingAnalysis.remaining.reduce((s, o) => s + o.coveragePercent, 0),
        isBlockingOverlay: remainingAnalysis.hasBlocking,
        url: target.url(),
        timestamp: new Date().toISOString(),
        dismissedInfo: { count: dismissed.length, status }
      }));
    }
    
    return text(JSON.stringify(resultData, null, 2));
  }

  // ====== browser_captcha ======
  // v1.9.5 起合并 browser_captcha_detect/read/screenshot
  if (name === 'browser_captcha') {
    const mode = args.mode || 'detect';
    if (mode === 'detect') {
      return handle('browser_captcha_detect', args, deps);
    }
    if (mode === 'read') {
      return handle('browser_captcha_read', args, deps);
    }
    if (mode === 'screenshot') {
      return handle('browser_captcha_screenshot', args, deps);
    }
    return mcpParamMissing('mode', name);
  }

  // ====== browser_captcha_detect ======
  if (name === 'browser_captcha_detect') {
    const { target } = await ensurePage(args);
    const detectMode = args.detectMode || 'auto';
    const captchaSelector = args.captchaSelector;

    const detection = await target.evaluate(({ selector, mode }) => {
      const result = {
        found: false,
        type: 'unknown',
        provider: 'unknown',
        complexity: 'unknown',
        needsHuman: false,
        elements: [],
        scripts: [],
        suggestions: []
      };

      const selectors = selector
        ? [selector]
        : [
            'img[src*="captcha"]', 'img[src*="verify"]', 'img[src*="code"]',
            'img[id*="captcha"]', 'img[id*="verify"]', 'img[class*="captcha"]',
            'canvas[class*="captcha"]', 'canvas[id*="captcha"]',
            '[class*="captcha"]', '[id*="captcha"]',
            '[class*="verify-code"]', '[id*="verify-code"]',
            '[class*="slider"]', '[class*="slide-verify"]',
            'iframe[src*="captcha"]', 'iframe[src*="recaptcha"]', 'iframe[src*="hcaptcha"]',
            'iframe[src*="geetest"]', 'iframe[src*="captcha.tencent"]',
            'iframe[src*="captcha.awswaf"]', 'iframe[src*="challenges.cloudflare.com"]',
            '.cf-turnstile', '.h-captcha', '.g-recaptcha', '.grecaptcha-badge',
            '[data-sitekey]', '.geetest_widget', '.geetest_panel',
            '#tcaptcha_iframe', '[class*="tcaptcha"]',
            '[class*="nc_iconfont"]', '[class*="nc_lang"]',
            '[class*="J_slideBlock"]', '[id*="aliyunCaptcha"]'
          ];

      const scriptPatterns = [
        { pattern: /recaptcha\/api\.js|recaptcha\/releases/i, provider: 'recaptcha', type: 'recaptcha' },
        { pattern: /hcaptcha\.com\/1\/api\.js/i, provider: 'hcaptcha', type: 'hcaptcha' },
        { pattern: /challenges\.cloudflare\.com\/turnstile/i, provider: 'turnstile', type: 'turnstile' },
        { pattern: /geetest\.com\/static\/tools|geetest\.com\/api/i, provider: 'geetest', type: 'geetest' },
        { pattern: /captcha\.tencent/i, provider: 'tencent', type: 'tencent' },
        { pattern: /captcha\.awswaf\.com/i, provider: 'awswaf', type: 'awswaf' },
        { pattern: /aliyunCaptcha|captcha\.aliyun/i, provider: 'aliyun', type: 'aliyun-slider' }
      ];

      document.querySelectorAll('script[src]').forEach(s => {
        const src = s.src || '';
        for (const { pattern, provider, type } of scriptPatterns) {
          if (pattern.test(src)) {
            result.scripts.push({ provider, type, src: src.slice(0, 200) });
            if (result.provider === 'unknown') result.provider = provider;
            if (result.type === 'unknown') result.type = type;
            result.found = true;
            break;
          }
        }
      });

      const typeMap = [
        { match: (src, cls, tag) => src.includes('challenges.cloudflare.com') || cls.includes('cf-turnstile') || cls.includes('turnstile'), type: 'turnstile', provider: 'cloudflare', complexity: 'high' },
        { match: (src, cls, tag) => src.includes('geetest') || cls.includes('geetest'), type: 'geetest', provider: 'geetest', complexity: 'high' },
        { match: (src, cls, tag) => src.includes('captcha.tencent') || cls.includes('tcaptcha'), type: 'tencent', provider: 'tencent', complexity: 'high' },
        { match: (src, cls, tag) => src.includes('captcha.awswaf') || cls.includes('awswaf'), type: 'awswaf', provider: 'aws', complexity: 'high' },
        { match: (src, cls, tag) => src.includes('recaptcha') || cls.includes('g-recaptcha') || cls.includes('grecaptcha'), type: 'recaptcha', provider: 'google', complexity: 'high' },
        { match: (src, cls, tag) => cls.includes('grecaptcha-badge'), type: 'recaptcha-v3', provider: 'google', complexity: 'high' },
        { match: (src, cls, tag) => src.includes('hcaptcha') || cls.includes('h-captcha'), type: 'hcaptcha', provider: 'hcaptcha', complexity: 'high' },
        { match: (src, cls, tag) => cls.includes('slider') || cls.includes('slide'), type: 'slider', provider: 'unknown', complexity: 'high' },
        { match: (src, cls, tag) => cls.includes('nc_iconfont') || cls.includes('nc_lang') || cls.includes('aliyunCaptcha'), type: 'aliyun-slider', provider: 'aliyun', complexity: 'high' },
        { match: (src, cls, tag) => tag === 'canvas', type: 'canvas', provider: 'unknown', complexity: 'medium' },
        { match: (src, cls, tag) => tag === 'iframe', type: 'iframe', provider: 'unknown', complexity: 'medium' }
      ];

      const detectType = (src, cls, tag) => {
        for (const t of typeMap) {
          if (t.match(src, cls, tag)) return t;
        }
        return { type: 'image', provider: 'unknown', complexity: 'low' };
      };

      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          const tagName = el.tagName.toLowerCase();
          const src = el.src || el.getAttribute('data-src') || '';
          const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
          const detected = detectType(src, cls, tagName);

          result.elements.push({
            type: detected.type,
            provider: detected.provider,
            tagName,
            selector: sel,
            src: src.slice(0, 200),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            visible: rect.width > 0 || rect.height > 0,
            sitekey: el.getAttribute('data-sitekey') || undefined
          });
          result.found = true;
          if (result.type === 'unknown' || result.type === 'image') {
            result.type = detected.type;
            result.provider = detected.provider;
          }
          const complexityRank = { low: 0, medium: 1, high: 2 };
          const currentRank = complexityRank[result.complexity] ?? -1;
          const newRank = complexityRank[detected.complexity] ?? 0;
          if (newRank > currentRank) result.complexity = detected.complexity;
        }
      }

      if (mode !== 'auto') {
        result.elements = result.elements.filter(e => e.type === mode || e.type === 'iframe');
        result.found = result.elements.length > 0 || result.scripts.length > 0;
        result.type = result.found ? mode : (result.scripts.length > 0 ? result.scripts[0].type : 'unknown');
      }

      result.needsHuman = result.complexity === 'high';
      if (!result.found) {
        result.suggestions = [
          '未检测到验证码元素，可能原因：页面未加载验证码、验证码在 iframe 中、或使用非标准选择器',
          '尝试使用 captchaSelector 参数手动指定验证码元素选择器',
          '使用 browser_snapshot 查看页面 DOM 结构以定位验证码元素',
          '某些现代验证码（Turnstile/reCAPTCHA v3）可能为隐形，检查 scripts 字段是否检测到验证码脚本'
        ];
      } else {
        result.suggestions = result.needsHuman
          ? [`检测到 ${result.provider} ${result.type} 验证码，复杂度较高，建议人工处理或使用 browser_captcha_screenshot 截图后人工识别`]
          : ['可以使用 browser_captcha_read 尝试自动识别验证码文本'];
      }

      return result;
    }, { selector: captchaSelector, mode: detectMode });

    return text(JSON.stringify(detection, null, 2));
  }

  // ====== browser_captcha_screenshot ======
  if (name === 'browser_captcha_screenshot') {
    const { target } = await ensurePage(args);
    const captchaSelector = args.captchaSelector;
    const padding = args.padding || 4;
    const savePath = args.savePath;
    const minSize = args.minSize || 100;
    const autoRefresh = args.autoRefresh !== false;

    const findCaptchaEl = async () => {
      if (captchaSelector) {
        const el = await target.$(captchaSelector).catch(() => null);
        if (el) return el;
      }
      const autoSelectors = [
        'img[src*="captcha"]', 'img[src*="verify"]', 'img[class*="captcha"]',
        'canvas[class*="captcha"]', '[class*="captcha"] img', '[class*="verify-code"] img'
      ];
      for (const sel of autoSelectors) {
        const el = await target.$(sel).catch(() => null);
        if (el) return el;
      }
      return null;
    };

    const refreshSelectors = [
      '[class*="refresh"]', '[class*="reload"]', '[class*="change-captcha"]',
      '[onclick*="refresh"]', '[onclick*="reload"]', '[onclick*="changeCode"]',
      'img[src*="refresh"]', 'img[src*="reload"]', 'img[alt*="refresh"]',
      '[aria-label*="refresh"]', '[title*="刷新"]', '[title*="refresh"]',
      'a[class*="refresh"]', 'button[class*="refresh"]', 'span[class*="refresh"]'
    ];

    const tryRefreshCaptcha = async () => {
      for (const sel of refreshSelectors) {
        const btn = await target.$(sel).catch(() => null);
        if (btn) {
          const btnBox = await btn.boundingBox().catch(() => null);
          if (btnBox && btnBox.width > 0 && btnBox.height > 0) {
            await btn.click().catch(() => {});
            await target.waitForTimeout(600);
            return sel;
          }
        }
      }
      return null;
    };

    let captchaEl = await findCaptchaEl();

    if (!captchaEl) {
      return text(JSON.stringify({
        success: false,
        error: '未找到验证码元素',
        suggestions: [
          '使用 captchaSelector 参数手动指定验证码选择器',
          '使用 browser_captcha_detect 先检测验证码位置'
        ]
      }, null, 2));
    }

    const fs = require('fs');
    const path = require('path');
    const screenshotDir = path.join(__dirname, '..', 'screenshots');
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

    const filename = `captcha-${Date.now()}.png`;
    const filepath = savePath || path.join(screenshotDir, filename);

    let box = await captchaEl.boundingBox();
    if (!box || box.width < 10 || box.height < 10) {
      return text(JSON.stringify({
        success: false,
        error: '验证码元素尺寸过小',
        boundingBox: box,
        suggestions: ['验证码可能尚未加载完成，尝试增加等待时间后重试']
      }, null, 2));
    }

    await captchaEl.screenshot({ path: filepath, omitBackground: false });
    let tooSmall = box.width < minSize || box.height < minSize;
    const refreshAttempts = [];

    if (tooSmall && autoRefresh && !savePath) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const refreshSel = await tryRefreshCaptcha();
        if (!refreshSel) {
          refreshAttempts.push({ attempt, refreshed: false, reason: '未找到刷新按钮' });
          break;
        }
        captchaEl = await findCaptchaEl();
        if (!captchaEl) {
          refreshAttempts.push({ attempt, refreshed: true, selector: refreshSel, reason: '刷新后验证码元素消失' });
          break;
        }
        box = await captchaEl.boundingBox();
        if (!box || box.width < 10 || box.height < 10) {
          refreshAttempts.push({ attempt, refreshed: true, selector: refreshSel, reason: '刷新后元素尺寸仍过小' });
          continue;
        }
        await captchaEl.screenshot({ path: filepath, omitBackground: false });
        tooSmall = box.width < minSize || box.height < minSize;
        refreshAttempts.push({ attempt, refreshed: true, selector: refreshSel, width: Math.round(box.width), height: Math.round(box.height), stillSmall: tooSmall });
        if (!tooSmall) break;
      }
    }

    const stats = fs.statSync(filepath);

    return text(JSON.stringify({
      success: !tooSmall,
      path: filepath,
      size: stats.size,
      width: Math.round(box.width),
      height: Math.round(box.height),
      warning: tooSmall ? `截图尺寸小于 minSize(${minSize})，验证码可能无效` : undefined,
      autoRefresh: autoRefresh && refreshAttempts.length > 0 ? {
        attempted: refreshAttempts.length,
        attempts: refreshAttempts,
        resolved: !tooSmall
      } : undefined,
      nextSteps: tooSmall
        ? ['验证码图片尺寸过小，可能需要手动刷新验证码后重新截图', '尝试使用 captchaSelector 精确指定验证码元素']
        : ['使用 browser_captcha_read 对截图进行 OCR 识别']
    }, null, 2));
  }

  // ====== browser_captcha_read ======
  if (name === 'browser_captcha_read') {
    const { target } = await ensurePage(args);
    const captchaSelector = args.captchaSelector;
    const captchaIndex = args.captchaIndex || 0;

    let captchaEl = null;
    let searchContext = target;
    let iframeUsed = null;

    if (captchaSelector) {
      captchaEl = await target.$(captchaSelector).catch(() => null);
    } else {
      const autoSelectors = [
        'img[src*="captcha"]', 'img[src*="verify"]', 'img[src*="code"]',
        'img[class*="captcha"]', '[class*="captcha"] img', '[class*="verify-code"] img'
      ];
      for (const sel of autoSelectors) {
        const els = await target.$$(sel).catch(() => []);
        if (els.length > captchaIndex) {
          captchaEl = els[captchaIndex];
          break;
        }
      }

      if (!captchaEl) {
        const frames = target.frames();
        for (const frame of frames) {
          if (frame === target) continue;
          const frameUrl = frame.url();
          if (frameUrl.includes('captcha') || frameUrl.includes('recaptcha') || frameUrl.includes('hcaptcha') || frameUrl.includes('geetest') || frameUrl.includes('turnstile')) {
            for (const sel of autoSelectors) {
              const els = await frame.$$(sel).catch(() => []);
              if (els.length > captchaIndex) {
                captchaEl = els[captchaIndex];
                searchContext = frame;
                iframeUsed = frameUrl.slice(0, 200);
                break;
              }
            }
            if (captchaEl) break;
          }
        }
      }
    }

    if (!captchaEl) {
      return text(JSON.stringify({
        success: false,
        error: '未找到验证码元素',
        suggestions: [
          '使用 captchaSelector 参数手动指定验证码选择器',
          '使用 browser_captcha_detect 先检测验证码位置',
          '验证码可能在 iframe 中，已尝试自动搜索 iframe 但未找到'
        ]
      }, null, 2));
    }

    const src = await captchaEl.getAttribute('src').catch(() => '');
    const tagName = await captchaEl.evaluate(el => el.tagName.toLowerCase()).catch(() => 'img');

    const preprocessImage = async (dataUrl) => {
      if (!dataUrl) return null;
      return await searchContext.evaluate(async (url) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
              const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              const binary = gray > 128 ? 255 : 0;
              data[i] = binary;
              data[i + 1] = binary;
              data[i + 2] = binary;
            }
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = () => resolve(null);
          img.src = url;
        });
      }, dataUrl);
    };

    let recognizedText = '';
    let confidence = 0;
    let ocrMethod = 'none';
    let preprocessingApplied = false;

    const tryDdddocr = async (imageBuffer) => {
      const ddddocr = require('ddddocr-node');
      const ocrResult = await ddddocr.classification(imageBuffer);
      return {
        text: ocrResult.text || ocrResult.result || '',
        confidence: ocrResult.confidence || 0
      };
    };

    let rawDataUrl = null;

    if (src && src.startsWith('data:image')) {
      ocrMethod = 'data-url';
      rawDataUrl = src;
      try {
        const base64Data = src.split(',')[1];
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const ocrResult = await tryDdddocr(imageBuffer);
        recognizedText = ocrResult.text;
        confidence = ocrResult.confidence || (recognizedText ? 0.8 : 0);
      } catch (e) {
        ocrMethod = 'data-url-failed';
      }
    } else if (src && (src.startsWith('http') || src.startsWith('/'))) {
      ocrMethod = 'url-fetch';
      try {
        const url = src.startsWith('/') ? await target.evaluate(() => window.location.origin) + src : src;
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        rawDataUrl = `data:image/png;base64,${Buffer.from(imageBuffer).toString('base64')}`;
        const ocrResult = await tryDdddocr(imageBuffer);
        recognizedText = ocrResult.text;
        confidence = ocrResult.confidence || (recognizedText ? 0.8 : 0);
      } catch (e) {
        ocrMethod = 'url-fetch-failed';
      }
    } else if (tagName === 'canvas') {
      ocrMethod = 'canvas';
      try {
        const dataUrl = await captchaEl.evaluate(el => {
          if (el.tagName.toLowerCase() === 'canvas') {
            return el.toDataURL('image/png');
          }
          return null;
        });
        if (dataUrl) {
          rawDataUrl = dataUrl;
          const base64Data = dataUrl.split(',')[1];
          const imageBuffer = Buffer.from(base64Data, 'base64');
          const ocrResult = await tryDdddocr(imageBuffer);
          recognizedText = ocrResult.text;
          confidence = ocrResult.confidence || (recognizedText ? 0.8 : 0);
        }
      } catch (e) {
        ocrMethod = 'canvas-failed';
      }
    }

    if (!recognizedText && rawDataUrl) {
      try {
        const processedDataUrl = await preprocessImage(rawDataUrl);
        if (processedDataUrl && processedDataUrl !== rawDataUrl) {
          const base64Data = processedDataUrl.split(',')[1];
          const imageBuffer = Buffer.from(base64Data, 'base64');
          const ocrResult = await tryDdddocr(imageBuffer);
          if (ocrResult.text) {
            recognizedText = ocrResult.text;
            confidence = ocrResult.confidence || 0.7;
            ocrMethod = ocrMethod + '-preprocessed';
            preprocessingApplied = true;
          }
        }
      } catch (e) {
        // preprocessing failed, continue to tesseract fallback
      }
    }

    if (!recognizedText) {
      try {
        const tesseract = require('tesseract.js');
        const fs = require('fs');
        const path = require('path');
        const screenshotDir = path.join(__dirname, '..', 'screenshots');
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
        const tempPath = path.join(screenshotDir, `captcha-ocr-${Date.now()}.png`);
        await captchaEl.screenshot({ path: tempPath });
        const { data } = await tesseract.recognize(tempPath, 'eng');
        recognizedText = (data.text || '').trim();
        confidence = data.confidence ? data.confidence / 100 : (recognizedText ? 0.6 : 0);
        ocrMethod = recognizedText ? 'tesseract' : 'tesseract-empty';
        try { fs.unlinkSync(tempPath); } catch (_) { /* optional, ignore errors */ }
      } catch (e) {
        ocrMethod = 'tesseract-failed';
      }
    }

    return text(JSON.stringify({
      success: recognizedText.length > 0,
      text: recognizedText,
      confidence: Number(confidence.toFixed(2)),
      method: ocrMethod,
      preprocessing: preprocessingApplied ? { grayscale: true, binaryThreshold: 128 } : undefined,
      iframe: iframeUsed ? { used: true, url: iframeUsed } : undefined,
      elementInfo: {
        tag: tagName,
        src: (src || '').slice(0, 100),
        hasSrc: !!src
      },
      needsHuman: confidence < 0.5 || recognizedText.length === 0,
      nextSteps: confidence < 0.5
        ? ['识别置信度较低，建议使用 browser_captcha_screenshot 截图后人工识别']
        : [`识别结果: "${recognizedText}"，可尝试填入验证码输入框`]
    }, null, 2));
  }

  return mcpError(`未知工具（browser）: ${name}`, { error: 'UNKNOWN_TOOL', toolName: name });
  } finally {
    Object.assign(deps, { page, browser, browserSessionId, consoleLogs, networkLogs, pageErrors, currentCheckpoint, eventCheckpoint, lastAction, sessions, activeSessionName, sessionCounter, traceLogs, traceActive, currentTraceName, backendProbeResults, instrumentationEnabled, imageErrors, lastImageErrorCheckpoint, validationResults, lastQualityChecks, lastValidationRun, requestStartTimes, stateManager });
  }

}

module.exports = { tools, handle };
