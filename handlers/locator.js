'use strict';

// Handler: locator
// Extracted from server.js callTool switch statements

const { mcpError } = require('../core/mcp-error');

const tools = [
  "browser_find_element",
  "browser_find_page",
  "browser_locator_suggest",
  "browser_locator_validate"
];

async function handle(name, args, deps) {

  // === Bridge deps into scope via globalThis ===
  const _depsKeys = Object.keys(deps);
  const _depsPrev = {};
  for (const k of _depsKeys) { _depsPrev[k] = globalThis[k]; globalThis[k] = deps[k]; }
  try {
  // ====== browser_find_element ======
  if (name === 'browser_find_element') {
const { target } = await ensurePage();
    const result = await findElement(target, args);
    const count = result?.count || result?.elements?.length || 0;
    const resultData = {
      ...result,
      nextSteps: count > 0 ? [
        '调用 browser_click 点击找到的元素',
        '调用 browser_type 在找到的输入框中输入',
        '调用 browser_highlight 高亮元素确认位置',
        '调用 browser_screenshot 截图留存证据'
      ] : [
        '调用 browser_dom 查看页面 DOM 结构',
        '调用 browser_snapshot 获取页面完整快照',
        '调用 browser_locator_suggest 获取定位建议'
      ],
      suggestions: count > 0 ? [
        { type: 'next', tool: 'browser_click', reason: '点击找到的元素进行交互验证' },
        { type: 'next', tool: 'browser_highlight', reason: '高亮元素确认定位准确性' }
      ] : [
        { type: 'fix', tool: 'browser_locator_suggest', reason: '获取更准确的元素定位建议' },
        { type: 'fix', tool: 'browser_dom', reason: '查看页面 DOM 结构确认元素是否存在' }
      ],
      paidUpgradeHint: '需要 AI 智能元素推荐、自动生成稳定定位器、跨页面元素追踪？升级到 Pro 版本获取高级定位能力。'
    };
    return text(JSON.stringify(resultData, null, 2));
  }

  // ====== browser_find_page ======
  if (name === 'browser_find_page') {
    const result = await findPage(args.target, args);
    const resultData = {
      ...result,
      nextSteps: result?.found ? [
        '调用 browser_open 切换到找到的页面',
        '调用 browser_screenshot 查看页面状态',
        '调用 browser_performance_check 检查页面性能'
      ] : [
        '确认目标 URL 是否正确',
        '检查页面是否已加载完成',
        '调用 browser_open 重新打开目标页面'
      ],
      suggestions: result?.found ? [
        { type: 'next', tool: 'browser_open', reason: '切换到找到的页面' },
        { type: 'next', tool: 'browser_screenshot', reason: '查看页面实际状态' }
      ] : [
        { type: 'fix', tool: 'browser_open', reason: '重新打开目标页面' }
      ],
      paidUpgradeHint: '需要跨页面智能追踪、多标签页管理、页面状态实时同步？升级到 Pro 版本获取高级页面管理能力。'
    };
    return text(JSON.stringify(resultData, null, 2));
  }

  // ====== browser_locator_suggest ======
  if (name === 'browser_locator_suggest') {
const { target } = await ensurePage(args);
    const result = await suggestLocator(target, args);
    const sugArr = result?.suggestions || [];
    const hasSuggestions = sugArr.length > 0 || (result?.length ?? 0) > 0;
    const resultData = {
      ...result,
      nextSteps: hasSuggestions ? [
        '调用 browser_locator_validate 验证推荐定位器',
        '调用 browser_click 使用推荐定位器点击',
        '调用 browser_highlight 高亮推荐元素'
      ] : [
        '调用 browser_dom 查看页面 DOM 结构',
        '使用更具体的描述重新尝试',
        '调用 browser_snapshot 查看页面元素分布'
      ],
      toolSuggestions: hasSuggestions ? [
        { type: 'next', tool: 'browser_locator_validate', reason: '验证推荐定位器的准确性' },
        { type: 'next', tool: 'browser_click', reason: '使用定位器进行交互' }
      ] : [
        { type: 'fix', tool: 'browser_dom', reason: '查看页面 DOM 结构手动定位' }
      ],
      paidUpgradeHint: '需要 AI 智能定位器推荐、自动生成稳定 CSS/XPath、多浏览器兼容性分析？升级到 Pro 版本获取智能定位能力。'
    };
    return text(JSON.stringify(resultData, null, 2));
  }

  // ====== browser_locator_validate ======
  if (name === 'browser_locator_validate') {
const { target } = await ensurePage(args);
    const result = await validateLocator(target, args);
    const isValid = result?.valid || result?.found || false;
    const resultData = {
      ...result,
      nextSteps: isValid ? [
        '调用 browser_click 使用验证通过的定位器操作',
        '调用 browser_highlight 高亮元素确认位置',
        '将验证通过的定位器保存到测试脚本'
      ] : [
        '调用 browser_locator_suggest 获取更好的定位器',
        '调用 browser_find_element 智能搜索元素',
        '调用 browser_dom 查看 DOM 结构'
      ],
      suggestions: isValid ? [
        { type: 'next', tool: 'browser_click', reason: '使用验证通过的定位器' }
      ] : [
        { type: 'fix', tool: 'browser_locator_suggest', reason: '获取更准确的定位器' }
      ],
      paidUpgradeHint: '需要自动生成多种定位器方案、跨版本回归验证、定位器稳定性评分？升级到 Pro 版本获取高级定位验证能力。'
    };
    return text(JSON.stringify(resultData, null, 2));
  }

  return mcpError(`未知工具（locator）: ${name}`, { error: 'UNKNOWN_TOOL', toolName: name });
  } finally {
    for (const k of _depsKeys) { deps[k] = globalThis[k]; }
    for (const k of _depsKeys) { if (k in _depsPrev) globalThis[k] = _depsPrev[k]; else delete globalThis[k]; }
  }

}

module.exports = { tools, handle };
