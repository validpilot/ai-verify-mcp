'use strict';

/**
 * MCP 协议层集成测试：通过 HTTP MCP 服务器验证新工具注册和调用
 *
 * 测试目标（用高阶 MCP 工具测试新工具）：
 *   1. 启动 ai-verify-mcp HTTP 服务器（端口 3457）
 *   2. tools/list → 验证 memory_recall / business_loop_validate / arch_reverse_probe 都注册
 *   3. tools/call memory_recall stats → 验证调用链通畅
 *   4. tools/call memory_recall consolidate + recall → 验证完整闭环
 *   5. 关闭服务器
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = 3457;
const SERVER_PATH = path.join(__dirname, '..', 'server.js');
const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-mcp-integ-'));

let serverProc = null;
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

async function fetchMcp(method, params) {
  const body = {
    jsonrpc: '2.0',
    id: String(Date.now()),
    method,
    params: params || {}
  };
  const res = await fetch(`http://localhost:${PORT}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (json.error) throw new Error(`MCP error: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function waitForServer(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${PORT}/health`);
      if (res.ok) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function run() {
  console.log(`[Test] 临时项目根: ${tmpProject}`);
  console.log('[Test] 启动 ai-verify-mcp HTTP 服务器 (端口', PORT, ')...');

  serverProc = spawn(process.execPath, [SERVER_PATH], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      MCP_MODE: 'http',
      MCP_HTTP_PORT: String(PORT),
      PROJECT_ROOT: tmpProject
    },
    cwd: tmpProject
  });

  serverProc.stdout.on('data', (d) => {
    const s = d.toString();
    if (/error|ERROR|Error/.test(s)) console.log('[server stdout]', s.trim());
  });
  serverProc.stderr.on('data', (d) => {
    const s = d.toString();
    if (/Error|EADDRINUSE|throw/.test(s)) console.log('[server stderr]', s.trim());
  });

  console.log('[Test] 等待服务器就绪...');
  const ready = await waitForServer();
  if (!ready) {
    console.log('❌ 服务器启动超时');
    failed++;
    return cleanup(1);
  }
  console.log('[Test] 服务器已就绪\n');

  try {
    // ===== 测试 1: tools/list 验证三个新工具注册 =====
    console.log('=== 测试 1: tools/list 验证新工具注册 ===');
    const listResult = await fetchMcp('tools/list');
    const toolNames = listResult.tools.map(t => t.name);
    assert(toolNames.includes('memory_recall'), `memory_recall 已注册 (共 ${toolNames.length} 个工具)`);
    assert(toolNames.includes('business_loop_validate'), 'business_loop_validate 已注册');
    assert(toolNames.includes('arch_reverse_probe'), 'arch_reverse_probe 已注册');

    // 验证 schema 完整性
    const memTool = listResult.tools.find(t => t.name === 'memory_recall');
    assert(memTool && memTool.inputSchema && memTool.inputSchema.properties.operation, 'memory_recall inputSchema.operation 存在');
    // v1.6.8 移除 outputSchema：handler 返回 text content 而非 structuredContent，MCP 协议要求 outputSchema 必须不存在
    assert(!memTool.outputSchema, 'memory_recall 不应定义 outputSchema');

    const bizTool = listResult.tools.find(t => t.name === 'business_loop_validate');
    assert(bizTool && bizTool.inputSchema && bizTool.inputSchema.properties.loop, 'business_loop_validate inputSchema.loop 存在');

    const archTool = listResult.tools.find(t => t.name === 'arch_reverse_probe');
    assert(archTool && archTool.inputSchema && archTool.inputSchema.properties.probePorts, 'arch_reverse_probe inputSchema.probePorts 存在');

    // ===== 测试 2: tools/call memory_recall stats（空库）=====
    console.log('\n=== 测试 2: tools/call memory_recall stats ===');
    const statsRes = await fetchMcp('tools/call', {
      name: 'memory_recall',
      arguments: { operation: 'stats' }
    });
    const statsJson = JSON.parse(statsRes.content[0].text);
    assert(statsJson.success === true, 'memory_recall stats 调用成功');
    assert(statsJson.stats && typeof statsJson.stats.totalMemories === 'number', 'stats 返回 totalMemories 字段');

    // ===== 测试 3: tools/call memory_recall consolidate =====
    console.log('\n=== 测试 3: tools/call memory_recall consolidate ===');
    const conRes = await fetchMcp('tools/call', {
      name: 'memory_recall',
      arguments: {
        operation: 'consolidate',
        episode: {
          title: 'MCP集成测试-表缺失',
          target: 'http://api.test.com',
          symptom: 'API 500 错误，settlement_accounts 表不存在',
          rootCause: 'CREATE TABLE 未执行',
          fix: '执行 CREATE TABLE settlement_accounts',
          tags: ['postgres', 'integration-test']
        }
      }
    });
    const conJson = JSON.parse(conRes.content[0].text);
    assert(conJson.success === true, 'consolidate 调用成功');
    assert(conJson.saved && conJson.saved.id, `consolidate 返回 id: ${conJson.saved?.id}`);
    assert(conJson.saved && conJson.saved.extractedPatterns === 1, 'consolidate 提炼了 1 个模式');

    // ===== 测试 4: tools/call memory_recall recall（验证闭环）=====
    console.log('\n=== 测试 4: tools/call memory_recall recall（验证闭环）===');
    const recRes = await fetchMcp('tools/call', {
      name: 'memory_recall',
      arguments: {
        operation: 'recall',
        query: 'settlement_accounts 表不存在 500',
        minScore: 0.1
      }
    });
    const recJson = JSON.parse(recRes.content[0].text);
    assert(recJson.success === true, 'recall 调用成功');
    assert(recJson.matches && recJson.matches.length > 0, `recall 返回 ${recJson.matches?.length} 条匹配`);
    assert(recJson.matches[0].score >= 0.5, `最高匹配分数 ${recJson.matches[0]?.score} >= 0.5`);

    // ===== 测试 5: tools/call memory_recall list =====
    console.log('\n=== 测试 5: tools/call memory_recall list ===');
    const listRes = await fetchMcp('tools/call', {
      name: 'memory_recall',
      arguments: { operation: 'list', limit: 5 }
    });
    const listJson = JSON.parse(listRes.content[0].text);
    assert(listJson.success === true, 'list 调用成功');
    assert(listJson.items && listJson.items.length >= 1, `list 返回 ${listJson.items?.length} 条`);

    // ===== 测试 6: 错误处理 - 缺少必填参数 =====
    console.log('\n=== 测试 6: 错误处理（recall 缺 query）===');
    const errRes = await fetchMcp('tools/call', {
      name: 'memory_recall',
      arguments: { operation: 'recall' }
    });
    assert(errRes.isError === true, 'recall 缺 query 时返回 isError');

    // ===== 测试 7: 错误处理 - 未知工具 =====
    console.log('\n=== 测试 7: 错误处理（未知工具）===');
    try {
      const unknownRes = await fetchMcp('tools/call', {
        name: 'non_existent_tool_xyz',
        arguments: {}
      });
      // 应该返回 error 或 isError
      assert(unknownRes === undefined || unknownRes.isError === true, '未知工具返回错误');
    } catch (err) {
      assert(/Unknown tool|未知工具/i.test(err.message), `未知工具抛出错误: ${err.message}`);
    }

  } catch (err) {
    console.log(`\n❌ 测试异常: ${err.message}`);
    console.log(err.stack);
    failed++;
  } finally {
    await cleanup(failed > 0 ? 1 : 0);
  }
}

async function cleanup(exitCode) {
  console.log(`\n========== 结果: ${passed} 通过 / ${failed} 失败 ==========`);
  if (serverProc) {
    try {
      serverProc.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 500));
      if (!serverProc.killed) serverProc.kill('SIGKILL');
    } catch (_) {}
  }
  try { fs.rmSync(tmpProject, { recursive: true, force: true }); } catch (_) {}
  process.exit(exitCode);
}

run().catch(err => {
  console.error('Fatal:', err);
  cleanup(1);
});
