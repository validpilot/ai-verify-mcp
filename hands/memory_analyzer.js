'use strict';

/**
 * memory_analyzer — 内存泄漏检测模块
 *
 * 通过 Performance API 和 DOM 遍历检测：
 *  - detached DOM 节点数量
 *  - 事件监听器泄漏风险
 *  - JS 堆大小
 *  - DOM 节点总数
 *
 * 返回结构化泄漏风险评估报告。
 */

/**
 * 在页面上下文中执行内存泄漏检测
 * @param {object} page - Playwright page 或兼容的 mock 对象
 * @returns {Promise<object>} 检测结果
 */
async function detectMemoryLeaks(page) {
  const canEval = typeof page.evaluate === 'function';
  if (!canEval) {
    // 兼容 mock 环境
    return getDefaultResult();
  }

  try {
    const source = [
      calculateRiskScore.toString(),
      getRiskLevel.toString(),
      generateRecommendations.toString(),
      detectInBrowser.toString()
    ].join('\n');
    return await page.evaluate((script) => {
      const detect = new Function(`${script}; return detectInBrowser;`)();
      return detect();
    }, source);
  } catch (err) {
    return {
      ...getDefaultResult(),
      error: err.message || String(err),
      note: '检测执行失败，返回默认值'
    };
  }
}

/**
 * 在浏览器中执行检测（可独立导出用于扩展）
 */
function detectInBrowser() {
  // 1. 遍历所有 DOM 节点，检测 detached 节点
  const allElements = document.querySelectorAll('*');
  let detachedCount = 0;
  for (const el of allElements) {
    if (el.parentNode === null && el !== document.body && el !== document.documentElement) {
      detachedCount++;
    }
  }

  // 2. 事件监听器数量（通过自定义注入或 getEventListeners）
  let listenerCount = 0;
  if (typeof window.__VALIDPILOT_EVENT_LISTENERS !== 'undefined') {
    listenerCount = window.__VALIDPILOT_EVENT_LISTENERS;
  } else if (typeof getEventListeners === 'function') {
    // Chrome DevTools 方法（仅限开发工具环境）
    try {
      const rootListeners = getEventListeners(window);
      for (const key of Object.keys(rootListeners)) {
        listenerCount += rootListeners[key].length;
      }
    } catch (err) {
      // getEventListeners 是 Chrome DevTools 专有方法，在普通浏览器上下文中不可用或抛错，回退到 0
    }
  }

  // 3. JS 堆大小
  let heapSize = null;
  let heapLimit = null;
  if (performance.memory) {
    heapSize = performance.memory.usedJSHeapSize;
    heapLimit = performance.memory.jsHeapSizeLimit;
  }

  // 4. 节点总数
  const totalNodes = allElements.length;

  // 5. 计算泄漏风险评分
  const riskScore = calculateRiskScore(detachedCount, listenerCount, totalNodes);
  const riskLevel = getRiskLevel(riskScore);

  // 6. 生成建议
  const recommendations = generateRecommendations(detachedCount, listenerCount, heapSize, totalNodes);

  return {
    detachedCount,
    listenerCount,
    heapSize,
    heapLimit,
    totalNodes,
    riskScore,
    riskLevel,
    recommendations
  };
}

/**
 * 计算泄漏风险评分（0-100，越低越安全）
 */
function calculateRiskScore(detachedCount, listenerCount, totalNodes) {
  let score = 0;

  // detached DOM：每个节点 +5 分
  score += detachedCount * 5;

  // 事件监听器：超过 100 个开始扣分
  if (listenerCount > 100) {
    score += Math.min((listenerCount - 100) * 0.3, 20);
  }

  // 非预期 detached：占节点总数比例
  if (totalNodes > 0 && detachedCount > 0) {
    const ratio = detachedCount / totalNodes;
    if (ratio > 0.05) score += 15;
    else if (ratio > 0.01) score += 8;
  }

  return Math.min(Math.round(score * 10) / 10, 100);
}

/**
 * 获取风险等级
 */
function getRiskLevel(score) {
  if (score === 0) return 'none';
  if (score < 15) return 'low';
  if (score < 35) return 'medium';
  return 'high';
}

/**
 * 生成优化建议
 */
function generateRecommendations(detachedCount, listenerCount, heapSize, totalNodes) {
  const recs = [];

  if (detachedCount > 0) {
    recs.push(`检测到 ${detachedCount} 个 detached DOM 节点。建议检查 DOM 移除操作后是否正确清理引用，避免父节点移除后子节点未被回收。`);
  }
  if (listenerCount > 150) {
    recs.push(`事件监听器数量较多（${listenerCount} 个）。建议检查未移除的 addEventListener，使用 AbortController 或 removeEventListener 在组件卸载时清理。`);
  }
  if (heapSize !== null && heapSize > 100 * 1024 * 1024) {
    recs.push(`JS 堆使用较高（${(heapSize / 1024 / 1024).toFixed(1)} MB）。建议检查是否存在对象引用未释放、闭包持有大对象等问题。`);
  }
  if (totalNodes > 5000) {
    recs.push(`DOM 节点总数 ${totalNodes}，页面复杂度较高。建议考虑虚拟滚动或懒加载以减少 DOM 节点数。`);
  }
  if (recs.length === 0) {
    recs.push('未检测到明显内存泄漏风险。');
  }

  return recs;
}

function getDefaultResult() {
  return {
    detachedCount: 0,
    listenerCount: 0,
    heapSize: null,
    heapLimit: null,
    totalNodes: 0,
    riskScore: 0,
    riskLevel: 'none',
    recommendations: ['无法执行页面内检测，返回默认值。']
  };
}

module.exports = {
  detectMemoryLeaks,
  detectInBrowser,
  calculateRiskScore,
  getRiskLevel,
  generateRecommendations
};
