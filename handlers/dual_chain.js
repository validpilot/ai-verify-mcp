'use strict';

const { DualChainOrchestrator } = require('../orchestrator/dual_chain_orchestrator');

const tools = ['dual_chain_explore'];

async function handle(name, args, deps) {
  if (name === 'dual_chain_explore') {
    return await dualChainExplore(args, deps);
  }
  return { isError: true, content: [{ type: 'text', text: `未知工具：${name}` }] };
}

async function dualChainExplore(args, deps) {
  const target = args.target;
  if (!target) {
    return { isError: true, content: [{ type: 'text', text: '缺少 target 参数（目标系统 URL）' }] };
  }

  const log = deps.log || (() => {});
  const text = deps.text || ((t) => t);
  const callTool = deps.callTool || null;

  try {
    const orchestrator = new DualChainOrchestrator({
      callTool: deps.callTool || null,
      log: log || (() => {}),
      maxIterations: args.maxIterations || 5
    });

    const result = await orchestrator.execute(target, args);

    log('INFO', `[DualChain] 双链路探索完成: ${result.sessionId}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  } catch (error) {
    log('ERROR', `[DualChain] 双链路探索失败: ${error.message}`, { error: error.stack });
    return {
      isError: true,
      content: [{ type: 'text', text: `双链路探索失败: ${error.message}` }]
    };
  }
}

module.exports = { tools, handle };