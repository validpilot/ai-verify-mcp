'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { patternStore } = require('../brain/pattern_store');
const { learnFromError, learnFromErrors, suggestFixes, computeLogLikelihoodRatio, calculateLikelihoodScore } = require('../brain/atl_learner');

describe('ATL Learner', () => {
  describe('learnFromError', () => {
    it('should return learning result for database schema error', () => {
      const error = {
        text: '多个 API 端点返回 404/500，schema.sql 中 DEFAULT 值缺少引号导致迁移失败',
        url: '/api/users',
        type: 'network',
        status: 500
      };
      const result = learnFromError(error);
      assert.ok(result);
      assert.ok(result.errorSignature);
      assert.strictEqual(result.totalPatterns, patternStore.length);
      assert.ok(Array.isArray(result.topMatches));
    });

    it('should return result for unknown error', () => {
      const error = {
        text: 'Unknown error occurred',
        url: '/api/test',
        type: 'console'
      };
      const result = learnFromError(error);
      assert.ok(result);
      assert.strictEqual(result.hasHighConfidence, false);
    });
  });

  describe('learnFromErrors', () => {
    it('should process multiple errors', () => {
      const errors = [
        { text: 'schema.sql DEFAULT值缺少引号', url: '/api/v1/health', type: 'network', status: 500 },
        { text: 'column does not exist', url: '/api/v1/users', type: 'network', status: 500 }
      ];
      const result = learnFromErrors(errors);
      assert.ok(result);
      assert.ok(result.totalErrorGroups >= 1);
      assert.ok(Array.isArray(result.results));
    });

    it('should handle empty error list', () => {
      const result = learnFromErrors([]);
      assert.ok(result);
      assert.strictEqual(result.totalErrorGroups, 0);
    });
  });

  describe('suggestFixes', () => {
    it('should suggest fix for matching error', () => {
      const error = {
        text: 'schema.sql DEFAULT值缺少引号导致迁移失败',
        url: '/api/test'
      };
      const result = suggestFixes(error);
      assert.ok(result);
      assert.ok(Array.isArray(result.fixes));
    });

    it('should suggest classification-based fix for unknown error', () => {
      const error = {
        text: 'Failed to load resource: net::ERR_CONNECTION_REFUSED',
        url: '/api/test'
      };
      const result = suggestFixes(error);
      assert.ok(result);
      assert.ok(result.fixes.length > 0);
    });
  });

  describe('computeLogLikelihoodRatio', () => {
    it('should compute likelihood ratio', () => {
      const pattern = {
        id: 'test-pattern',
        score: 2.0,
        title: 'Test Pattern',
        symptom: 'test error',
        rootCause: 'test cause',
        fix: 'test fix',
        tags: ['test', 'tag'],
        source: 'test'
      };
      const error = {
        text: 'test error occurred',
        url: '/test'
      };
      const result = computeLogLikelihoodRatio(pattern, error);
      assert.ok(result);
      assert.ok(typeof result.score === 'number');
      assert.ok(typeof result.probability === 'number');
      assert.ok(result.probability >= 0 && result.probability <= 1);
    });
  });

  describe('calculateLikelihoodScore', () => {
    it('should calculate score based on similarity', () => {
      const pattern = {
        score: 1.0,
        symptom: 'database schema error',
        tags: ['postgres', 'schema']
      };
      const error = {
        text: 'schema error in database',
        url: '/api/postgres'
      };
      const result = calculateLikelihoodScore(pattern, error);
      assert.ok(result);
      assert.ok(typeof result.score === 'number');
      assert.ok(result.score > 0);
    });
  });
});