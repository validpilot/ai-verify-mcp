'use strict';

/**
 * 智能页面与元素定位助手（从 server.js 提取，v1.8.7 瘦身）
 *
 * 设计说明：
 * - `findElement` 为纯函数，无外部依赖，可直接调用
 * - `findPage` 依赖 `ensurePage`（定义在 server.js 中），通过 `createLocatorHelpers`
 *   工厂函数注入，避免循环依赖
 * - `PAGE_PATTERNS` 为静态配置，与本模块强相关，一并迁移
 */

// ===== 智能页面发现 =====
const PAGE_PATTERNS = {
  login: {
    urlPatterns: ['/login', '/signin', '/auth/login', '/auth/signin', '/log-in', '/sign-in', '/user/login', '/account/login', '/#/login', '/#/signin'],
    selectors: ['input[type="password"]', 'form input[type="password"]', '#login-form', '.login-form', '.login-page', '[data-page="login"]', '[data-testid="login"]'],
    textIndicators: ['登录', 'Login', 'Sign In', 'SIGN IN', 'log in', 'sign in', 'Forgot your password'],
    titleIndicators: ['Login', 'Sign In', 'Log In', '登录']
  },
  signup: {
    urlPatterns: ['/signup', '/register', '/auth/register', '/auth/signup', '/sign-up', '/user/register', '/account/register', '/create-account', '/#/signup', '/#/register'],
    selectors: ['input[type="email"]', 'input[name="email"]', 'input[id*="email"]', '#signup-form', '.signup-form', '.register-form', '[data-testid="signup"]'],
    textIndicators: ['注册', 'Sign Up', 'SIGN UP', 'Register', 'Create Account', '免费注册', "Don't have an account"],
    titleIndicators: ['Sign Up', 'Register', '注册']
  },
  home: {
    urlPatterns: ['/', '/home', '/index', '/index.html', '/dashboard', '/app', '/#/home', '/#/'],
    selectors: ['nav a[href="/"]', '.logo a', 'header a[href="/"]', 'a[href="/home"]', '[data-testid="home"]'],
    textIndicators: ['首页', 'Home', 'Dashboard', '概览', '欢迎'],
    titleIndicators: ['Home', '首页', 'Dashboard']
  },
  dashboard: {
    urlPatterns: ['/dashboard', '/app', '/console', '/admin/dashboard', '/home', '/#/dashboard'],
    selectors: ['.sidebar', '.dashboard', '.admin-nav', 'aside nav', '[data-page="dashboard"]', '.main-content', '[data-testid="dashboard"]'],
    textIndicators: ['仪表盘', 'Dashboard', '控制台', 'Console', '概览', 'Workspace'],
    titleIndicators: ['Dashboard', '仪表盘', 'Console']
  },
  admin: {
    urlPatterns: ['/admin', '/admin/', '/manage', '/management', '/backend', '/system', '/#/admin'],
    selectors: ['.admin-sidebar', '.admin-nav', '[data-page="admin"]', 'a[href*="admin"]', '.admin-header', '[data-testid="admin"]'],
    textIndicators: ['管理', 'Admin', '管理后台', '后台'],
    titleIndicators: ['Admin', '管理后台']
  },
  settings: {
    urlPatterns: ['/settings', '/profile/settings', '/user/settings', '/account/settings', '/preferences', '/#/settings'],
    selectors: ['a[href*="settings"]', 'a[href*="preferences"]', '#settings-form', '.settings-page', '#settings', '[data-testid="settings"]'],
    textIndicators: ['设置', 'Settings', '偏好', 'Preferences', '个人设置'],
    titleIndicators: ['Settings', '设置']
  },
  profile: {
    urlPatterns: ['/profile', '/user', '/user/profile', '/account', '/me', '/#/profile'],
    selectors: ['a[href*="profile"]', 'a[href*="/user"]', '.user-profile', '#profile-form', '.avatar-upload', '[data-testid="profile"]'],
    textIndicators: ['个人中心', 'Profile', '我的', '个人资料'],
    titleIndicators: ['Profile', '个人中心']
  },
  search: {
    urlPatterns: ['/search', '/find', '/browse', '/explore', '/#/search'],
    selectors: ['input[type="search"]', 'input[placeholder*="search"]', 'input[placeholder*="Search"]', 'input[placeholder*="搜索"]', '#search-form', '.search-box', '[data-testid="search"]'],
    textIndicators: ['搜索', 'Search', '查找', 'Browse'],
    titleIndicators: ['Search', '搜索']
  },
  cart: {
    urlPatterns: ['/cart', '/shop/cart', '/shopping-cart', '/checkout/cart', '/#/cart'],
    selectors: ['.cart', '.shopping-cart', '#cart', 'a[href*="cart"]', '.cart-icon', '[data-testid="cart"]'],
    textIndicators: ['购物车', 'Cart', 'Shopping Cart'],
    titleIndicators: ['Cart', '购物车']
  },
  checkout: {
    urlPatterns: ['/checkout', '/order/checkout', '/payment', '/checkout/shipping', '/#/checkout'],
    selectors: ['.checkout', '#checkout', '.checkout-page', '.payment-form', '[data-testid="checkout"]'],
    textIndicators: ['结算', 'Checkout', '支付', 'Payment'],
    titleIndicators: ['Checkout']
  },
  'forgot-password': {
    urlPatterns: ['/forgot-password', '/reset-password', '/auth/forgot', '/password/reset', '/forgot', '/reset', '/#/forgot-password'],
    selectors: ['input[placeholder*="email"]', 'input[placeholder*="Email"]', 'a[href*="forgot"]', 'a[href*="reset"]', '[data-testid="forgot-password"]'],
    textIndicators: ['忘记密码', 'Forgot Password', '重置密码', 'Reset Password'],
    titleIndicators: ['Forgot Password', 'Reset Password', '忘记密码']
  },
  logout: {
    urlPatterns: ['/logout', '/signout', '/auth/logout', '/user/logout', '/#/logout'],
    selectors: ['a[href*="logout"]', 'a[href*="signout"]', '[data-testid="logout"]'],
    textIndicators: ['退出', 'Logout', 'Sign Out', '登出'],
    titleIndicators: ['Logout']
  }
};

/**
 * 智能页面发现 — 检测当前页面是否匹配目标类型，并收集相关链接/按钮
 * @param {string} target - 页面类型（login/signup/home/dashboard/admin/settings/profile/search/cart/checkout/forgot-password/logout）或 'all'
 * @param {Object} args - 参数（baseUrl、navigate、headless 等）
 * @param {Function} ensurePage - 注入的浏览器页面获取函数
 * @returns {Promise<Object>} 页面匹配结果
 */
async function findPage(target, args = {}, ensurePage) {
  const { target: pageTarget } = await ensurePage(args);
  // 等待SPA页面渲染
  await new Promise(r => setTimeout(r, 800)).catch(() => {});

  const currentUrl = pageTarget.url();
  const currentOrigin = new URL(currentUrl).origin;
  const baseUrl = args.baseUrl || currentOrigin;

  const results = {};

  // 支持 "all" - 检测所有类型
  const targets = target === 'all' ? Object.keys(PAGE_PATTERNS) : [target];

  for (const t of targets) {
    const pattern = PAGE_PATTERNS[t];
    if (!pattern) {
      results[t] = { error: `未知的页面类型：${t}，支持：${Object.keys(PAGE_PATTERNS).join(', ')}` };
      continue;
    }

    const pageInfo = {
      targetType: t,
      currentUrl,
      onTargetPage: false,
      matchMethod: null,
      matchDetail: null,
      matchScore: 0,
      suggestions: [],
      links: [],
      buttons: []
    };

    let score = 0;

    // 1. 检查当前URL是否匹配（包括hash路由）
    const currentUrlObj = new URL(currentUrl);
    const currentPath = currentUrlObj.pathname;
    const currentHash = (currentUrlObj.hash || '').toLowerCase();
    for (const urlPattern of pattern.urlPatterns) {
      // 匹配pathname
      if (currentPath === urlPattern || currentPath.startsWith(urlPattern + '/') || currentPath.startsWith(urlPattern + '?')) {
        pageInfo.onTargetPage = true;
        pageInfo.matchMethod = 'url';
        pageInfo.matchDetail = `当前URL路径(${currentPath})匹配模式 ${urlPattern}`;
        pageInfo.matchScore = 100;
        score = Math.max(score, 100);
        break;
      }
      // 匹配hash路由（SPA应用如 /#/login）
      if (urlPattern.startsWith('/#/') && currentHash === urlPattern.replace('/#', '')) {
        pageInfo.onTargetPage = true;
        pageInfo.matchMethod = 'hash_url';
        pageInfo.matchDetail = `当前URL hash(${currentHash})匹配模式 ${urlPattern}`;
        pageInfo.matchScore = 95;
        score = Math.max(score, 95);
        break;
      }
      if (urlPattern === '/#/' && (currentHash === '/#' || currentHash === '/#/')) {
        pageInfo.onTargetPage = true;
        pageInfo.matchMethod = 'hash_url';
        pageInfo.matchDetail = `当前URL hash(${currentHash})匹配首页`;
        pageInfo.matchScore = 95;
        score = Math.max(score, 95);
        break;
      }
    }

    // 2. 检查页面元素特征（如果可以在当前页面）
    if (!pageInfo.onTargetPage) {
      try {
        const elementCheck = await pageTarget.evaluate(({ selectors, textIndicators, titleIndicators }) => {
          let score = 0;
          let bestMatch = { matched: false, via: null, detail: null, score: 0 };

          // 检查页面标题
          const title = document.title;
          if (titleIndicators) {
            for (const ti of titleIndicators) {
              if (title.toLowerCase().includes(ti.toLowerCase())) {
                const s = ti.length > 3 ? 90 : 80;
                if (s > bestMatch.score) {
                  bestMatch = { matched: true, via: 'title', detail: `页面标题"${title}"包含"${ti}"`, score: s };
                }
              }
            }
          }
          // 检查CSS选择器（存在即可见）
          for (const sel of selectors) {
            try {
              const el = document.querySelector(sel);
              if (el) {
                const rect = el.getBoundingClientRect();
                if (rect.width && rect.height) {
                  const s = 70;
                  if (s > bestMatch.score) {
                    bestMatch = { matched: true, via: 'selector', detail: sel, text: (el.innerText || el.textContent || '').trim().substring(0, 100), score: s };
                  }
                }
              }
            } catch (e) { /* browser DOM query: non-critical */ }
          }
          // 检查按钮文本（SPA常用按钮导航）
          const allButtons = document.querySelectorAll('button, [role="button"], .btn, input[type="submit"]');
          for (const btn of allButtons) {
            const btnText = (btn.innerText || btn.textContent || btn.value || '').trim();
            if (!btnText) continue;
            const btnLower = btnText.toLowerCase();
            for (const indicator of textIndicators) {
              if (btnLower.includes(indicator.toLowerCase())) {
                const s = 60;
                if (s > bestMatch.score) {
                  bestMatch = { matched: true, via: 'button_text', detail: `按钮"${btnText.substring(0, 50)}"`, score: s };
                }
              }
            }
          }
          // 检查导航栏/侧边栏等语义区域的文本
          const navAreas = document.querySelectorAll('nav, [role="navigation"], .nav, .sidebar, .menu, header nav');
          for (const nav of navAreas) {
            const navText = nav.innerText || '';
            for (const indicator of textIndicators) {
              if (navText.includes(indicator)) {
                const s = 50;
                if (s > bestMatch.score) {
                  bestMatch = { matched: true, via: 'nav_text', detail: `导航区域包含"${indicator}"`, score: s };
                }
              }
            }
          }
          // 检查页面可见文本
          const bodyText = document.body.innerText;
          for (const text of textIndicators) {
            if (bodyText.includes(text)) {
              const s = 40;
              if (s > bestMatch.score) {
                bestMatch = { matched: true, via: 'page_text', detail: `页面包含文本"${text}"`, score: s };
              }
            }
          }
          return bestMatch;
        }, { selectors: pattern.selectors, textIndicators: pattern.textIndicators, titleIndicators: pattern.titleIndicators });

        if (elementCheck.matched) {
          pageInfo.onTargetPage = true;
          pageInfo.matchMethod = elementCheck.via;
          pageInfo.matchDetail = elementCheck.detail;
          pageInfo.matchScore = elementCheck.score;
          score = Math.max(score, elementCheck.score);
        }
      } catch (e) {
        // ignore evaluate errors
      }
    }

    // 3. 收集该类型的链接（a标签 + 按钮）
    try {
      const collected = await pageTarget.evaluate(({ t, urlPatterns, selectors, textIndicators }) => {
        const allLinks = [];
        const seenHref = new Set();
        const seenText = new Set();

        // 从a标签提取
        document.querySelectorAll('a[href]').forEach(a => {
          const href = a.href || a.getAttribute('href') || '';
          const text = (a.innerText || a.textContent || '').trim().substring(0, 100);
          if (href && !href.startsWith('javascript:') && href !== '#' && !seenHref.has(href)) {
            seenHref.add(href);
            // 检查是否匹配目标类型
            const hrefLower = href.toLowerCase();
            let relevance = 0;
            for (const p of urlPatterns) {
              if (hrefLower.includes(p)) relevance = Math.max(relevance, 10);
            }
            for (const sel of selectors) {
              if (a.matches(sel)) relevance = Math.max(relevance, 8);
            }
            for (const txt of textIndicators) {
              if (text.includes(txt)) relevance = Math.max(relevance, 6);
            }
            if (relevance > 0) {
              allLinks.push({ type: 'link', href: href.substring(0, 300), text: text.substring(0, 80), relevance, selector: `a` });
            }
          }
        });

        // 从按钮提取（SPA关键增强）
        document.querySelectorAll('button, [role="button"], .btn, [role="link"], [onclick]').forEach(btn => {
          const btnText = (btn.innerText || btn.textContent || btn.value || '').trim().substring(0, 80);
          if (!btnText || seenText.has(btnText.toLowerCase())) return;
          const btnLower = btnText.toLowerCase();
          let relevance = 0;
          for (const txt of textIndicators) {
            if (btnLower.includes(txt.toLowerCase())) relevance = Math.max(relevance, 6);
          }
          // 检查周围上下文
          const parentText = (btn.parentElement?.innerText || '').trim().substring(0, 100);
          for (const txt of textIndicators) {
            if (parentText.toLowerCase().includes(txt.toLowerCase())) relevance = Math.max(relevance, 4);
          }
          if (relevance > 0) {
            seenText.add(btnText.toLowerCase());
            const btnId = btn.id ? `#${btn.id}` : '';
            const btnClass = btn.className && typeof btn.className === 'string' ? `.${btn.className.split(' ')[0]}` : '';
            allLinks.push({
              type: 'button',
              href: null,
              text: btnText.substring(0, 80),
              relevance,
              selector: btn.tagName.toLowerCase() + btnId + btnClass || 'button',
              action: 'click'
            });
          }
        });

        // 按relevance排序
        allLinks.sort((a, b) => b.relevance - a.relevance);
        const links = allLinks.filter(l => l.type === 'link').slice(0, 10);
        const buttons = allLinks.filter(l => l.type === 'button').slice(0, 10);
        return { links, buttons };
      }, { t, urlPatterns: pattern.urlPatterns, selectors: pattern.selectors, textIndicators: pattern.textIndicators });

      pageInfo.links = collected.links;
      pageInfo.buttons = collected.buttons;
    } catch (e) {
      // ignore
    }

    // 4. 生成建议
    if (!pageInfo.onTargetPage) {
      if (pageInfo.links.length > 0) {
        pageInfo.suggestions.push(`页面有 ${pageInfo.links.length} 个链接可能与"${t}"相关`);
      }
      if (pageInfo.buttons.length > 0) {
        pageInfo.suggestions.push(`页面有 ${pageInfo.buttons.length} 个按钮可能与"${t}"相关（SPA应用）`);
      }
      if (pageInfo.links.length > 0 || pageInfo.buttons.length > 0) {
        pageInfo.suggestions.push(`建议：使用 browser_click 点击相关元素，或使用 browser_open 直接导航`);
      }

      // 尝试建议URL
      const suggestedUrls = [];
      for (const urlPattern of pattern.urlPatterns) {
        suggestedUrls.push(baseUrl.replace(/\/$/, '') + urlPattern);
      }
      pageInfo.suggestedUrls = suggestedUrls.slice(0, 5);
    } else {
      pageInfo.suggestions.push(`已在 ${t} 页面（匹配方式：${pageInfo.matchMethod}）`);
    }

    results[t] = pageInfo;
  }

  // 如果指定了navigate且当前不在目标页面，且有建议URL
  if (args.navigate && !results[target]?.onTargetPage && results[target]?.suggestedUrls?.length > 0) {
    // 尝试多个建议URL（优先选非hash的，不行再试hash）
    for (const suggestedUrl of results[target].suggestedUrls) {
      try {
        await pageTarget.goto(suggestedUrl, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
        results[target].navigatedTo = suggestedUrl;
        results[target].navigationResult = pageTarget.url();
        // 如果是hash URL，多等一会让SPA渲染
        if (suggestedUrl.includes('/#')) {
          await new Promise(r => setTimeout(r, 1000)).catch(() => {});
        }
        break;
      } catch (e) {
        continue;
      }
    }
  }

  return results;
}

/**
 * 智能元素查找 — 按 text/selector/role/tagName 查找页面元素
 * @param {Object} target - Playwright Page 对象
 * @param {Object} args - 参数（text、selector、role、tagName、onlyVisible、limit）
 * @returns {Promise<Object>} 元素查找结果
 */
async function findElement(target, args = {}) {
  const text = String(args.text || '').trim();
  const selector = args.selector || '';
  const role = args.role ? String(args.role).toLowerCase() : null;
  const tagName = args.tagName ? String(args.tagName).toLowerCase() : null;
  const onlyVisible = args.onlyVisible !== false;
  const limit = Number(args.limit) || 5;

  console.log('[findElement DEBUG] args:', JSON.stringify(args));
  console.log('[findElement DEBUG] selector:', selector);
  console.log('[findElement DEBUG] text:', text);

  if (!text && !selector) {
    return { results: [], total: 0, query: { text, selector, role, tagName }, error: '缺少 text 或 selector 参数' };
  }

  if (selector) {
    const results = [];
    try {
      const elements = await target.$$(selector);
      for (const el of elements.slice(0, limit)) {
        const rect = await el.boundingBox();
        const tag = await el.evaluate(el => el.tagName.toLowerCase());
        const className = await el.evaluate(el => typeof el.className === 'string' ? el.className : '');
        const innerText = await el.evaluate(el => el.innerText.trim().slice(0, 200));
        const visible = rect && rect.width > 0 && rect.height > 0;
        results.push({
          selector,
          text: innerText,
          tagName: tag,
          className,
          confidence: 1.0,
          visible,
          position: rect ? { top: Math.round(rect.y), left: Math.round(rect.x) } : null,
          matchMethod: 'selector_direct'
        });
      }
    } catch (e) {
      return { results: [], total: 0, query: { text, selector, role, tagName }, error: `选择器无效: ${e.message}` };
    }
    return {
      query: { text, selector, role, tagName, onlyVisible, limit },
      results,
      total: results.length,
      returned: results.length,
      debug: { selectorUsed: !!selector, elementsFound: results.length }
    };
  }

  const results = await target.evaluate((params) => {
    const { text, role, tagName, onlyVisible } = params;
    const textLower = text.toLowerCase();
    const allResults = [];
    const seenSelectors = new Set();

    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden') return false;
      if (parseFloat(style.opacity) < 0.1) return false;
      if (rect.width <= 0 || rect.height <= 0) return false;
      return true;
    }

    function getElementText(el) {
      const t = (el.innerText || el.textContent || el.value || '').trim();
      return t.replace(/\s+/g, ' ');
    }

    function generateSelector(el) {
      if (el.id) {
        return `#${CSS.escape(el.id)}`;
      }
      const name = el.getAttribute('name');
      if (name && el.tagName.match(/^(INPUT|SELECT|TEXTAREA|BUTTON|FORM)$/)) {
        return `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
      }
      const tag = el.tagName.toLowerCase();
      const classes = typeof el.className === 'string'
        ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.')
        : '';
      const classPart = classes ? `.${classes}` : '';
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(sib =>
          sib.tagName === el.tagName && (!classes || (typeof sib.className === 'string' && sib.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.') === classes))
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(el) + 1;
          return `${tag}${classPart}:nth-child(${index})`;
        }
      }
      return `${tag}${classPart}`;
    }

    function buildResult(el, confidence, matchMethod) {
      const fullSelector = generateSelector(el);
      if (seenSelectors.has(fullSelector)) return null;
      seenSelectors.add(fullSelector);
      const rect = el.getBoundingClientRect();
      const visible = isVisible(el);
      return {
        selector: fullSelector,
        text: getElementText(el).slice(0, 200),
        tagName: el.tagName.toLowerCase(),
        confidence,
        visible,
        position: { top: Math.round(rect.top), left: Math.round(rect.left) },
        matchMethod
      };
    }

    function matchesRole(el, roleName) {
      const elRole = el.getAttribute('role')?.toLowerCase() || '';
      if (elRole === roleName) return true;
      const tag = el.tagName.toLowerCase();
      const roleMap = {
        button: ['button', 'input[type="submit"]', 'input[type="button"]', 'input[type="reset"]'],
        link: ['a'],
        textbox: ['input[type="text"]', 'input[type="email"]', 'input[type="password"]', 'input[type="search"]', 'input[type="tel"]', 'input[type="url"]', 'textarea'],
        input: ['input', 'textarea', 'select'],
        checkbox: ['input[type="checkbox"]'],
        radio: ['input[type="radio"]'],
        combobox: ['select'],
        img: ['img'],
        heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
      };
      const tags = roleMap[roleName] || [];
      return tags.some(t => {
        if (t.includes('[type=')) {
          const [baseTag, typePart] = t.split('[');
          const typeVal = typePart.replace(/type="([^"]+)"\]/, '$1');
          return tag === baseTag && el.type?.toLowerCase() === typeVal;
        }
        return tag === t;
      });
    }

    function matchesTagName(el, tn) {
      return el.tagName.toLowerCase() === tn.toLowerCase();
    }

    function filterByCriteria(el) {
      if (role && !matchesRole(el, role)) return false;
      if (tagName && !matchesTagName(el, tagName)) return false;
      if (onlyVisible && !isVisible(el)) return false;
      return true;
    }

    const buttonLinkSelector = 'button, a[href], [role="button"], [role="link"], input[type="submit"], input[type="button"], .btn';

    const strategies = [
      {
        name: 'button_link_exact',
        confidence: 1.0,
        selector: buttonLinkSelector,
        match: (el) => getElementText(el).toLowerCase() === textLower
      },
      {
        name: 'any_element_exact',
        confidence: 0.9,
        selector: '*',
        match: (el) => getElementText(el).toLowerCase() === textLower
      },
      {
        name: 'button_link_contains',
        confidence: 0.8,
        selector: buttonLinkSelector,
        match: (el) => getElementText(el).toLowerCase().includes(textLower)
      },
      {
        name: 'placeholder_match',
        confidence: 0.75,
        selector: 'input, textarea',
        match: (el) => {
          const ph = el.getAttribute('placeholder') || '';
          return ph.toLowerCase() === textLower || ph.toLowerCase().includes(textLower);
        }
      },
      {
        name: 'aria_label_match',
        confidence: 0.75,
        selector: '*',
        match: (el) => {
          const aria = el.getAttribute('aria-label') || '';
          return aria.toLowerCase() === textLower || aria.toLowerCase().includes(textLower);
        }
      },
      {
        name: 'title_alt_match',
        confidence: 0.7,
        selector: '*',
        match: (el) => {
          const title = el.getAttribute('title') || '';
          const alt = el.getAttribute('alt') || '';
          return title.toLowerCase() === textLower || title.toLowerCase().includes(textLower) ||
                 alt.toLowerCase() === textLower || alt.toLowerCase().includes(textLower);
        }
      },
      {
        name: 'role_text_fuzzy',
        confidence: 0.6,
        selector: '*',
        match: (el) => {
          if (!role) return false;
          const elText = getElementText(el).toLowerCase();
          return matchesRole(el, role) && (elText.includes(textLower) || textLower.includes(elText));
        }
      }
    ];

    for (const strategy of strategies) {
      try {
        const elements = document.querySelectorAll(strategy.selector);
        for (const el of elements) {
          if (!filterByCriteria(el)) continue;
          if (strategy.match(el)) {
            const result = buildResult(el, strategy.confidence, strategy.name);
            if (result) allResults.push(result);
          }
        }
      } catch (_) { /* browser DOM query: non-critical */ }
    }

    allResults.sort((a, b) => b.confidence - a.confidence);

    return {
      results: allResults.slice(0, 100),
      total: allResults.length
    };
  }, { text, role, tagName, onlyVisible });

  const limitedResults = results.results.slice(0, limit);
  return {
    query: { text, role, tagName, onlyVisible, limit },
    results: limitedResults,
    total: results.total,
    returned: limitedResults.length
  };
}

/**
 * 工厂函数：创建绑定了 ensurePage 的 findPage 实例
 * 用于避免循环依赖：server.js 定义 ensurePage 后注入
 * @param {Object} deps - { ensurePage }
 * @returns {{ findPage: Function }}
 */
function createLocatorHelpers({ ensurePage }) {
  const boundFindPage = (target, args = {}) => findPage(target, args, ensurePage);
  return { findPage: boundFindPage };
}

module.exports = { PAGE_PATTERNS, findElement, findPage, createLocatorHelpers };
