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
  "browser_eval",
  "browser_dom",
  "browser_highlight",
  "browser_select",
  "browser_navigate",
  "browser_wait",
  "browser_assert",
  "browser_instrument",
  "browser_events",
  "browser_form_validate",
  "browser_aria_snapshot",
  "browser_aria_click",
  "browser_aria_type",
  "browser_matrix_test",
  "browser_overlay",
  "browser_captcha",
  "browser_table_verify",
  "browser_api_intercept"
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
      // autoFirst 默认为 true：自动点击第一个可见元素，不报错
      const autoFirst = args.autoFirst !== false;
      if (!autoFirst) {
        // autoFirst=false 时返回 MULTIPLE_ELEMENTS 错误供人工选择
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
          hint: '可在 selector 参数中使用 ">> nth=0" 语法点击第一个匹配元素，或设置 autoFirst=true 自动点击第一个'
        }, null, 2));
      }
      // autoFirst=true：继续执行，自动点击第一个元素（下方 clickSelector 会使用 .first()）
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
        suggestions.push('页面抛出异常，请使用 browser_errors { mode: \'aggregate\' } 查看聚合分析');
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
      ]
    }, null, 2));
  }

  // ====== browser_click_audit ======
  if (name === 'browser_click_audit') {
const { target } = await ensurePage();
    const label = args.label || args.selector || args.text || 'audit';
    const waitMs = args.waitMs || 1500;
    const autoReturn = args.autoReturn !== false;
    const auditMode = args.mode || 'basic';
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

    // form-submit 模式：点击前捕获表单状态
    let formSubmitContext = null;
    if (auditMode === 'form-submit') {
      try {
        formSubmitContext = await target.evaluate(({ selector, formSelector }) => {
          const clickedEl = document.querySelector(selector);
          let formEl = formSelector ? document.querySelector(formSelector) : null;
          if (!formEl && clickedEl) {
            // 自动查找最近的 form 祖先
            formEl = clickedEl.closest('form');
          }
          if (!formEl) {
            return { found: false, reason: 'no_form_element' };
          }
          // 收集表单字段
          const fields = [];
          const fieldEls = formEl.querySelectorAll('input, select, textarea');
          for (const f of fieldEls) {
            if (f.type === 'submit' || f.type === 'button' || f.type === 'reset') continue;
            fields.push({
              name: f.name || f.id || '',
              type: f.type || f.tagName.toLowerCase(),
              value: f.value || '',
              required: !!f.required
            });
          }
          return {
            found: true,
            action: formEl.action || '',
            method: (formEl.method || 'get').toLowerCase(),
            enctype: formEl.enctype || '',
            fieldCount: fields.length,
            fieldsBefore: fields
          };
        }, { selector, formSelector: args.formSelector });
      } catch (_) {
        formSubmitContext = { found: false, reason: 'evaluate_failed' };
      }
    }

    // form-submit 模式：监听 submit 事件（注入到页面）
    if (auditMode === 'form-submit' && formSubmitContext && formSubmitContext.found) {
      try {
        await target.evaluate(() => {
          // 每次调用都重新安装监听器（避免上次调用残留状态干扰）
          // 使用随机命名空间避免冲突
          if (window.__avmSubmitHandler) {
            document.removeEventListener('submit', window.__avmSubmitHandler, true);
          }
          window.__avmSubmitEvents = [];
          const handler = (e) => {
            const form = e.target;
            if (!form || form.tagName !== 'FORM') return;
            const fields = [];
            try {
              const fd = new FormData(form);
              for (const [k, v] of fd.entries()) {
                fields.push({ name: k, value: typeof v === 'string' ? v : '[file]' });
              }
            } catch (_) { /* FormData 不可用，跳过字段收集 */ }
            window.__avmSubmitEvents.push({
              timestamp: Date.now(),
              action: form.action || '',
              method: (form.method || 'get').toLowerCase(),
              fields: fields
            });
          };
          window.__avmSubmitHandler = handler;
          document.addEventListener('submit', handler, true);
        });
      } catch (_) { /* ignore listener install error */ }
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

    // 7.5 form-submit 模式：收集提交结果
    let formSubmitResult = null;
    if (auditMode === 'form-submit') {
      formSubmitResult = { mode: 'form-submit' };

      // a) 读取 submit 事件（点击前已注入监听器）
      if (formSubmitContext && formSubmitContext.found) {
        try {
          const submitEvents = await target.evaluate(() => {
            const evs = window.__avmSubmitEvents || [];
            // 读取后清空，避免污染下次调用
            window.__avmSubmitEvents = [];
            return evs;
          });
          formSubmitContext.submitEvents = submitEvents;
          formSubmitResult.submitTriggered = submitEvents.length > 0;
          if (submitEvents.length > 0) {
            const ev = submitEvents[0];
            formSubmitResult.submitEvent = {
              method: ev.method,
              action: (ev.action || '').slice(0, 200),
              fieldCount: ev.fields.length,
              submittedFields: ev.fields.slice(0, 20).map(f => ({
                name: f.name,
                valueLength: (f.value || '').length,
                valuePreview: (f.value || '').slice(0, 50)
              }))
            };
          }
        } catch (_) { /* ignore */ }
      } else if (formSubmitContext) {
        formSubmitResult.submitTriggered = false;
        formSubmitResult.reason = formSubmitContext.reason || 'no_form';
      }

      // b) 读取表单字段当前值，检测是否清空（成功提交的标志）
      if (formSubmitContext && formSubmitContext.found) {
        try {
          const afterState = await target.evaluate(({ selector, formSelector }) => {
            const clickedEl = document.querySelector(selector);
            let formEl = formSelector ? document.querySelector(formSelector) : null;
            if (!formEl && clickedEl) formEl = clickedEl.closest('form');
            if (!formEl) return { found: false };
            const fields = [];
            const fieldEls = formEl.querySelectorAll('input, select, textarea');
            for (const f of fieldEls) {
              if (f.type === 'submit' || f.type === 'button' || f.type === 'reset') continue;
              fields.push({
                name: f.name || f.id || '',
                value: f.value || ''
              });
            }
            return {
              found: true,
              fieldsAfter: fields,
              // 当前页面是否还存在该 form（提交后可能跳转导致 form 消失）
              formStillInDOM: document.body.contains(formEl)
            };
          }, { selector, formSelector: args.formSelector });
          if (afterState.found) {
            // 比较前后字段值
            const before = formSubmitContext.fieldsBefore || [];
            const after = afterState.fieldsAfter || [];
            const beforeMap = {};
            for (const f of before) beforeMap[f.name] = f.value;
            const clearedFields = [];
            for (const f of after) {
              if (beforeMap[f.name] && beforeMap[f.name] !== '' && (f.value === '' || f.value === undefined)) {
                clearedFields.push(f.name);
              }
            }
            formSubmitResult.fieldsCleared = clearedFields.length > 0;
            formSubmitResult.clearedFieldNames = clearedFields.slice(0, 10);
            formSubmitResult.fieldsAfterCount = after.length;
          } else {
            // form 已不在 DOM（可能因页面跳转）
            formSubmitResult.fieldsCleared = null;
            formSubmitResult.formInDOM = false;
          }
        } catch (_) { /* ignore */ }
      }

      // c) 检测成功/错误提示消息（支持多种 UI 框架，只读取可见元素）
      try {
        const messages = await target.evaluate(() => {
          const msgs = { success: [], error: [], warning: [] };
          // 判断元素是否可见（offsetParent 非 null 或 display 非 none）
          const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            // offsetParent 为 null 且不是 fixed 时，元素不可见
            if (el.offsetParent === null && style.position !== 'fixed') return false;
            return true;
          };
          // Element Plus / Ant Design / 通用类名
          const successSel = [
            '.el-message--success', '.ant-message-success', '.ant-notification-notice-success',
            '.success-message', '.alert-success', '[class*="success-message"]',
            '.toast-success', '[role="alert"].success'
          ];
          const errorSel = [
            '.el-message--error', '.ant-message-error', '.ant-notification-notice-error',
            '.error-message', '.alert-danger', '.alert-error', '[class*="error-message"]',
            '.toast-error', '[role="alert"].error', '.invalid-feedback', '.field-error'
          ];
          const warningSel = [
            '.el-message--warning', '.ant-message-warning', '.ant-notification-notice-warning',
            '.warning-message', '.alert-warning', '[class*="warning-message"]'
          ];
          for (const sel of successSel) {
            document.querySelectorAll(sel).forEach(el => {
              if (!isVisible(el)) return;
              const t = (el.textContent || '').trim();
              if (t) msgs.success.push(t.slice(0, 200));
            });
          }
          for (const sel of errorSel) {
            document.querySelectorAll(sel).forEach(el => {
              if (!isVisible(el)) return;
              const t = (el.textContent || '').trim();
              if (t) msgs.error.push(t.slice(0, 200));
            });
          }
          for (const sel of warningSel) {
            document.querySelectorAll(sel).forEach(el => {
              if (!isVisible(el)) return;
              const t = (el.textContent || '').trim();
              if (t) msgs.warning.push(t.slice(0, 200));
            });
          }
          // 去重
          msgs.success = Array.from(new Set(msgs.success)).slice(0, 3);
          msgs.error = Array.from(new Set(msgs.error)).slice(0, 3);
          msgs.warning = Array.from(new Set(msgs.warning)).slice(0, 3);
          return msgs;
        });
        formSubmitResult.successMessage = messages.success.length > 0 ? messages.success.join(' | ') : null;
        formSubmitResult.errorMessage = messages.error.length > 0 ? messages.error.join(' | ') : null;
        formSubmitResult.warningMessage = messages.warning.length > 0 ? messages.warning.join(' | ') : null;
      } catch (_) { /* ignore */ }

      // d) 检测提交相关的网络请求（POST/PUT/DELETE/PATCH，且时间在点击之后）
      try {
        const submitMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
        const submitRequests = networkLogs
          .filter(e => {
            const method = (e.method || '').toUpperCase();
            const ts = new Date(e.timestamp || 0).getTime();
            const ckpt = new Date(currentCheckpoint).getTime();
            return submitMethods.includes(method) && ts > ckpt;
          })
          .slice(0, 5)
          .map(e => ({
            method: e.method,
            url: (e.url || '').slice(0, 200),
            status: e.status || null,
            contentType: e.contentType || null
          }));
        formSubmitResult.submitRequests = submitRequests;
        formSubmitResult.networkSubmitCount = submitRequests.length;
      } catch (_) { /* ignore */ }

      // e) 综合判定：是否触发了表单提交（任一标志即可）
      const triggeredByEvent = formSubmitResult.submitTriggered === true;
      const triggeredByNetwork = (formSubmitResult.networkSubmitCount || 0) > 0;
      const triggeredByNav = urlNavigated && (formSubmitContext && formSubmitContext.method === 'get');
      formSubmitResult.formSubmitted = triggeredByEvent || triggeredByNetwork || triggeredByNav;

      // f) 综合判定：提交是否成功（满足任一条件即视为成功）
      const hasSuccessMessage = !!formSubmitResult.successMessage;
      const fieldsClearedAfterSubmit = formSubmitResult.fieldsCleared === true;
      const hasNoErrorMessages = !formSubmitResult.errorMessage;
      const submitRequests = formSubmitResult.submitRequests || [];
      const submitNetworkSucceeded = submitRequests.some(r => r.status && r.status >= 200 && r.status < 300);
      // 网络请求返回 4xx/5xx 视为失败，优先于字段清空标志
      const submitNetworkFailed = submitRequests.some(r => r.status && (r.status >= 400 || r.status < 200));
      formSubmitResult.submitSucceeded = hasSuccessMessage || submitNetworkSucceeded || (fieldsClearedAfterSubmit && hasNoErrorMessages && !submitNetworkFailed);

      // g) 断言（如果调用方提供了期望值）
      const assertions = [];
      if (args.expectSuccess === true) {
        const passed = formSubmitResult.submitSucceeded;
        assertions.push({
          name: 'expectSuccess',
          passed,
          expected: true,
          actual: formSubmitResult.submitSucceeded,
          reason: passed ? '检测到成功标志（成功消息/网络 2xx/字段清空且无错误）' : '未检测到成功标志，可能存在错误消息或网络失败'
        });
      }
      if (args.expectNavigation === true) {
        const passed = urlNavigated;
        assertions.push({
          name: 'expectNavigation',
          passed,
          expected: true,
          actual: urlNavigated,
          reason: passed ? `URL 已跳转: ${urlBefore} → ${urlAfter}` : 'URL 未发生变化'
        });
      } else if (args.expectNavigation === false) {
        const passed = !urlNavigated;
        assertions.push({
          name: 'expectNavigation',
          passed,
          expected: false,
          actual: urlNavigated,
          reason: passed ? 'URL 未跳转（SPA 模式预期）' : `URL 发生了跳转: ${urlBefore} → ${urlAfter}`
        });
      }
      formSubmitResult.assertions = assertions;
      formSubmitResult.allAssertionsPassed = assertions.length > 0 && assertions.every(a => a.passed);

      // h) 清理 window 上的临时监听器标记（保留监听器避免重复安装检测开销，仅清空事件数组）
      // 已在读取时清空 __avmSubmitEvents，无需额外清理
    }

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
    
    // 8.5 Modal/Dialog 检测（点击后是否弹出了模态框）
    let modalResult = null;
    if (visualChanged && !urlNavigated) {
      try {
        const modalData = await target.evaluate(() => {
          // Ant Design Modal
          let modal = document.querySelector('.ant-modal-wrap:not([style*="display: none"]) .ant-modal');
          let library = 'ant-design';
          // Element UI Dialog
          if (!modal) {
            modal = document.querySelector('.el-dialog__wrapper:not([style*="display: none"]) .el-dialog');
            library = 'element-ui';
          }
          // 通用 role="dialog"
          if (!modal) {
            modal = document.querySelector('[role="dialog"]:not([aria-hidden="true"])');
            library = 'generic';
          }
          // Ant Design Drawer
          if (!modal) {
            modal = document.querySelector('.ant-drawer-content:not([style*="display: none"])');
            library = 'ant-design-drawer';
          }
          // Tailwind CSS 自定义弹窗（.fixed.inset-0.z-50 或 .fixed.inset-0 配合 bg-black/50）
          if (!modal) {
            const tailwindModal = Array.from(document.querySelectorAll('.fixed.inset-0, [class*="fixed"][class*="inset-0"]')).find(el => {
              const z = parseInt(getComputedStyle(el).zIndex) || 0;
              const hasOverlay = el.className.includes('bg-black') || el.className.includes('bg-gray') || el.className.includes('bg-opacity');
              return z >= 40 || hasOverlay;
            });
            if (tailwindModal) {
              modal = tailwindModal.querySelector('.bg-white, .rounded-xl, .rounded-lg, [class*="shadow"]') || tailwindModal;
              library = 'tailwind-css';
            }
          }
          if (!modal) return { modalFound: false };

          // 提取弹窗内容
          const title = modal.querySelector('.ant-modal-title, .el-dialog__title, [role="dialog"] .title, .ant-drawer-title, h1, h2, h3, [class*="title"]')?.textContent?.trim() || '';
          const body = modal.querySelector('.ant-modal-body, .el-dialog__body, .ant-drawer-body')?.textContent?.trim()?.slice(0, 200) || modal.textContent.trim().slice(0, 200);
          const buttons = Array.from(modal.querySelectorAll('.ant-btn, .el-button, button')).map(b => ({
            text: b.textContent.trim().slice(0, 30),
            type: b.className.includes('primary') || b.className.includes('confirm') || b.className.includes('bg-blue') || b.className.includes('bg-indigo') ? 'primary' : 'default'
          }));

          return { modalFound: true, library, title, body, buttons, buttonCount: buttons.length };
        });

        if (modalData.modalFound) {
          modalResult = {
            modalFound: true,
            library: modalData.library,
            title: modalData.title,
            body: modalData.body,
            buttons: modalData.buttons,
            buttonCount: modalData.buttonCount
          };

          // 断言：期望的弹窗标题
          if (args.expectModalTitle !== undefined) {
            const titlePassed = modalData.title.includes(String(args.expectModalTitle));
            modalResult.titleAssertion = {
              expected: args.expectModalTitle,
              actual: modalData.title,
              passed: titlePassed,
              reason: titlePassed ? `弹窗标题匹配: "${modalData.title}"` : `弹窗标题不匹配，期望包含 "${args.expectModalTitle}"，实际 "${modalData.title}"`
            };
          }

          // 断言：期望的弹窗内容
          if (args.expectModalBody !== undefined) {
            const bodyPassed = modalData.body.includes(String(args.expectModalBody));
            modalResult.bodyAssertion = {
              expected: args.expectModalBody,
              actual: modalData.body.slice(0, 100),
              passed: bodyPassed,
              reason: bodyPassed ? `弹窗内容匹配` : `弹窗内容不匹配，期望包含 "${args.expectModalBody}"`
            };
          }

          // 自动关闭弹窗
          if (args.closeModal === true) {
            try {
              await target.evaluate(() => {
                // 查找各种类型的弹窗
                let modal = document.querySelector('.ant-modal-wrap:not([style*="display: none"]) .ant-modal, .el-dialog__wrapper:not([style*="display: none"]) .el-dialog, [role="dialog"]:not([aria-hidden="true"])');
                // Tailwind CSS 弹窗
                if (!modal) {
                  const tailwindModal = Array.from(document.querySelectorAll('.fixed.inset-0, [class*="fixed"][class*="inset-0"]')).find(el => {
                    const z = parseInt(getComputedStyle(el).zIndex) || 0;
                    const hasOverlay = el.className.includes('bg-black') || el.className.includes('bg-gray') || el.className.includes('bg-opacity');
                    return z >= 40 || hasOverlay;
                  });
                  if (tailwindModal) modal = tailwindModal;
                }
                if (modal) {
                  // 优先点击取消/关闭按钮
                  const cancelBtn = Array.from(modal.querySelectorAll('button')).find(b => {
                    const t = b.textContent.trim();
                    return t.includes('取') || t.includes('Cancel') || t.includes('关闭') || t.includes('Close') || t.includes('×');
                  });
                  if (cancelBtn) { cancelBtn.click(); return 'cancel_btn'; }
                  // 点击右上角关闭按钮
                  const closeBtn = modal.querySelector('.ant-modal-close, .el-dialog__closebtn, [aria-label="close"], [aria-label="Close"]');
                  if (closeBtn) { closeBtn.click(); return 'close_icon'; }
                  // 按 Escape
                  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
                  return 'escape';
                }
                return 'no_modal';
              });
              await new Promise(r => setTimeout(r, 500));
              modalResult.closed = true;
            } catch (_) { modalResult.closed = false; }
          }
        }
      } catch (_) { /* modal detection failed, not critical */ }
    }

    // 9. 组装结果
    const result = {
      success: true,
      mode: auditMode,
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
      modal: modalResult,
      timestamp: new Date().toISOString()
    };

    // form-submit 模式：附加表单提交检测结果
    if (auditMode === 'form-submit' && formSubmitResult) {
      result.formSubmit = formSubmitResult;
      // 如果有断言失败，将 success 标记为 false（不影响 errors 统计）
      if (formSubmitResult.allAssertionsPassed === false) {
        result.assertionFailed = true;
      }
    }
    
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

    // form-submit 模式：增强的下一步建议
    if (auditMode === 'form-submit' && formSubmitResult) {
      const formNextSteps = [];
      const formSuggestions = [];
      if (formSubmitResult.formSubmitted === false) {
        formNextSteps.push('表单未触发提交，使用 browser_snapshot 检查按钮是否在 form 内或检查 disabled 状态');
        formSuggestions.push({ type: 'diagnose', tool: 'browser_snapshot', reason: '检查按钮与表单的关系' });
      } else if (formSubmitResult.submitSucceeded === false) {
        formNextSteps.push('表单已提交但未检测到成功标志，使用 browser_errors 查看错误详情');
        formSuggestions.push({ type: 'diagnose', tool: 'browser_errors', reason: '查看提交失败的网络/控制台错误' });
      } else {
        formNextSteps.push('表单提交成功，使用 browser_snapshot 确认提交后的页面状态');
        formSuggestions.push({ type: 'verify', tool: 'browser_snapshot', reason: '验证提交后的数据展示' });
      }
      result.nextSteps = formNextSteps.concat(result.nextSteps);
      result.suggestions = formSuggestions.concat(result.suggestions);
    }

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
      suggestions: [{ type: 'next', tool: 'browser_click', reason: '点击悬浮后出现的交互元素' }]
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
      nextSteps: ['调用 browser_snapshot 确认滚动后页面状态', '调用 browser_find { mode: \'element\' } 查找滚动后显示的元素'],
      suggestions: [{ type: 'next', tool: 'browser_snapshot', reason: '查看滚动后的页面内容' }]
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
        '调用 browser_find { mode: \'element\' } 搜索页面中特定元素',
        '调用 browser_click 点击按钮或链接进行交互',
        '调用 browser_screenshot 截图留存页面状态'
      ],
      suggestions: [
        { type: 'next', tool: 'browser_find', reason: '搜索页面中的特定元素' },
        { type: 'next', tool: 'browser_click', reason: '点击按钮或链接进行交互验证' }
      ]
    }, null, 2));
  }

  // ====== browser_flow mode=batch ======
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
      ]
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
      ]
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
        '调用 browser_find { mode: \'element\' } 智能搜索元素',
        '检查选择器是否正确',
        '调用 browser_snapshot 查看页面完整结构'
      ];
      resultData.suggestions = [
        { type: 'fix', tool: 'browser_find', reason: '智能搜索页面元素' }
      ];
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
      ]
    }, null, 2));
  }

  // ====== browser_navigate ======
  if (name === 'browser_navigate') {
    const action = args.action || 'refresh';
    const url = args.url;
    const waitUntil = args.waitUntil || 'domcontentloaded';
    const timeout = args.timeout || 30000;
    // 传入 url 给 ensurePage，避免 about:blank 时关闭旧页面创建新页面导致 target 失效
    const { target } = await ensurePage({ url });

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
        ]
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
      ]
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
  // v1.9.5 起合并 browser_flow（mode=chain）和 browser_flow（mode=batch）
  if (name === 'browser_flow') {
    const { target } = await ensurePage(args);
    const mode = args.mode || 'flow';

    if (mode === 'chain') {
      // chain 模式：等价于已废弃的 browser_flow mode=chain
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
      // chain 模式额外提供 consoleErrors/networkErrors 汇总（兼容 browser_flow mode=chain 输出结构）
      const consoleErrors = (result.errors?.console || []).map((e) => ({
        type: e.type || 'error',
        text: (e.text || '').slice(0, 200)
      }));
      const networkErrors = (result.errors?.network || [])
        .filter((e) => e.status >= 400)
        .map((e) => ({ url: (e.url || '').slice(0, 100), status: e.status }));
      const completedActions = result.results ? result.results.filter((r) => r.ok !== false).length : 0;
      const failedStepIndex = result.results ? result.results.findIndex((r) => r.ok === false) : -1;
      const chainResults = args.compact === true
        ? (result.results || []).map(r => ({ label: r.label, type: r.type, ok: r.ok, error: r.error || null }))
        : result.results;
      return text(JSON.stringify({
        success: result.passed,
        mode: 'chain',
        totalActions: mappedSteps.length,
        completedActions,
        failedActionIndex: failedStepIndex >= 0 ? failedStepIndex : null,
        actionResults: chainResults,
        consoleErrors,
        networkErrors,
        errorMessage: failedStepIndex >= 0 ? `第 ${failedStepIndex + 1} 步操作失败` : null,
        errors: result.errors
      }, null, 2));
    }

    if (mode === 'batch') {
      // batch 模式：等价于已废弃的 browser_flow mode=batch，受 maxSteps 限制
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
      const rawResults = result.results || [];
      const hasFailed = rawResults.some((r) => r.ok === false);
      const batchResults = args.compact === true
        ? rawResults.map(r => ({ label: r.label, type: r.type, ok: r.ok, error: r.error || null }))
        : rawResults;
      return text(JSON.stringify({
        mode: 'batch',
        total: mappedSteps.length,
        results: batchResults,
        hasFailed,
        passed: result.passed,
        errors: result.errors,
        nextSteps: hasFailed
          ? ['使用 browser_counterfactual_analyze 分析失败步骤的根因', '检查失败步骤的选择器或参数是否正确']
          : ['使用 browser_snapshot 确认批量操作后的页面状态', '使用 browser_errors 检查批量操作后的错误']
      }, null, 2));
    }

    // 默认 flow 模式
    const flowResult = await runFlow(target, args);
    if (args.compact === true) {
      flowResult.results = (flowResult.results || []).map(r => ({
        label: r.label,
        type: r.type,
        ok: r.ok,
        url: r.evidence ? (r.evidence.url || (r.evidence.snapshot && r.evidence.snapshot.url) || null) : null,
        error: r.error || null,
        assertionPassed: r.assertion ? r.assertion.passed : undefined
      }));
      if (flowResult.errors) {
        flowResult.errors = { summary: flowResult.errors.summary || {} };
      }
    }
    return text(JSON.stringify(flowResult, null, 2));
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
      // v1.9.5 起合并 browser_events（mode=clear）
      const result = await clearBrowserEvents(target);
      return text(JSON.stringify({ mode: 'clear', ...result }, null, 2));
    }
    return text(JSON.stringify(await getBrowserEvents(target, args), null, 2));
  }

  // ====== browser_events mode=clear ======
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
          minLength: input.minLength > 0 ? input.minLength : null,
          maxLength: input.maxLength > 0 ? input.maxLength : null,
          min: input.min !== '' ? input.min : null,
          max: input.max !== '' ? input.max : null,
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
        const classNameStr = typeof input.className === 'string' ? input.className : '';
        const fieldName = input.name || '';
        if (!input.getAttribute('type') || input.getAttribute('type') === 'text') {
          if (classNameStr.includes('email') || fieldName.includes('email')) {
            field.inputType = 'email';
            field.validationRules.push('预期: 邮箱格式');
          }
          if (classNameStr.includes('tel') || fieldName.includes('phone')) {
            field.inputType = 'tel';
            field.validationRules.push('预期: 电话号码格式');
          }
          if (classNameStr.includes('url') || fieldName.includes('url')) {
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
            const msg = el.validationMessage || '';
            if (msg) {
              messages.push({
                field: el.name || el.id || el.tagName,
                message: msg
              });
            }
          });
          // Check for custom validation
          document.querySelectorAll('.error, .invalid, [class*="error"]').forEach(el => {
            const text = el.innerText.trim();
            if (text) messages.push({ field: el.className, message: text });
          });
          return messages;
        });

        const requiredMissing = formAnalysis.fields.filter(f => f.required && !f.defaultValue).length;
        const patternViolations = validationMessages.filter(m => (m.message || '').includes('pattern')).length;
        const lengthViolations = validationMessages.filter(m => (m.message || '').includes('length')).length;

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

  // ====== browser_flow mode=chain ======
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

  // ====== browser_form_fill mode=smart ======
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
  // v1.9.5 起合并 browser_overlay mode=detect/dismiss
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

  // ====== browser_overlay mode=detect ======
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

        // SPA 根节点感知：跳过常见 SPA 框架的根容器（#app, #root, #__next, #__nuxt 等）
        // 这些节点覆盖大部分视口是正常行为，不应被标记为 overlay
        const spaRootIds = ['app', 'root', '__next', '__nuxt', '__vue'];
        const isSpaRoot = (id && spaRootIds.includes(id)) ||
          (tagName === 'div' && position === 'static' && zIndex === 0 &&
           rect.top <= 5 && rect.left <= 5 &&
           rect.width >= viewportWidth * 0.95 &&
           el.parentElement === document.body);
        if (isSpaRoot) return;
        
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
        // 全屏覆盖（遮挡大部分视口）— 必须非 static 定位且有 z-index
        if ((tagName === 'div' || tagName === 'section' || tagName === 'aside') &&
            rect.top <= 10 && rect.left <= 10 &&
            rect.width >= viewportWidth * 0.8 && rect.height >= viewportHeight * 0.5 &&
            zIndex >= 100 && position !== 'static') {
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
        (o.coveragePercent >= 50 || o.overlayType === 'fullscreen-overlay' || o.overlayType === 'semi-transparent-mask') &&
        (o.position !== 'static' || o.zIndex > 0)
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
        '调用 browser_overlay { mode: \'dismiss\' } 自动关闭遮挡物',
        '关闭后调用 browser_screenshot 重新截图',
        '确认遮挡消失后重新运行测试'
      ] : [
        '调用 browser_screenshot 截图留存证据',
        '继续正常测试流程'
      ],
      suggestions: overlayAnalysis.hasBlockingOverlay ? [
        { type: 'fix', tool: 'browser_overlay', reason: '自动关闭遮挡物' },
        { type: 'next', tool: 'browser_screenshot', reason: '确认遮挡消失后截图' }
      ] : [
        { type: 'next', tool: 'browser_screenshot', reason: '截图留存证据' }
      ]
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

  // ====== browser_overlay mode=dismiss ======
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
        '调用 browser_overlay { mode: \'detect\' } 查看剩余遮挡物详情',
        '调用 browser_screenshot 查看当前页面状态'
      ] : [
        '调用 browser_overlay { mode: \'detect\' } 详细分析遮挡物',
        '考虑手动点击关闭按钮',
        '调用 browser_screenshot 查看页面状态'
      ],
      suggestions: [
        { type: 'next', tool: 'browser_screenshot', reason: dismissed.length > 0 ? '确认遮挡已关闭后截图' : '查看页面当前状态' },
        { type: remainingAnalysis.hasBlocking ? 'fix' : 'next', tool: 'browser_overlay', reason: '检查剩余遮挡物' }
      ]
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
  // v1.9.5 起合并 browser_captcha mode=detect/read/screenshot
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

  // ====== browser_captcha mode=detect ======
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
          ? [`检测到 ${result.provider} ${result.type} 验证码，复杂度较高，建议人工处理或使用 browser_captcha { mode: 'screenshot' } 截图后人工识别`]
          : ['可以使用 browser_captcha { mode: \'read\' } 尝试自动识别验证码文本'];
      }

      return result;
    }, { selector: captchaSelector, mode: detectMode });

    return text(JSON.stringify(detection, null, 2));
  }

  // ====== browser_captcha mode=screenshot ======
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
          '使用 browser_captcha { mode: \'detect\' } 先检测验证码位置'
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
        : ['使用 browser_captcha { mode: \'read\' } 对截图进行 OCR 识别']
    }, null, 2));
  }

  // ====== browser_captcha mode=read ======
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
          '使用 browser_captcha { mode: \'detect\' } 先检测验证码位置',
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
        ? ['识别置信度较低，建议使用 browser_captcha { mode: \'screenshot\' } 截图后人工识别']
        : [`识别结果: "${recognizedText}"，可尝试填入验证码输入框`]
    }, null, 2));
  }

  // ====== browser_table_verify ======
  if (name === 'browser_table_verify') {
const { target } = await ensurePage();
    const mode = args.mode || 'table';
    const maxRows = args.maxRows || 100;
    // 卡片模式：cardSelector 作为主选择器；表格模式：selector 作为表格选择器
    const tableSelector = mode === 'card' ? (args.cardSelector || '') : (args.selector || 'table');

    // 1. 提取数据（headers + rows）
    let tableData;
    if (mode === 'card') {
      // 卡片列表模式：每张卡片作为一行，按 fieldMap 提取字段
      if (!args.cardSelector || !args.fieldMap || typeof args.fieldMap !== 'object') {
        return text(JSON.stringify({
          ok: false,
          mode: 'card',
          error: 'mode=card 时必须提供 cardSelector 和 fieldMap 参数'
        }, null, 2));
      }
      try {
        tableData = await target.evaluate(({ cardSelector, fieldMap, fieldAttr, maxRows }) => {
          const cards = document.querySelectorAll(cardSelector);
          if (cards.length === 0) {
            return { found: false, reason: 'card_not_found' };
          }
          const headers = Object.keys(fieldMap);
          const rows = [];
          let count = 0;
          for (const card of cards) {
            if (count >= maxRows) break;
            const row = headers.map(fieldName => {
              const sel = fieldMap[fieldName];
              if (!sel) return '';
              const el = card.querySelector(sel);
              if (!el) return '';
              const attrName = fieldAttr && fieldAttr[fieldName];
              if (attrName) {
                return (el.getAttribute(attrName) || '').trim();
              }
              return (el.textContent || '').trim();
            });
            rows.push(row);
            count++;
          }
          return {
            found: true,
            headers,
            rows,
            rowCount: rows.length,
            columnCount: headers.length
          };
        }, {
          cardSelector: args.cardSelector,
          fieldMap: args.fieldMap,
          fieldAttr: args.fieldAttr,
          maxRows
        });
      } catch (e) {
        return text(JSON.stringify({ ok: false, mode: 'card', cardSelector: args.cardSelector, error: `提取卡片数据失败: ${e.message}` }, null, 2));
      }
    } else {
      // 表格模式：标准 <table> 元素提取
    try {
      tableData = await target.evaluate(({ selector, maxRows }) => {
        const tableEl = document.querySelector(selector);
        if (!tableEl) {
          return { found: false, reason: 'table_not_found' };
        }
        // 提取表头（支持 thead th 和 tbody 第一行 tr td）
        const headers = [];
        const theadThs = tableEl.querySelectorAll('thead th, thead td');
        if (theadThs.length > 0) {
          theadThs.forEach(th => headers.push((th.textContent || '').trim()));
        } else {
          // 没有 thead，尝试第一行 tr td 作为表头
          const firstRow = tableEl.querySelector('tr');
          if (firstRow) {
            firstRow.querySelectorAll('td, th').forEach(cell => headers.push((cell.textContent || '').trim()));
          }
        }

        // 提取数据行（tbody tr td，如果没有 tbody 则所有 tr td，跳过表头行）
        const rows = [];
        let bodyTrs;
        if (tableEl.querySelector('tbody')) {
          bodyTrs = tableEl.querySelectorAll('tbody tr');
        } else {
          // 没有 tbody，所有 tr（如果第一行已被识别为表头则跳过）
          bodyTrs = tableEl.querySelectorAll('tr');
          if (headers.length > 0 && bodyTrs.length > 0) {
            bodyTrs = Array.from(bodyTrs).slice(1);
          }
        }
        let count = 0;
        for (const tr of bodyTrs) {
          if (count >= maxRows) break;
          const cells = Array.from(tr.querySelectorAll('td, th')).map(td => (td.textContent || '').trim());
          if (cells.length > 0) {
            rows.push(cells);
            count++;
          }
        }

        return {
          found: true,
          headers,
          rows,
          rowCount: rows.length,
          columnCount: headers.length || (rows.length > 0 ? rows[0].length : 0)
        };
      }, { selector: tableSelector, maxRows });
    } catch (e) {
      return text(JSON.stringify({ ok: false, selector: tableSelector, error: `提取表格数据失败: ${e.message}` }, null, 2));
    }
    } // end of else (table mode)

    if (!tableData.found) {
      return text(JSON.stringify({
        ok: false,
        mode,
        selector: tableSelector,
        error: mode === 'card' ? `未找到卡片元素: ${tableSelector}` : `未找到表格元素: ${tableSelector}`,
        reason: tableData.reason
      }, null, 2));
    }

    // 2. 执行断言
    const assertions = [];

    // a) 行数断言
    if (args.expectRowCount !== undefined) {
      const passed = tableData.rowCount === args.expectRowCount;
      assertions.push({
        name: 'expectRowCount',
        passed,
        expected: args.expectRowCount,
        actual: tableData.rowCount,
        reason: passed ? `行数匹配: ${tableData.rowCount}` : `行数不匹配，期望 ${args.expectRowCount}，实际 ${tableData.rowCount}`
      });
    }
    if (args.expectMinRowCount !== undefined) {
      const passed = tableData.rowCount >= args.expectMinRowCount;
      assertions.push({
        name: 'expectMinRowCount',
        passed,
        expected: `>= ${args.expectMinRowCount}`,
        actual: tableData.rowCount,
        reason: passed ? `行数 >= 最小值: ${tableData.rowCount}` : `行数少于最小值 ${args.expectMinRowCount}，实际 ${tableData.rowCount}`
      });
    }
    if (args.expectMaxRowCount !== undefined) {
      const passed = tableData.rowCount <= args.expectMaxRowCount;
      assertions.push({
        name: 'expectMaxRowCount',
        passed,
        expected: `<= ${args.expectMaxRowCount}`,
        actual: tableData.rowCount,
        reason: passed ? `行数 <= 最大值: ${tableData.rowCount}` : `行数超过最大值 ${args.expectMaxRowCount}，实际 ${tableData.rowCount}`
      });
    }

    // b) 列名断言
    if (Array.isArray(args.expectColumns) && args.expectColumns.length > 0) {
      const missingCols = args.expectColumns.filter(c => !tableData.headers.includes(c));
      const passed = missingCols.length === 0;
      assertions.push({
        name: 'expectColumns',
        passed,
        expected: args.expectColumns,
        actual: tableData.headers,
        missing: missingCols,
        reason: passed ? `所有期望列都存在: ${args.expectColumns.join(', ')}` : `缺少列: ${missingCols.join(', ')}`
      });
    }

    // c) 列值断言
    if (args.columnValues && typeof args.columnValues === 'object') {
      for (const [colName, expectedValues] of Object.entries(args.columnValues)) {
        const colIdx = tableData.headers.indexOf(colName);
        if (colIdx === -1) {
          assertions.push({
            name: `columnValues[${colName}]`,
            passed: false,
            reason: `列名 "${colName}" 不存在于表头中`
          });
          continue;
        }
        const actualValues = tableData.rows.map(r => r[colIdx] || '').filter(v => v !== '');
        const missingValues = expectedValues.filter(v => !actualValues.includes(String(v)));
        const passed = missingValues.length === 0;
        assertions.push({
          name: `columnValues[${colName}]`,
          passed,
          expected: expectedValues,
          actual: actualValues.slice(0, 20),
          missing: missingValues,
          reason: passed ? `列 "${colName}" 包含所有期望值` : `列 "${colName}" 缺少值: ${missingValues.join(', ')}`
        });
      }
    }

    // d) 单元格内容匹配
    if (Array.isArray(args.cellMatch)) {
      for (const match of args.cellMatch) {
        const { row, column, expected } = match;
        if (row === undefined || column === undefined || expected === undefined) {
          assertions.push({
            name: `cellMatch[row=${row},col=${column}]`,
            passed: false,
            reason: '缺少 row/column/expected 参数'
          });
          continue;
        }
        let colIdx;
        if (typeof column === 'number') {
          colIdx = column;
        } else {
          colIdx = tableData.headers.indexOf(column);
        }
        if (colIdx === -1) {
          assertions.push({
            name: `cellMatch[row=${row},col=${column}]`,
            passed: false,
            reason: `列 "${column}" 不存在`
          });
          continue;
        }
        const actualCell = (tableData.rows[row] && tableData.rows[row][colIdx]) || '';
        const passed = actualCell.includes(String(expected));
        assertions.push({
          name: `cellMatch[row=${row},col=${column}]`,
          passed,
          expected,
          actual: actualCell,
          reason: passed ? `单元格匹配: "${actualCell}"` : `单元格不匹配，期望包含 "${expected}"，实际 "${actualCell}"`
        });
      }
    }

    // 3. 排序验证（仅 table 模式支持，卡片列表无表头可点击）
    let sortResult = null;
    if (args.sortBy && mode === 'table') {
      const sortColIdx = tableData.headers.indexOf(args.sortBy);
      if (sortColIdx === -1) {
        sortResult = { ok: false, reason: `排序列 "${args.sortBy}" 不存在` };
      } else {
        try {
          // 定位表头单元格（thead th:nth-child(colIdx+1)）
          const thSelector = `${tableSelector} thead th:nth-child(${sortColIdx + 1}), ${tableSelector} thead td:nth-child(${sortColIdx + 1})`;
          const expectedOrder = args.sortOrder || 'asc';
          const waitMs = args.waitMs || 800;

          // 智能比较函数：数字用数值比较，字符串用 localeCompare
          const smartCompare = (a, b) => {
            const na = parseFloat(a);
            const nb = parseFloat(b);
            if (!isNaN(na) && !isNaN(nb) && String(na) === a.trim() && String(nb) === b.trim()) {
              return na - nb;
            }
            return a.localeCompare(b, 'zh');
          };

          // 提取列值并判断排序方向
          const extractAndCheck = async () => {
            const afterSort = await target.evaluate(({ selector, colIdx, maxRows }) => {
              const tableEl = document.querySelector(selector);
              if (!tableEl) return { found: false };
              const rows = [];
              let bodyTrs = tableEl.querySelector('tbody') ? tableEl.querySelectorAll('tbody tr') : tableEl.querySelectorAll('tr');
              if (tableEl.querySelector('thead') && !tableEl.querySelector('tbody')) {
                bodyTrs = Array.from(bodyTrs).slice(1);
              }
              let count = 0;
              for (const tr of bodyTrs) {
                if (count >= maxRows) break;
                const cells = Array.from(tr.querySelectorAll('td, th')).map(td => (td.textContent || '').trim());
                if (cells.length > 0) {
                  rows.push(cells);
                  count++;
                }
              }
              return { found: true, sortedValues: rows.map(r => r[colIdx] || '') };
            }, { selector: tableSelector, colIdx: sortColIdx, maxRows });

            if (!afterSort.found) return null;
            const sortedValues = afterSort.sortedValues;
            const ascSorted = [...sortedValues].sort(smartCompare);
            const descSorted = [...sortedValues].sort((a, b) => smartCompare(b, a));
            const isAsc = JSON.stringify(sortedValues) === JSON.stringify(ascSorted);
            const isDesc = JSON.stringify(sortedValues) === JSON.stringify(descSorted);
            return {
              sortedValues,
              actualOrder: isAsc ? 'asc' : (isDesc ? 'desc' : 'unsorted')
            };
          };

          // 点击表头进行排序（最多点击 3 次以达到期望顺序）
          let checkResult = null;
          let clickCount = 0;
          const maxClicks = 3;

          while (clickCount < maxClicks) {
            await target.click(thSelector, { timeout: 5000 }).catch(() => {});
            clickCount++;
            await new Promise(r => setTimeout(r, waitMs));
            checkResult = await extractAndCheck();
            if (!checkResult) break;
            if (checkResult.actualOrder === expectedOrder) break;
            // 如果已达到期望顺序，停止点击；否则继续点击切换排序方向
          }

          if (checkResult) {
            const sortedValues = checkResult.sortedValues;
            const actualOrder = checkResult.actualOrder;
            const passed = actualOrder === expectedOrder;
            sortResult = {
              ok: true,
              column: args.sortBy,
              expectedOrder,
              actualOrder,
              passed,
              clickCount,
              sortedValues: sortedValues.slice(0, 10),
              reason: passed ? `排序顺序匹配 (${expectedOrder})，点击 ${clickCount} 次` : `排序顺序不匹配，期望 ${expectedOrder}，实际 ${actualOrder}，点击 ${clickCount} 次`
            };
            assertions.push({
              name: `sortBy[${args.sortBy}]`,
              passed,
              expected: expectedOrder,
              actual: actualOrder,
              reason: sortResult.reason
            });
          }
        } catch (e) {
          sortResult = { ok: false, reason: `排序操作失败: ${e.message}` };
        }
      }
    }

    // 4. 分页验证
    let paginationResult = null;
    if (args.pagination && args.pagination.nextSelector) {
      const pageNextSel = args.pagination.nextSelector;
      const expectDataChanged = args.pagination.expectDataChanged !== false;
      const maxPages = args.pagination.maxPages || 3;
      const pages = [];
      pages.push({ pageIndex: 0, rowCount: tableData.rowCount, firstRowSignature: tableData.rows[0] ? tableData.rows[0].join('|') : '' });

      let currentPage = 1;
      let lastRowCount = tableData.rowCount;
      let lastSignature = pages[0].firstRowSignature;
      let dataChangedAcrossPages = false;

      while (currentPage < maxPages) {
        try {
          // 检查下一页按钮是否可用（非 disabled）
          const isDisabled = await target.evaluate(sel => {
            const el = document.querySelector(sel);
            if (!el) return true;
            return el.disabled || el.classList.contains('disabled') || el.classList.contains('is-disabled') ||
              el.getAttribute('aria-disabled') === 'true';
          }, pageNextSel).catch(() => true);
          if (isDisabled) {
            paginationResult = paginationResult || { pages, reachedLastPage: true, lastPageIndex: currentPage };
            break;
          }
          await target.click(pageNextSel, { timeout: 5000 });
          await new Promise(r => setTimeout(r, args.waitMs || 1000));
          // 提取当前页数据（根据 mode 使用不同提取逻辑）
          const pageData = mode === 'card'
            ? await target.evaluate(({ cardSelector, fieldMap, fieldAttr, maxRows }) => {
                const cards = document.querySelectorAll(cardSelector);
                if (cards.length === 0) return { found: false };
                const headers = Object.keys(fieldMap);
                const rows = [];
                let count = 0;
                for (const card of cards) {
                  if (count >= maxRows) break;
                  const row = headers.map(fieldName => {
                    const sel = fieldMap[fieldName];
                    if (!sel) return '';
                    const el = card.querySelector(sel);
                    if (!el) return '';
                    const attrName = fieldAttr && fieldAttr[fieldName];
                    if (attrName) return (el.getAttribute(attrName) || '').trim();
                    return (el.textContent || '').trim();
                  });
                  rows.push(row);
                  count++;
                }
                return { found: true, rowCount: rows.length, signature: rows[0] ? rows[0].join('|') : '' };
              }, { cardSelector: args.cardSelector, fieldMap: args.fieldMap, fieldAttr: args.fieldAttr, maxRows })
            : await target.evaluate(({ selector, maxRows }) => {
                const tableEl = document.querySelector(selector);
                if (!tableEl) return { found: false };
                const rows = [];
                let bodyTrs = tableEl.querySelector('tbody') ? tableEl.querySelectorAll('tbody tr') : tableEl.querySelectorAll('tr');
                if (tableEl.querySelector('thead') && !tableEl.querySelector('tbody')) {
                  bodyTrs = Array.from(bodyTrs).slice(1);
                }
                let count = 0;
                for (const tr of bodyTrs) {
                  if (count >= maxRows) break;
                  const cells = Array.from(tr.querySelectorAll('td, th')).map(td => (td.textContent || '').trim());
                  if (cells.length > 0) {
                    rows.push(cells);
                    count++;
                  }
                }
                return { found: true, rowCount: rows.length, signature: rows[0] ? rows[0].join('|') : '' };
              }, { selector: tableSelector, maxRows });

          if (!pageData.found) break;
          pages.push({
            pageIndex: currentPage,
            rowCount: pageData.rowCount,
            firstRowSignature: pageData.signature
          });
          if (pageData.signature !== lastSignature) {
            dataChangedAcrossPages = true;
          }
          lastSignature = pageData.signature;
          lastRowCount = pageData.rowCount;
          currentPage++;
        } catch (e) {
          break;
        }
      }

      paginationResult = {
        ok: true,
        pagesTraversed: pages.length,
        pages,
        dataChangedAcrossPages,
        passed: expectDataChanged ? dataChangedAcrossPages : true,
        reason: expectDataChanged
          ? (dataChangedAcrossPages ? `翻页 ${pages.length} 页，数据有变化` : `翻页 ${pages.length} 页，但数据未变化（可能数据不足或分页失效）`)
          : `翻页 ${pages.length} 页`
      };
      assertions.push({
        name: 'pagination',
        passed: paginationResult.passed,
        expected: expectDataChanged ? 'data_changed' : 'any',
        actual: dataChangedAcrossPages ? 'data_changed' : 'data_unchanged',
        reason: paginationResult.reason
      });
    }

    // 5. 树形展开验证（仅 table 模式支持）
    let expandResult = null;
    if (args.expandRow !== undefined && mode === 'table') {
      const rowIndex = args.expandRow;
      const expandBtnSelector = `${tableSelector} tbody tr:nth-child(${rowIndex + 1}) .ant-table-row-expand-icon, ${tableSelector} tbody tr:nth-child(${rowIndex + 1}) [class*="expand-icon"], ${tableSelector} tbody tr:nth-child(${rowIndex + 1}) [class*="expand-btn"]`;
      try {
        const beforeCount = tableData.rowCount;
        // 检查展开按钮是否存在
        const btnExists = await target.evaluate((sel) => !!document.querySelector(sel), expandBtnSelector).catch(() => false);
        if (!btnExists) {
          expandResult = { ok: false, reason: `第 ${rowIndex} 行未找到展开按钮` };
        } else {
          // 点击展开按钮
          await target.click(expandBtnSelector, { timeout: 5000 }).catch(() => {});
          await new Promise(r => setTimeout(r, args.waitMs || 800));
          // 重新提取表格数据
          const afterExpand = await target.evaluate(({ selector, maxRows }) => {
            const tableEl = document.querySelector(selector);
            if (!tableEl) return { found: false };
            const headers = [];
            const headerCells = tableEl.querySelectorAll('thead th, thead td');
            headerCells.forEach(th => headers.push((th.textContent || '').trim()));
            const rows = [];
            let bodyTrs = tableEl.querySelector('tbody') ? tableEl.querySelectorAll('tbody tr') : tableEl.querySelectorAll('tr');
            if (tableEl.querySelector('thead') && !tableEl.querySelector('tbody')) {
              bodyTrs = Array.from(bodyTrs).slice(1);
            }
            let count = 0;
            for (const tr of bodyTrs) {
              if (count >= maxRows) break;
              const cells = Array.from(tr.querySelectorAll('td, th')).map(td => (td.textContent || '').trim());
              if (cells.length > 0) { rows.push(cells); count++; }
            }
            return { found: true, rowCount: rows.length, rows: rows.slice(0, 5) };
          }, { selector: tableSelector, maxRows: args.maxRows || 100 });

          if (afterExpand.found) {
            const afterCount = afterExpand.rowCount;
            const childRowsAdded = afterCount - beforeCount;
            const passed = childRowsAdded > 0;
            expandResult = {
              ok: true,
              rowIndex,
              beforeRowCount: beforeCount,
              afterRowCount: afterCount,
              childRowsAdded,
              passed,
              newRows: afterExpand.rows.slice(beforeCount),
              reason: passed ? `展开第 ${rowIndex} 行，新增 ${childRowsAdded} 行子数据` : `展开第 ${rowIndex} 行，行数未变化（可能无子数据或展开失败）`
            };
            assertions.push({
              name: `expandRow[${rowIndex}]`,
              passed,
              expected: 'row_count_increased',
              actual: childRowsAdded > 0 ? `+${childRowsAdded} rows` : 'no_change',
              reason: expandResult.reason
            });
          }
        }
      } catch (e) {
        expandResult = { ok: false, reason: `展开操作失败: ${e.message}` };
      }
    }

    // 6. 组装结果
    const allPassed = assertions.length > 0 ? assertions.every(a => a.passed) : true;
    const result = {
      ok: true,
      mode,
      selector: tableSelector,
      headers: tableData.headers,
      rowCount: tableData.rowCount,
      columnCount: tableData.columnCount,
      rows: tableData.rows.slice(0, 20),
      assertions,
      allAssertionsPassed: allPassed,
      timestamp: new Date().toISOString()
    };
    if (sortResult) result.sort = sortResult;
    if (paginationResult) result.pagination = paginationResult;
    if (expandResult) result.expand = expandResult;

    result.nextSteps = allPassed ? [
      '使用 browser_snapshot 查看页面整体结构',
      '使用 browser_click_audit 验证表格相关的操作按钮'
    ] : [
      '使用 browser_snapshot 检查表格渲染是否正确',
      '使用 browser_errors 检查表格数据加载是否产生错误'
    ];
    result.suggestions = allPassed ? [
      { type: 'next', tool: 'browser_snapshot', reason: '查看页面整体结构' }
    ] : [
      { type: 'diagnose', tool: 'browser_errors', reason: '检查表格数据加载错误' }
    ];
    return text(JSON.stringify(redact(result), null, 2));
  }

  // ====== browser_api_intercept ======
  if (name === 'browser_api_intercept') {
const { target } = await ensurePage();
    const urlPattern = args.urlPattern || '*';
    const methodFilter = args.method ? args.method.toUpperCase() : null;
    const interceptMode = args.mode || 'observe';
    const waitMs = args.waitMs || 5000;
    const captureCount = args.captureCount || 1;
    const ignoreStatic = args.ignoreStatic !== false;

    // 静态资源过滤
    const staticExts = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.ico', '.map', '.webp'];
    const isStatic = (url) => {
      if (!ignoreStatic) return false;
      const u = (url || '').toLowerCase().split('?')[0].split('#')[0];
      return staticExts.some(ext => u.endsWith(ext));
    };

    // URL 模式匹配（支持 glob 和字符串包含）
    const matchesUrlPattern = (url) => {
      if (!urlPattern || urlPattern === '*') return true;
      // glob 模式：**/api/** → 转换为正则
      if (urlPattern.includes('*')) {
        try {
          const regexStr = urlPattern
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*')
            .replace(/\?/g, '.');
          return new RegExp(regexStr).test(url);
        } catch (_) { /* fall through */ }
      }
      // 字符串包含匹配
      return (url || '').includes(urlPattern);
    };

    const matchesMethod = (reqMethod) => {
      if (!methodFilter) return true;
      return (reqMethod || '').toUpperCase() === methodFilter;
    };

    const shouldCapture = (url, method) => {
      return !isStatic(url) && matchesMethod(method) && matchesUrlPattern(url);
    };

    const captured = [];

    // 安装响应监听器（observe 模式）
    const onResponse = async (response) => {
      try {
        const request = response.request();
        const url = request.url();
        const method = request.method();
        if (!shouldCapture(url, method)) return;

        const body = await response.text().catch(() => '');
        const capturedItem = {
          url: url.slice(0, 300),
          method: method,
          requestHeaders: request.headers(),
          requestPostData: request.postData() ? (request.postData().slice(0, 1000)) : null,
          response: {
            status: response.status(),
            statusText: response.statusText(),
            headers: response.headers(),
            body: body.slice(0, 5000),
            bodySize: body.length
          },
          timestamp: new Date().toISOString()
        };
        captured.push(capturedItem);
      } catch (_) { /* ignore response capture error */ }
    };

    // mock 模式：安装 route 拦截器
    let routeHandler = null;
    if (interceptMode === 'mock') {
      const mockResp = args.mockResponse || { status: 200, body: '{}' };
      routeHandler = async (route) => {
        const request = route.request();
        const url = request.url();
        const method = request.method();
        if (!shouldCapture(url, method)) {
          await route.continue();
          return;
        }
        captured.push({
          url: url.slice(0, 300),
          method: method,
          requestHeaders: request.headers(),
          requestPostData: request.postData() ? request.postData().slice(0, 1000) : null,
          mocked: true,
          mockResponse: {
            status: mockResp.status || 200,
            body: (mockResp.body || '{}').slice(0, 500)
          },
          timestamp: new Date().toISOString()
        });
        await route.fulfill({
          status: mockResp.status || 200,
          headers: mockResp.headers || { 'Content-Type': 'application/json' },
          body: mockResp.body || '{}'
        });
      };
      try {
        // 将 urlPattern 转换为 Playwright route 的 glob 模式
        // '/posts' → '**/posts**'，确保匹配完整 URL
        let routePattern = '**/*';
        if (urlPattern !== '*') {
          if (urlPattern.includes('*')) {
            // 已含通配符，直接使用
            routePattern = urlPattern;
          } else {
            // 字符串包含模式，转换为 glob
            routePattern = `**${urlPattern}**`;
          }
        }
        await target.route(routePattern, routeHandler);
      } catch (e) {
        return text(JSON.stringify({ ok: false, error: `安装 route 拦截器失败: ${e.message}` }, null, 2));
      }
    } else {
      // observe 模式：监听 response 事件
      target.on('response', onResponse);
    }

    // 触发动作（在监听器安装后、等待捕获前执行）
    let triggerResult = null;
    if (args.trigger && (args.trigger.click || args.trigger.eval)) {
      const delayMs = args.trigger.delayMs !== undefined ? args.trigger.delayMs : 100;
      if (delayMs > 0) {
        await new Promise(r => setTimeout(r, delayMs));
      }
      try {
        if (args.trigger.click) {
          await target.click(args.trigger.click, { timeout: 3000 }).catch(e => {
            triggerResult = { ok: false, action: 'click', selector: args.trigger.click, error: e.message };
          });
          if (!triggerResult) {
            triggerResult = { ok: true, action: 'click', selector: args.trigger.click };
          }
        } else if (args.trigger.eval) {
          const evalResult = await target.evaluate(args.trigger.eval).catch(e => {
            triggerResult = { ok: false, action: 'eval', error: e.message };
          });
          if (!triggerResult) {
            triggerResult = { ok: true, action: 'eval', result: typeof evalResult === 'object' ? JSON.stringify(evalResult).slice(0, 200) : String(evalResult).slice(0, 200) };
          }
        }
      } catch (e) {
        triggerResult = { ok: false, action: args.trigger.click ? 'click' : 'eval', error: e.message };
      }
    }

    // 等待 captureCount 或 waitMs 超时
    const startTime = Date.now();
    while (captured.length < captureCount && (Date.now() - startTime) < waitMs) {
      await new Promise(r => setTimeout(r, 200));
    }

    // 清理：移除监听器 / route
    if (interceptMode === 'mock' && routeHandler) {
      let cleanupPattern = '**/*';
      if (urlPattern !== '*') {
        if (urlPattern.includes('*')) {
          cleanupPattern = urlPattern;
        } else {
          cleanupPattern = `**${urlPattern}**`;
        }
      }
      try { await target.unroute(cleanupPattern, routeHandler); } catch (_) { /* ignore */ }
    } else {
      try { target.off('response', onResponse); } catch (_) { /* ignore */ }
    }

    // 进行断言
    const assertions = [];
    const matchedCount = captured.length;

    // a) 捕获数量断言
    if (matchedCount === 0) {
      assertions.push({
        name: 'captureCount',
        passed: false,
        expected: captureCount,
        actual: 0,
        reason: `等待 ${waitMs}ms 未捕获到匹配的请求（urlPattern: ${urlPattern}${methodFilter ? ', method: ' + methodFilter : ''}）`
      });
    } else if (matchedCount < captureCount) {
      assertions.push({
        name: 'captureCount',
        passed: false,
        expected: captureCount,
        actual: matchedCount,
        reason: `捕获数量不足，期望 ${captureCount}，实际 ${matchedCount}（等待 ${waitMs}ms）`
      });
    } else {
      assertions.push({
        name: 'captureCount',
        passed: true,
        expected: captureCount,
        actual: matchedCount,
        reason: `捕获数量满足: ${matchedCount}`
      });
    }

    // b) 对每个捕获的请求进行断言（只对第一个请求进行详细断言）
    if (captured.length > 0) {
      const first = captured[0];

      // mock 模式下，将 mockResponse 归一化为 response 以支持断言
      if (!first.response && first.mockResponse) {
        first.response = {
          status: first.mockResponse.status || 200,
          body: first.mockResponse.body || '',
          headers: first.mockResponse.headers || {}
        };
      }

      // 状态码断言
      if (args.expectStatus !== undefined && first.response) {
        const passed = first.response.status === args.expectStatus;
        assertions.push({
          name: 'expectStatus',
          passed,
          expected: args.expectStatus,
          actual: first.response.status,
          reason: passed ? `状态码匹配: ${first.response.status}` : `状态码不匹配，期望 ${args.expectStatus}，实际 ${first.response.status}`
        });
      }

      // 响应体包含断言
      if (args.expectBodyContains && first.response) {
        const bodyStr = first.response.body || '';
        const passed = bodyStr.includes(args.expectBodyContains);
        assertions.push({
          name: 'expectBodyContains',
          passed,
          expected: args.expectBodyContains,
          actual: bodyStr.slice(0, 200),
          reason: passed ? `响应体包含 "${args.expectBodyContains}"` : `响应体不包含 "${args.expectBodyContains}"`
        });
      }

      // 响应体正则断言
      if (args.expectBodyMatch && first.response) {
        const bodyStr = first.response.body || '';
        let passed = false;
        try {
          const regex = new RegExp(args.expectBodyMatch);
          passed = regex.test(bodyStr);
        } catch (_) { /* invalid regex */ }
        assertions.push({
          name: 'expectBodyMatch',
          passed,
          expected: args.expectBodyMatch,
          reason: passed ? `响应体匹配正则 /${args.expectBodyMatch}/` : `响应体不匹配正则 /${args.expectBodyMatch}/`
        });
      }

      // 响应头断言
      if (args.expectHeaders && typeof args.expectHeaders === 'object' && first.response) {
        const actualHeaders = first.response.headers || {};
        for (const [hk, hv] of Object.entries(args.expectHeaders)) {
          const actualVal = actualHeaders[hk.toLowerCase()] || actualHeaders[hk] || '';
          const passed = String(actualVal).toLowerCase() === String(hv).toLowerCase();
          assertions.push({
            name: `expectHeaders[${hk}]`,
            passed,
            expected: hv,
            actual: actualVal,
            reason: passed ? `响应头 ${hk} 匹配: ${actualVal}` : `响应头 ${hk} 不匹配，期望 "${hv}"，实际 "${actualVal}"`
          });
        }
      }

      // 与外部预期值比对（数据一致性验证）
      if (args.compareWith && first.response) {
        if (args.compareWith.status !== undefined) {
          const passed = first.response.status === args.compareWith.status;
          assertions.push({
            name: 'compareWith.status',
            passed,
            expected: args.compareWith.status,
            actual: first.response.status,
            reason: passed ? `状态码与预期一致: ${first.response.status}` : `状态码与预期不一致，预期 ${args.compareWith.status}，实际 ${first.response.status}`
          });
        }
        if (args.compareWith.bodyContains) {
          const bodyStr = first.response.body || '';
          const passed = bodyStr.includes(args.compareWith.bodyContains);
          assertions.push({
            name: 'compareWith.bodyContains',
            passed,
            expected: args.compareWith.bodyContains,
            reason: passed ? `响应体包含预期字符串` : `响应体不包含预期字符串 "${args.compareWith.bodyContains}"`
          });
        }
        if (args.compareWith.bodyMatch) {
          const bodyStr = first.response.body || '';
          let passed = false;
          try {
            passed = new RegExp(args.compareWith.bodyMatch).test(bodyStr);
          } catch (_) { /* invalid regex */ }
          assertions.push({
            name: 'compareWith.bodyMatch',
            passed,
            expected: args.compareWith.bodyMatch,
            reason: passed ? `响应体匹配预期正则` : `响应体不匹配预期正则 /${args.compareWith.bodyMatch}/`
          });
        }
      }
    }

    // 组装结果
    const allPassed = assertions.length > 0 ? assertions.every(a => a.passed) : true;
    const result = {
      ok: true,
      urlPattern,
      method: methodFilter || 'ANY',
      mode: interceptMode,
      captured: captured.slice(0, 10),
      matchedCount,
      assertions,
      allAssertionsPassed: allPassed,
      trigger: triggerResult,
      timestamp: new Date().toISOString()
    };

    result.nextSteps = allPassed && matchedCount > 0 ? [
      '使用 browser_snapshot 确认页面状态',
      '使用 browser_errors 检查其他错误'
    ] : [
      '使用 browser_snapshot 检查页面是否正确触发了 API 请求',
      '使用 browser_click 手动触发请求后再调用 browser_api_intercept'
    ];
    result.suggestions = allPassed && matchedCount > 0 ? [
      { type: 'next', tool: 'browser_snapshot', reason: '查看页面整体状态' }
    ] : [
      { type: 'diagnose', tool: 'browser_network', reason: '查看完整网络请求日志，定位未匹配的请求' }
    ];
    return text(JSON.stringify(redact(result), null, 2));
  }

  return mcpError(`未知工具（browser）: ${name}`, { error: 'UNKNOWN_TOOL', toolName: name });
  } finally {
    Object.assign(deps, { page, browser, browserSessionId, consoleLogs, networkLogs, pageErrors, currentCheckpoint, eventCheckpoint, lastAction, sessions, activeSessionName, sessionCounter, traceLogs, traceActive, currentTraceName, backendProbeResults, instrumentationEnabled, imageErrors, lastImageErrorCheckpoint, validationResults, lastQualityChecks, lastValidationRun, requestStartTimes, stateManager });
  }

}

module.exports = { tools, handle };
