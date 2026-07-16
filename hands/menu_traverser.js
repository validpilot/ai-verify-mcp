'use strict';

/**
 * 菜单遍历器（从 server.js 提取，v1.8.8 瘦身）
 *
 * 设计说明：
 * - `traverseMenu` 依赖 `ensurePage` 和 `postActionErrorCheck`，通过
 *   `createMenuTraverser({ ensurePage, postActionErrorCheck })` 工厂注入
 * - 内部包含 4 个辅助函数（smartClick/discoverNavItems/clickAndCheck/discoverChildren），
 *   均为闭包内私有，不对外导出
 */

/**
 * 遍历页面导航菜单，逐项点击并记录错误
 * @param {Object} args - 参数（maxDepth/maxItems/waitMs/includeSubMenus 等）
 * @param {Function} ensurePage - 注入的浏览器页面获取函数
 * @param {Function} postActionErrorCheck - 注入的点击后错误检查函数
 * @returns {Promise<Object>} 遍历结果
 */
async function traverseMenu(args = {}, ensurePage, postActionErrorCheck) {
  const { target } = await ensurePage(args);
  const maxDepth = Math.min(args.maxDepth || 3, 5);
  const maxItems = args.maxItems || 30;
  const waitMs = Math.min(args.waitMs || 500, 1000);
  const includeSubMenus = args.includeSubMenus !== false;

  const startUrl = target.url();

  // 全局超时（60秒后强制返回）
  let timeoutReached = false;
  const timeoutId = setTimeout(() => { timeoutReached = true; }, 55000);
  function checkTimeout() { return timeoutReached; }
  const allItems = [];
  const visited = new Set();
  let totalClicks = 0;
  let totalErrors = 0;

  // 辅助：快速按文本点击元素（优先evaluate，避免Playwright locator等待）
  async function smartClick(text, href) {
    // 策略1：evaluate内联点击（最快，不会等待不存在的元素）
    try {
      const clicked = await target.evaluate((txt, hrf) => {
        const all = document.querySelectorAll('a, button, [role="menuitem"], [role="tab"], [role="button"], [role="link"], .nav-link, .nav-item, .menu-item, .dropdown-item, .dropdown-toggle, span[onclick]');
        // 精确匹配文本
        for (const el of all) {
          const t = (el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
          if (t === txt) { try { el.scrollIntoView?.({block:'center',behavior:'instant'}); } catch (_) { /* browser-side: ignore */ } el.click(); return true; }
        }
        // 精确匹配href
        if (hrf) {
          for (const el of all) {
            if (el.tagName === 'A' && el.href === hrf) { try { el.scrollIntoView?.(); } catch (_) { /* browser-side: ignore */ } el.click(); return true; }
          }
        }
        // 部分匹配文本
        for (const el of all) {
          const t = (el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
          if (t.includes(txt) || txt.includes(t)) { try { el.scrollIntoView?.({block:'center',behavior:'instant'}); } catch (_) { /* browser-side: ignore */ } el.click(); return true; }
        }
        // 部分匹配href
        if (hrf) {
          for (const el of all) {
            if (el.tagName === 'A' && hrf.includes(el.href)) { try { el.scrollIntoView?.(); } catch (_) { /* browser-side: ignore */ } el.click(); return true; }
          }
        }
        return false;
      }, text, href || '');
      if (clicked) return true;
    } catch (_) { /* evaluate失败 */ }

    // 策略2：快速selector点击（仅用于有id的明确元素）
    if (href && !href.startsWith('javascript:')) {
      try {
        await target.click(`a[href="${href.replace(/"/g, '\\"')}"]`, { timeout: 2000 });
        return true;
      } catch (_) { /* fallback action */ }
    }
    return false;
  }

  // 发现当前页面的所有导航项
  async function discoverNavItems() {
    return await target.evaluate(() => {
      const navSelectors = [
        'nav', '[role="navigation"]', '[role="menubar"]', '[role="tablist"]', '[role="tree"]',
        '.nav', '.navbar', '.sidebar', '.menu', '.menu-bar', '.main-nav', '.top-nav',
        'header nav', 'aside nav',
        '.ant-menu', '.ant-menu-root', '.el-menu', '.ivu-menu', '.n-menu',
        '[class*="sidebar"]', '[class*="nav-"]', '[class*="Nav"]', '[class*="menu-"]', '[class*="Menu"]',
        '.tabs', '.tab-bar', '[class*="tree"]',
        // 中文网站常见导航容器
        '#head', '#header', '#top-nav', '#nav', '#navbar', '.head', '.header',
        '#s-top-left', '.s-top-left', '#top', '.top-bar', '#topbar',
        '#top_nav', '#nav-bar', '.nav-bar', '.nav-wrap', '.nav-wrapper',
        '[id*="nav"]:not([id*="hidden"]):not([id*="loading"])',
        '[class*="header"]:not([class*="hidden"])',
        '[id*="header"]:not([id*="hidden"])'
    ];
    const navContainers = document.querySelectorAll(navSelectors.join(','));

    // 如果没找到标准导航容器，降级扫描整个页面
    let useGlobalFallback = navContainers.length === 0;

    function extractClickables(container) {
        const result = [];
        const seen = new Set();
        const clickables = container.querySelectorAll(
          'a[href], button, [role="menuitem"], [role="tab"], [role="button"], ' +
          '.ant-menu-item, .el-menu-item, .ivu-menu-item, .n-menu-item, ' +
          '[class*="menu-item"], [class*="nav-item"], ' +
          '.nav-link, .dropdown-item, .dropdown-toggle'
        );
        clickables.forEach(el => {
          const text = (el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
          if (!text || text.length > 80 || seen.has(text)) return;
          seen.add(text);
          let level = 0;
          let p = el.parentElement;
          while (p && p !== container && p !== document.body) {
            if (p.matches('li, [role="menuitem"], [role="treeitem"], .ant-menu-item, .el-menu-item, .ivu-menu-item, .n-menu-item, [class*="menu-item"], [class*="nav-item"], .dropdown-menu, .sub-menu, [class*="submenu"], [class*="children"]')) {
              level++;
            }
            p = p.parentElement;
          }
          const hasSub = el.getAttribute('aria-haspopup') === 'true' ||
                        el.getAttribute('aria-expanded') !== null ||
                        !!el.querySelector('ul, .sub-menu, .dropdown-menu, [class*="submenu"], [class*="children"]');
          result.push({
            text: text.substring(0, 60),
            tagName: el.tagName.toLowerCase(),
            href: el.tagName === 'A' ? (el.href || '').substring(0, 300) : '',
            level,
            hasSubMenu: hasSub
          });
        });
        return result;
      }

      let all = [];
      navContainers.forEach(c => { all = all.concat(extractClickables(c)); });

      // 降级：从页面body提取所有顶级链接
      if (useGlobalFallback || all.length === 0) {
        // 收集页面中所有有意义的链接（过滤无文本的图标链接）
        document.querySelectorAll('a[href]:not([href=""]):not([href="#"]):not([href*="javascript"])').forEach(a => {
          const text = (a.innerText || a.textContent || '').trim();
          if (text && text.length <= 60) {
            let level = 0;
            // 检查是否可能在某个列表/菜单中
            const parentLi = a.closest('li');
            if (parentLi) {
              const parentUl = parentLi.closest('ul');
              if (parentUl) {
                const liCount = parentUl.querySelectorAll('li').length;
                if (liCount > 1) level = 1;
                // 嵌套li
                const grandparent = parentUl.parentElement?.closest('li');
                if (grandparent) level = 2;
              }
            }
            all.push({
              text: text.substring(0, 60),
              tagName: 'a',
              href: a.href.substring(0, 300),
              level,
              hasSubMenu: false
            });
          }
        });
        // 收集页面中的按钮
        document.querySelectorAll('button:not([disabled])').forEach(btn => {
          const text = (btn.innerText || btn.textContent || btn.getAttribute('aria-label') || '').trim();
          if (text && text.length <= 60 && !all.some(i => i.text === text)) {
            all.push({
              text: text.substring(0, 60),
              tagName: 'button',
              href: '',
              level: 0,
              hasSubMenu: false
            });
          }
        });
      }

      const dedup = [];
      const seenGlobal = new Set();
      all.forEach(item => {
        const key = item.text.toLowerCase();
        if (!seenGlobal.has(key)) { seenGlobal.add(key); dedup.push(item); }
      });
      return dedup.sort((a, b) => a.level - b.level || a.text.localeCompare(b.text));
    });
  }

  // 点击一个元素并检查错误（带安全超时）
  async function clickAndCheck(text, href, level) {
    if (visited.has(text)) return null;
    visited.add(text);

    const beforeUrl = target.url();

    // smartClick带2秒超时
    let clicked = false;
    try {
      clicked = await Promise.race([
        smartClick(text, href),
        new Promise(r => setTimeout(() => r(false), 2000))
      ]);
    } catch (_) { clicked = false; }
    if (!clicked) return null;

    totalClicks++;
    await new Promise(r => setTimeout(r, Math.min(waitMs, 1000)));
    try { await target.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {}); } catch (_) { /* load state timeout */ }
    await new Promise(r => setTimeout(r, 200));

    const errors = await postActionErrorCheck(target, 'traverse', text);
    if (errors.detected) totalErrors++;

    const result = {
      text,
      level,
      status: 'clicked',
      urlBefore: beforeUrl,
      urlAfter: target.url(),
      navigated: beforeUrl !== target.url(),
      errors: errors.detected ? { count: errors.count, console: errors.console.length, page: errors.page.length, network: errors.network.length } : null
    };

    if (result.navigated) {
      try { result.pageTitle = await target.title(); } catch (_) { /* best-effort title */ }
    }
    return result;
  }

  // 发现子菜单项
  async function discoverChildren(parentText) {
    return await target.evaluate((pText) => {
      const all = document.querySelectorAll('a, button, [role="menuitem"], [role="tab"]');
      let parentEl = null;
      for (const el of all) {
        if ((el.innerText || '').trim().includes(pText) || (el.textContent || '').trim().includes(pText)) {
          parentEl = el;
          break;
        }
      }
      if (!parentEl) return [];

      let subContainer = parentEl.querySelector('ul, .sub-menu, .dropdown-menu, [class*="submenu"], [class*="children"]');
      if (!subContainer) {
        let next = parentEl.nextElementSibling;
        while (next) {
          if (next.matches('ul, .sub-menu, .dropdown-menu, [class*="submenu"], [class*="children"]')) {
            subContainer = next;
            break;
          }
          next = next.nextElementSibling;
        }
      }
      if (!subContainer || subContainer.offsetParent === null) return [];

      const items = [];
      const seen = new Set();
      subContainer.querySelectorAll('a, button, [role="menuitem"]').forEach(el => {
        const text = (el.innerText || el.textContent || '').trim();
        if (text && !seen.has(text)) {
          seen.add(text);
          items.push({
            text: text.substring(0, 60),
            href: el.tagName === 'A' ? (el.href || '').substring(0, 300) : ''
          });
        }
      });
      return items;
    }, parentText);
  }

  // ==== 主逻辑 ====
  const menuItems = await discoverNavItems();
  if (menuItems.length === 0) {
    return {
      startUrl, endUrl: target.url(), status: 'no_nav_items',
      message: '当前页面未发现导航菜单。可能是因为：①页面已登录但没有导航栏；②SPA尚未渲染；③需要先打开一个应用页面。建议先调用 browser_open 打开目标应用。',
      itemsFound: 0
    };
  }

  // 按层级分组
  const levelGroups = {};
  for (const item of menuItems) {
    const lvl = Math.min(item.level + 1, maxDepth);
    if (!levelGroups[lvl]) levelGroups[lvl] = [];
    if (levelGroups[lvl].length < maxItems) levelGroups[lvl].push(item);
  }

  // 从第一级开始点击（带超时检查）
  for (const item of (levelGroups[1] || []).concat(levelGroups[0] || [])) {
    if (totalClicks >= maxItems || checkTimeout()) break;
    if (visited.has(item.text)) continue;

    const first = await clickAndCheck(item.text, item.href, 1);
    if (!first) continue;

    if (includeSubMenus && item.hasSubMenu && item.level < maxDepth && totalClicks < maxItems && !checkTimeout()) {
      await new Promise(r => setTimeout(r, Math.min(500, waitMs)));
      const children = await discoverChildren(item.text);
      for (const child of children) {
        if (totalClicks >= maxItems || checkTimeout()) break;
        const second = await clickAndCheck(child.text, child.href, 2);
        if (!second) continue;

        if (includeSubMenus && 2 < maxDepth && totalClicks < maxItems && !checkTimeout()) {
          await new Promise(r => setTimeout(r, 300));
          const grandchildren = await discoverChildren(child.text);
          for (const grand of grandchildren) {
            if (totalClicks >= maxItems || checkTimeout()) break;
            const third = await clickAndCheck(grand.text, grand.href, 3);
            if (third) allItems.push(third);
          }
        }
        allItems.push(second);
      }
    }
    allItems.push(first);
  }

  clearTimeout(timeoutId);
  return {
    startUrl, endUrl: target.url(), status: timeoutReached ? 'timeout' : 'completed',
    itemsFound: menuItems.length, itemsClicked: totalClicks, errorsFound: totalErrors, maxDepth,
    pathSummary: {
      level1: allItems.filter(i => i.level === 1).length,
      level2: allItems.filter(i => i.level === 2).length,
      level3: allItems.filter(i => i.level === 3).length,
      withErrors: allItems.filter(i => i.errors).length,
      navigatedPages: allItems.filter(i => i.navigated).length
    },
    results: allItems
  };
}

/**
 * 工厂函数：创建绑定了 ensurePage 和 postActionErrorCheck 的 traverseMenu 实例
 * @param {Object} deps - { ensurePage, postActionErrorCheck }
 * @returns {{ traverseMenu: Function }}
 */
function createMenuTraverser({ ensurePage, postActionErrorCheck }) {
  const boundTraverseMenu = (args = {}) => traverseMenu(args, ensurePage, postActionErrorCheck);
  return { traverseMenu: boundTraverseMenu };
}

module.exports = { traverseMenu, createMenuTraverser };
