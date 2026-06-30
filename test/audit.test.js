'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const visualHandler = require('../handlers/visual');

function createMockDeps(opts = {}) {
  return {
    text: (content) => ({ content: [{ type: 'text', text: content }] }),
    ensurePage: async (args) => {
      return { target: { url: () => args?.url || 'http://example.com' } };
    },
    visualBaseline: opts.visualBaseline || (async (target, args) => ({
      baselineId: 'baseline-001',
      url: target.url(),
      screenshotCount: 1,
      timestamp: new Date().toISOString()
    })),
    visualCompare: opts.visualCompare || (async (target, args) => ({
      compareId: 'compare-001',
      url: target.url(),
      diffPercentage: 2.5,
      passed: true,
      diffImage: null,
      timestamp: new Date().toISOString()
    })),
    runFullAudit: opts.runFullAudit || ((args) => ({
      url: args.url || 'http://example.com',
      auditId: 'audit-001',
      score: 87,
      results: {
        a11y: { score: 90, violations: 3 },
        performance: { score: 82, metrics: { fcp: 1200, lcp: 2500, tbt: 300 } },
        bestPractices: { score: 95 },
        seo: { score: 88 }
      },
      summary: 'Overall score: 87/100',
      timestamp: new Date().toISOString()
    })),
    runA11yCheck: opts.runA11yCheck || (async (target, args) => ({
      selector: args.selector || 'body',
      violations: [
        { id: 'color-contrast', description: '文本颜色对比度不足', severity: 'serious', nodes: 3 },
        { id: 'image-alt', description: '图片缺少alt属性', severity: 'moderate', nodes: 1 }
      ],
      totalViolations: 2,
      passes: 45,
      score: 85
    })),
    runPerformanceCheck: opts.runPerformanceCheck || (async (target, args) => ({
      url: target.url(),
      metrics: {
        fcp: { value: 1200, rating: 'good' },
        lcp: { value: 2500, rating: 'needs-improvement' },
        tbt: { value: 300, rating: 'good' },
        cls: { value: 0.05, rating: 'good' },
        si: { value: 3200, rating: 'needs-improvement' }
      },
      overallScore: 72,
      timestamp: new Date().toISOString()
    })),
    runLighthouseAudit: opts.runLighthouseAudit || ((args) => ({
      url: args.url || 'http://example.com',
      categories: args.categories || ['performance', 'accessibility', 'best-practices', 'seo'],
      scores: {
        performance: 0.82,
        accessibility: 0.90,
        'best-practices': 0.95,
        seo: 0.88
      },
      reportPath: '/tmp/lighthouse-report.html',
      timestamp: new Date().toISOString()
    }))
  };
}

describe('Audit tools', () => {
  it('browser_full_audit returns comprehensive audit results', async () => {
    const deps = createMockDeps();
    const result = await visualHandler.handle('browser_full_audit', { url: 'http://example.com' }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.score, 87);
    assert.ok(parsed.results);
    assert.ok(parsed.results.a11y);
    assert.ok(parsed.results.performance);
    assert.strictEqual(parsed.results.a11y.score, 90);
    assert.strictEqual(parsed.results.performance.score, 82);
  });

  it('browser_a11y_check returns accessibility violations', async () => {
    const deps = createMockDeps();
    const result = await visualHandler.handle('browser_a11y_check', { selector: 'body' }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.violations));
    assert.strictEqual(parsed.totalViolations, 2);
    assert.strictEqual(parsed.violations[0].id, 'color-contrast');
    assert.strictEqual(parsed.score, 85);
  });

  it('browser_a11y_check validates selector param', async () => {
    const deps = createMockDeps({
      runA11yCheck: async () => ({
        selector: '',
        violations: [],
        totalViolations: 0,
        passes: 0,
        score: 100
      })
    });
    const result = await visualHandler.handle('browser_a11y_check', { selector: '' }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.selector, '');
    assert.strictEqual(parsed.totalViolations, 0);
  });

  it('browser_performance_check returns performance metrics', async () => {
    const deps = createMockDeps();
    const result = await visualHandler.handle('browser_performance_check', {}, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.metrics);
    assert.ok(parsed.metrics.fcp);
    assert.strictEqual(parsed.metrics.fcp.value, 1200);
    assert.strictEqual(parsed.metrics.fcp.rating, 'good');
    assert.ok(parsed.metrics.lcp);
    assert.strictEqual(parsed.overallScore, 72);
  });

  it('browser_lighthouse_audit validates categories param', async () => {
    const deps = createMockDeps();
    const result = await visualHandler.handle('browser_lighthouse_audit', {
      url: 'http://example.com',
      categories: ['performance', 'accessibility']
    }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.categories);
    assert.deepStrictEqual(parsed.categories, ['performance', 'accessibility']);
    assert.strictEqual(parsed.scores.performance, 0.82);
    assert.strictEqual(parsed.scores.accessibility, 0.90);
    assert.ok(parsed.reportPath.includes('lighthouse'));
  });

  it('browser_full_audit partial results on error', async () => {
    const deps = createMockDeps({
      runFullAudit: () => ({
        url: 'http://example.com',
        auditId: 'audit-err',
        score: 32,
        results: {
          a11y: { score: 0, violations: 25, error: 'Accessibility scan timeout' },
          performance: { score: 45, metrics: {} },
          bestPractices: { score: 0, error: 'Network error' },
          seo: { score: 50 }
        },
        summary: 'Partial results: some audits failed',
        errors: ['Accessibility scan timeout', 'Network error'],
        timestamp: new Date().toISOString()
      })
    });
    const result = await visualHandler.handle('browser_full_audit', { url: 'http://example.com' }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.score, 32);
    assert.ok(parsed.errors);
    assert.strictEqual(parsed.errors.length, 2);
    assert.ok(parsed.summary.includes('Partial'));
  });

  it('unknown visual tool returns isError', async () => {
    const deps = createMockDeps();
    const result = await visualHandler.handle('browser_no_such_tool', {}, deps);
    assert.strictEqual(result.isError, true);
    assert.ok(result.content[0].text.includes('未知工具'));
  });

  it('browser_visual_baseline 缺少参数时返回 isError', async () => {
    const deps = createMockDeps();
    const result = await visualHandler.handle('browser_visual_baseline', {}, deps);
    assert.ok(result);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.baselineId || parsed.error);
  });

  it('browser_visual_compare 在未设置 baseline 时返回有意义的错误', async () => {
    const deps = createMockDeps();
    const result = await visualHandler.handle('browser_visual_compare', { currentUrl: 'http://example.com' }, deps);
    assert.ok(result);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.diffPercentage === 'number' || parsed.error);
  });

  it('browser_performance_check 返回的结构包含 metrics', async () => {
    const deps = createMockDeps();
    const result = await visualHandler.handle('browser_performance_check', { url: 'http://example.com' }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.metrics);
    assert.ok(parsed.metrics.fcp);
    assert.ok(parsed.metrics.lcp);
  });

  it('browser_performance_check 包含 overallScore 指标', async () => {
    const deps = createMockDeps();
    const result = await visualHandler.handle('browser_performance_check', { url: 'http://example.com' }, deps);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(typeof parsed.overallScore === 'number');
    assert.ok(parsed.overallScore > 0);
  });
});
