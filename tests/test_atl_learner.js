'use strict';

const assert = require('assert');
const { learnFromError, learnFromErrors, suggestFixes, computeLogLikelihoodRatio, calculateLikelihoodScore } = require('../brain/atl_learner');
const { patternStore } = require('../brain/pattern_store');
const { classifyError } = require('../brain/error_aggregator');

console.log('=== ATL Learner Tests ===');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}: ${e.message}`);
  }
}

test('calculateLikelihoodScore - exact symptom match', () => {
  const pattern = {
    id: 'test-pattern-1',
    score: 1.0,
    symptom: 'API 端点返回 404',
    rootCause: '路由配置错误',
    tags: ['api', '404']
  };
  
  const errorEvidence = {
    text: '多个 API 端点返回 404，schema.sql 中 DEFAULT 值缺少引号导致迁移失败',
    url: 'http://example.com/api/users'
  };
  
  const { score, matchDetails } = calculateLikelihoodScore(pattern, errorEvidence);
  assert.strictEqual(typeof score, 'number');
  assert.strictEqual(score > 0.3, true);
  assert.strictEqual(Array.isArray(matchDetails), true);
});

test('calculateLikelihoodScore - tag match', () => {
  const pattern = {
    id: 'test-pattern-2',
    score: 1.0,
    symptom: 'database schema migration',
    rootCause: 'schema migration failed',
    tags: ['postgres', 'schema']
  };
  
  const errorEvidence = {
    text: 'PostgreSQL schema migration failed',
    url: 'http://example.com'
  };
  
  const { score, matchDetails } = calculateLikelihoodScore(pattern, errorEvidence);
  assert.strictEqual(typeof score, 'number');
  assert.strictEqual(matchDetails.some(m => m.includes('标签匹配: postgres')), true);
  assert.strictEqual(matchDetails.some(m => m.includes('标签匹配: schema')), true);
});

test('computeLogLikelihoodRatio - valid ratio', () => {
  const pattern = patternStore[0];
  const errorEvidence = {
    text: 'schema.sql 中 DEFAULT 值缺少引号',
    url: 'http://huoke.example.com'
  };
  
  const result = computeLogLikelihoodRatio(pattern, errorEvidence);
  assert.strictEqual(result.patternId, pattern.id);
  assert.strictEqual(typeof result.score, 'number');
  assert.strictEqual(typeof result.probability, 'number');
  assert.strictEqual(result.probability >= 0 && result.probability <= 1, true);
});

test('learnFromError - single error', () => {
  const errorEvidence = {
    text: '多个 API 端点返回 404/500，schema.sql 中 DEFAULT 值缺少引号导致迁移失败',
    url: 'http://huoke.example.com'
  };
  
  const result = learnFromError(errorEvidence);
  assert.strictEqual(typeof result.errorSignature, 'string');
  assert.strictEqual(result.totalPatterns, patternStore.length);
  assert.strictEqual(Array.isArray(result.topMatches), true);
});

test('learnFromError - no match', () => {
  const errorEvidence = {
    text: 'completely unknown error message that does not match any pattern',
    url: 'http://unknown.example.com'
  };
  
  const result = learnFromError(errorEvidence);
  assert.strictEqual(result.matchedPatterns >= 0, true);
});

test('learnFromErrors - multiple errors', () => {
  const errorList = [
    { text: 'API 返回 404', url: 'http://huoke.example.com/api/users' },
    { text: 'schema.sql 迁移失败', url: 'http://huoke.example.com' },
    { text: 'API 返回 404', url: 'http://huoke.example.com/api/orders' },
    { text: 'unknown error', url: 'http://other.example.com' }
  ];
  
  const result = learnFromErrors(errorList);
  assert.strictEqual(typeof result.totalErrorGroups, 'number');
  assert.strictEqual(result.totalErrorGroups >= 2, true);
  assert.strictEqual(Array.isArray(result.results), true);
  assert.strictEqual(typeof result.summary, 'object');
});

test('suggestFixes - with matching pattern', () => {
  const errorEvidence = {
    text: '多表缺失列/缺失表/迁移未执行，导致多个端点 500',
    url: 'http://huoke.example.com'
  };
  
  const result = suggestFixes(errorEvidence);
  assert.strictEqual(typeof result.errorSignature, 'string');
  assert.strictEqual(Array.isArray(result.fixes), true);
});

test('suggestFixes - without matching pattern (fallback to classification)', () => {
  const errorEvidence = {
    text: 'Cannot read properties of undefined',
    url: 'http://example.com'
  };
  
  const result = suggestFixes(errorEvidence);
  assert.strictEqual(Array.isArray(result.fixes), true);
  assert.strictEqual(result.fixes.length > 0, true);
});

test('classifyError - network error', () => {
  const result = classifyError({
    text: 'Failed to load resource: net::ERR_CONNECTION_REFUSED'
  });
  assert.strictEqual(result.category, 'network');
  assert.strictEqual(typeof result.suggestion, 'string');
});

test('classifyError - runtime error', () => {
  const result = classifyError({
    text: 'Cannot read properties of undefined'
  });
  assert.strictEqual(result.category, 'runtime');
});

test('classifyError - CORS error', () => {
  const result = classifyError({
    text: "CORS policy: No 'Access-Control-Allow-Origin'"
  });
  assert.strictEqual(result.category, 'network');
});

test('classifyError - no match', () => {
  const result = classifyError({
    text: 'random error message'
  });
  assert.strictEqual(result, null);
});

console.log('\n=== Test Results ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}