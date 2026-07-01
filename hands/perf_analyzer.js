'use strict';

/**
 * Core Web Vitals 性能分析器
 * 
 * 采集并分析 LCP / INP / CLS / TTFB 四大核心指标，
 * 输出标准化 rating（good / needs-improvement / poor）和可执行优化建议。
 * 
 * @see product-gap-analysis-2026.md §P0-5
 * @see https://web.dev/vitals/
 */

const THRESHOLDS = {
  LCP:  { good: 2500, poor: 4000, unit: 'ms' },
  INP:  { good: 200,  poor: 500,  unit: 'ms' },
  CLS:  { good: 0.1,  poor: 0.25, unit: '' },
  TTFB: { good: 800,  poor: 1800, unit: 'ms' }
};

/** 对单个指标评级 */
function rateMetric(value, threshold) {
  if (value == null || isNaN(value)) return 'poor';
  if (value < threshold.good) return 'good';
  if (value < threshold.poor) return 'needs-improvement';
  return 'poor';
}

/** LCP 评分 */
function rateLCP(value) { return rateMetric(value, THRESHOLDS.LCP); }
/** FCP 评分 */
function rateFCP(value) { if (value == null || isNaN(value)) return 'unknown'; if (value <= 1800) return 'good'; if (value <= 3000) return 'needs-improvement'; return 'poor'; }
/** TTFB 评分 */
function rateTTFB(value) { return rateMetric(value, THRESHOLDS.TTFB); }
/** CLS 评分 */
function rateCLS(value) { return rateMetric(value, THRESHOLDS.CLS); }

/** 生成优化建议 */
function generateSuggestion(metric, value, rating) {
  if (rating === 'good') return null;
  const suggestions = {
    LCP: {
      'needs-improvement': { impact: 'medium', title: '首屏最大内容元素加载偏慢', suggestion: '建议：压缩图片资源、开启 preload 预加载关键资源、优化服务端响应时间。' },
      'poor': { impact: 'high', title: '首屏最大内容元素严重超时', suggestion: '建议：考虑使用骨架屏、启用服务端渲染（SSR）或静态生成（SSG）、使用 CDN 加速。' }
    },
    INP: {
      'needs-improvement': { impact: 'medium', title: '交互响应延迟偏高', suggestion: '建议：拆分长 JavaScript 任务（<50ms）、使用 Web Worker、减少 DOM 大小。' },
      'poor': { impact: 'high', title: '交互响应延迟过高', suggestion: '建议：使用 requestAnimationFrame 分批执行 UI 更新、避免主线程执行繁重任务。' }
    },
    CLS: {
      'needs-improvement': { impact: 'medium', title: '页面布局存在偏移', suggestion: '建议：为图片和视频元素显式设置 width/height、使用 font-display: swap 避免字体加载偏移。' },
      'poor': { impact: 'high', title: '页面布局严重不稳定', suggestion: '建议：动态插入内容时预留占位空间、避免在已渲染内容上方插入新内容。' }
    },
    TTFB: {
      'needs-improvement': { impact: 'medium', title: '服务端响应时间偏长', suggestion: '建议：使用 CDN 加速静态内容、优化后端数据库查询、启用 HTTP/2。' },
      'poor': { impact: 'high', title: '服务端响应时间过长', suggestion: '建议：升级服务器配置、添加页面缓存层（Redis/CDN）、优化 API 响应结构。' }
    }
  };
  const entry = (suggestions[metric] || {})[rating];
  return entry ? { type: metric.toLowerCase(), ...entry } : null;
}

/** 计算综合评分 (0-100) */
function calculateScore(metrics) {
  let score = 100;
  if (rateLCP(metrics.LCP) === 'needs-improvement') score -= 15;
  if (rateLCP(metrics.LCP) === 'poor') score -= 30;
  if (rateFCP(metrics.FCP) === 'needs-improvement') score -= 10;
  if (rateFCP(metrics.FCP) === 'poor') score -= 20;
  if (rateTTFB(metrics.TTFB) === 'needs-improvement') score -= 10;
  if (rateTTFB(metrics.TTFB) === 'poor') score -= 20;
  return Math.max(0, score);
}

/**
 * 分析页面性能（兼容 ai-verify-mcp 的 page-based API）
 * @param {import('playwright').Page} page
 * @returns {Promise<object>}
 */
async function analyzePerformance(page) {
  const canEval = typeof page.evaluate === 'function';
  const metrics = { FP: null, FCP: null, LCP: null, TTFB: null, CLS: 0, INP: 0 };

  if (canEval) {
    try {
      const data = await page.evaluate(() => {
        const paintEntries = performance.getEntriesByType('paint');
        const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
        const firstPaint = paintEntries.find(e => e.name === 'first-paint');
        const fcp = paintEntries.find(e => e.name === 'first-contentful-paint');
        const lcp = lcpEntries.length > 0 ? lcpEntries[lcpEntries.length - 1] : null;
        let ttfb = null;
        try {
          const nav = performance.getEntriesByType('navigation')[0];
          if (nav) ttfb = Math.round(nav.responseStart);
        } catch (_) { /* ignore */ }
        return {
          FP: firstPaint ? Math.round(firstPaint.startTime) : null,
          FCP: fcp ? Math.round(fcp.startTime) : null,
          LCP: lcp ? Math.round(lcp.startTime) : null,
          TTFB: ttfb
        };
      });
      Object.assign(metrics, data);
    } catch (_) { /* ignore */ }

    // 采集 CLS
    try {
      metrics.CLS = await page.evaluate(() => {
        let cls = window.__VALIDPILOT_CLS || 0;
        try {
          const clsEntries = performance.getEntriesByType('layout-shift');
          cls = clsEntries.reduce((sum, e) => { if (!e.hadRecentInput) sum += e.value; return sum; }, 0);
        } catch (_) { /* ignore */ }
        return cls;
      });
    } catch (_) { /* ignore */ }

    // 采集 INP
    try {
      metrics.INP = await page.evaluate(() => {
        let worstInp = 0;
        try {
          const eventEntries = performance.getEntriesByType('event');
          worstInp = eventEntries.reduce((max, e) => Math.max(max, e.duration), 0);
        } catch (_) { /* ignore */ }
        return worstInp;
      });
    } catch (_) { /* ignore */ }
  }

  const opportunities = [];
  const cwv = {};
  const addCWV = (key, value, threshold) => {
    if (value == null) return;
    const rating = rateMetric(value, threshold);
    cwv[key] = { value, rating };
    const sug = generateSuggestion(key, value, rating);
    if (sug) opportunities.push(sug);
  };

  addCWV('LCP', metrics.LCP, THRESHOLDS.LCP);
  addCWV('FCP', metrics.FCP, { good: 1800, poor: 3000 });
  addCWV('TTFB', metrics.TTFB, THRESHOLDS.TTFB);
  addCWV('CLS', metrics.CLS, THRESHOLDS.CLS);
  addCWV('INP', metrics.INP, THRESHOLDS.INP);

  const score = calculateScore(metrics);
  const rating = score >= 90 ? 'good' : score >= 50 ? 'needs-improvement' : 'poor';

  return { score, rating, coreWebVitals: cwv, opportunities, metrics };
}

module.exports = { analyzePerformance, rateLCP, rateFCP, rateTTFB, rateCLS, calculateScore, rateMetric, generateSuggestion, THRESHOLDS };
