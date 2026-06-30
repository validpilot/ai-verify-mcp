'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { collectRawErrors, aggregateErrors, errorSummaryMd } = require('../brain/error_aggregator');

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
