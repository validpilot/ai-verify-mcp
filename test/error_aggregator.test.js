'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { collectRawErrors, aggregateErrors, errorSummaryMd, classifyError, ERROR_PATTERNS } = require('../brain/error_aggregator');

describe('collectRawErrors', () => {
  it('returns empty array for empty input', () => {
    assert.deepEqual(collectRawErrors({}), []);
    assert.deepEqual(collectRawErrors(), []);
  });

  it('extracts console errors from various formats', () => {
    const result = collectRawErrors({
      console: { recent: [{ text: 'err1' }] }
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'err1');
  });

  it('extracts consoleErrors (legacy format)', () => {
    const result = collectRawErrors({
      consoleErrors: [{ text: 'err1' }]
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].source, 'console');
  });

  it('extracts network errors', () => {
    const result = collectRawErrors({
      network: { recent: [{ url: 'https://example.com/404', status: 404 }] }
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].source, 'network');
    assert.equal(result[0].status, 404);
  });

  it('extracts page errors', () => {
    const result = collectRawErrors({
      pageErrors: [{ message: 'TypeError: x is not a function' }]
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].source, 'pageerror');
  });

  it('handles non-array records gracefully', () => {
    const result = collectRawErrors({
      console: { recent: null },
      networkErrors: 'not an array'
    });
    assert.equal(result.length, 0);
  });

  it('recursively extracts from evidence', () => {
    const result = collectRawErrors({
      evidence: {
        console: { recent: [{ text: 'nested err' }] }
      }
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'nested err');
  });

  it('recursively extracts from errors', () => {
    const result = collectRawErrors({
      errors: {
        pageErrors: [{ message: 'deep error' }]
      }
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].source, 'pageerror');
  });

  it('handles deeply nested structures', () => {
    const result = collectRawErrors({
      evidence: {
        errors: {
          mcpErrors: [{ code: 'TIMEOUT' }]
        }
      }
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].code, 'TIMEOUT');
  });
});

describe('aggregateErrors', () => {
  it('returns empty result when no errors', () => {
    const result = aggregateErrors({ console: { recent: [] } });
    assert.equal(result.topErrors.length, 0);
    assert.equal(result.uniqueCount, 0);
    assert.equal(result.totalCount, 0);
    assert.ok(result.summary.includes('Status: pass'));
  });

  it('groups identical errors by signature', () => {
    const input = {
      console: {
        recent: [
          { type: 'error', text: 'Cannot read property x', url: 'http://example.com/app.js' },
          { type: 'error', text: 'Cannot read property x', url: 'http://example.com/app.js' }
        ]
      }
    };
    const result = aggregateErrors(input);
    assert.equal(result.uniqueCount, 1);
    assert.equal(result.topErrors.length, 1);
    assert.equal(result.topErrors[0].count, 2);
  });

  it('separates different errors', () => {
    const input = {
      console: {
        recent: [
          { type: 'error', text: 'TypeError: x is null', url: 'http://example.com/a.js' },
          { type: 'error', text: 'ReferenceError: y not defined', url: 'http://example.com/b.js' }
        ]
      }
    };
    const result = aggregateErrors(input);
    assert.equal(result.uniqueCount, 2);
    assert.equal(result.totalCount, 2);
  });

  it('sorts by severity then count', () => {
    const input = {
      pageErrors: [{ message: 'CRASH' }],
      console: {
        recent: [
          { type: 'warning', text: 'Deprecated API', url: 'http://example.com/a.js' },
          { type: 'warning', text: 'Deprecated API', url: 'http://example.com/a.js' },
          { type: 'error', text: 'Cannot read property', url: 'http://example.com/b.js' }
        ]
      }
    };
    const result = aggregateErrors(input);
    assert.equal(result.topErrors.length, 3);
    // pageerror (severity 4) should be first
    assert.ok(result.topErrors[0].signature.includes('pageerror'));
    assert.equal(result.topErrors[0].severity, 4);
  });

  it('respects limit option', () => {
    const input = {
      console: {
        recent: [
          { type: 'error', text: 'Error 1', url: 'http://ex.com/1.js' },
          { type: 'error', text: 'Error 2', url: 'http://ex.com/2.js' },
          { type: 'error', text: 'Error 3', url: 'http://ex.com/3.js' }
        ]
      }
    };
    const result = aggregateErrors(input, { limit: 2 });
    assert.equal(result.topErrors.length, 2);
  });

  it('includes example details', () => {
    const input = {
      console: {
        recent: [
          { type: 'error', text: 'Something broke', url: 'http://ex.com/app.js', status: 500 }
        ]
      }
    };
    const result = aggregateErrors(input);
    assert.equal(result.topErrors[0].examples.length, 1);
    assert.equal(result.topErrors[0].examples[0].type, 'error');
    assert.equal(result.topErrors[0].examples[0].url, 'http://ex.com/app.js');
  });

  it('filters out info-level items', () => {
    const result = aggregateErrors({
      console: { recent: [{ type: 'info', text: 'All good', url: 'http://ex.com/app.js' }] }
    });
    assert.equal(result.totalCount, 0);
    assert.ok(result.summary.includes('Status: pass'));
  });
});

describe('errorSummaryMd', () => {
  it('generates pass summary when no errors', () => {
    const md = errorSummaryMd({ console: { recent: [] } });
    assert.ok(md.includes('Status: pass'));
    assert.ok(md.includes('Error Summary'));
  });

  it('generates fail summary with error details', () => {
    const md = errorSummaryMd({
      console: { recent: [{ type: 'error', text: 'Something broke', url: 'http://ex.com/app.js', status: 500 }] }
    });
    assert.ok(md.includes('Status: fail'));
    assert.ok(md.includes('[1x'));
  });
});

describe('classifyError', () => {
  it('should detect ResizeObserver error pattern', () => {
    const result = classifyError({ text: 'ResizeObserver loop limit exceeded' });
    assert.ok(result);
    assert.equal(result.category, 'layout');
    assert.ok(result.suggestion.includes('重排'));
  });

  it('should detect ERR_CONNECTION_REFUSED pattern', () => {
    const result = classifyError({ text: 'Failed to load resource: net::ERR_CONNECTION_REFUSED' });
    assert.ok(result);
    assert.equal(result.category, 'network');
    assert.ok(result.suggestion.includes('后端API'));
  });

  it('should detect CORS pattern', () => {
    const result = classifyError({ text: 'has been blocked by CORS policy: No \'Access-Control-Allow-Origin\'' });
    assert.ok(result);
    assert.equal(result.category, 'network');
    assert.ok(result.affectedTarget, '跨域');
  });

  it('should detect Hydration failed pattern', () => {
    const result = classifyError({ text: 'Hydration failed because the initial UI does not match' });
    assert.ok(result);
    assert.equal(result.category, 'framework');
    assert.ok(result.suggestion.includes('水合'));
  });

  it('should detect WebSocket failed pattern', () => {
    const result = classifyError({ text: 'WebSocket connection to wss://example.com failed' });
    assert.ok(result);
    assert.equal(result.category, 'network');
    assert.equal(result.affectedTarget, 'WebSocket');
  });

  it('should return null for unrecognized patterns', () => {
    const result = classifyError({ text: 'Some random text without matching' });
    assert.equal(result, null);
  });

  it('should detect Mixed Content security pattern', () => {
    const result = classifyError({ text: 'Mixed Content: The page was loaded over HTTPS' });
    assert.ok(result);
    assert.equal(result.category, 'security');
    assert.equal(result.severity, undefined);
  });
});

describe('aggregateErrors with pattern classification', () => {
  it('should attach category to topErrors when pattern matches', () => {
    const input = {
      console: {
        recent: [
          { type: 'error', text: 'ResizeObserver loop limit exceeded', url: 'http://ex.com/app.js' }
        ]
      }
    };
    const result = aggregateErrors(input);
    assert.equal(result.topErrors.length, 1);
    assert.equal(result.topErrors[0].category, 'layout');
    assert.ok(result.topErrors[0].suggestion.includes('重排'));
    assert.equal(result.topErrors[0].affectedTarget, 'CSS布局');
  });

  it('should attach network category for CORS errors in aggregateErrors', () => {
    const input = {
      console: {
        recent: [
          { type: 'error', text: 'blocked by CORS policy: No \'Access-Control-Allow-Origin\'', url: 'http://ex.com/api' }
        ]
      }
    };
    const result = aggregateErrors(input);
    assert.equal(result.topErrors.length, 1);
    assert.equal(result.topErrors[0].category, 'network');
    assert.equal(result.topErrors[0].affectedTarget, '跨域');
  });
});

// ============================================================
// severityOf 间接测试（通过 aggregateErrors）
// ============================================================

describe('aggregateErrors — severityOf 覆盖路径', () => {
  it('404 + .js URL 应为 severity 2（关键 JS 资源缺失）', () => {
    const input = {
      console: {
        recent: [
          { type: 'error', text: 'Failed to load resource', url: 'http://ex.com/app.js', status: 404 }
        ]
      }
    };
    const result = aggregateErrors(input);
    assert.equal(result.topErrors.length, 1);
    assert.equal(result.topErrors[0].severity, 2);
  });

  it('404 + .css URL 应为 severity 2（关键 CSS 资源缺失）', () => {
    const input = {
      console: {
        recent: [
          { type: 'error', text: 'Failed to load resource', url: 'http://ex.com/style.css', status: 404 }
        ]
      }
    };
    const result = aggregateErrors(input);
    assert.equal(result.topErrors.length, 1);
    assert.equal(result.topErrors[0].severity, 2);
  });

  it('404 + .png URL 应为 severity 1（非关键资源）', () => {
    const input = {
      console: {
        recent: [
          { type: 'error', text: 'Failed to load resource', url: 'http://ex.com/logo.png', status: 404 }
        ]
      }
    };
    const result = aggregateErrors(input);
    assert.equal(result.topErrors.length, 1);
    assert.equal(result.topErrors[0].severity, 1);
  });

  it('500 状态应为 severity 3（服务端错误）', () => {
    const input = {
      network: {
        recent: [
          { url: 'http://ex.com/api', status: 500, method: 'GET' }
        ]
      }
    };
    const result = aggregateErrors(input);
    assert.equal(result.topErrors.length, 1);
    assert.equal(result.topErrors[0].severity, 3);
  });

  it('silentFail 来源应为 severity 3', () => {
    const input = {
      silentFailErrors: [
        { text: 'HTTP 200 but error in body', url: 'http://ex.com/api', status: 200 }
      ]
    };
    const result = aggregateErrors(input);
    assert.equal(result.topErrors.length, 1);
    assert.equal(result.topErrors[0].severity, 3);
  });

  it('warning 类型应为 severity 1', () => {
    const input = {
      console: {
        recent: [
          { type: 'warning', text: 'Deprecated API usage', url: 'http://ex.com/app.js' }
        ]
      }
    };
    const result = aggregateErrors(input);
    assert.equal(result.topErrors.length, 1);
    assert.equal(result.topErrors[0].severity, 1);
  });
});

// ============================================================
// errorSummaryMd — 聚合输入路径
// ============================================================

describe('errorSummaryMd — 聚合输入路径', () => {
  it('接受 errorAggregation 格式输入', () => {
    const md = errorSummaryMd({
      errorAggregation: {
        totalErrors: 5,
        topPatterns: [
          { pattern: 'TypeError: x is null', count: 3 },
          { pattern: '404 Not Found', count: 2 }
        ]
      }
    });
    assert.ok(md.includes('Status: fail'));
    assert.ok(md.includes('total=5'));
    assert.ok(md.includes('unique=2'));
  });

  it('接受 evidence.errorAggregation 格式输入', () => {
    const md = errorSummaryMd({
      evidence: {
        errorAggregation: {
          totalErrors: 3,
          topPatterns: [
            { pattern: 'CORS error', count: 3 }
          ]
        }
      }
    });
    assert.ok(md.includes('Status: fail'));
    assert.ok(md.includes('total=3'));
  });

  it('已有 topErrors 的输入直接使用', () => {
    const md = errorSummaryMd({
      topErrors: [
        { signature: 'test error', count: 1, severity: 2, examples: [] }
      ],
      uniqueCount: 1,
      totalCount: 1,
      summary: '## Error Summary\n- Status: fail'
    });
    assert.ok(md.includes('Status: fail'));
  });
});
