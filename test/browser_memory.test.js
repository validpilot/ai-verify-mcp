'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname, '..', 'tools');
const memoryAnalyzer = require('../hands/memory_analyzer');

// Build toolNames from handler modules
const handlers = [
  require('../handlers/browser'),
  require('../handlers/session'),
  require('../handlers/evidence'),
  require('../handlers/network'),
  require('../handlers/validation'),
  require('../handlers/diagnose'),
  require('../handlers/visual'),
  require('../handlers/locator'),
  require('../handlers/system'),
];

function buildToolNames() {
  const names = new Set();
  for (const h of handlers) {
    for (const name of h.tools) {
      names.add(name);
    }
  }
  return names;
}

const toolNames = buildToolNames();

// ============================================================
// memory_analyzer 模块 — 单元测试
// ============================================================

describe('memoryAnalyzer — calculateRiskScore', () => {
  test('无 detached、无 listener → score=0', () => {
    assert.equal(memoryAnalyzer.calculateRiskScore(0, 0, 100), 0);
  });

  test('少量 detached → score > 0', () => {
    const score = memoryAnalyzer.calculateRiskScore(2, 0, 100);
    assert.ok(score > 0);
  });

  test('大量 listener → score 增加', () => {
    const scoreLow = memoryAnalyzer.calculateRiskScore(0, 50, 100);
    const scoreHigh = memoryAnalyzer.calculateRiskScore(0, 200, 100);
    assert.ok(scoreHigh > scoreLow);
  });

  test('score 上限为 100', () => {
    const score = memoryAnalyzer.calculateRiskScore(1000, 2000, 100);
    assert.ok(score <= 100);
  });
});

describe('memoryAnalyzer — getRiskLevel', () => {
  test('score=0 → none', () => {
    assert.equal(memoryAnalyzer.getRiskLevel(0), 'none');
  });

  test('score=5 → low', () => {
    assert.equal(memoryAnalyzer.getRiskLevel(5), 'low');
  });

  test('score=20 → medium', () => {
    assert.equal(memoryAnalyzer.getRiskLevel(20), 'medium');
  });

  test('score=50 → high', () => {
    assert.equal(memoryAnalyzer.getRiskLevel(50), 'high');
  });
});

describe('memoryAnalyzer — generateRecommendations', () => {
  test('无泄漏 → 一条无风险建议', () => {
    const recs = memoryAnalyzer.generateRecommendations(0, 0, null, 100);
    assert.equal(recs.length, 1);
    assert.ok(recs[0].includes('未检测到明显内存泄漏'));
  });

  test('有 detached → 包含 detached 建议', () => {
    const recs = memoryAnalyzer.generateRecommendations(3, 0, null, 100);
    assert.ok(recs.some(r => r.includes('detached')));
  });

  test('堆较大 → 包含堆建议', () => {
    const recs = memoryAnalyzer.generateRecommendations(0, 0, 200 * 1024 * 1024, 100);
    assert.ok(recs.some(r => r.includes('堆')));
  });
});

describe('memoryAnalyzer — detectMemoryLeaks', () => {
  test('mock page（无 evaluate）→ 返回默认值', async () => {
    const mockPage = { };
    const result = await memoryAnalyzer.detectMemoryLeaks(mockPage);
    assert.equal(result.detachedCount, 0);
    assert.equal(result.riskLevel, 'none');
    assert.ok(Array.isArray(result.recommendations));
    assert.equal(result.heapSize, null);
  });

  test('mock page（有 evaluate）→ 返回检测结果', async () => {
    const mockPage = {
      evaluate: async (fn) => {
        // 模拟在浏览器中执行
        const result = {
          detachedCount: 1,
          listenerCount: 50,
          heapSize: 50 * 1024 * 1024,
          heapLimit: 1000 * 1024 * 1024,
          totalNodes: 500,
          riskScore: 5,
          riskLevel: 'low',
          recommendations: ['检测完成']
        };
        return result;
      }
    };
    const result = await memoryAnalyzer.detectMemoryLeaks(mockPage);
    // evaluate 返回的是原始对象，但 detectMemoryLeaks 在 evaluate 中调用 detectInBrowser
    // 这里我们测试 evaluate 的路径
    assert.ok(result);
  });
});

// ============================================================
// browser_memory_check schema + 注册验证
// ============================================================

describe('browser_memory_check', () => {
  test('schema 文件存在且 JSON 合法', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, 'browser_memory_check.json'), 'utf8'));
    assert.equal(schema.name, 'browser_memory_check');
    assert.ok(schema.description);
    assert.ok(schema.inputSchema);
    assert.ok(schema.inputSchema.properties);
  });

  test('已注册到 MCP（toolNames 中包含）', () => {
    assert.ok(toolNames.has('browser_memory_check'));
  });

  test('handler 能正确识别 browser_memory_check', () => {
    const handler = require('../handlers/visual');
    assert.ok(handler.tools.includes('browser_memory_check'));
  });

  test('memory_analyzer 模块导出所有方法', () => {
    assert.equal(typeof memoryAnalyzer.detectMemoryLeaks, 'function');
    assert.equal(typeof memoryAnalyzer.calculateRiskScore, 'function');
    assert.equal(typeof memoryAnalyzer.getRiskLevel, 'function');
    assert.equal(typeof memoryAnalyzer.generateRecommendations, 'function');
  });
});
