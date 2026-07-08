'use strict';

/**
 * memory_recall 工具最小自测脚本
 * 验证 5 个操作（stats/consolidate/recall/list/forget）能端到端跑通
 * 不依赖浏览器，纯 Node.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const { handle } = require('../handlers/memory');

async function run() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-memory-test-'));
  console.log(`[Test] 临时项目根目录: ${tmpDir}`);

  const deps = {
    cwd: tmpDir,
    projectRoot: tmpDir,
    log: (level, msg) => console.log(`[${level}] ${msg}`)
  };

  // 1. stats（空库）
  console.log('\n=== 1. stats（空库） ===');
  const r1 = await handle('memory_recall', { operation: 'stats' }, deps);
  console.log(JSON.parse(r1.content[0].text).summary);

  // 2. consolidate 情景 1
  console.log('\n=== 2. consolidate 情景1 (huokesys 表缺失) ===');
  const r2 = await handle('memory_recall', {
    operation: 'consolidate',
    episode: {
      title: 'huokesys settlement_accounts 表缺失',
      target: 'http://api.huokesys.com',
      symptom: '多个 API 返回 500，settlement_accounts 表不存在',
      rootCause: 'schema.sql 中 CREATE TABLE settlement_accounts 未执行',
      fix: '执行 schema.sql 中遗漏的 CREATE TABLE 语句',
      tags: ['postgres', 'schema', 'huokesys', 'missing-table']
    }
  }, deps);
  const r2j = JSON.parse(r2.content[0].text);
  console.log(r2j.summary, '| saved:', r2j.saved);

  // 3. consolidate 情景 2（不同项目，应创建新 pattern）
  console.log('\n=== 3. consolidate 情景2 (类似问题，应合并到现有 pattern) ===');
  const r3 = await handle('memory_recall', {
    operation: 'consolidate',
    episode: {
      title: 'huokesys 订单表不存在',
      target: 'http://api.huokesys.com',
      symptom: 'settlement_accounts 表不存在导致 500 错误',
      rootCause: 'CREATE TABLE 未执行',
      fix: '补执行 CREATE TABLE settlement_accounts',
      tags: ['postgres', 'schema', 'huokesys']
    }
  }, deps);
  const r3j = JSON.parse(r3.content[0].text);
  console.log(r3j.summary, '| patternId:', r3j.saved.patternId);

  // 4. recall（按症状检索）
  console.log('\n=== 4. recall "settlement_accounts 表不存在" ===');
  const r4 = await handle('memory_recall', {
    operation: 'recall',
    query: 'settlement_accounts 表不存在 500 错误',
    minScore: 0.1
  }, deps);
  const r4j = JSON.parse(r4.content[0].text);
  console.log(r4j.summary);
  console.log('top match:', r4j.matches[0] ? { id: r4j.matches[0].id, score: r4j.matches[0].score, title: r4j.matches[0].title } : null);

  // 5. recall（按 URL 检索）
  console.log('\n=== 5. recall URL=http://api.huokesys.com ===');
  const r5 = await handle('memory_recall', {
    operation: 'recall',
    query: 'http://api.huokesys.com',
    minScore: 0.1
  }, deps);
  const r5j = JSON.parse(r5.content[0].text);
  console.log(r5j.summary, '| queryType:', r5j.queryType);

  // 6. list
  console.log('\n=== 6. list ===');
  const r6 = await handle('memory_recall', { operation: 'list', limit: 10 }, deps);
  const r6j = JSON.parse(r6.content[0].text);
  console.log(r6j.summary);
  for (const item of r6j.items) {
    console.log(`  [${item.memoryType}] ${item.id} "${item.title}" tags=[${item.tags.join(',')}]`);
  }

  // 7. stats（有数据后）
  console.log('\n=== 7. stats（有数据后） ===');
  const r7 = await handle('memory_recall', { operation: 'stats' }, deps);
  const r7j = JSON.parse(r7.content[0].text);
  console.log(r7j.summary);
  console.log('  byType:', r7j.stats.byType);
  console.log('  byHost:', r7j.stats.byHost);

  // 8. 项目隔离测试：切换到另一个项目根，应看不到上述记忆
  console.log('\n=== 8. 项目隔离测试 ===');
  const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-memory-test2-'));
  const deps2 = { cwd: tmpDir2, projectRoot: tmpDir2, log: deps.log };
  const r8 = await handle('memory_recall', { operation: 'stats' }, deps2);
  const r8j = JSON.parse(r8.content[0].text);
  console.log(`项目2 记忆数: ${r8j.stats.totalMemories}（应为 0）`);
  fs.rmSync(tmpDir2, { recursive: true, force: true });

  // 9. forget byTag
  console.log('\n=== 9. forget byTag=huokesys ===');
  const r9 = await handle('memory_recall', {
    operation: 'forget',
    forgetStrategy: 'byTag',
    tags: ['huokesys']
  }, deps);
  const r9j = JSON.parse(r9.content[0].text);
  console.log(r9j.summary);

  // 10. stats（forget 后）
  console.log('\n=== 10. stats（forget 后） ===');
  const r10 = await handle('memory_recall', { operation: 'stats' }, deps);
  const r10j = JSON.parse(r10.content[0].text);
  console.log(r10j.summary);

  // 清理
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('\n[Test] 清理完成');

  const passed = r10j.stats.totalMemories === 0 && r8j.stats.totalMemories === 0 && r4j.matches.length > 0;
  console.log(`\n========== 结果: ${passed ? 'PASS ✅' : 'FAIL ❌'} ==========`);
  process.exit(passed ? 0 : 1);
}

run().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
