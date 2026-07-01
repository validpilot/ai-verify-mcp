'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const perfAnalyzer = require('../hands/perf_analyzer');

// ============================================================
// perf_analyzer 模块 — 评分函数单元测试
// ============================================================

describe('perfAnalyzer — rateLCP', () => {
  test('LCP ≤ 2500ms → good', () => {
    assert.equal(perfAnalyzer.rateLCP('1500ms'), 'good');
    assert.equal(perfAnalyzer.rateLCP('2500ms'), 'good');
  });

  test('LCP 2501-4000ms → needs-improvement', () => {
    assert.equal(perfAnalyzer.rateLCP('3000ms'), 'needs-improvement');
    assert.equal(perfAnalyzer.rateLCP('4000ms'), 'needs-improvement');
  });

  test('LCP > 4000ms → poor', () => {
    assert.equal(perfAnalyzer.rateLCP('5000ms'), 'poor');
  });

  test('无效值 → unknown', () => {
    assert.equal(perfAnalyzer.rateLCP('N/A'), 'unknown');
    assert.equal(perfAnalyzer.rateLCP(undefined), 'unknown');
  });
});

describe('perfAnalyzer — rateFCP', () => {
  test('FCP ≤ 1800ms → good', () => {
    assert.equal(perfAnalyzer.rateFCP('1000ms'), 'good');
    assert.equal(perfAnalyzer.rateFCP('1800ms'), 'good');
  });

  test('FCP 1801-3000ms → needs-improvement', () => {
    assert.equal(perfAnalyzer.rateFCP('2500ms'), 'needs-improvement');
  });

  test('FCP > 3000ms → poor', () => {
    assert.equal(perfAnalyzer.rateFCP('5000ms'), 'poor');
  });
});

describe('perfAnalyzer — rateTTFB', () => {
  test('TTFB ≤ 800ms → good', () => {
    assert.equal(perfAnalyzer.rateTTFB('500ms'), 'good');
    assert.equal(perfAnalyzer.rateTTFB('800ms'), 'good');
  });

  test('TTFB 801-1800ms → needs-improvement', () => {
    assert.equal(perfAnalyzer.rateTTFB('1200ms'), 'needs-improvement');
  });

  test('TTFB > 1800ms → poor', () => {
    assert.equal(perfAnalyzer.rateTTFB('2500ms'), 'poor');
  });
});

describe('perfAnalyzer — rateCLS', () => {
  test('CLS ≤ 0.1 → good', () => {
    assert.equal(perfAnalyzer.rateCLS(0.05), 'good');
    assert.equal(perfAnalyzer.rateCLS(0.1), 'good');
  });

  test('CLS 0.11-0.25 → needs-improvement', () => {
    assert.equal(perfAnalyzer.rateCLS(0.15), 'needs-improvement');
  });

  test('CLS > 0.25 → poor', () => {
    assert.equal(perfAnalyzer.rateCLS(0.5), 'poor');
  });
});

describe('perfAnalyzer — calculateScore', () => {
  test('所有指标 good → 100分', () => {
    const score = perfAnalyzer.calculateScore({
      LCP: '1500ms', FCP: '800ms', TTFB: '300ms'
    });
    assert.equal(score, 100);
  });

  test('LCP poor → 扣30分', () => {
    const score = perfAnalyzer.calculateScore({
      LCP: '5000ms', FCP: '800ms', TTFB: '300ms'
    });
    assert.equal(score, 70);
  });

  test('所有指标 poor → 最低0分', () => {
    const score = perfAnalyzer.calculateScore({
      LCP: '5000ms', FCP: '5000ms', TTFB: '5000ms'
    });
    assert.ok(score <= 30, '多项 poor 应大幅扣分');
  });
});

describe('perfAnalyzer — analyzePerformance', () => {
  test('模块导出所有必要函数', () => {
    assert.ok(typeof perfAnalyzer.analyzePerformance === 'function', '导出 analyzePerformance');
    assert.ok(typeof perfAnalyzer.rateLCP === 'function', '导出 rateLCP');
    assert.ok(typeof perfAnalyzer.rateFCP === 'function', '导出 rateFCP');
    assert.ok(typeof perfAnalyzer.rateTTFB === 'function', '导出 rateTTFB');
    assert.ok(typeof perfAnalyzer.rateCLS === 'function', '导出 rateCLS');
    assert.ok(typeof perfAnalyzer.calculateScore === 'function', '导出 calculateScore');
  });
});
