'use strict';

const { learnFromErrors, suggestFixes, learnFromError } = require('../brain/atl_learner');

console.log('=== ATL 学习功能测试 ===\n');

const testErrors = [
  {
    text: 'Failed to load resource: the server responded with a status of 404 (Not Found)',
    url: 'https://example.com/api/v1/health',
    type: 'network',
    status: 404
  },
  {
    text: 'Access to XMLHttpRequest at \'https://api.example.com/data\' from origin \'https://example.com\' has been blocked by CORS policy: No \'Access-Control-Allow-Origin\' header is present on the requested resource.',
    url: 'https://api.example.com/data',
    type: 'network',
    status: 0
  },
  {
    text: 'Uncaught TypeError: Cannot read properties of undefined (reading \'data\')',
    url: 'https://example.com/app.js',
    type: 'console',
    status: undefined
  },
  {
    text: 'POST https://example.com/api/login 401 (Unauthorized)',
    url: 'https://example.com/api/login',
    type: 'network',
    status: 401
  }
];

console.log('测试错误列表:', testErrors.length, '个错误');
console.log('');

const learningResult = learnFromErrors(testErrors);
console.log('=== 学习结果 ===');
console.log('总错误分组:', learningResult.totalErrorGroups);
console.log('高置信度匹配数:', learningResult.highConfidenceCount);
console.log('');

for (const result of learningResult.results) {
  console.log('错误签名:', result.errorSignature);
  console.log('出现次数:', result.errorCount);
  console.log('高置信度:', result.hasHighConfidence);
  
  if (result.topMatches && result.topMatches.length > 0) {
    console.log('Top匹配:');
    for (const match of result.topMatches.slice(0, 3)) {
      console.log(`  - ${match.title} (概率: ${(match.probability * 100).toFixed(1)}%)`);
      console.log(`    根因: ${match.rootCause}`);
      console.log(`    修复: ${match.fix}`);
    }
  }
  
  if (result.recommendedFix) {
    console.log('推荐修复:', result.recommendedFix);
  }
  console.log('');
}

console.log('=== 修复建议测试 ===');
for (const error of testErrors) {
  const fixResult = suggestFixes(error);
  console.log('\n错误:', error.text.slice(0, 50), '...');
  console.log('修复建议数:', fixResult.fixes.length);
  for (const fix of fixResult.fixes) {
    console.log(`  - ${fix.title} (置信度: ${(fix.confidence * 100).toFixed(1)}%)`);
    console.log(`    修复: ${fix.fix}`);
  }
}

console.log('\n=== ATL 功能测试完成 ===');