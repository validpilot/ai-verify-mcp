'use strict';

// Handler: diagnose
// Extracted from server.js callTool switch statements

const tools = [
  "browser_diagnose",
  "browser_anti_bot_detect",
  "browser_debug_report",
  "browser_element_status",
  "browser_quick_fix",
  "browser_verify_fix",
  "browser_errors_aggregate",
  "error_fix_suggestion",
  "error_summary_md",
  "debug_investigate"
];

async function handle(name, args, deps) {

  // === Bridge deps into scope via globalThis ===
  const _depsKeys = Object.keys(deps);
  const _depsPrev = {};
  for (const k of _depsKeys) { _depsPrev[k] = globalThis[k]; globalThis[k] = deps[k]; }
  try {
  // ====== browser_diagnose ======
  if (name === 'browser_diagnose') {
const { target } = await ensurePage();
    const selector = args.selector;
    const errorType = args.errorType || 'all';
    const includeStackTrace = args.includeStackTrace !== false;

    const diagnosis = {
      timestamp: new Date().toISOString(),
      url: target.url(),
      selector: selector || '(全局诊断)',
      errorType,
      rootCauses: [],
      confidence: 0,
      suggestedFixes: [],
      affectedElements: []
    };

    // 1. 收集错误数据
    const errors = getUnifiedErrors({ includeWarnings: false });
    const recentConsole = consoleLogs.slice(-20).filter(e => e.type === 'error');
    const recentPage = pageErrors.slice(-10);
    const recentNetwork = networkLogs.slice(-30).filter(e => e.status >= 400 || e.failed);

    // 2. 按类型过滤
    let filteredErrors = { console: [], page: [], network: [] };
    if (errorType === 'all' || errorType === 'js') {
      filteredErrors.console = recentConsole;
      filteredErrors.page = recentPage;
    }
    if (errorType === 'all' || errorType === 'network') {
      filteredErrors.network = recentNetwork;
    }

    // 3. 根因分析逻辑
    const analyzeRootCause = async () => {
      // JS错误根因
      if (filteredErrors.console.length > 0 || filteredErrors.page.length > 0) {
        for (const err of filteredErrors.page.slice(0, 5)) {
          const errText = err.text || '';
          // 常见错误模式识别
          if (errText.includes('TypeError') || errText.includes('undefined')) {
            diagnosis.rootCauses.push({
              type: 'js_error',
              pattern: 'TypeError/undefined',
              description: 'JS未加载或变量未定义',
              confidence: 0.85,
              evidence: errText.substring(0, 150)
            });
            diagnosis.suggestedFixes.push('检查页面JS是否加载完成，可使用 browser_wait 等待');
            diagnosis.suggestedFixes.push('检查元素是否依赖动态生成的DOM');
          }
          if (errText.includes('Cannot read properties')) {
            diagnosis.rootCauses.push({
              type: 'js_error',
              pattern: 'property_access',
              description: '访问未定义对象属性',
              confidence: 0.80,
              evidence: errText.substring(0, 150)
            });
            diagnosis.suggestedFixes.push('检查数据是否已加载，可能是异步问题');
          }
          if (errText.includes('NetworkError') || errText.includes('fetch')) {
            diagnosis.rootCauses.push({
              type: 'network',
              pattern: 'fetch_failed',
              description: 'API请求失败',
              confidence: 0.90,
              evidence: errText.substring(0, 150)
            });
            diagnosis.suggestedFixes.push('检查网络连接和API可用性');
          }
        }
        // Console错误
        for (const err of filteredErrors.console.slice(0, 5)) {
          const errText = err.text || '';
          if (errText.includes('Failed to fetch') || errText.includes('CORS')) {
            diagnosis.rootCauses.push({
              type: 'network',
              pattern: 'cors_or_fetch',
              description: '跨域或网络请求失败',
              confidence: 0.85,
              evidence: errText.substring(0, 150)
            });
            diagnosis.suggestedFixes.push('检查API CORS配置或网络可达性');
          }
          if (errText.includes('404') || errText.includes('not found')) {
            diagnosis.rootCauses.push({
              type: 'resource',
              pattern: '404',
              description: '资源未找到',
              confidence: 0.90,
              evidence: errText.substring(0, 150)
            });
            diagnosis.suggestedFixes.push('检查资源路径是否正确');
          }
        }
      }

      // 网络错误根因
      if (filteredErrors.network.length > 0) {
        const byStatus = {};
        for (const n of filteredErrors.network) {
          byStatus[n.status] = (byStatus[n.status] || 0) + 1;
        }
        if (byStatus[401] || byStatus[403]) {
          diagnosis.rootCauses.push({
            type: 'auth',
            pattern: '401/403',
            description: '认证或权限不足',
            confidence: 0.95,
            evidence: `检测到 ${byStatus[401] || 0} 个401，${byStatus[403] || 0} 个403错误`
          });
          diagnosis.suggestedFixes.push('检查登录状态，使用 browser_cookies 查看认证Cookie');
          diagnosis.suggestedFixes.push('尝试重新登录或检查用户权限');
        }
        if (byStatus[404]) {
          diagnosis.rootCauses.push({
            type: 'resource',
            pattern: '404',
            description: 'API或资源不存在',
            confidence: 0.90,
            evidence: `检测到 ${byStatus[404]} 个404错误`
          });
          diagnosis.suggestedFixes.push('检查API路径是否正确，可能是版本变更');
        }
        if (byStatus[500] || byStatus[502] || byStatus[503]) {
          diagnosis.rootCauses.push({
            type: 'server',
            pattern: '5xx',
            description: '服务端错误',
            confidence: 0.95,
            evidence: `检测到 ${(byStatus[500]||0)+(byStatus[502]||0)+(byStatus[503]||0)} 个5xx错误`
          });
          diagnosis.suggestedFixes.push('后端服务异常，检查服务日志或稍后重试');
        }
        // 网络超时/失败
        const failed = filteredErrors.network.filter(n => n.failed && !n.status);
        if (failed.length > 0) {
          diagnosis.rootCauses.push({
            type: 'network',
            pattern: 'timeout_or_failed',
            description: '网络超时或连接失败',
            confidence: 0.80,
            evidence: `${failed.length} 个请求失败（无状态码）`
          });
          diagnosis.suggestedFixes.push('检查网络连接，可能是超时或DNS问题');
        }
      }

      // 元素相关诊断（如果提供了selector）
      if (selector && (errorType === 'all' || errorType === 'element' || errorType === 'interaction')) {
        try {
          const elemStatus = await target.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return { found: false };
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            // 检查遮挡
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const topEl = document.elementFromPoint(centerX, centerY);
            const isObscured = topEl !== el && !el.contains(topEl);
            return {
              found: true,
              visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
              opacity: parseFloat(style.opacity),
              display: style.display,
              visibility: style.visibility,
              disabled: el.disabled,
              readonly: el.readOnly,
              pointerEvents: style.pointerEvents,
              zIndex: style.zIndex,
              inViewport: rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth,
              obscured: isObscured,
              obscuringElement: isObscured ? (topEl?.tagName + (topEl?.className ? '.' + topEl.className.split(' ').slice(0,2).join('.') : '')) : null,
              hasClickListener: el.onclick !== null || el.hasAttribute('onclick') || el.getAttribute('role') === 'button'
            };
          }, selector);

          diagnosis.affectedElements.push({ selector, status: elemStatus });

          if (!elemStatus.found) {
            diagnosis.rootCauses.push({
              type: 'element',
              pattern: 'not_found',
              description: '元素未找到',
              confidence: 0.95
            });
            diagnosis.suggestedFixes.push('元素选择器无效，检查是否动态生成或拼写错误');
            diagnosis.suggestedFixes.push('使用 browser_dom 查看页面结构');
          } else if (!elemStatus.visible) {
            diagnosis.rootCauses.push({
              type: 'element',
              pattern: 'not_visible',
              description: `元素不可见（display:${elemStatus.display}, visibility:${elemStatus.visibility}, opacity:${elemStatus.opacity})`,
              confidence: 0.90
            });
            diagnosis.suggestedFixes.push('元素被隐藏，检查CSS样式或等待动画完成');
            diagnosis.suggestedFixes.push('使用 browser_quick_fix 强制可见');
          } else if (elemStatus.disabled) {
            diagnosis.rootCauses.push({
              type: 'element',
              pattern: 'disabled',
              description: '元素被禁用',
              confidence: 0.95
            });
            diagnosis.suggestedFixes.push('元素处于disabled状态，检查表单验证条件');
          } else if (elemStatus.obscured) {
            diagnosis.rootCauses.push({
              type: 'element',
              pattern: 'obscured',
              description: `元素被遮挡（被 ${elemStatus.obscuringElement} 遮挡）`,
              confidence: 0.85
            });
            diagnosis.suggestedFixes.push('元素被遮挡，尝试滚动或关闭遮罩层');
            diagnosis.suggestedFixes.push('使用 browser_quick_fix 移除遮挡');
          } else if (!elemStatus.inViewport) {
            diagnosis.rootCauses.push({
              type: 'element',
              pattern: 'out_of_viewport',
              description: '元素不在可视区域',
              confidence: 0.80
            });
            diagnosis.suggestedFixes.push('元素不在视口内，使用 browser_scroll 滚动到元素');
          } else if (!elemStatus.hasClickListener && elemStatus.pointerEvents === 'none') {
            diagnosis.rootCauses.push({
              type: 'element',
              pattern: 'no_events',
              description: '元素无事件绑定且pointer-events为none',
              confidence: 0.75
            });
            diagnosis.suggestedFixes.push('元素无交互事件，检查是否是装饰性元素');
          }
        } catch (e) {
          diagnosis.affectedElements.push({ selector, status: { error: e.message } });
        }
      }
    };

    await analyzeRootCause();

    // 计算总体置信度
    if (diagnosis.rootCauses.length > 0) {
      diagnosis.confidence = Math.max(...diagnosis.rootCauses.map(r => r.confidence));
    } else {
      diagnosis.rootCauses.push({
        type: 'unknown',
        pattern: 'no_errors_detected',
        description: '未检测到明显错误',
        confidence: 0.50
      });
      diagnosis.suggestedFixes.push('当前无明显错误，可使用 browser_element_status 深入检查元素');
    }
    // 添加堆栈信息（如果需要）
    if (includeStackTrace && filteredErrors.page.length > 0) {
      diagnosis.stackTraces = filteredErrors.page.slice(0, 3).map(e => ({
        error: (e.text || '').substring(0, 100),
        stack: (e.stack || '').substring(0, 300)
      }));
    }

    // 前端框架检测（新增）
    const frameworkDetection = await target.evaluate(() => {
      const frameworks = [];

      // React detection
      const reactRoot = document.querySelector('[data-reactroot], [data-reactid]');
      const hasReactDevtools = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      const reactVersion = window.React?.version;
      if (reactRoot || hasReactDevtools || document.body.innerHTML.includes('react')) {
        frameworks.push({
          name: 'React',
          detected: true,
          version: reactVersion || 'unknown',
          evidence: reactRoot ? 'data-reactroot attribute' : hasReactDevtools ? 'devtools hook' : 'react in HTML'
        });
      } else {
        frameworks.push({ name: 'React', detected: false });
      }

      // Vue detection
      const vueApp = document.querySelector('[data-v-app], [data-v-],[id="app"][data-v-]');
      const vueInstance = window.Vue || window.__VUE__;
      if (vueApp || vueInstance) {
        frameworks.push({
          name: 'Vue',
          detected: true,
          version: vueInstance?.version || 'unknown',
          evidence: vueApp ? 'data-v- attributes' : 'Vue global'
        });
      } else {
        frameworks.push({ name: 'Vue', detected: false });
      }

      // Angular detection
      const ngVersion = window.ng?.version;
      const ngApp = document.querySelector('[ng-app], [ng-version]');
      const angularMarkers = document.querySelectorAll('[ng-], [_ngcontent-], [_nghost-]').length > 0;
      if (ngVersion || ngApp || angularMarkers) {
        frameworks.push({
          name: 'Angular',
          detected: true,
          version: ngVersion?.full || 'unknown',
          evidence: ngApp ? 'ng-app attribute' : angularMarkers ? 'Angular attributes' : 'ng version'
        });
      } else {
        frameworks.push({ name: 'Angular', detected: false });
      }

      // Svelte detection
      const svelteMarkers = document.querySelectorAll('[class*="svelte"]').length > 0;
      const svelteVersion = window.__svelte;
      if (svelteMarkers || svelteVersion) {
        frameworks.push({
          name: 'Svelte',
          detected: true,
          version: svelteVersion?.version || 'unknown',
          evidence: svelteMarkers ? 'svelte class markers' : 'Svelte global'
        });
      } else {
        frameworks.push({ name: 'Svelte', detected: false });
      }

      // Next.js detection
      const nextData = document.getElementById('__NEXT_DATA__');
      if (nextData) {
        frameworks.push({
          name: 'Next.js',
          detected: true,
          version: JSON.parse(nextData.innerText)?.buildId || 'unknown',
          evidence: '__NEXT_DATA__ element'
        });
      } else {
        frameworks.push({ name: 'Next.js', detected: false });
      }

      // Nuxt.js detection
      const nuxtData = document.getElementById('__NUXT__');
      if (nuxtData || window.__NUXT__) {
        frameworks.push({
          name: 'Nuxt.js',
          detected: true,
          version: 'unknown',
          evidence: nuxtData ? '__NUXT__ element' : 'NUXT global'
        });
      } else {
        frameworks.push({ name: 'Nuxt.js', detected: false });
      }

      // jQuery detection
      if (window.jQuery || window.$) {
        frameworks.push({
          name: 'jQuery',
          detected: true,
          version: window.jQuery?.fn?.jquery || window.$.fn?.jquery || 'unknown',
          evidence: 'jQuery global'
        });
      } else {
        frameworks.push({ name: 'jQuery', detected: false });
      }

      return frameworks;
    });

    diagnosis.frameworks = frameworkDetection;

    // 添加框架相关诊断建议
    const detectedFrameworks = frameworkDetection.filter(f => f.detected);
    if (detectedFrameworks.length > 0) {
      diagnosis.environmentInfo = diagnosis.environmentInfo || {};
      diagnosis.environmentInfo.frameworks = detectedFrameworks.map(f => `${f.name} (${f.version || 'unknown'})`);

      // React 特定诊断
      const react = detectedFrameworks.find(f => f.name === 'React');
      if (react) {
        diagnosis.suggestedFixes.push('React 框架检测：考虑使用 act() 等待组件更新');
      }
      // Vue 特定诊断
      const vue = detectedFrameworks.find(f => f.name === 'Vue');
      if (vue) {
        diagnosis.suggestedFixes.push('Vue 框架检测：考虑使用 $nextTick() 等待 DOM 更新');
      }
    }

    return text(JSON.stringify(diagnosis, null, 2));
  }

  // ====== browser_anti_bot_detect ======
  if (name === 'browser_anti_bot_detect') {
    const { target } = await ensurePage();

    // Navigate if URL provided
    if (args.url) {
      await target.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    const detected = [];
    const recommendations = [];
    const checkHeaders = args.checkHeaders !== false;
    const checkJsChallenges = args.checkJsChallenges !== false;
    const checkCaptcha = args.checkCaptcha !== false;
    const checkFingerprint = args.checkFingerprint !== false;

    // 1. Check page content for anti-bot signals
    const pageAnalysis = await target.evaluate(() => {
      const signals = [];

      // Cloudflare detection
      if (document.title.includes('Checking your browser') ||
          document.title.includes('Just a moment') ||
          document.title.includes('Cloudflare')) {
        signals.push({ type: 'cloudflare', name: 'Cloudflare', confidence: 95, evidence: 'Page title: ' + document.title });
      }
      if (document.body.innerHTML.includes('Checking your browser') ||
          document.body.innerHTML.includes('cf-content-type-generator') ||
          document.body.innerHTML.includes('cloudflare')) {
        signals.push({ type: 'cloudflare', name: 'Cloudflare JS Challenge', confidence: 90, evidence: 'CF content in page body' });
      }

      // reCAPTCHA detection
      if (document.querySelector('.g-recaptcha')) {
        signals.push({ type: 'recaptcha', name: 'Google reCAPTCHA', confidence: 95, evidence: 'reCAPTCHA widget found' });
      }
      if (document.querySelector('div[class*="recaptcha"]')) {
        signals.push({ type: 'recaptcha', name: 'Google reCAPTCHA', confidence: 85, evidence: 'reCAPTCHA class found' });
      }

      // hCaptcha detection
      if (document.querySelector('.h-captcha')) {
        signals.push({ type: 'hcaptcha', name: 'hCaptcha', confidence: 95, evidence: 'hCaptcha widget found' });
      }

      // Turnstile (Cloudflare) detection
      if (document.querySelector('.cf-turnstile')) {
        signals.push({ type: 'cloudflare', name: 'Cloudflare Turnstile', confidence: 95, evidence: 'Turnstile widget found' });
      }

      // AWS WAF detection
      if (document.body.innerHTML.includes('aws-waf') ||
          document.body.innerHTML.includes('AWS WAF')) {
        signals.push({ type: 'aws_waf', name: 'AWS WAF', confidence: 85, evidence: 'AWS WAF content found' });
      }

      // Custom challenge detection
      if (document.querySelector('script[src*="challenge"]')) {
        signals.push({ type: 'js_challenge', name: 'JS Challenge', confidence: 70, evidence: 'Challenge script found' });
      }

      // Fingerprint detection
      const hasWebGL = !!window.WebGLRenderingContext;
      const hasCanvas = !!document.createElement('canvas');
      const hasAudio = !!window.AudioContext;
      const fingerprintSignals = { webgl: hasWebGL, canvas: hasCanvas, audio: hasAudio };

      return { signals, fingerprintSignals, title: document.title };
    });

    detected.push(...pageAnalysis.signals);

    // 2. Check response headers
    if (checkHeaders) {
      const headers = await target.evaluate(() => {
        // Can't access response headers directly, but can check meta tags
        const metaTags = {};
        document.querySelectorAll('meta').forEach(m => {
          if (m.name || m.httpEquiv) {
            metaTags[m.name || m.httpEquiv] = m.content;
          }
        });
        return metaTags;
      });

      // Check for anti-bot headers in meta tags
      if (headers['robots'] && headers['robots'].includes('noindex')) {
        detected.push({ type: 'custom', name: 'Robots NoIndex', confidence: 60, evidence: 'X-Robots-Tag: noindex', risk: 'low' });
      }
    }

    // 3. Calculate risk level
    const riskScores = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
    const riskReverse = { 0: 'none', 1: 'low', 2: 'medium', 3: 'high', 4: 'critical' };
    let maxRisk = 0;
    for (const d of detected) {
      const riskScore = riskScores[d.risk || 'medium'] || 2;
      if (riskScore > maxRisk) maxRisk = riskScore;
    }
    const riskLevel = riskReverse[maxRisk] || 'medium';

    // 4. Generate recommendations
    if (detected.some(d => d.type === 'cloudflare')) {
      recommendations.push('Cloudflare 检测到：等待挑战完成或使用 stealth 模式');
      recommendations.push('考虑使用 Playwright stealth 插件来绕过 Cloudflare 检测');
    }
    if (detected.some(d => d.type === 'recaptcha')) {
      recommendations.push('reCAPTCHA 检测到：需要人工解决或使用验证码解决服务');
      recommendations.push('考虑集成 2Captcha 或类似的验证码解决 API');
    }
    if (detected.some(d => d.type === 'hcaptcha')) {
      recommendations.push('hCaptcha 检测到：需要人工解决或使用 hCaptcha 解决服务');
    }
    if (detected.some(d => d.type === 'js_challenge')) {
      recommendations.push('JS Challenge 检测到：尝试等待或使用无头浏览器模式');
    }
    if (detected.some(d => d.type === 'aws_waf')) {
      recommendations.push('AWS WAF 检测到：可能需要使用真实浏览器或住宅代理');
    }
    if (checkFingerprint && pageAnalysis.fingerprintSignals) {
      recommendations.push('浏览器指纹特征：WebGL=' + pageAnalysis.fingerprintSignals.webgl + ', Canvas=' + pageAnalysis.fingerprintSignals.canvas);
    }
    if (detected.length === 0) {
      recommendations.push('未检测到明显反爬机制，页面可能可以正常访问');
    }

    // Set default risk if not specified
    for (const d of detected) {
      if (!d.risk) {
        if (d.type === 'cloudflare' || d.type === 'recaptcha') d.risk = 'high';
        else if (d.type === 'js_challenge') d.risk = 'medium';
        else d.risk = 'low';
      }
    }

    return text(JSON.stringify({
      success: true,
      url: target.url(),
      detected,
      riskLevel,
      recommendations,
      pageInfo: {
        title: pageAnalysis.title,
        hasChallenge: detected.some(d => d.type === 'js_challenge'),
        challengeType: detected.find(d => d.type === 'js_challenge')?.name || null
      }
    }, null, 2));
  }

  // ====== browser_debug_report ======
  if (name === 'browser_debug_report') {
const { target } = await ensurePage();
    return text(JSON.stringify(await buildDebugReport(target, args), null, 2));
  }

  // ====== browser_element_status ======
  if (name === 'browser_element_status') {
const { target } = await ensurePage();
    const selector = args.selector;
    if (!selector) {
      return { isError: true, content: [{ type: 'text', text: 'browser_element_status 需要提供 selector 参数' }] };
    }

    const checkEvents = args.checkEvents !== false;
    const checkVisibility = args.checkVisibility !== false;
    const checkInteractability = args.checkInteractability !== false;

    const status = await target.evaluate((params) => {
      const { selector, checkEvents, checkVisibility, checkInteractability } = params;
      const el = document.querySelector(selector);
      if (!el) {
        return { found: false, reason: '元素未找到', suggestions: ['检查选择器拼写', '使用 browser_dom 查看页面结构', '可能是动态生成，尝试等待'] };
      }

      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const result = {
        found: true,
        tagName: el.tagName.toLowerCase(),
        className: el.className.split(' ').slice(0, 5).join(' ') || '',
        id: el.id || '',
        type: el.type || '',
        text: (el.innerText || el.textContent || '').substring(0, 50).trim()
      };

      // 可见性检查
      if (checkVisibility) {
        result.visibility = {
          isDisplayed: style.display !== 'none',
          isVisible: style.visibility !== 'hidden',
          opacity: parseFloat(style.opacity),
          hasContent: rect.width > 0 && rect.height > 0,
          clipPath: style.clipPath !== 'none' && style.clipPath !== 'inset(0)',
          summary: ''
        };
        const visIssues = [];
        if (style.display === 'none') visIssues.push('display:none');
        if (style.visibility === 'hidden') visIssues.push('visibility:hidden');
        if (parseFloat(style.opacity) < 0.1) visIssues.push(`opacity:${style.opacity}`);
        if (rect.width <= 0 || rect.height <= 0) visIssues.push('尺寸为0');
        if (style.clipPath !== 'none' && style.clipPath !== 'inset(0)') visIssues.push('clip-path裁剪');
        result.visibility.summary = visIssues.length === 0 ? '可见' : `不可见：${visIssues.join(', ')}`;
        result.visibility.isFullyVisible = visIssues.length === 0;
      }

      // 可交互性检查
      if (checkInteractability) {
        result.interactability = {
          disabled: el.disabled,
          readonly: el.readOnly,
          pointerEvents: style.pointerEvents,
          userSelect: style.userSelect,
          isFocusable: el.tabIndex >= 0 || el.tagName === 'INPUT' || el.tagName === 'BUTTON' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA',
          summary: ''
        };
        const intIssues = [];
        if (el.disabled) intIssues.push('disabled');
        if (el.readOnly) intIssues.push('readonly');
        if (style.pointerEvents === 'none') intIssues.push('pointer-events:none');
        if (!result.interactability.isFocusable && el.tagName !== 'A') intIssues.push('不可聚焦');
        result.interactability.summary = intIssues.length === 0 ? '可交互' : `不可交互：${intIssues.join(', ')}`;
        result.interactability.isInteractable = intIssues.length === 0;
      }

      // 遮挡检查
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      if (rect.width > 0 && rect.height > 0) {
        const topEl = document.elementFromPoint(centerX, centerY);
        const isObscured = topEl !== el && !el.contains(topEl);
        result.obscuration = {
          isObscured,
          obscuringElement: isObscured ? `${topEl?.tagName}.${(topEl?.className || '').split(' ').slice(0, 2).join('.')}` : null,
          obscuringZIndex: isObscured ? parseInt(window.getComputedStyle(topEl).zIndex || '0') : null,
          elementZIndex: parseInt(style.zIndex || '0')
        };
        if (isObscured) {
          result.obscuration.summary = `被 ${result.obscuration.obscuringElement} 遮挡`;
        } else {
          result.obscuration.summary = '未被遮挡';
        }
      } else {
        result.obscuration = { summary: '尺寸为0，无法检测遮挡' };
      }

      // 视口位置
      result.viewport = {
        inViewport: rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth,
        position: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) },
        needsScroll: rect.top < 0 || rect.bottom > window.innerHeight
      };

      // 事件检查
      if (checkEvents) {
        result.events = {
          hasClick: el.onclick !== null || el.hasAttribute('onclick') || el.getAttribute('role') === 'button',
          hasKeydown: el.onkeydown !== null || el.hasAttribute('onkeydown'),
          hasChange: el.onchange !== null || el.hasAttribute('onchange'),
          hasSubmit: el.tagName === 'INPUT' && el.type === 'submit',
          eventListenersCount: (typeof getEventListeners === 'function' ? Object.keys(getEventListeners(el) || {}).length : 'N/A（需DevTools）'),
          summary: ''
        };
        const evList = [];
        if (result.events.hasClick) evList.push('click');
        if (result.events.hasKeydown) evList.push('keydown');
        if (result.events.hasChange) evList.push('change');
        if (result.events.hasSubmit) evList.push('submit');
        result.events.summary = evList.length > 0 ? `绑定事件：${evList.join(', ')}` : '无明显事件绑定';
      }

      // 综合诊断
      result.diagnosis = {
        canClick: result.visibility?.isFullyVisible && result.interactability?.isInteractable && !result.obscuration?.isObscured,
        canType: result.interactability?.isInteractable && !el.disabled && !el.readOnly && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'),
        issues: []
      };

      if (!result.found) result.diagnosis.issues.push('元素未找到');
      if (!result.visibility?.isFullyVisible) result.diagnosis.issues.push(result.visibility?.summary);
      if (!result.interactability?.isInteractable) result.diagnosis.issues.push(result.interactability?.summary);
      if (result.obscuration?.isObscured) result.diagnosis.issues.push(result.obscuration?.summary);
      if (result.viewport?.needsScroll) result.diagnosis.issues.push('需要滚动到视口');

      result.suggestions = [];
      if (!result.found) {
        result.suggestions.push('使用 browser_dom 查看实际DOM结构');
        result.suggestions.push('尝试等待元素加载：browser_wait selector="' + selector + '"');
      } else if (!result.diagnosis.canClick) {
        if (result.obscuration?.isObscured) result.suggestions.push('关闭遮罩层或使用 browser_quick_fix 移除遮挡');
        if (!result.visibility?.isFullyVisible) result.suggestions.push('等待动画或使用 browser_quick_fix 强制可见');
        if (!result.interactability?.isInteractable) result.suggestions.push('检查disabled状态或表单验证条件');
      }
      if (result.viewport?.needsScroll) result.suggestions.push('使用 browser_scroll selector="' + selector + '" 滚动到元素');

      return result;
    }, { selector, checkEvents, checkVisibility, checkInteractability });

    return text(JSON.stringify(status, null, 2));
  }

  // ====== browser_quick_fix ======
  if (name === 'browser_quick_fix') {
const { target } = await ensurePage();
    const selector = args.selector;
    if (!selector) {
      return { isError: true, content: [{ type: 'text', text: 'browser_quick_fix 需要提供 selector 参数' }] };
    }

    const problems = args.problems || (args.problem ? [args.problem] : ['not_found']);
    const isBatchMode = !!args.problems;
    const maxAttempts = args.maxAttempts || 5;
    const waitStrategy = args.waitStrategy || 'smart';

    const attempts = [];

    // 策略执行函数
    const tryFix = async (strategy) => {
      const attempt = { strategy, timestamp: new Date().toISOString(), success: false, error: null };
      try {
        switch (strategy) {
          case 'wait_and_check':
            if (waitStrategy === 'smart') {
              await target.waitForSelector(selector, { timeout: 5000, state: 'attached' }).catch(() => {});
            } else if (waitStrategy === 'fixed') {
              await target.waitForTimeout(2000);
            }
            const exists = await target.evaluate((s) => !!document.querySelector(s), selector);
            attempt.success = exists;
            attempt.result = exists ? '元素已出现' : '元素仍未出现';
            break;

          case 'scroll_to_element':
            await target.evaluate((s) => {
              const el = document.querySelector(s);
              if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
            }, selector);
            attempt.success = true;
            attempt.result = '已滚动到元素位置';
            break;

          case 'force_visible':
            await target.evaluate((s) => {
              const el = document.querySelector(s);
              if (el) {
                el.style.display = '';
                el.style.visibility = 'visible';
                el.style.opacity = '1';
              }
            }, selector);
            attempt.success = true;
            attempt.result = '已强制设置可见';
            break;

          case 'remove_obscuring':
            // 移除常见遮罩层
            const removed = await target.evaluate(() => {
              const overlays = document.querySelectorAll('.modal-backdrop, .overlay, .mask, [role="dialog"], .toast, .notification, .loading');
              let count = 0;
              for (const el of overlays) {
                el.style.display = 'none';
                el.remove();
                count++;
              }
              return count;
            });
            attempt.success = removed > 0;
            attempt.result = removed > 0 ? `已移除 ${removed} 个遮挡元素` : '未发现遮挡元素';
            break;

          case 'remove_disabled':
            await target.evaluate((s) => {
              const el = document.querySelector(s);
              if (el) {
                el.disabled = false;
                el.removeAttribute('disabled');
                el.removeAttribute('readonly');
              }
            }, selector);
            attempt.success = true;
            attempt.result = '已移除disabled属性';
            break;

          case 'force_click':
            await target.evaluate((s) => {
              const el = document.querySelector(s);
              if (el) {
                el.scrollIntoView({ behavior: 'instant' });
                el.click();
              }
            }, selector);
            attempt.success = true;
            attempt.result = '已通过JS强制点击';
            break;

          case 'inject_click_listener':
            await target.evaluate((s) => {
              const el = document.querySelector(s);
              if (el && !el.onclick) {
                el.onclick = () => console.log('注入的点击已执行');
              }
            }, selector);
            attempt.success = true;
            attempt.result = '已注入点击事件监听';
            break;

          case 'trigger_event':
            await target.evaluate((s) => {
              const el = document.querySelector(s);
              if (el) {
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              }
            }, selector);
            attempt.success = true;
            attempt.result = '已触发click事件';
            break;

          default:
            attempt.error = '未知策略';
        }
      } catch (e) {
        attempt.error = e.message;
      }
      attempts.push(attempt);
      return attempt.success;
    };

    // === 新增策略函数：api_failed / page_crashed / resource_blocked ===

    // api_failed 策略
    async function fixApiFailed(t, sel) {
      const results = [];
      // 策略1: retry - 等待后刷新页面重试
      try {
        const pageUrl = t.url();
        if (pageUrl) {
          await t.waitForTimeout(2000);
          await t.reload({ waitUntil: 'networkidle' });
          results.push({ strategy: 'page_reload', success: true });
        }
      } catch (e) {
        results.push({ strategy: 'page_reload', success: false, error: e.message });
      }
      // 策略2: wait + check response
      try {
        await t.waitForTimeout(1000);
        const hasApiErr = pageErrors.length > 0;
        results.push({ strategy: 'wait_and_check', success: !hasApiErr });
      } catch (e) {
        results.push({ strategy: 'wait_and_check', success: false, error: e.message });
      }
      return results;
    }

    // page_crashed 策略
    async function fixPageCrashed(t, sel) {
      const results = [];
      // 策略1: reload
      try {
        await t.reload({ waitUntil: 'domcontentloaded' });
        results.push({ strategy: 'force_reload', success: true });
      } catch (e) {
        results.push({ strategy: 'force_reload', success: false, error: e.message });
      }
      // 策略2: restore session / re-navigate
      try {
        const pageUrl = t.url();
        if (pageUrl && pageUrl !== 'about:blank') {
          await t.goto(pageUrl, { waitUntil: 'domcontentloaded' });
          results.push({ strategy: 're_navigate', success: true });
        }
      } catch (e) {
        results.push({ strategy: 're_navigate', success: false, error: e.message });
      }
      return results;
    }

    // resource_blocked 策略
    async function fixResourceBlocked(t, sel) {
      const results = [];
      // 策略1: hard reload bypass cache
      try {
        await t.reload({ waitUntil: 'networkidle' });
        results.push({ strategy: 'hard_reload', success: true });
      } catch (e) {
        results.push({ strategy: 'hard_reload', success: false, error: e.message });
      }
      // 策略2: clear cache via CDP
      try {
        const cdp = await t.context().newCDPSession(t);
        await cdp.send('Network.clearBrowserCache');
        await t.reload({ waitUntil: 'networkidle' });
        results.push({ strategy: 'clear_cache_reload', success: true });
      } catch (e) {
        results.push({ strategy: 'clear_cache_reload', success: false, error: e.message });
      }
      return results;
    }

    // 根据问题类型选择策略顺序
    const strategyOrder = {
      not_found: ['wait_and_check', 'scroll_to_element', 'force_visible'],
      not_visible: ['scroll_to_element', 'force_visible', 'remove_obscuring'],
      not_interactable: ['remove_disabled', 'remove_obscuring', 'force_click'],
      click_failed: ['scroll_to_element', 'remove_obscuring', 'force_click', 'trigger_event'],
      type_failed: ['scroll_to_element', 'remove_disabled', 'force_visible'],
      js_error: ['wait_and_check', 'force_click', 'inject_click_listener'],
      api_failed: ['fixApiFailed'],
      page_crashed: ['fixPageCrashed'],
      resource_blocked: ['fixResourceBlocked']
    };

    const allResults = [];
    let successCount = 0;

    for (const currentProblem of problems) {
      const problemAttempts = [];
      const strategies = strategyOrder[currentProblem] || strategyOrder.not_found;

      let problemFixed = false;
      let problemFinalStatus = null;

      for (const strategy of strategies) {
        if (problemAttempts.length >= maxAttempts) break;

        // 新策略函数（返回结果数组）走单独路径
        if (typeof strategy === 'string' && ['fixApiFailed', 'fixPageCrashed', 'fixResourceBlocked'].includes(strategy)) {
          const strategyFn = strategy === 'fixApiFailed' ? fixApiFailed :
                             strategy === 'fixPageCrashed' ? fixPageCrashed :
                             fixResourceBlocked;
          const subResults = await strategyFn(target, selector);
          for (const sr of subResults) {
            problemAttempts.push({
              strategy: sr.strategy,
              timestamp: new Date().toISOString(),
              success: sr.success,
              error: sr.error || null,
              result: sr.success ? '执行成功' : '执行失败'
            });
          }
          problemFixed = subResults.some(r => r.success);
          if (problemFixed) break;
          continue;
        }

        const success = await tryFix(strategy);
        if (success) {
          // 检查是否真的修复了
          const checkStatus = await target.evaluate((s) => {
            const el = document.querySelector(s);
            if (!el) return { found: false };
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return {
              found: true,
              visible: rect.width > 0 && style.visibility !== 'hidden' && style.display !== 'none',
              disabled: el.disabled
            };
          }, selector);

          if (checkStatus.found && (currentProblem === 'not_found' || (checkStatus.visible && currentProblem !== 'not_interactable') || (!checkStatus.disabled && currentProblem === 'not_interactable'))) {
            problemFixed = true;
            problemFinalStatus = checkStatus;
            break;
          }
        }
      }

      // 当前 problem 最终状态检查
      if (!problemFinalStatus) {
        problemFinalStatus = await target.evaluate((s) => {
          const el = document.querySelector(s);
          if (!el) return { found: false };
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return {
            found: true,
            visible: rect.width > 0 && style.visibility !== 'hidden' && style.display !== 'none',
            disabled: el.disabled,
            interactable: !el.disabled && rect.width > 0
          };
        }, selector);
      }

      if (problemFixed) successCount++;

      allResults.push({
        problem: currentProblem,
        attempts: problemAttempts,
        totalAttempts: problemAttempts.length,
        fixed: problemFixed,
        finalStatus: problemFinalStatus,
        nextSteps: problemFixed ? ['修复成功，可继续操作'] : ['建议使用 browser_element_status 深入诊断', '检查页面是否完全加载', '尝试不同的选择器']
      });

      // 如果当前 problem 未修复，不再继续后续 problem
      if (!problemFixed) break;
    }

    // 最终状态取最后一个执行的 problem 的 finalStatus（兼容单 problem 模式）
    const lastResult = allResults[allResults.length - 1];
    const finalFixed = lastResult?.fixed || false;
    const finalFinalStatus = lastResult?.finalStatus || null;

    const responseBody = {
      selector,
      problem: args.problem || problems[0],
      attempts,
      totalAttempts: attempts.length,
      fixed: finalFixed,
      finalStatus: finalFinalStatus,
      nextSteps: finalFixed ? ['修复成功，可继续操作'] : ['建议使用 browser_element_status 深入诊断', '检查页面是否完全加载', '尝试不同的选择器']
    };

    // 批量模式附加信息
    if (isBatchMode) {
      responseBody.batchedResults = allResults;
      responseBody.totalFixed = successCount;
      responseBody.totalAttempted = problems.length;
    }

    return text(JSON.stringify(responseBody, null, 2));
  }

  // ====== browser_verify_fix ======
  if (name === 'browser_verify_fix') {
const { target } = await ensurePage();
    const selector = args.selector;
    if (!selector) {
      return { isError: true, content: [{ type: 'text', text: 'browser_verify_fix 需要提供 selector 参数' }] };
    }

    const fixAction = args.fixAction || 'quick_fix';
    const fixValue = args.fixValue;
    const criteria = args.verificationCriteria || {};
    const timeout = args.timeout || 10000;

    // 1. 记录修复前状态
    const beforeState = {
      url: target.url(),
      timestamp: new Date().toISOString(),
      checkpoint: currentCheckpoint,
      errors: {
        console: consoleLogs.slice(-10).filter(e => e.type === 'error').length,
        page: pageErrors.slice(-5).length,
        network: networkLogs.slice(-10).filter(e => e.status >= 400 || e.failed).length
      },
      elementStatus: null
    };

    // 获取元素修复前状态
    try {
      beforeState.elementStatus = await target.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return { found: false };
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          found: true,
          visible: rect.width > 0 && style.visibility !== 'hidden' && style.display !== 'none',
          disabled: el.disabled,
          inViewport: rect.top >= 0 && rect.bottom <= window.innerHeight
        };
      }, selector);
    } catch (e) {
      beforeState.elementStatus = { error: e.message };
    }

    // 2. 执行修复动作
    const fixResult = { action: fixAction, success: false, error: null };

    try {
      switch (fixAction) {
        case 'click':
          await target.click(selector, { timeout: timeout }).catch(() => {
            // 降级到 JS 点击
            return target.evaluate((s) => {
              const el = document.querySelector(s);
              if (el) el.click();
            }, selector);
          });
          fixResult.success = true;
          fixResult.message = '点击执行完成';
          break;

        case 'type':
          if (!fixValue) {
            fixResult.error = 'type 操作需要 fixValue 参数';
          } else {
            await target.fill(selector, fixValue, { timeout: timeout });
            fixResult.success = true;
            fixResult.message = `已输入: ${fixValue.substring(0, 20)}`;
          }
          break;

        case 'wait':
          const waitMs = parseInt(fixValue) || 2000;
          await target.waitForTimeout(waitMs);
          fixResult.success = true;
          fixResult.message = `等待 ${waitMs}ms 完成`;
          break;

        case 'scroll':
          await target.evaluate((s) => {
            const el = document.querySelector(s);
            if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
          }, selector);
          fixResult.success = true;
          fixResult.message = '已滚动到元素';
          break;

        case 'quick_fix':
          // 自动尝试修复
          const quickFixStrategies = ['scroll', 'force_visible', 'remove_disabled', 'force_click'];
          for (const strategy of quickFixStrategies) {
            try {
              if (strategy === 'scroll') {
                await target.evaluate((s) => {
                  const el = document.querySelector(s);
                  if (el) el.scrollIntoView({ behavior: 'instant' });
                }, selector);
              } else if (strategy === 'force_visible') {
                await target.evaluate((s) => {
                  const el = document.querySelector(s);
                  if (el) {
                    el.style.display = '';
                    el.style.visibility = 'visible';
                    el.style.opacity = '1';
                  }
                }, selector);
              } else if (strategy === 'remove_disabled') {
                await target.evaluate((s) => {
                  const el = document.querySelector(s);
                  if (el) {
                    el.disabled = false;
                    el.removeAttribute('disabled');
                  }
                }, selector);
              } else if (strategy === 'force_click') {
                await target.evaluate((s) => {
                  const el = document.querySelector(s);
                  if (el) {
                    el.scrollIntoView({ behavior: 'instant' });
                    el.click();
                  }
                }, selector);
                fixResult.success = true;
                fixResult.message = '已通过JS强制点击';
                break;
              }
            } catch (e) {
              // 继续尝试下一个策略
            }
          }
          if (!fixResult.success) {
            fixResult.success = true;
            fixResult.message = 'quick_fix 尝试完成';
          }
          break;

        case 'none':
          fixResult.success = true;
          fixResult.message = '仅验证，无修复动作';
          break;
      }
    } catch (e) {
      fixResult.error = e.message;
    }

    // 等待一下让状态稳定
    await target.waitForTimeout(500);

    // 3. 记录修复后状态
    const afterState = {
      url: target.url(),
      timestamp: new Date().toISOString(),
      errors: {
        console: consoleLogs.slice(-10).filter(e => e.type === 'error').length,
        page: pageErrors.slice(-5).length,
        network: networkLogs.slice(-10).filter(e => e.status >= 400 || e.failed).length
      },
      elementStatus: null
    };

    try {
      afterState.elementStatus = await target.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return { found: false };
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          found: true,
          visible: rect.width > 0 && style.visibility !== 'hidden' && style.display !== 'none',
          disabled: el.disabled,
          inViewport: rect.top >= 0 && rect.bottom <= window.innerHeight
        };
      }, selector);
    } catch (e) {
      afterState.elementStatus = { error: e.message };
    }

    // 4. 验证结果
    const verification = {
      passed: true,
      criteria: {},
      details: []
    };

    // 检查各种验证条件
    if (criteria.noNewErrors !== false) {
      const newErrors = afterState.errors.console + afterState.errors.page + afterState.errors.network -
        (beforeState.errors.console + beforeState.errors.page + beforeState.errors.network);
      verification.criteria.noNewErrors = newErrors <= 0;
      if (newErrors > 0) {
        verification.details.push(`新增 ${newErrors} 个错误`);
        verification.passed = false;
      } else {
        verification.details.push('无新增错误');
      }
    }

    if (criteria.elementVisible) {
      verification.criteria.elementVisible = afterState.elementStatus?.visible === true;
      if (!verification.criteria.elementVisible) {
        verification.details.push('元素仍不可见');
        verification.passed = false;
      } else {
        verification.details.push('元素已可见');
      }
    }

    if (criteria.elementInteractable) {
      verification.criteria.elementInteractable = afterState.elementStatus?.found && !afterState.elementStatus?.disabled;
      if (!verification.criteria.elementInteractable) {
        verification.details.push('元素仍不可交互');
        verification.passed = false;
      } else {
        verification.details.push('元素已可交互');
      }
    }

    if (criteria.textContains) {
      const pageText = await target.evaluate(() => document.body.innerText);
      verification.criteria.textContains = pageText.includes(criteria.textContains);
      if (!verification.criteria.textContains) {
        verification.details.push(`页面不包含 "${criteria.textContains}"`);
        verification.passed = false;
      } else {
        verification.details.push(`页面包含 "${criteria.textContains}"`);
      }
    }

    if (criteria.urlChanged) {
      verification.criteria.urlChanged = beforeState.url !== afterState.url;
      if (!verification.criteria.urlChanged) {
        verification.details.push('URL未变化');
        verification.passed = false;
      } else {
        verification.details.push(`URL已变化: ${afterState.url.substring(0, 50)}`);
      }
    }

    // 5. 综合结果
    const result = {
      selector,
      fixAction,
      fixResult,
      beforeState,
      afterState,
      verification,
      fixStatus: verification.passed ? 'FIXED' : 'NOT_FIXED',
      nextAction: verification.passed ? ['修复成功，可继续后续操作'] : ['建议使用 browser_diagnose 深入诊断', '尝试不同的修复策略', '使用 browser_element_status 检查元素状态']
    };

    return text(JSON.stringify(result, null, 2));
  }

  // ====== browser_errors_aggregate ======
  if (name === 'browser_errors_aggregate') {
const evidence = args.evidence || (args.includeCurrentPage === false ? {} : (await evidenceCollector.collectEvidence(args)).evidence);
    return text(JSON.stringify(errorAggregator.aggregateErrors(evidence, args), null, 2));
  }

  // ====== error_fix_suggestion ======
  if (name === 'error_fix_suggestion') {
const errorSummary = args.errorSummary || '';
    const context = args.context || {};
    const maxSuggestions = args.maxSuggestions || 3;

    const errorText = typeof errorSummary === 'string' ? errorSummary : JSON.stringify(errorSummary);
    const lowerText = errorText.toLowerCase();

    const patterns = [
      {
        name: '404_not_found',
        match: /404|not found|无法找到|找不到资源/i,
        suggestions: [
          { suggestion: '检查URL路径是否正确，注意大小写和拼写', severity: 'critical', confidence: 0.9, verifyAction: '在浏览器中直接访问URL，确认是否返回404', relatedTool: 'browser_open' },
          { suggestion: '检查API路由版本是否匹配', severity: 'general', confidence: 0.7, verifyAction: '查看API文档确认路由版本', relatedTool: 'browser_network' },
          { suggestion: '检查资源引用路径（JS/CSS/图片）', severity: 'general', confidence: 0.6, verifyAction: '使用browser_network检查失败的资源请求', relatedTool: 'browser_network' }
        ]
      },
      {
        name: '401_unauthorized',
        match: /401|unauthorized|未授权|无权限登录|身份验证失败/i,
        suggestions: [
          { suggestion: '检查登录状态是否有效', severity: 'critical', confidence: 0.9, verifyAction: '查看当前页面是否需要重新登录', relatedTool: 'browser_cookies' },
          { suggestion: '检查Token或Cookie是否过期', severity: 'critical', confidence: 0.85, verifyAction: '使用browser_cookies查看认证信息', relatedTool: 'browser_cookies' },
          { suggestion: '重新登录获取有效凭证', severity: 'general', confidence: 0.8, verifyAction: '执行登录操作后重试', relatedTool: 'browser_click' }
        ]
      },
      {
        name: '403_forbidden',
        match: /403|forbidden|禁止访问|访问被拒绝/i,
        suggestions: [
          { suggestion: '检查当前用户角色权限是否足够', severity: 'critical', confidence: 0.85, verifyAction: '确认用户角色与资源权限要求', relatedTool: 'browser_cookies' },
          { suggestion: '检查资源访问控制配置', severity: 'general', confidence: 0.7, verifyAction: '查看服务端权限配置', relatedTool: 'browser_network' }
        ]
      },
      {
        name: '5xx_server_error',
        match: /500|502|503|server error|服务器错误|内部错误|服务不可用/i,
        suggestions: [
          { suggestion: '检查后端服务状态是否正常', severity: 'critical', confidence: 0.9, verifyAction: '查看服务健康检查接口', relatedTool: 'browser_network' },
          { suggestion: '稍后重试，可能是临时故障', severity: 'general', confidence: 0.7, verifyAction: '等待一段时间后重新请求', relatedTool: 'browser_wait' },
          { suggestion: '查看服务端日志获取详细错误信息', severity: 'critical', confidence: 0.8, verifyAction: '检查服务日志排查根因', relatedTool: 'browser_diagnose' }
        ]
      },
      {
        name: 'type_error_undefined',
        match: /TypeError|undefined|Cannot read properties|无法读取属性|类型错误/i,
        suggestions: [
          { suggestion: '等待页面JS加载完成后再操作', severity: 'critical', confidence: 0.85, verifyAction: '使用browser_wait等待页面稳定', relatedTool: 'browser_wait', suggestedCode: 'await page.waitForSelector(".content-loaded", { timeout: 5000 })' },
          { suggestion: '检查目标元素是否存在于DOM中', severity: 'critical', confidence: 0.8, verifyAction: '使用browser_find_element确认元素存在', relatedTool: 'browser_find_element', suggestedCode: 'const el = document.querySelector(".target-element"); console.log("exists:", !!el)' },
          { suggestion: '检查页面数据是否加载完成', severity: 'general', confidence: 0.7, verifyAction: '查看网络请求确认数据返回', relatedTool: 'browser_network' }
        ]
      },
      {
        name: 'cors_cross_origin',
        match: /CORS|cross-origin|跨域|Access-Control|被CORS策略阻止|Script error[\.]?$/i,
        suggestions: [
          { suggestion: '检查API服务端CORS配置', severity: 'critical', confidence: 0.9, verifyAction: '查看响应头Access-Control-Allow-Origin', relatedTool: 'browser_network' },
          { suggestion: '检查请求域名是否在白名单中', severity: 'general', confidence: 0.75, verifyAction: '确认服务端配置的允许源', relatedTool: 'browser_network' },
          { suggestion: '跨域脚本错误：在<script>标签添加crossorigin="anonymous"属性', severity: 'critical', confidence: 0.85, verifyAction: '检查HTML中的<script src>是否缺少crossorigin属性', relatedTool: 'browser_dom' },
          { suggestion: '使用代理服务器转发请求', severity: 'general', confidence: 0.6, verifyAction: '配置开发代理绕过CORS限制', relatedTool: 'browser_network', suggestedCode: '// dev proxy config\nmodule.exports = { devServer: { proxy: { "/api": { target: "http://localhost:3000" } } } }' }
        ]
      },
      {
        name: 'timeout',
        match: /timeout|timed out|ETIMEDOUT|超时|请求超时/i,
        suggestions: [
          { suggestion: '检查网络连接是否正常', severity: 'critical', confidence: 0.85, verifyAction: '访问其他网站确认网络状态', relatedTool: 'browser_open' },
          { suggestion: '增加请求超时时间', severity: 'general', confidence: 0.8, verifyAction: '调整超时参数后重试', relatedTool: 'browser_wait', suggestedCode: 'await page.goto(url, { timeout: 30000 })' },
          { suggestion: '检查服务端响应速度是否正常', severity: 'general', confidence: 0.7, verifyAction: '查看网络请求耗时分布', relatedTool: 'browser_network' }
        ]
      },
      {
        name: 'element_not_found',
        match: /element not found|no element matched|找不到元素|元素不存在|没有匹配的元素/i,
        suggestions: [
          { suggestion: '检查选择器拼写是否正确', severity: 'critical', confidence: 0.9, verifyAction: '使用browser_dom验证选择器', relatedTool: 'browser_dom' },
          { suggestion: '等待元素加载完成后再操作', severity: 'critical', confidence: 0.85, verifyAction: '使用browser_wait等待元素出现', relatedTool: 'browser_wait', suggestedCode: 'await page.waitForSelector(".target-element", { timeout: 10000 })' },
          { suggestion: '使用browser_find_element查找元素', severity: 'general', confidence: 0.8, verifyAction: '调用browser_find_element确认元素位置', relatedTool: 'browser_find_element' }
        ]
      },
      {
        name: 'element_not_visible',
        match: /element not visible|not interactable|不可见|不可交互|元素被遮挡/i,
        suggestions: [
          { suggestion: '滚动到元素位置使其可见', severity: 'critical', confidence: 0.85, verifyAction: '使用browser_scroll滚动到元素', relatedTool: 'browser_scroll', suggestedCode: 'await element.scrollIntoView({ behavior: "smooth", block: "center" })' },
          { suggestion: '检查元素是否被其他元素遮挡', severity: 'general', confidence: 0.7, verifyAction: '截图查看元素实际显示状态', relatedTool: 'browser_screenshot' },
          { suggestion: '等待页面动画或过渡完成', severity: 'general', confidence: 0.75, verifyAction: '使用browser_wait等待动画结束', relatedTool: 'browser_wait', suggestedCode: 'await page.waitForTimeout(1000) // 等待动画结束' }
        ]
      },
      {
        name: 'disabled_readonly',
        match: /disabled|readonly|只读|禁用|不可编辑/i,
        suggestions: [
          { suggestion: '检查表单验证条件是否满足', severity: 'critical', confidence: 0.8, verifyAction: '查看表单字段的启用条件', relatedTool: 'browser_diagnose' },
          { suggestion: '检查前置输入是否满足要求', severity: 'general', confidence: 0.7, verifyAction: '确认依赖字段是否已正确填写', relatedTool: 'browser_click' }
        ]
      },
      {
        name: 'network_error_fetch',
        match: /NetworkError|Failed to fetch|网络错误|获取失败|连接失败/i,
        suggestions: [
          { suggestion: '检查网络连接是否正常', severity: 'critical', confidence: 0.9, verifyAction: '访问其他网站确认网络连通性', relatedTool: 'browser_open' },
          { suggestion: '检查API服务是否可用', severity: 'critical', confidence: 0.85, verifyAction: '直接访问API地址确认服务状态', relatedTool: 'browser_network' },
          { suggestion: '检查请求格式是否正确', severity: 'general', confidence: 0.7, verifyAction: '核对请求参数和格式要求', relatedTool: 'browser_network' }
        ]
      },
      // api_response_html — 路由兜底检测（API 返回 HTML 而非 JSON）
      {
        name: 'api_response_html',
        match: /html.*200|返回了HTML|路由兜底|SPA路由/i,
        suggestions: [
          { suggestion: 'API 路径可能被 SPA 路由捕获，返回了 HTML 而非 JSON', severity: 'blocking', confidence: 0.9, verifyAction: '在 Network 面板检查响应 Content-Type', relatedTool: 'browser_network', suggestedCode: 'fetch(url).then(r => { if (!r.ok || !r.headers.get("content-type")?.includes("json")) throw new Error("Not JSON response") })' },
          { suggestion: '检查 API URL 前缀是否匹配服务端路由配置', severity: 'critical', confidence: 0.8, verifyAction: '对比 API 文档中的路由前缀', relatedTool: 'browser_dom', suggestedCode: '// 检查 /api/ 前缀是否匹配 server 配置' },
          { suggestion: '确认服务端未将所有未匹配路由指向 index.html', severity: 'critical', confidence: 0.85, verifyAction: '查看 nginx/tomcat 路由配置', relatedTool: 'browser_network' }
        ]
      },
      // missing_envVar — 环境变量缺失
      {
        name: 'missing_envVar',
        match: /environment variable|env.*not set|环境变量.*未|缺少.*环境|process\.env/i,
        suggestions: [
          { suggestion: '检查 .env 文件是否存在且包含必需变量', severity: 'blocking', confidence: 0.9, verifyAction: '检查 .env 或 .env.local 文件', relatedTool: 'browser_diagnose', suggestedCode: 'console.log("MISSING:", ["KEY1","KEY2"].filter(k=>!process.env[k]))' },
          { suggestion: '确认 CI/CD 中已配置该环境变量', severity: 'critical', confidence: 0.85, verifyAction: '检查部署环境的变量配置', relatedTool: 'browser_diagnose' }
        ]
      },
      // port_conflict — 端口冲突
      {
        name: 'port_conflict',
        match: /port.*in use|EADDRINUSE|端口.*占用|address.*already in use/i,
        suggestions: [
          { suggestion: '查找占用端口的进程并停止', severity: 'blocking', confidence: 0.9, verifyAction: 'netstat -ano | findstr :PORT', relatedTool: 'browser_diagnose', suggestedCode: '// Windows: netstat -ano | findstr :PORT\n// Linux: lsof -i :PORT' },
          { suggestion: '修改应用端口配置重新启动', severity: 'critical', confidence: 0.85, verifyAction: '在配置文件中修改端口号', relatedTool: 'browser_diagnose' }
        ]
      },
      // websocket_error — WebSocket 错误
      {
        name: 'websocket_error',
        match: /websocket|WebSocket|ws:[/][/]|wss:[/][/]|socket.*error|连接.*断开/i,
        suggestions: [
          { suggestion: '检查 WebSocket 服务端是否正常运行', severity: 'blocking', confidence: 0.9, verifyAction: '直接连接 WebSocket 端点确认状态', relatedTool: 'browser_network', suggestedCode: 'new WebSocket(url).onopen=()=>console.log("WS OK")' },
          { suggestion: '检查防火墙/代理是否拦截 WebSocket 升级请求', severity: 'critical', confidence: 0.8, verifyAction: '查看网络请求中 101 状态码', relatedTool: 'browser_network' }
        ]
      },
      // rate_limit — 请求频率限制
      {
        name: 'rate_limit',
        match: /rate limit|429|too many requests|请求过于频繁|请求被限流/i,
        suggestions: [
          { suggestion: '增加请求间隔，避免短时间内大量请求', severity: 'critical', confidence: 0.9, verifyAction: '添加延迟后重试', relatedTool: 'browser_wait', suggestedCode: 'await new Promise(r=>setTimeout(r,2000))' },
          { suggestion: '检查是否需要添加认证头提高限额', severity: 'general', confidence: 0.7, verifyAction: '查看 API 文档关于限流的说明', relatedTool: 'browser_cookies' }
        ]
      },
      // python_route_missing — Python 后端路由缺失（Flask/FastAPI）
      {
        name: 'python_route_missing',
        match: /404|route.*not found|endpoint.*missing|路由.*缺失|接口.*不存在|api.*not found|identity\.me|tenants.*500/i,
        suggestions: [
          { suggestion: '检查 Python 路由文件是否存在对应端点定义', severity: 'blocking', confidence: 0.9, verifyAction: '在 routes/ 目录下查找对应 .py 文件', relatedTool: 'debug_investigate', suggestedCode: '# 检查路由文件\n# grep -rn "endpoint_name" app/routes/' },
          { suggestion: '检查蓝图(Blueprint)是否在 __init__.py 中注册', severity: 'critical', confidence: 0.85, verifyAction: '查看 routes/__init__.py 中的 router 注册列表', relatedTool: 'debug_investigate', suggestedCode: '# 检查蓝图注册\nfrom app.routes.module import router\napp.include_router(router)' },
          { suggestion: '检查路由装饰器 @router.get/post 的路径是否正确', severity: 'critical', confidence: 0.8, verifyAction: '对比 API 文档和路由装饰器中的路径', relatedTool: 'browser_network' }
        ]
      },
      // python_import_error — Python 模块导入错误
      {
        name: 'python_import_error',
        match: /ImportError|ModuleNotFoundError|No module named|导入.*失败|模块.*不存在/i,
        suggestions: [
          { suggestion: '检查 requirements.txt 是否包含缺失的依赖包', severity: 'blocking', confidence: 0.9, verifyAction: '执行 pip install -r requirements.txt', relatedTool: 'debug_investigate', suggestedCode: 'pip install -r requirements.txt' },
          { suggestion: '检查 Python 路径(PYTHONPATH)和模块搜索路径', severity: 'critical', confidence: 0.85, verifyAction: '打印 sys.path 确认导入路径', relatedTool: 'debug_investigate', suggestedCode: 'python3 -c "import sys; print(chr(10).join(sys.path))"' },
          { suggestion: '检查循环导入(circular import)问题', severity: 'critical', confidence: 0.8, verifyAction: '检查模块之间的相互引用关系', relatedTool: 'debug_investigate' }
        ]
      },
      // python_db_error — 数据库连接/查询错误
      {
        name: 'python_db_error',
        match: /psycopg|DatabaseError|OperationalError|数据库.*错误|relation.*does not exist|UndefinedTable|connection.*failed|database.*error/i,
        suggestions: [
          { suggestion: '检查数据库表是否存在(SELECT tablename FROM pg_tables)', severity: 'blocking', confidence: 0.9, verifyAction: '连接数据库执行 \\dt 检查表清单', relatedTool: 'debug_investigate', suggestedCode: 'docker exec postgres psql -U user -d db -c "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname=\'public\'"' },
          { suggestion: '检查 schema.sql/Docker 启动时是否成功执行迁移', severity: 'critical', confidence: 0.85, verifyAction: '查看容器启动日志中的 schema/migration 信息', relatedTool: 'debug_investigate', suggestedCode: 'docker compose logs | grep -iE "schema|migration|error"' },
          { suggestion: '检查 SQL 语法错误（如缺少引号、逗号、DEFAULT 值格式）', severity: 'critical', confidence: 0.8, verifyAction: '逐步测试 CREATE TABLE 语句定位语法错误', relatedTool: 'debug_investigate', suggestedCode: '-- 常见错误: DEFAULT value 缺少引号\n-- 正确: DEFAULT \'value\'\n-- 错误: DEFAULT value' }
        ]
      },
      // sql_undefined_column — SQL 查询引用不存在的列（UndefinedColumn）
      {
        name: 'sql_undefined_column',
        match: /UndefinedColumn|column.*does not exist|列.*不存在|payout_status|payout_requested_at|column.*status.*not exist/i,
        suggestions: [
          { suggestion: '检查 SQL 查询中引用的列名是否在对应表结构中存在', severity: 'blocking', confidence: 0.95, verifyAction: '执行 \\d tablename 检查表结构中的列清单', relatedTool: 'debug_investigate', suggestedCode: 'docker exec postgres psql -U user -d db -c "SELECT column_name FROM information_schema.columns WHERE table_name=\'tablename\'"' },
          { suggestion: '确认 schema.sql 或迁移文件是否遗漏了该列定义', severity: 'critical', confidence: 0.9, verifyAction: '检查 schema.sql 中 CREATE TABLE 部分和 migrations/ 目录下的迁移文件', relatedTool: 'debug_investigate', suggestedCode: 'grep -n "payout_status\|status" infra/postgres/schema.sql services/gateway/migrations/*.sql' },
          { suggestion: '使用 ALTER TABLE ADD COLUMN IF NOT EXISTS 补充缺失列', severity: 'critical', confidence: 0.85, verifyAction: '执行 ALTER TABLE 后重新测试 API', relatedTool: 'debug_investigate', suggestedCode: 'ALTER TABLE tablename ADD COLUMN IF NOT EXISTS column_name VARCHAR(32) NOT NULL DEFAULT \'pending\';' }
        ]
      },
      // sql_undefined_table — SQL 查询引用了不存在的表（UndefinedTable）
      {
        name: 'sql_undefined_table',
        match: /UndefinedTable|relation.*does not exist|表.*不存在|setlement_accounts|settlement_accounts/i,
        suggestions: [
          { suggestion: '检查 schema.sql 是否包含该表的 CREATE TABLE 定义', severity: 'blocking', confidence: 0.95, verifyAction: '检查 schema.sql 和 migrations/ 目录下的所有 SQL 文件', relatedTool: 'debug_investigate', suggestedCode: 'grep -rn "CREATE TABLE.*tablename" infra/postgres/ services/gateway/migrations/' },
          { suggestion: '从代码仓库的 INSERT SQL 中提取表结构定义', severity: 'critical', confidence: 0.85, verifyAction: '查找代码中该表的 INSERT/REFERENCES 推断列定义', relatedTool: 'debug_investigate', suggestedCode: 'grep -rn "tablename" app/*.py | grep -i "INSERT\|SELECT.*FROM" | head -5' },
          { suggestion: '创建缺失的表并补充外键约束', severity: 'critical', confidence: 0.8, verifyAction: '执行 CREATE TABLE IF NOT EXISTS 创建表', relatedTool: 'debug_investigate', suggestedCode: 'CREATE TABLE IF NOT EXISTS tablename (id VARCHAR(64) PRIMARY KEY, tenant_id VARCHAR(64) NOT NULL, ...);' }
        ]
      },
      // sql_schema_syntax — SQL schema 语法错误（DEFAULT 缺引号、逗号缺失等）
      {
        name: 'sql_schema_syntax',
        match: /syntax error at or near|语法错误|DEFAULT.*community|DEFAULT\[^'\].*[^']|missing comma|SYNTAX_ERROR/i,
        suggestions: [
          { suggestion: '检查所有 DEFAULT 值是否被单引号包裹（如 DEFAULT \'value\' 而非 DEFAULT value）', severity: 'blocking', confidence: 0.9, verifyAction: '用 grep 扫描 schema.sql 中所有 DEFAULT 关键字', relatedTool: 'debug_investigate', suggestedCode: 'grep -n "^[[:space:]]*[a-z].*DEFAULT " schema.sql | grep -v "DEFAULT \'"' },
          { suggestion: '检查每一列定义末尾是否有关键缺失的逗号', severity: 'critical', confidence: 0.85, verifyAction: '逐行检查 CREATE TABLE 中列定义间的逗号', relatedTool: 'debug_investigate', suggestedCode: '-- 上一行以逗号结尾, 下一行是另一列定义' },
          { suggestion: '使用 docker exec psql -f schema.sql 单独测试 schema 文件', severity: 'critical', confidence: 0.9, verifyAction: '单独执行 schema 文件查看具体错误行号', relatedTool: 'debug_investigate', suggestedCode: 'docker exec postgres psql -U user -d db -f /path/to/schema.sql 2>&1 | head -20' }
        ]
      },
      // sql_migration_not_applied — Migration 文件存在但未执行
      {
        name: 'sql_migration_not_applied',
        match: /migration.*not applied|应用迁移|_migrations|迁移.*未|schema.*outdated|schema.*stale/i,
        suggestions: [
          { suggestion: '检查 _migrations 表确认已应用的迁移版本', severity: 'blocking', confidence: 0.9, verifyAction: '查询 _migrations 表对比 migrations/ 目录中的文件', relatedTool: 'debug_investigate', suggestedCode: 'SELECT version FROM _migrations ORDER BY version;' },
          { suggestion: '检查 migrations 目录中的 SQL 文件是否多于 _migrations 记录', severity: 'critical', confidence: 0.85, verifyAction: '对比 ls migrations/ 和 _migrations 表', relatedTool: 'debug_investigate', suggestedCode: 'ls -1 services/gateway/migrations/*.sql | sed "s/.*\\///" | sed "s/\\.sql$//"' },
          { suggestion: '手动执行缺失的迁移文件或重启应用触发迁移', severity: 'critical', confidence: 0.8, verifyAction: 'docker exec psql -f missing_migration.sql', relatedTool: 'debug_investigate', suggestedCode: 'docker exec postgres psql -U user -d db -f migrations/009_missing.sql' }
        ]
      }
    ];

    const matchedPatterns = [];
    let allSuggestions = [];

    for (const pattern of patterns) {
      if (pattern.match.test(lowerText)) {
        matchedPatterns.push(pattern.name);
        allSuggestions = allSuggestions.concat(pattern.suggestions);
      }
    }

    if (matchedPatterns.length === 0) {
      allSuggestions = [
        { suggestion: '使用browser_errors查看完整错误详情', severity: 'general', confidence: 0.7, verifyAction: '调用browser_errors获取完整错误列表', relatedTool: 'browser_errors' },
        { suggestion: '检查浏览器控制台输出', severity: 'general', confidence: 0.6, verifyAction: '使用browser_console查看控制台日志', relatedTool: 'browser_console' },
        { suggestion: '使用browser_diagnose进行综合诊断', severity: 'general', confidence: 0.5, verifyAction: '调用browser_diagnose获取页面健康报告', relatedTool: 'browser_diagnose' }
      ];
    }

    const sortedSuggestions = allSuggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxSuggestions);

    const result = {
      errorSummary,
      matchedPatterns,
      suggestions: sortedSuggestions,
      totalSuggestions: sortedSuggestions.length,
      generatedAt: new Date().toISOString()
    };

    return text(JSON.stringify(result, null, 2));
  }

  // ====== error_summary_md ======
  if (name === 'error_summary_md') {
const evidence = args.evidence || (await evidenceCollector.collectEvidence(args)).evidence;
    return text(errorAggregator.errorSummaryMd(evidence, args));
  }

  // ====== debug_investigate ======
  if (name === 'debug_investigate') {
const { target } = await ensurePage(args);
    const investigation = await investigateDebug(target, args);
    return text(JSON.stringify(investigation, null, 2));
  }

  return { isError: true, content: [{ type: 'text', text: `未知工具（diagnose）: ${name}` }] };
  } finally {
    for (const k of _depsKeys) { deps[k] = globalThis[k]; }
    for (const k of _depsKeys) { if (k in _depsPrev) globalThis[k] = _depsPrev[k]; else delete globalThis[k]; }
  }

}

module.exports = { tools, handle };
