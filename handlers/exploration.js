'use strict';

/**
 * exploration_quick — 开源版前端浅层探索引擎
 *
 * 6 阶段自动探索（纯浏览器沙箱内完成）：
 *   Phase1 导航+快照 → Phase2 端点提取 → Phase3 技术栈指纹
 *   Phase4 路由发现 → Phase5 表单检测 → Phase6 报告聚合
 *
 * 不需要后端权限，不依赖 Premium 工具。
 * 深度跨层分析（Fuzz/IDOR/DB）留给 Premium 升级。
 *
 * 数据保护（防泄密）：
 *   - 端点 URL 参数中 token/secret/key 自动脱敏
 *   - endpoint 详情 headers/body 递归 redact
 *   - console/error 文本脱敏
 *   - redactedCount 标记（不是真实数量）
 */

const { redact, redactString } = require('../core/redaction');

const tools = [
  'exploration_quick',
  'business_loop_validate'
];

async function handle(name, args, deps) {
  const { text, log, resetRuntimeLogs, ensurePage } = deps;

    if (name === 'exploration_quick') {
      return await explorationQuick(args, deps);
    }
    if (name === 'business_loop_validate') {
      return await businessLoopValidate(args, deps);
    }
    return { isError: true, content: [{ type: 'text', text: `未知工具：${name}` }] };}

/**
 * 探索主入口
 * @param {object} args - { target (url), depth (1-3), mode ('basic'|'full') }
 * @param {object} deps - 来自 server.js 的依赖注入
 */
async function explorationQuick(args, deps) {
  const targetUrl = args.target || args.url;
  if (!targetUrl) {
    return { isError: true, content: [{ type: 'text', text: '缺少 target 参数（待探索的页面 URL）' }] };
  }

  const depth = Math.min(Math.max(args.depth || 2, 1), 3);
  const mode = args.mode || 'full';
  const startTime = Date.now();

  const findings = {
    target: targetUrl,
    depth,
    mode,
    phases: {},
    summary: {}
  };

  log('INFO', `[Exploration] 开始探索 ${targetUrl} (depth=${depth})`);

  try {
    // ====== Phase 1: 导航 + DOM 快照 ======
    const startCheckpoint = deps.currentCheckpoint || new Date().toISOString();
    log('INFO', '[Exploration] Phase 1: 导航 + DOM 快照');

    const { target } = await ensurePage();
    await target.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await target.waitForTimeout(2000);

    // 更新 checkpoint（导航后）
    deps.currentCheckpoint = new Date().toISOString();
    if (deps.stateManager) deps.stateManager.currentCheckpoint = deps.currentCheckpoint;

    const pageTitle = await target.title();
    const pageUrl = target.url();

    let domSummary = { elements: 0, forms: 0, buttons: 0, links: 0, images: 0, inputs: [] };
    try {
      domSummary = await target.evaluate(() => {
        return {
          elements: document.querySelectorAll('*').length,
          forms: document.querySelectorAll('form').length,
          buttons: document.querySelectorAll('button, input[type=submit], input[type=button]').length,
          links: document.querySelectorAll('a[href]').length,
          images: document.querySelectorAll('img').length,
          inputs: Array.from(document.querySelectorAll('input,select,textarea')).map(el => ({
            tag: el.tagName.toLowerCase(),
            type: el.type || '',
            name: el.name || '',
            id: el.id || '',
            placeholder: (el.placeholder || '').slice(0, 50),
            required: el.required || false,
            visible: el.offsetParent !== null
          }))
        };
      });
    } catch (_) {}

    findings.phases.navigate = {
      url: pageUrl,
      title: pageTitle,
      dom: domSummary,
      timestamp: new Date().toISOString()
    };
    log('INFO', `[Exploration] 页面已加载: ${pageTitle} (${domSummary.elements} 元素, ${domSummary.inputs.length} 输入)`);

    // ====== Phase 2: 端点提取 ======
    log('INFO', '[Exploration] Phase 2: 端点提取');

    // 2a: 从 network 日志提取 API 模式
    const allNetwork = deps.networkLogs || [];
    // 使用导航前 checkpoint，因为网络请求发生在导航期间
    const filteredNetwork = deps.stateManager
      ? deps.stateManager.filterBySince(allNetwork, { since: startCheckpoint, currentOnly: false })
      : allNetwork;

    const apiPatterns = new Set();
    const fullEndpoints = [];
    for (const entry of filteredNetwork) {
      const url = entry.url;
      if (!url) continue;

      // 过滤静态资源 + Vite HMR 源码模块
      if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|tsx?|jsx?|vue|svelte|mjs|webp|avif|mp4|webm)(\?|$)/i.test(url)) continue;
      if (/\/@(vite|react-refresh|fs)(\/|$)/.test(url)) continue;
      if (/\/node_modules\//.test(url)) continue;
      if (url.includes('google-analytics') || url.includes('gtag')) continue;

      // API 模式归一化时额外脱敏敏感参数
      let dirtyUrl = url;
      dirtyUrl = dirtyUrl.replace(/([?&])(token|secret|apikey|api_key|key|auth|password|pass)=([^&]*)/gi, '$1$2={REDACTED}');

      fullEndpoints.push(redact({
        url: dirtyUrl,
        method: entry.method || 'GET',
        status: entry.status,
        type: entry.resourceType || '',
        size: entry.transferSize || 0
      }));

      const pathMatch = dirtyUrl.match(/https?:\/\/[^\/]+(\/[^?#]*)/);
      if (pathMatch) {
        const path = pathMatch[1];
        const pattern = path
          .replace(/\/\d+(\/|$|\?)/g, '/{id}$1')
          .replace(/\/[a-f0-9]{24,}(\/|$|\?)/g, '/{hash}$1')
          .replace(/\/[a-f0-9-]{36}(\/|$|\?)/g, '/{uuid}$1')
          .replace(/timestamp=\d+/g, 'timestamp={ts}')
          .replace(/token=[^&]*/g, 'token={token}')
          .replace(/=\d{6,}/g, '={id}');
        apiPatterns.add(pattern);
      }
    }

    findings.phases.endpoints = {
      apiPatterns: [...apiPatterns],
      totalRequests: allNetwork.length,
      currentRequests: filteredNetwork.length,
      endpoints: fullEndpoints.slice(0, 50)
    };
    log('INFO', `[Exploration] 发现 ${fullEndpoints.length} 个请求，${apiPatterns.size} 个 API 模式`);

    // ====== Phase 3: 技术栈指纹 ======
    log('INFO', '[Exploration] Phase 3: 技术栈指纹');
    const techStack = await detectTechStack(target);
    findings.phases.techStack = techStack;
    log('INFO', `[Exploration] 技术栈: ${JSON.stringify(techStack.frameworks)}`);

    // ====== Phase 4: SPA 路由发现 ======
    log('INFO', '[Exploration] Phase 4: SPA 路由发现');
    const routes = await discoverRoutes(target, filteredNetwork, depth);
    findings.phases.routes = routes;
    log('INFO', `[Exploration] 路由: ${routes.routes.length} 条`);

    // ====== Phase 5: 表单检测 ======
    log('INFO', '[Exploration] Phase 5: 表单检测');
    const forms = await detectForms(target, domSummary);
    findings.phases.forms = forms;
    log('INFO', `[Exploration] 表单: ${forms.forms.length} 个`);

    // ====== Phase 6: 报告聚合 ======
    const consoleErrors = await detectConsoleErrors(deps, startCheckpoint);

    findings.summary = {
      url: pageUrl,
      title: pageTitle,
      domElements: domSummary.elements,
      apiEndpoints: fullEndpoints.length,
      apiPatterns: apiPatterns.size,
      frameworks: techStack.frameworks,
      routes: routes.routes.length,
      forms: forms.forms.length,
      consoleErrors: consoleErrors.length,
      duration_ms: Date.now() - startTime,
      explorationCheckpoint: new Date().toISOString()
    };

    // 付费升级提示（数据驱动，只在发现高价值线索时触发）
    const premiumHints = buildPremiumHints(findings);

    log('INFO', `[Exploration] 完成: ${findings.summary.apiPatterns} API 模式, ${findings.summary.routes} 路由, ${techStack.frameworks.length} 框架, ${consoleErrors.length} 错误, ${Date.now() - startTime}ms`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          ...findings,
          premiumHints: premiumHints.length > 0 ? premiumHints : undefined
        }, null, 2)
      }]
    };

  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: `探索失败: ${error.message}` }],
      exploration: { target: targetUrl, error: error.message, timestamp: new Date().toISOString() }
    };
  }
}

// ====== 子阶段实现 ======

/**
 * Phase 3: 技术栈检测
 */
async function detectTechStack(page) {
  const result = {
    frameworks: [],
    buildTools: [],
    uiLibraries: [],
    stateManagement: [],
    runtime: [],
    meta: [],
    detected: false
  };

  try {
    const info = await page.evaluate(() => {
      const detected = {
        frameworks: [],
        buildTools: [],
        uiLibraries: [],
        stateManagement: [],
        runtime: [],
        meta: []
      };

      // Vue 先检测，防止 #app 误触发 React
      const hasVueDevtools = typeof window.__VUE_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined';
      const hasVueAttr = document.querySelector('[data-v-]') || document.querySelector('[data-v-');
      const hasVueScript = document.querySelector('script[src*="vue"]');
      if (typeof window.__VUE__ !== 'undefined' || hasVueDevtools || hasVueAttr || hasVueScript ||
          (document.querySelector('#app') && document.querySelector('script[src*="vue"]'))) {
        detected.frameworks.push('Vue.js');
        if (window.__VUE_VERSION__) detected.frameworks.push(`Vue ${window.__VUE_VERSION__}`);
        else if (hasVueScript) detected.frameworks.push('Vue (检测到 vue script)');
      }
      if (document.querySelector('script[src*="vue@3"]') || document.querySelector('script[src*="vue.runtime"]')) {
        if (!detected.frameworks.some(f => f.includes('Vue'))) detected.frameworks.push('Vue.js');
      }

      // React (Vue 已匹配时不基于 #app 添加 React)
      const hasVueDetected = detected.frameworks.some(f => f.includes('Vue'));
      const hasReactRoot = document.querySelector('#root') || (!hasVueDetected && document.querySelector('#app'));
      const hasReactData = document.querySelector('[data-reactroot]') || document.querySelector('[data-react-root]');
      const hasReactDevtools = typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined';
      const hasReactScript = document.querySelector('script[src*="react"]');
      const hasReactDom = typeof window.ReactDOM !== 'undefined' || typeof window.React !== 'undefined';
      if (hasReactDom || hasReactDevtools || hasReactData || hasReactRoot || hasReactScript) {
        detected.frameworks.push('React');
        if (window.React && window.React.version) detected.frameworks.push(`React ${window.React.version}`);
      }

      // Alpine.js (x-data / x-show / x-on: 属性)
      if (document.querySelector('[x-data]') || document.querySelector('[x-show]') || document.querySelector('[x-on\\:]')) {
        if (!detected.frameworks.includes('Alpine.js')) detected.frameworks.push('Alpine.js');
      }

      // Angular
      if (document.querySelector('[ng-version]') || document.querySelector('[ng-app]') ||
          document.querySelector('script[src*="angular"]') ||
          typeof window.ng !== 'undefined') {
        detected.frameworks.push('Angular');
      }

      // Svelte
      if (document.querySelector('script[src*="svelte"]') ||
          document.querySelector('[class*="svelte-"]')) {
        detected.frameworks.push('Svelte');
      }

      // jQuery
      if (typeof window.jQuery !== 'undefined') {
        const ver = window.jQuery.fn ? window.jQuery.fn.jquery : '';
        detected.frameworks.push(ver ? `jQuery ${ver}` : 'jQuery');
      }

      // Meta generator
      const generator = document.querySelector('meta[name="generator"]');
      if (generator) detected.meta.push(generator.content);

      // Build tools
      if (typeof window.__vite_ping_timeout !== 'undefined' ||
          document.querySelector('script[src*="vite"]') ||
          document.querySelector('script[src*="@vite"]') ||
          document.querySelector('script[type="module"]')) {
        detected.buildTools.push('Vite');
      }
      if (typeof window.__webpack_hash__ !== 'undefined' ||
          document.querySelector('script[src*="webpack"]')) {
        detected.buildTools.push('Webpack');
      }

      // UI Libraries — 用已知组件类名精确匹配（防止 hash 子串误触发）
      const uiChecks = [
        { selector: '[class*="ant-btn"], [class*="ant-input"], [class*="ant-table"], [class*="ant-modal"], [class*="ant-form"]', name: 'Ant Design' },
        { selector: '[class*="el-button"], [class*="el-input"], [class*="el-table"], [class*="el-dialog"], [class*="el-form"]', name: 'Element UI' },
        { selector: '[class*="arco-btn"], [class*="arco-input"], [class*="arco-table"], [class*="arco-modal"], [class*="arco-form"]', name: 'Arco Design' },
        { selector: '[class*="mdui-btn"], [class*="mdui-textfield"], [class*="mdui-list"]', name: 'MDUI' }
      ];
      let anyMatched = false;
      for (const { selector, name } of uiChecks) {
        if (document.querySelector(selector)) {
          detected.uiLibraries.push(name);
          anyMatched = true;
        }
      }
      // Tailwind — 检测大量工具类模式
      if (!anyMatched) {
        try {
          const allClasses = Array.from(document.querySelectorAll('[class]'))
            .map(e => e.className).filter(Boolean).join(' ').slice(0, 3000);
          const twPatterns = [/\.?\b(flex|grid|hidden|block|inline|relative|absolute|fixed)\b/g,
            /\b(w-\d+|h-\d+|p-\d+|m-\d+|px-\d+|py-\d+|mx-\d+|my-\d+)\b/g,
            /\b(text-\w+|bg-\w+|border-\w+|rounded-\w+|shadow-\w+)\b/g];
          let twMatches = 0;
          for (const pat of twPatterns) {
            const m = allClasses.match(pat);
            if (m) twMatches += m.length;
          }
          if (twMatches > 3) detected.uiLibraries.push('Tailwind CSS');
        } catch (_) {}
      }

      // State management
      if (typeof window.__REDUX_DEVTOOLS_EXTENSION__ !== 'undefined') detected.stateManagement.push('Redux');
      if (typeof window.__ZUSTAND_DEVTOOLS__ !== 'undefined') detected.stateManagement.push('Zustand');
      if (typeof window.__PINIA_DEVTOOLS__ !== 'undefined') detected.stateManagement.push('Pinia');
      if (typeof window.__MOBX_DEVTOOLS__ !== 'undefined') detected.stateManagement.push('MobX');

      // i18n
      if (typeof window.__VUE_I18N__ !== 'undefined') detected.runtime.push('vue-i18n');
      if (typeof window.i18next !== 'undefined') detected.runtime.push('i18next');

      // Axios / fetch wrapper
      if (typeof window.axios !== 'undefined') detected.runtime.push('axios');

      return detected;
    });

    Object.assign(result, info);
    result.detected = result.frameworks.length > 0 || result.buildTools.length > 0;
  } catch (_) {}

  return result;
}

/**
 * Phase 4: SPA 路由发现
 * 从 script src 和 inline JS 中提取路由路径
 */
async function discoverRoutes(page, networkLogs, depth) {
  const result = {
    routes: [],
    sources: [],
    method: 'script_analysis'
  };

  try {
    // 从 network 中的 JS 文件提取路由线索
    const jsFiles = networkLogs
      .filter(e => e.url && /\.js(\?|$)/i.test(e.url) && !e.url.includes('node_modules'))
      .map(e => e.url)
      .slice(0, 10);

    result.sources = jsFiles;

    // 路由提取：从 DOM 中提取导航链接 + 从 eval 提取路由列表
    const routeInfo = await page.evaluate(() => {
      const routes = new Set();

      // 1. 从 DOM 导航提取
      const navLinks = document.querySelectorAll('nav a[href], [class*="nav"] a[href], [class*="menu"] a[href], [class*="sidebar"] a[href], [class*="tab"] a[href]');
      for (const a of navLinks) {
        const href = a.getAttribute('href');
        if (href && href !== '#' && !href.startsWith('http') && !href.startsWith('//') && !href.startsWith('javascript:')) {
          routes.add(href);
        }
      }

      // 2. 从 data-view / data-route 属性提取
      const dataRoutes = document.querySelectorAll('[data-view], [data-route], [data-path]');
      for (const el of dataRoutes) {
        const val = el.getAttribute('data-view') || el.getAttribute('data-route') || el.getAttribute('data-path');
        if (val) routes.add('/' + val.replace(/^\//, ''));
      }

      // 3. 从 SPA 容器中找出路由组件名
      const appRoot = document.querySelector('#app, #root, [data-app], [ng-app]');
      const componentNames = [];
      if (appRoot) {
        const components = appRoot.querySelectorAll('[data-component], [class*="page"], [class*="view"], [class*="route"]');
        for (const c of components) {
          const cls = c.className;
          if (typeof cls === 'string') {
            const match = cls.match(/(?:page|view|route)[-_](\w+)/i);
            if (match) componentNames.push(match[1]);
          }
        }
      }

      return { routes: [...routes], componentNames };
    });

    result.routes = routeInfo.routes;
    result.componentNames = routeInfo.componentNames;

  } catch (_) {}

  return result;
}

/**
 * Phase 5: 表单检测
 */
async function detectForms(page, domSummary) {
  const result = {
    forms: [],
    totalInputs: domSummary.inputs?.length || 0
  };

  try {
    const formInfo = await page.evaluate(() => {
      const forms = [];
      const formElements = document.querySelectorAll('form');
      for (const form of formElements) {
        if (form.offsetParent === null) continue; // 不可见

        const inputs = Array.from(form.querySelectorAll('input,select,textarea')).map(el => ({
          name: el.name || '',
          type: el.type || '',
          placeholder: (el.placeholder || '').slice(0, 30),
          required: el.required || false
        }));

        forms.push({
          action: form.action || '',
          method: (form.method || 'get').toUpperCase(),
          inputs,
          inputCount: inputs.length,
          hasPassword: inputs.some(i => i.type === 'password'),
          hasEmail: inputs.some(i => i.type === 'email'),
          hasSubmit: form.querySelector('button[type=submit], input[type=submit]') !== null
        });
      }

      // 无 form 标签但有输入组的场景
      if (forms.length === 0) {
        const inputs = document.querySelectorAll('input:not([type=hidden])');
        if (inputs.length > 0) {
          const hasPassword = Array.from(inputs).some(i => i.type === 'password');
          const hasEmail = Array.from(inputs).some(i => i.type === 'email' || i.name?.includes('email'));
          const hasSubmit = document.querySelector('button[type=submit], input[type=submit], button:not([type])') !== null;

          forms.push({
            action: 'inline',
            method: 'POST',
            inputs: Array.from(inputs).map(el => ({
              name: el.name || '',
              type: el.type || '',
              placeholder: (el.placeholder || '').slice(0, 30),
              required: el.required || false
            })),
            inputCount: inputs.length,
            hasPassword,
            hasEmail,
            hasSubmit,
            note: '无 <form> 标签，自动检测输入组'
          });
        }
      }

      return { forms };
    });

    result.forms = formInfo.forms;

  } catch (_) {}

  return result;
}

/**
 * 控制台错误检测
 */
async function detectConsoleErrors(deps, checkpoint) {
  const consoleLogs = deps.consoleLogs || [];
  const filtered = deps.stateManager
    ? deps.stateManager.filterBySince(consoleLogs, { since: checkpoint })
    : consoleLogs;

  return filtered
    .filter(item => item.type === 'error')
    .map(item => ({
      text: redactString((item.text || '').slice(0, 200)),
      timestamp: item.timestamp
    }));
}

/**
 * 构建 Premium 升级提示
 * 只在发现高价值线索时触发
 */
function buildPremiumHints(findings) {
  const hints = [];

  const apiCount = findings.phases.endpoints?.apiPatterns?.length || 0;
  const formCount = findings.phases.forms?.forms?.length || 0;
  const errorCount = findings.summary?.consoleErrors || 0;

  if (apiCount > 5) {
    hints.push({
      type: 'api_fuzz',
      message: `发现 ${apiCount} 个 API 端点。升级 Pro 解锁参数 Fuzz 注入探测（SQLi/XSS/IDOR）`,
      tier: 'pro'
    });
  }

  if (formCount > 0) {
    hints.push({
      type: 'form_fuzz',
      message: `发现 ${formCount} 个表单。升级 Pro 解锁自动化表单模糊测试（25+ 注入 payload）`,
      tier: 'pro'
    });
  }

  if (errorCount > 0) {
    hints.push({
      type: 'error_investigation',
      message: `发现 ${errorCount} 个控制台错误。升级 Pro 解锁 ATL 假设驱动调试引擎`,
      tier: 'pro'
    });
  }

  if (apiCount > 10 || findings.phases.techStack?.frameworks?.length > 2) {
    hints.push({
      type: 'cross_layer',
      message: `复杂技术栈 + 大量 API。升级 Team 解锁跨层 Pivot（DB/SSH/Infra 关联分析）`,
      tier: 'team'
    });
  }

  return hints;
}

// ============================================================
// business_loop_validate — 业务闭环验证
// ============================================================

/**
 * 业务节点识别规则库
 * 每个节点通过 URL 关键词、DOM 选择器、文本关键词三重信号识别
 */
const BUSINESS_NODE_SIGNATURES = {
  lead_capture: {
    name: '留资/获客',
    urlPatterns: [/\/contact/i, /\/lead/i, /\/inquiry/i, /\/consult/i, /\/reserve/i, /\/booking/i, /\/subscribe/i, /\/demo/i, /\/quote/i, /\/liuyan/i, /\/baoming/i],
    domSelectors: ['form[id*="contact"]', 'form[id*="lead"]', 'form[class*="contact"]', 'form[class*="lead"]', 'input[name="phone"]', 'input[name="mobile"]', 'input[name="email"]', 'textarea[name="message"]'],
    textKeywords: ['联系我们', '预约', '咨询', '留言', '报名', '获取报价', '预约演示', '联系销售', 'submit', 'contact us', 'get quote', 'book a demo'],
    apiPatterns: [/\/api\/.*lead/i, /\/api\/.*contact/i, /\/api\/.*inquiry/i, /\/api\/.*consult/i, /\/api\/.*subscribe/i, /\/api\/.*booking/i],
    expectedFields: ['phone', 'email', 'name', 'message']
  },
  product_browse: {
    name: '商品浏览',
    urlPatterns: [/\/product/i, /\/item/i, /\/goods/i, /\/shop/i, /\/category/i, /\/list/i, /\/detail/i, /\/p\//i],
    domSelectors: ['.product', '.goods', '.item-card', '.product-list', '[class*="product"]', '[class*="goods"]', 'article.product', '.card'],
    textKeywords: ['商品', '产品', '详情', '加入购物车', '立即购买', 'add to cart', 'buy now', 'shop now', 'view details'],
    apiPatterns: [/\/api\/.*product/i, /\/api\/.*goods/i, /\/api\/.*item/i, /\/api\/.*category/i, /\/api\/.*list/i],
    expectedFields: []
  },
  cart: {
    name: '购物车',
    urlPatterns: [/\/cart/i, /\/basket/i, /\/shopping/i, /\/gouwuche/i],
    domSelectors: ['.cart', '#cart', '[class*="cart"]', '[id*="cart"]', '.cart-list', '.cart-item'],
    textKeywords: ['购物车', '购物篮', 'your cart', 'shopping cart', 'checkout', '去结算', '清空购物车', '继续购物'],
    apiPatterns: [/\/api\/.*cart/i, /\/api\/.*basket/i],
    expectedFields: []
  },
  checkout: {
    name: '下单结算',
    urlPatterns: [/\/checkout/i, /\/order/i, /\/settle/i, /\/pay/i, /\/confirm/i, /\/jiesuan/i],
    domSelectors: ['.checkout', '#checkout', '[class*="checkout"]', 'form[id*="order"]', 'form[id*="checkout"]', '.order-confirm', '.settlement'],
    textKeywords: ['结算', '下单', '确认订单', '提交订单', 'checkout', 'place order', 'confirm order', 'complete order'],
    apiPatterns: [/\/api\/.*order/i, /\/api\/.*checkout/i, /\/api\/.*settle/i, /\/api\/.*pay/i, /\/api\/.*confirm/i],
    expectedFields: ['address', 'phone', 'name']
  },
  payment: {
    name: '支付',
    urlPatterns: [/\/payment/i, /\/pay/i, /\/alipay/i, /\/wechat.*pay/i, /\/stripe/i, /\/zhifu/i],
    domSelectors: ['.payment', '#payment', '[class*="payment"]', '.pay-method', '.pay-button', 'form[id*="pay"]'],
    textKeywords: ['支付', '付款', '微信支付', '支付宝', '银联', '信用卡', 'pay', 'payment method', 'complete payment', '立即支付'],
    apiPatterns: [/\/api\/.*pay/i, /\/api\/.*payment/i, /\/api\/.*alipay/i, /\/api\/.*wechat.*pay/i, /\/api\/.*stripe/i],
    expectedFields: []
  },
  account: {
    name: '账户',
    urlPatterns: [/\/login/i, /\/register/i, /\/signup/i, /\/profile/i, /\/account/i, /\/user/i, /\/member/i, /\/dashboard/i],
    domSelectors: ['form[id*="login"]', 'form[id*="register"]', 'form[id*="signup"]', 'input[type="password"]', '.login-form', '.register-form', '.user-profile', '.dashboard'],
    textKeywords: ['登录', '注册', '签到', '账户', '个人中心', '我的', 'login', 'sign in', 'sign up', 'register', 'my account', 'dashboard', 'logout'],
    apiPatterns: [/\/api\/.*login/i, /\/api\/.*register/i, /\/api\/.*signup/i, /\/api\/.*user/i, /\/api\/.*profile/i, /\/api\/.*account/i, /\/api\/.*auth/i],
    expectedFields: ['email', 'password']
  }
};

/**
 * 业务闭环节点顺序定义
 */
const LOOP_DEFINITIONS = {
  ecommerce: {
    name: '电商闭环',
    nodes: ['product_browse', 'cart', 'checkout', 'payment'],
    description: '商品浏览 → 加入购物车 → 下单结算 → 支付'
  },
  lead_gen: {
    name: '留资闭环',
    nodes: ['lead_capture'],
    description: '访问 → 填写表单 → 提交留资'
  },
  saas_signup: {
    name: 'SaaS注册闭环',
    nodes: ['account', 'lead_capture'],
    description: '访问 → 注册账户 → 完善信息'
  },
  content_publish: {
    name: '内容发布闭环',
    nodes: ['account', 'lead_capture'],
    description: '访问 → 登录 → 发布内容'
  }
};

/**
 * 业务闭环验证主函数
 */
async function businessLoopValidate(args, deps) {
  const targetUrl = args.target || args.url;
  if (!targetUrl) {
    return { isError: true, content: [{ type: 'text', text: '缺少 target 参数' }] };
  }

  const depth = Math.min(Math.max(args.depth || 2, 1), 3);
  const checkForm = args.checkForm !== false;
  const checkNetwork = args.checkNetwork !== false;
  const maxSteps = args.maxSteps || 15;
  let loopType = args.loop || 'auto';

  log('INFO', `[BusinessLoop] 开始验证 ${targetUrl} (loop=${loopType}, depth=${depth})`);

  const result = {
    success: true,
    target: targetUrl,
    loopType: null,
    nodes: [],
    flow: { complete: false, missingNodes: [], brokenLinks: [], orderCorrect: true },
    issues: [],
    summary: { totalNodes: 0, foundNodes: 0, missingNodes: 0, issuesCount: 0, blockingIssues: 0, completeness: 0 }
  };

  try {
    const { target } = await ensurePage();
    await target.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await target.waitForTimeout(1500);

    // ====== Phase 1: 当前页面节点识别 ======
    const pageUrl = target.url();
    const pageTitle = await target.title().catch(() => '');

    log('INFO', `[BusinessLoop] Phase 1: 识别当前页面节点 (${pageUrl})`);

    const pageAnalysis = await analyzePageForBusinessNodes(target, pageUrl, pageTitle, checkForm, checkNetwork);

    // ====== Phase 2: 自动判定业务闭环类型 ======
    if (loopType === 'auto') {
      loopType = detectLoopType(pageAnalysis);
      log('INFO', `[BusinessLoop] 自动识别闭环类型: ${loopType}`);
    }
    result.loopType = loopType;

    const loopDef = LOOP_DEFINITIONS[loopType] || LOOP_DEFINITIONS.ecommerce;
    result.summary.totalNodes = loopDef.nodes.length;

    // ====== Phase 3: 收集所有节点信息 ======
    const foundNodes = new Set();

    // 当前页面识别到的节点
    for (const node of pageAnalysis.nodes) {
      if (loopDef.nodes.includes(node.type)) {
        foundNodes.add(node.type);
        result.nodes.push(node);
      }
    }

    // ====== Phase 4: 深度探测（depth >= 2）=====
    if (depth >= 2) {
      log('INFO', `[BusinessLoop] Phase 4: 深度探测（跟随 CTA，最多 ${maxSteps} 步）`);

      const ctaLinks = await extractCTALinks(target);
      const visitedUrls = new Set([pageUrl]);
      let stepsUsed = pageAnalysis.nodes.length > 0 ? 1 : 0;

      for (const cta of ctaLinks) {
        if (stepsUsed >= maxSteps) break;
        if (visitedUrls.has(cta.url)) continue;

        const missingTypes = loopDef.nodes.filter(n => !foundNodes.has(n));
        if (missingTypes.length === 0) break;

        // 只访问可能包含缺失节点的 URL
        const ctaAnalysis = analyzeUrlForNodeTypes(cta.url);
        if (!ctaAnalysis.some(t => missingTypes.includes(t))) continue;

        log('INFO', `[BusinessLoop] 访问 CTA: ${cta.url} (文本: ${cta.text})`);
        visitedUrls.add(cta.url);

        try {
          await target.goto(cta.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await target.waitForTimeout(1000);
          stepsUsed++;

          const ctaPageUrl = target.url();
          const ctaPageTitle = await target.title().catch(() => '');
          const ctaResult = await analyzePageForBusinessNodes(target, ctaPageUrl, ctaPageTitle, checkForm, checkNetwork);

          for (const node of ctaResult.nodes) {
            if (loopDef.nodes.includes(node.type) && !foundNodes.has(node.type)) {
              foundNodes.add(node.type);
              result.nodes.push(node);
            }
          }

          // 检查此页面是否报错（broken link）
          if (ctaPageTitle.includes('404') || ctaPageTitle.toLowerCase().includes('not found')) {
            result.flow.brokenLinks.push(`${cta.url} (404)`);
            result.issues.push({
              severity: 'major',
              node: cta.text,
              message: `CTA 链接 ${cta.url} 返回 404`
            });
          }
        } catch (e) {
          result.flow.brokenLinks.push(`${cta.url} (${e.message.slice(0, 50)})`);
          result.issues.push({
            severity: 'warning',
            node: cta.text,
            message: `无法访问 ${cta.url}: ${e.message.slice(0, 80)}`
          });
        }
      }
    }

    // ====== Phase 5: 流程连贯性分析 ======
    result.flow.missingNodes = loopDef.nodes.filter(n => !foundNodes.has(n));
    result.flow.complete = result.flow.missingNodes.length === 0;

    // 检查节点顺序（根据 URL 或页面转换）
    if (result.nodes.length >= 2) {
      const foundOrder = result.nodes.map(n => n.type);
      const expectedOrder = loopDef.nodes.filter(n => foundNodes.has(n));
      result.flow.orderCorrect = JSON.stringify(foundOrder) === JSON.stringify(expectedOrder);
      if (!result.flow.orderCorrect) {
        result.issues.push({
          severity: 'warning',
          node: 'flow',
          message: `节点顺序异常：实际 ${foundOrder.join('→')}，期望 ${expectedOrder.join('→')}`
        });
      }
    }

    // ====== Phase 6: 节点级问题检测 ======
    for (const node of result.nodes) {
      // 表单字段缺失检测
      if (checkForm && node.formFields && node.formFields.length === 0) {
        const sig = BUSINESS_NODE_SIGNATURES[node.type];
        if (sig && sig.expectedFields.length > 0) {
          result.issues.push({
            severity: 'warning',
            node: node.type,
            message: `${sig.name}节点缺少表单字段（期望: ${sig.expectedFields.join(', ')}）`
          });
        }
      }

      // 节点置信度低
      if (node.confidence < 0.4) {
        result.issues.push({
          severity: 'info',
          node: node.type,
          message: `${BUSINESS_NODE_SIGNATURES[node.type]?.name || node.type} 节点置信度低 (0.${Math.floor(node.confidence * 100)})`
        });
      }
    }

    // 缺失节点阻塞检测
    for (const missing of result.flow.missingNodes) {
      const sig = BUSINESS_NODE_SIGNATURES[missing];
      const isBlocking = (loopType === 'ecommerce' && (missing === 'checkout' || missing === 'payment'));
      result.issues.push({
        severity: isBlocking ? 'blocking' : 'major',
        node: missing,
        message: `未找到${sig?.name || missing}节点 — ${loopDef.description}`
      });
    }

    // ====== Phase 7: 统计汇总 ======
    result.summary.foundNodes = foundNodes.size;
    result.summary.missingNodes = result.flow.missingNodes.length;
    result.summary.issuesCount = result.issues.length;
    result.summary.blockingIssues = result.issues.filter(i => i.severity === 'blocking').length;
    result.summary.completeness = Math.round(
      (foundNodes.size / Math.max(loopDef.nodes.length, 1)) * 100
    );

    result.nextSteps = [
      '使用 browser_form_validate 深入检查表单字段验证规则',
      '使用 browser_chain 自动化测试完整业务流程',
      '使用 exploration_quick 获取页面技术栈和 API 端点',
      result.summary.completeness < 100 ? '使用 browser_smart_fill 自动填充并测试表单提交' : '使用 validation_flow 执行端到端流程验证'
    ];

    result.paidUpgradeHint = result.summary.completeness < 100
      ? `开源版识别到 ${foundNodes.size}/${loopDef.nodes.length} 个业务节点。升级 Pro 启用跨层 Pivot 验证（UI→API→DB 三方数据一致性），升级 Team 解锁自动化端到端流程测试（validation_flow）。`
      : `业务闭环完整。升级 Pro 启用跨层 Pivot 验证（UI 显示 vs API 响应 vs DB 记录三方比对），确保数据一致性。`;

    log('INFO', `[BusinessLoop] 验证完成: ${result.summary.foundNodes}/${result.summary.totalNodes} 节点, 完整度 ${result.summary.completeness}%`);

  } catch (e) {
    result.success = false;
    result.issues.push({
      severity: 'blocking',
      node: 'system',
      message: `验证过程出错: ${e.message}`
    });
    result.summary.blockingIssues = 1;
    result.summary.issuesCount = 1;
  }

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

/**
 * 分析当前页面的业务节点
 */
async function analyzePageForBusinessNodes(page, pageUrl, pageTitle, checkForm, checkNetwork) {
  const nodes = [];

  // DOM 信号收集
  const domSignals = await page.evaluate(() => {
    const signals = {};

    // URL 关键词
    const url = location.href.toLowerCase();
    const path = location.pathname.toLowerCase();

    // 文本关键词扫描（标题 + 按钮 + 链接文本）
    const allText = document.body ? document.body.innerText.toLowerCase() : '';
    const buttonTexts = Array.from(document.querySelectorAll('button, a, input[type="submit"]'))
      .map(el => (el.innerText || el.value || '').toLowerCase().trim())
      .filter(t => t.length > 0 && t.length < 50);

    // 表单字段收集
    const forms = Array.from(document.querySelectorAll('form')).map(form => ({
      id: form.id || '',
      className: form.className || '',
      action: form.action || '',
      fields: Array.from(form.querySelectorAll('input, select, textarea')).map(el => ({
        name: el.name || el.id || '',
        type: el.type || el.tagName.toLowerCase(),
        required: el.required || false
      })).filter(f => f.name)
    }));

    // 按钮文本
    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], .btn, [class*="button"]'))
      .map(el => (el.innerText || el.value || '').trim())
      .filter(t => t.length > 0 && t.length < 50);

    return { url, path, allText: allText.slice(0, 5000), buttonTexts, forms, buttons };
  }).catch(() => ({ url: pageUrl.toLowerCase(), path: '', allText: '', buttonTexts: [], forms: [], buttons: [] }));

  // 网络请求收集
  let apiCalls = [];
  if (checkNetwork && typeof currentNetworkLog !== 'undefined' && Array.isArray(currentNetworkLog)) {
    apiCalls = currentNetworkLog
      .filter(r => r.url && !r.url.includes('data:'))
      .map(r => redactString(r.url || ''))
      .slice(-50);
  }

  // 对每个节点类型进行匹配
  for (const [nodeType, sig] of Object.entries(BUSINESS_NODE_SIGNATURES)) {
    const evidence = [];
    let confidence = 0;

    // URL 模式匹配
    const urlMatch = sig.urlPatterns.some(p => p.test(domSignals.url) || p.test(domSignals.path));
    if (urlMatch) {
      evidence.push(`URL 匹配: ${domSignals.url}`);
      confidence += 0.4;
    }

    // DOM 选择器匹配
    for (const selector of sig.domSelectors) {
      try {
        const found = await page.locator(selector).first().count();
        if (found > 0) {
          evidence.push(`DOM: ${selector}`);
          confidence += 0.25;
          break;
        }
      } catch (_) {}
    }

    // 文本关键词匹配
    const textMatch = sig.textKeywords.some(kw =>
      domSignals.allText.includes(kw.toLowerCase()) ||
      domSignals.buttonTexts.some(bt => bt.includes(kw.toLowerCase()))
    );
    if (textMatch) {
      const matchedKw = sig.textKeywords.find(kw =>
        domSignals.allText.includes(kw.toLowerCase()) ||
        domSignals.buttonTexts.some(bt => bt.includes(kw.toLowerCase()))
      );
      evidence.push(`文本: "${matchedKw}"`);
      confidence += 0.3;
    }

    // API 调用匹配
    const apiMatch = apiCalls.some(api => sig.apiPatterns.some(p => p.test(api)));
    if (apiMatch) {
      const matchedApi = apiCalls.find(api => sig.apiPatterns.some(p => p.test(api)));
      evidence.push(`API: ${matchedApi}`);
      confidence += 0.3;
    }

    // 置信度归一化
    confidence = Math.min(confidence, 1);

    if (confidence >= 0.25) {
      const node = {
        type: nodeType,
        found: true,
        url: redactString(pageUrl),
        confidence: Number(confidence.toFixed(2)),
        evidence,
        buttons: domSignals.buttons.slice(0, 10),
        apiCalls: apiCalls.slice(0, 10)
      };

      // 表单字段分析
      if (checkForm && sig.expectedFields.length > 0) {
        const relevantForms = domSignals.forms.filter(f =>
          sig.domSelectors.some(s => s.includes(f.id.toLowerCase()) || s.includes(f.className.toLowerCase())) ||
          f.fields.some(field => sig.expectedFields.includes(field.name.toLowerCase()))
        );
        node.formFields = relevantForms.length > 0
          ? relevantForms[0].fields
          : domSignals.forms[0]?.fields || [];
      }

      nodes.push(node);
    }
  }

  return { nodes, pageTitle, url: pageUrl };
}

/**
 * 从 URL 分析可能包含的节点类型（用于 CTA 链接预判）
 */
function analyzeUrlForNodeTypes(url) {
  const types = [];
  const lowerUrl = url.toLowerCase();
  for (const [nodeType, sig] of Object.entries(BUSINESS_NODE_SIGNATURES)) {
    if (sig.urlPatterns.some(p => p.test(lowerUrl))) {
      types.push(nodeType);
    }
  }
  return types;
}

/**
 * 提取页面上的 CTA 链接（导航类按钮/链接）
 */
async function extractCTALinks(page) {
  try {
    return await page.evaluate(() => {
      const links = [];
      const seen = new Set();

      // 优先收集导航类链接
      const navLinks = document.querySelectorAll('nav a, header a, .nav a, .menu a, [class*="nav"] a');
      navLinks.forEach(a => {
        const href = a.href;
        const text = (a.innerText || '').trim();
        if (href && text && !seen.has(href) && !href.startsWith('javascript:') && !href.startsWith('#')) {
          seen.add(href);
          links.push({ url: href, text: text.slice(0, 30) });
        }
      });

      // 补充收集按钮类元素
      const btnLinks = document.querySelectorAll('a[href]:not(nav a):not(header a)');
      btnLinks.forEach(a => {
        const href = a.href;
        const text = (a.innerText || '').trim().toLowerCase();
        // 只收集可能是 CTA 的（包含业务关键词）
        const ctaKeywords = ['login', 'register', 'sign', 'cart', 'checkout', 'buy', 'order', 'pay', 'contact', '登录', '注册', '购物车', '结算', '购买', '下单', '支付', '联系'];
        if (href && text && !seen.has(href) && ctaKeywords.some(kw => text.includes(kw))) {
          seen.add(href);
          links.push({ url: href, text: text.slice(0, 30) });
        }
      });

      return links.slice(0, 20);
    });
  } catch (_) {
    return [];
  }
}

/**
 * 根据页面识别到的节点自动判定业务闭环类型
 */
function detectLoopType(pageAnalysis) {
  const foundTypes = new Set(pageAnalysis.nodes.map(n => n.type));

  // 优先级判定
  if (foundTypes.has('payment') || foundTypes.has('checkout') || foundTypes.has('cart')) {
    return 'ecommerce';
  }
  if (foundTypes.has('lead_capture')) {
    return 'lead_gen';
  }
  if (foundTypes.has('account')) {
    return 'saas_signup';
  }

  // 默认电商
  return 'ecommerce';
}

module.exports = { tools, handle };
