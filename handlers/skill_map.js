'use strict';

// Skill ↔ Tool 映射单一数据源
//
// 与 handlers/prompts.js 的 PROMPTS 一一对应（7 个 Skill / 7 个 Prompt）。
// 与 docs/skills/*.md 文档一一对应。
//
// 设计决策：
// - 不依赖 fs/path：纯内存计算，便于单元测试
// - 不解析 markdown：从 markdown 提取工具名脆弱（会捕获"常见坑"段落、被截断等），改用显式常量
// - mapDrift 检测：validateConsistency 内部解析 prompts.js buildMessages 输出中的 `Call: \`<tool>` 模式，
//   与 SKILL_TOOLS_MAP 中 required:true 的工具对比，差异写入 mapDrift（仅 warning，不 fail）

/**
 * Skill ↔ Tool 映射表
 * @typedef {Object} SkillToolEntry
 * @property {string} skillName - Skill 标识符
 * @property {string} promptName - 对应的 MCP Prompt 名称
 * @property {string} docFile - 对应的文档文件路径
 * @property {Array<{name: string, step: number, required: boolean, description: string, variant?: string}>} tools
 */
const SKILL_TOOLS_MAP = [
  {
    skillName: 'validate-login',
    promptName: 'validate-login',
    docFile: 'docs/skills/login-validation.md',
    tools: [
      { name: 'browser_open', step: 1, required: true, description: '打开登录页' },
      { name: 'browser_snapshot', step: 2, required: true, description: '截取登录页结构' },
      { name: 'browser_form_fill', step: 3, required: true, description: '填充用户名密码（不自动提交）' },
      { name: 'browser_click', step: 4, required: true, description: '点击登录按钮' },
      { name: 'browser_wait', step: 5, required: true, description: '等待跳转完成' },
      { name: 'browser_assert', step: 6, required: true, description: '断言登录成功' },
      { name: 'evidence', step: 7, required: true, mode: 'pack', description: '收集证据' }
    ]
  },
  {
    skillName: 'submit-form',
    promptName: 'submit-form',
    docFile: 'docs/skills/form-submission.md',
    tools: [
      { name: 'browser_open', step: 1, required: true, description: '打开表单页' },
      { name: 'browser_snapshot', step: 2, required: true, description: '截取页面结构' },
      { name: 'browser_form_validate', step: 3, required: true, description: '检测表单验证规则' },
      { name: 'browser_form_fill', step: 4, required: true, description: '批量填充字段（不自动提交）' },
      { name: 'browser_click', step: 5, required: true, description: '点击提交按钮' },
      { name: 'browser_assert', step: 6, required: true, description: '断言提交反馈' },
      { name: 'evidence', step: 7, required: true, mode: 'pack', description: '收集证据' }
    ]
  },
  {
    skillName: 'audit-performance',
    promptName: 'audit-performance',
    docFile: 'docs/skills/performance-audit.md',
    tools: [
      { name: 'browser_open', step: 1, required: true, description: '打开目标页' },
      { name: 'browser_lighthouse_audit', step: 2, required: true, description: '运行 Lighthouse 审计' },
      { name: 'browser_performance', step: 3, required: true, mode: 'check', description: '采集 Core Web Vitals' },
      { name: 'browser_performance', step: 4, required: true, mode: 'trace', description: '记录性能 trace + HAR' },
      { name: 'browser_memory_check', step: 5, required: true, description: '检测内存泄漏' },
      { name: 'evidence', step: 6, required: true, mode: 'pack', description: '收集证据' }
    ]
  },
  {
    skillName: 'audit-security',
    promptName: 'audit-security',
    docFile: 'docs/skills/security-audit.md',
    tools: [
      { name: 'security_scan', step: 1, required: true, mode: 'headers', description: '检查安全响应头' },
      { name: 'security_scan', step: 2, required: true, mode: 'csp', description: 'CSP 深度分析' },
      { name: 'security_scan', step: 3, required: true, mode: 'owasp', description: 'OWASP Top 10 扫描' },
      { name: 'security_scan', step: 4, required: true, mode: 'sqli', description: 'SQL 注入扫描' },
      { name: 'security_scan', step: 5, required: true, mode: 'xss', description: 'XSS 漏洞扫描' },
      { name: 'evidence', step: 6, required: true, mode: 'pack', description: '收集证据' }
    ]
  },
  {
    skillName: 'visual-regression',
    promptName: 'visual-regression',
    docFile: 'docs/skills/visual-regression.md',
    tools: [
      { name: 'browser_open', step: 1, required: true, description: '打开目标页' },
      { name: 'browser_visual', step: 2, required: false, mode: 'baseline', variant: 'full-page', description: '建立基线（仅 full-page 模式）' },
      { name: 'browser_visual', step: 2, required: false, mode: 'compare', variant: 'full-page', description: '与基线对比（仅 full-page 模式）' },
      { name: 'browser_visual_component', step: 2, required: false, variant: 'component', description: '组件级对比（仅 component 模式）' },
      { name: 'browser_visual', step: 3, required: true, mode: 'report', description: '列出视觉产物' },
      { name: 'evidence', step: 4, required: true, mode: 'pack', description: '收集证据' }
    ]
  },
  {
    skillName: 'debug-page',
    promptName: 'debug-page',
    docFile: 'docs/skills/debug-investigation.md',
    tools: [
      { name: 'browser_open', step: 1, required: true, description: '打开问题页' },
      { name: 'browser_errors', step: 2, required: true, mode: 'clear', description: '清理旧错误建立 checkpoint' },
      { name: 'browser_debug', step: 4, required: true, mode: 'investigate', description: '运行自动诊断' },
      { name: 'browser_errors', step: 5, required: true, description: '查看统一错误' },
      { name: 'browser_network', step: 6, required: true, mode: 'detail', description: '检查失败网络请求' },
      { name: 'error_analyze', step: 7, required: true, mode: 'fix', description: '获取修复建议' },
      { name: 'evidence', step: 8, required: true, mode: 'pack', description: '收集证据' }
    ]
  },
  {
    skillName: 'e2e-flow',
    promptName: 'e2e-flow',
    docFile: 'docs/skills/e2e-flow.md',
    tools: [
      { name: 'validation_run', step: 2, required: true, description: '执行验收计划' },
      { name: 'evidence', step: 3, required: true, mode: 'index', description: '构建证据时间线' },
      { name: 'validation_report', step: 4, required: true, description: '生成 Markdown 报告' },
      { name: 'validation_report', step: 5, required: true, mode: 'export', description: '导出 HTML 报告' }
    ]
  }
];

/**
 * 获取指定 Skill 的工具链
 * @param {string} skillName - Skill 名称
 * @returns {SkillToolEntry|null}
 */
function getSkillTools(skillName) {
  if (!skillName || typeof skillName !== 'string') return null;
  const entry = SKILL_TOOLS_MAP.find(s => s.skillName === skillName);
  return entry ? { ...entry, tools: entry.tools.map(t => ({ ...t })) } : null;
}

/**
 * 反查：哪些 Skill 引用了指定工具
 * @param {string} toolName - 工具名称
 * @returns {Array<string>} 引用该工具的 Skill name 数组（按 SKILL_TOOLS_MAP 顺序）
 */
function getToolSkills(toolName) {
  if (!toolName || typeof toolName !== 'string') return [];
  return SKILL_TOOLS_MAP
    .filter(s => s.tools.some(t => t.name === toolName))
    .map(s => s.skillName);
}

/**
 * 获取完整 SKILL_TOOLS_MAP 副本
 * @returns {Array<SkillToolEntry>}
 */
function getAllSkillToolsMap() {
  return SKILL_TOOLS_MAP.map(s => ({ ...s, tools: s.tools.map(t => ({ ...t })) }));
}

/**
 * 构建反向映射 { toolName: [skillName, ...] }
 * @returns {Object<string, Array<string>>}
 */
function getReverseMap() {
  const reverse = {};
  for (const skill of SKILL_TOOLS_MAP) {
    for (const tool of skill.tools) {
      if (!reverse[tool.name]) reverse[tool.name] = [];
      if (!reverse[tool.name].includes(skill.skillName)) {
        reverse[tool.name].push(skill.skillName);
      }
    }
  }
  return reverse;
}

/**
 * 从 prompt 的 buildMessages 输出中提取工具名
 * 匹配 `Call: \`<tool_name>(` 模式
 * @param {Array} messages - buildMessages 返回的 messages 数组
 * @returns {Array<string>} 工具名数组（去重，保序）
 */
function extractToolsFromPromptMessages(messages) {
  if (!Array.isArray(messages)) return [];
  const tools = new Set();
  for (const msg of messages) {
    if (!msg || !msg.content || typeof msg.content.text !== 'string') continue;
    const text = msg.content.text;
    // 匹配 Call: `tool_name( 模式（tool_name 仅含小写字母/数字/下划线）
    const matches = text.matchAll(/Call: `([a-z][a-z0-9_]*)\(/g);
    for (const m of matches) {
      tools.add(m[1]);
    }
  }
  return Array.from(tools);
}

/**
 * 批量校验 Skill 与实际工具注册的一致性
 * @param {Object} params
 * @param {Array<string>} params.availableTools - tools/ 目录中实际存在的工具名列表
 * @param {Array} params.prompts - handlers/prompts.js 的 PROMPTS 数组（用于 mapDrift 检测）
 * @param {string} [params.filterSkill] - 仅校验单个 Skill（可选）
 * @returns {{passed: boolean, summary: {total: number, passed: number, warnings: number}, skills: Array, checkedAt: string}}
 */
function validateConsistency({ availableTools, prompts, filterSkill } = {}) {
  const availableSet = new Set(Array.isArray(availableTools) ? availableTools : []);
  const promptByName = new Map();
  if (Array.isArray(prompts)) {
    for (const p of prompts) {
      if (p && p.name && typeof p.buildMessages === 'function') {
        promptByName.set(p.name, p);
      }
    }
  }

  const skillsToCheck = filterSkill
    ? SKILL_TOOLS_MAP.filter(s => s.skillName === filterSkill)
    : SKILL_TOOLS_MAP;

  const skillResults = [];
  let warnings = 0;

  for (const skill of skillsToCheck) {
    // 1) 检查每个工具是否在 availableTools 中
    const missing = [];
    const extra = [];
    for (const tool of skill.tools) {
      if (!availableSet.has(tool.name)) {
        missing.push({ name: tool.name, step: tool.step, required: tool.required });
      }
    }

    // 2) mapDrift：将 SKILL_TOOLS_MAP 中 required:true 的工具与 prompt buildMessages 输出对比
    const mapDrift = [];
    const prompt = promptByName.get(skill.promptName);
    if (prompt) {
      let promptToolNames = [];
      try {
        // 用空参数构造最小参数对象调用 buildMessages（仅 required 字段为空字符串）
        const minArgs = {};
        for (const arg of (prompt.arguments || [])) {
          if (arg.required) {
            minArgs[arg.name] = arg.name === 'fields' ? {} : 'placeholder';
          }
        }
        const messages = prompt.buildMessages(minArgs);
        promptToolNames = extractToolsFromPromptMessages(messages);
      } catch (e) {
        // buildMessages 失败不影响主流程，仅记为 warning
        mapDrift.push({ type: 'prompt_build_failed', message: e.message });
      }

      const mapRequired = skill.tools.filter(t => t.required).map(t => t.name);
      const mapAll = new Set(skill.tools.map(t => t.name));
      const promptSet = new Set(promptToolNames);

      // required 工具在 prompt 中缺失 → drift
      for (const toolName of mapRequired) {
        if (!promptSet.has(toolName)) {
          mapDrift.push({
            type: 'missing_in_prompt',
            tool: toolName,
            message: `工具 ${toolName} 在 SKILL_TOOLS_MAP 中标记为 required，但未出现在 prompt ${skill.promptName} 的 buildMessages 输出中`
          });
        }
      }
      // prompt 中出现但 SKILL_TOOLS_MAP 未列出 → drift
      for (const toolName of promptToolNames) {
        if (!mapAll.has(toolName)) {
          mapDrift.push({
            type: 'unlisted_in_map',
            tool: toolName,
            message: `工具 ${toolName} 出现在 prompt ${skill.promptName} 的 buildMessages 输出中，但未列入 SKILL_TOOLS_MAP`
          });
        }
      }
    } else {
      mapDrift.push({
        type: 'prompt_not_found',
        message: `未找到 promptName=${skill.promptName} 对应的 prompt，跳过 mapDrift 检测`
      });
    }

    if (mapDrift.length > 0) {
      warnings += mapDrift.length;
    }

    const skillPassed = missing.length === 0;  // mapDrift 仅 warning，不影响 passed

    skillResults.push({
      skillName: skill.skillName,
      promptName: skill.promptName,
      docFile: skill.docFile,
      passed: skillPassed,
      missing,
      extra,
      mapDrift,
      totalTools: skill.tools.length
    });
  }

  const total = skillsToCheck.length;
  const passedCount = skillResults.filter(r => r.passed).length;

  return {
    passed: skillResults.every(r => r.passed),
    summary: {
      total,
      passed: passedCount,
      warnings
    },
    skills: skillResults,
    checkedAt: new Date().toISOString()
  };
}

/**
 * 任务类型 → 验证流程映射表
 * 解决「AI 写完代码不知道该用什么 MCP 工具验证」的问题
 *
 * 每种任务类型对应：
 * - recommendedSkill: 对应的 Skill 名称（与 SKILL_TOOLS_MAP 关联）
 * - flowType: 验证流程类型
 * - triggerHint: 触发提示（告诉 AI 为什么现在应该用这些工具）
 * - steps: 推荐的工具调用步骤序列
 */
const TASK_SKILL_MAP = {
  login: {
    recommendedSkill: 'validate-login',
    flowType: '5步链路验证',
    triggerHint: '你刚完成了登录/认证功能代码修改。登录是核心功能，必须在真实浏览器中验证完整链路：页面加载→表单填写→提交→响应→状态更新。不能仅凭代码逻辑判断登录是否正常。',
    steps: [
      { step: 1, tool: 'browser_navigate', paramsHint: { url: '${url}' }, why: '打开登录页面，验证页面正常加载', triggerHint: '首先导航到登录页，检查页面是否正常渲染' },
      { step: 2, tool: 'browser_snapshot', paramsHint: {}, why: '捕获登录页结构，确认表单元素存在', triggerHint: '截图并分析页面结构，确认登录表单、输入框、按钮都存在' },
      { step: 3, tool: 'browser_type', paramsHint: { selector: 'input[type="email"]', text: '${用户邮箱}' }, why: '输入用户名', triggerHint: '模拟用户输入用户名' },
      { step: 4, tool: 'browser_type', paramsHint: { selector: 'input[type="password"]', text: '${用户密码}' }, why: '输入密码', triggerHint: '模拟用户输入密码' },
      { step: 5, tool: 'browser_click', paramsHint: { selector: 'button[type="submit"]' }, why: '点击登录按钮，触发提交', triggerHint: '点击登录按钮，观察是否有网络请求发出' },
      { step: 6, tool: 'browser_wait', paramsHint: { ms: 2000 }, why: '等待登录跳转完成', triggerHint: '等待页面跳转或错误提示出现' },
      { step: 7, tool: 'browser_assert', paramsHint: { urlContains: 'dashboard', noErrors: true }, why: '断言登录成功（URL 变化 + 无错误）', triggerHint: '验证登录是否成功：URL 是否跳转、是否有错误' },
      { step: 8, tool: 'evidence', paramsHint: { mode: 'pack' }, why: '收集验证证据', triggerHint: '打包所有验证证据' }
    ]
  },

  form: {
    recommendedSkill: 'submit-form',
    flowType: '5步链路验证',
    triggerHint: '你刚完成了表单功能代码修改。表单提交是数据提交类功能，必须完整验证5步链路：入口可达→操作可行→请求正确→响应正常→状态更新。',
    steps: [
      { step: 1, tool: 'browser_navigate', paramsHint: { url: '${url}' }, why: '打开表单页面', triggerHint: '导航到表单页面' },
      { step: 2, tool: 'browser_snapshot', paramsHint: {}, why: '检查表单结构', triggerHint: '分析表单字段和提交按钮' },
      { step: 3, tool: 'browser_form_validate', paramsHint: { url: '${url}' }, why: '检测表单验证规则', triggerHint: '了解表单的必填项、格式校验等规则' },
      { step: 4, tool: 'browser_form_fill', paramsHint: { url: '${url}', fields: '${表单字段}' }, why: '填充表单字段', triggerHint: '批量填充表单字段（不自动提交）' },
      { step: 5, tool: 'browser_click', paramsHint: { selector: 'button[type="submit"]' }, why: '点击提交按钮', triggerHint: '提交表单，观察网络请求' },
      { step: 6, tool: 'browser_assert', paramsHint: { noErrors: true }, why: '断言提交成功', triggerHint: '验证提交后是否有成功反馈' },
      { step: 7, tool: 'evidence', paramsHint: { mode: 'pack' }, why: '收集证据', triggerHint: '打包验证证据' }
    ]
  },

  crud: {
    recommendedSkill: 'e2e-flow',
    flowType: '5步链路验证（每个 CRUD 操作）',
    triggerHint: '你刚完成了 CRUD 功能代码修改。每个 CRUD 操作（增删改查）都必须验证5步链路，特别要验证数据一致性：创建后列表是否包含、更新后数据是否变化、删除后列表是否移除。',
    steps: [
      { step: 1, tool: 'browser_navigate', paramsHint: { url: '${url}' }, why: '打开 CRUD 页面', triggerHint: '导航到列表页面' },
      { step: 2, tool: 'browser_snapshot', paramsHint: {}, why: '检查列表结构', triggerHint: '分析列表表格/卡片结构' },
      { step: 3, tool: 'browser_table_verify', paramsHint: { mode: 'table' }, why: '验证当前列表数据', triggerHint: '记录当前列表数据，作为创建前基线' },
      { step: 4, tool: 'browser_click', paramsHint: { selector: '${创建按钮}' }, why: '点击创建按钮', triggerHint: '触发创建操作' },
      { step: 5, tool: 'browser_form_fill', paramsHint: { url: '${url}', fields: '${创建字段}' }, why: '填充创建表单', triggerHint: '填写新建数据' },
      { step: 6, tool: 'browser_click', paramsHint: { selector: '${提交按钮}' }, why: '提交创建', triggerHint: '提交并验证网络请求' },
      { step: 7, tool: 'browser_table_verify', paramsHint: { mode: 'table', expectMinRowCount: '${原行数+1}' }, why: '验证创建后列表新增一行', triggerHint: '确认创建的数据出现在列表中' },
      { step: 8, tool: 'evidence', paramsHint: { mode: 'pack' }, why: '收集证据', triggerHint: '打包验证证据' }
    ]
  },

  navigation: {
    recommendedSkill: null,
    flowType: '快速验证',
    triggerHint: '你刚完成了导航/路由功能代码修改。导航功能需要验证：页面跳转正常、目标页面正确加载、无控制台错误、浏览器前进/后退正常。',
    steps: [
      { step: 1, tool: 'browser_navigate', paramsHint: { url: '${url}' }, why: '打开起始页面', triggerHint: '导航到起始页面' },
      { step: 2, tool: 'browser_click', paramsHint: { selector: '${导航元素}' }, why: '点击导航元素', triggerHint: '触发导航跳转' },
      { step: 3, tool: 'browser_wait', paramsHint: { ms: 1000 }, why: '等待跳转完成', triggerHint: '等待页面加载' },
      { step: 4, tool: 'browser_assert', paramsHint: { urlContains: '${目标路径}', noErrors: true }, why: '断言跳转成功', triggerHint: '验证 URL 是否正确跳转' },
      { step: 5, tool: 'validation_check', paramsHint: { url: '${url}', noErrors: true }, why: '快速健康检查', triggerHint: '执行快速验证确保无错误' }
    ]
  },

  display: {
    recommendedSkill: null,
    flowType: '快速验证',
    triggerHint: '你刚完成了数据展示/列表页面代码修改。展示类功能需要验证：页面正常渲染、数据正确加载、无控制台错误、无网络错误。',
    steps: [
      { step: 1, tool: 'browser_navigate', paramsHint: { url: '${url}' }, why: '打开展示页面', triggerHint: '导航到列表/详情页面' },
      { step: 2, tool: 'browser_snapshot', paramsHint: {}, why: '检查页面渲染', triggerHint: '确认页面正常渲染，有数据展示' },
      { step: 3, tool: 'validation_check', paramsHint: { url: '${url}', noErrors: true }, why: '验证页面健康', triggerHint: '执行健康检查：无控制台错误、无网络错误' },
      { step: 4, tool: 'browser_table_verify', paramsHint: { mode: 'table', expectMinRowCount: 1 }, why: '验证列表有数据', triggerHint: '确认列表表格有数据行（非空状态）' }
    ]
  },

  bugfix: {
    recommendedSkill: 'debug-page',
    flowType: '调试→验证流程',
    triggerHint: '你刚完成了 bug 修复。修复后必须验证：① 原 bug 不再复现 ② 修复没有引入新问题 ③ 相关功能仍然正常。不能仅凭代码修改就判定修复成功。',
    steps: [
      { step: 1, tool: 'browser_navigate', paramsHint: { url: '${url}' }, why: '打开问题页面', triggerHint: '导航到 bug 出现的页面' },
      { step: 2, tool: 'browser_errors', paramsHint: {}, why: '清除旧错误建立 checkpoint', triggerHint: '建立错误检查基线' },
      { step: 3, tool: 'browser_debug', paramsHint: { mode: 'investigate' }, why: '运行自动诊断', triggerHint: '自动诊断页面问题' },
      { step: 4, tool: 'browser_click', paramsHint: { selector: '${触发bug的操作}' }, why: '执行触发 bug 的操作', triggerHint: '复现原始 bug 场景，验证是否已修复' },
      { step: 5, tool: 'browser_errors', paramsHint: {}, why: '检查是否有新错误', triggerHint: '确认操作后无错误' },
      { step: 6, tool: 'validation_check', paramsHint: { url: '${url}', noErrors: true }, why: '完整健康检查', triggerHint: '执行完整验证确保修复有效' },
      { step: 7, tool: 'evidence', paramsHint: { mode: 'pack' }, why: '收集修复证据', triggerHint: '打包修复前后的证据对比' }
    ]
  },

  refactor: {
    recommendedSkill: 'e2e-flow',
    flowType: '回归验证',
    triggerHint: '你刚完成了代码重构。重构后必须验证：① 所有原有功能仍然正常 ② 没有引入新的错误 ③ 页面渲染无变化。重构的黄金准则是「行为不变」。',
    steps: [
      { step: 1, tool: 'validation_check', paramsHint: { url: '${url}', noErrors: true }, why: '快速健康检查', triggerHint: '验证重构后页面基本健康' },
      { step: 2, tool: 'browser_traverse_menu', paramsHint: { maxDepth: 2, maxItems: 15 }, why: '遍历菜单验证导航', triggerHint: '自动遍历导航菜单，检查每个页面是否正常' },
      { step: 3, tool: 'browser_full_audit', paramsHint: {}, why: '全量错误审计', triggerHint: '聚合所有错误来源进行全量审计' },
      { step: 4, tool: 'evidence', paramsHint: { mode: 'pack' }, why: '收集回归验证证据', triggerHint: '打包回归验证证据' }
    ]
  },

  full_feature: {
    recommendedSkill: 'e2e-flow',
    flowType: '完整5步链路验证',
    triggerHint: '你刚完成了完整功能开发。新功能必须通过完整的5步链路验证：入口可达→操作可行→请求正确→响应正常→状态更新。这是发布前的必须步骤。',
    steps: [
      { step: 1, tool: 'browser_navigate', paramsHint: { url: '${url}' }, why: '打开功能页面', triggerHint: '导航到功能页面' },
      { step: 2, tool: 'browser_snapshot', paramsHint: {}, why: '检查页面渲染', triggerHint: '确认页面正常渲染' },
      { step: 3, tool: 'validation_check', paramsHint: { url: '${url}', noErrors: true }, why: '健康检查', triggerHint: '验证页面基本健康' },
      { step: 4, tool: 'browser_form_fill', paramsHint: { url: '${url}', fields: '${功能字段}' }, why: '操作功能', triggerHint: '模拟用户操作功能' },
      { step: 5, tool: 'browser_click', paramsHint: { selector: '${操作按钮}' }, why: '触发核心操作', triggerHint: '触发核心功能操作' },
      { step: 6, tool: 'browser_assert', paramsHint: { noErrors: true }, why: '断言操作成功', triggerHint: '验证操作结果' },
      { step: 7, tool: 'evidence', paramsHint: { mode: 'pack' }, why: '收集完整验证证据', triggerHint: '打包所有验证证据' }
    ]
  },

  deploy: {
    recommendedSkill: null,
    flowType: '部署验证',
    triggerHint: '部署完成后必须验证：① 页面可访问 ② 核心 API 响应正常 ③ 无 5xx 错误 ④ 静态资源加载正常。不能部署后不验证就上线。',
    steps: [
      { step: 1, tool: 'validation_check', paramsHint: { check_type: 'deploy_verify', targetUrl: '${url}' }, why: '部署验证（HTTP 检查）', triggerHint: '执行部署验证，检查 HTTP 状态码和静态资源' },
      { step: 2, tool: 'browser_navigate', paramsHint: { url: '${url}' }, why: '打开部署页面', triggerHint: '在真实浏览器中打开页面' },
      { step: 3, tool: 'validation_check', paramsHint: { url: '${url}', noErrors: true }, why: '页面健康检查', triggerHint: '验证页面在浏览器中的健康状态' },
      { step: 4, tool: 'browser_screenshot', paramsHint: {}, why: '截图留证', triggerHint: '截图保存部署后页面状态' }
    ]
  },

  performance: {
    recommendedSkill: 'audit-performance',
    flowType: '性能审计',
    triggerHint: '你刚完成了性能优化。必须验证：① Core Web Vitals 指标改善 ② Lighthouse 评分提升 ③ 无性能回归。用数据证明优化效果。',
    steps: [
      { step: 1, tool: 'browser_navigate', paramsHint: { url: '${url}' }, why: '打开目标页', triggerHint: '导航到优化后的页面' },
      { step: 2, tool: 'browser_lighthouse_audit', paramsHint: {}, why: '运行 Lighthouse 审计', triggerHint: '获取 Lighthouse 评分和优化建议' },
      { step: 3, tool: 'browser_performance', paramsHint: { mode: 'check' }, why: '采集 Core Web Vitals', triggerHint: '采集 FCP/LCP/CLS/FID 等关键指标' },
      { step: 4, tool: 'browser_memory_check', paramsHint: {}, why: '检测内存泄漏', triggerHint: '验证优化是否引入内存问题' },
      { step: 5, tool: 'evidence', paramsHint: { mode: 'pack' }, why: '收集性能基线证据', triggerHint: '打包性能审计证据' }
    ]
  },

  security: {
    recommendedSkill: 'audit-security',
    flowType: '安全审计',
    triggerHint: '你刚完成了安全相关修改。必须验证：① 安全响应头完整 ② 无 SQL 注入风险 ③ 无 XSS 漏洞 ④ CSP 策略正确。安全问题不能跳过验证。',
    steps: [
      { step: 1, tool: 'security_scan', paramsHint: { mode: 'headers', url: '${url}' }, why: '检查安全响应头', triggerHint: '验证 HTTP 安全头配置' },
      { step: 2, tool: 'security_scan', paramsHint: { mode: 'owasp', url: '${url}' }, why: 'OWASP Top 10 检查', triggerHint: '执行 OWASP 安全检查' },
      { step: 3, tool: 'security_scan', paramsHint: { mode: 'sqli', url: '${url}' }, why: 'SQL 注入扫描', triggerHint: '扫描 SQL 注入漏洞' },
      { step: 4, tool: 'security_scan', paramsHint: { mode: 'xss', url: '${url}' }, why: 'XSS 漏洞扫描', triggerHint: '扫描 XSS 漏洞' },
      { step: 5, tool: 'security_scan', paramsHint: { mode: 'csp', url: '${url}' }, why: 'CSP 策略分析', triggerHint: '分析 CSP 策略配置' },
      { step: 6, tool: 'evidence', paramsHint: { mode: 'pack' }, why: '收集安全审计证据', triggerHint: '打包安全审计证据' }
    ]
  }
};

/**
 * 根据任务类型获取推荐的验证流程
 * @param {string} taskType - 任务类型
 * @param {string} [url] - 待验证 URL（可选，用于预填参数）
 * @returns {Object|null} 验证流程推荐
 */
function getTaskWorkflow(taskType, url) {
  if (!taskType || !TASK_SKILL_MAP[taskType]) return null;
  const workflow = TASK_SKILL_MAP[taskType];

  // 预填 URL 参数
  const steps = workflow.steps.map(s => {
    const params = { ...s.paramsHint };
    if (params.url === '${url}' && url) {
      params.url = url;
    }
    return { ...s, params };
  });

  // 关联 skill 信息
  let skillInfo = null;
  if (workflow.recommendedSkill) {
    skillInfo = getSkillTools(workflow.recommendedSkill);
  }

  return {
    taskType,
    recommendedSkill: workflow.recommendedSkill,
    skillInfo,
    flowType: workflow.flowType,
    triggerHint: workflow.triggerHint,
    steps,
    totalSteps: steps.length,
    nextAction: steps.length > 0 ? `立即执行第 1 步：调用 ${steps[0].tool} — ${steps[0].why}` : '无需验证步骤'
  };
}

/**
 * 获取所有支持的任务类型
 * @returns {Array<{taskType: string, flowType: string, recommendedSkill: string|null}>}
 */
function getAllTaskTypes() {
  return Object.entries(TASK_SKILL_MAP).map(([taskType, info]) => ({
    taskType,
    flowType: info.flowType,
    recommendedSkill: info.recommendedSkill
  }));
}

/**
 * 工具 → 下一步验证提示映射表
 * 在关键工具返回结果中添加 workflowHint，引导 AI 继续下一步验证操作
 * 解决「调用了 browser_navigate 后不知道下一步该做什么」的问题
 */
const TOOL_WORKFLOW_HINTS = {
  browser_navigate: {
    nextTool: 'browser_snapshot',
    hint: '页面已加载。下一步：调用 browser_snapshot 检查页面结构，或调用 validation_check { url, noErrors: true } 执行健康检查',
    workflowRef: '如需完整验证流程，调用 dev_workflow { taskType: "login|form|..." }'
  },
  browser_click: {
    nextTool: 'browser_assert',
    hint: '点击操作已完成。下一步：调用 browser_assert 验证点击效果（URL 变化/元素可见/无错误），或调用 browser_errors 检查是否有新错误',
    workflowRef: '如需完整验证流程，调用 dev_workflow { taskType: "form|crud|..." }'
  },
  browser_form_fill: {
    nextTool: 'browser_click',
    hint: '表单已填充。下一步：调用 browser_click { selector: "button[type=submit]" } 提交表单，或调用 browser_form_validate 验证表单数据',
    workflowRef: '如需完整验证流程，调用 dev_workflow { taskType: "form|login|..." }'
  },
  browser_type: {
    nextTool: null,
    hint: '文本输入完成。继续输入其他字段，或调用 browser_click 提交表单',
    workflowRef: null
  },
  browser_snapshot: {
    nextTool: 'browser_click',
    hint: '页面结构已捕获。下一步：根据页面元素调用 browser_click 进行交互，或调用 browser_table_verify 验证表格数据',
    workflowRef: null
  },
  browser_assert: {
    nextTool: 'evidence',
    hint: '断言完成。下一步：如断言通过，调用 evidence { mode: "pack" } 收集证据；如断言失败，调用 browser_debug { mode: "investigate" } 诊断问题',
    workflowRef: null
  },
  browser_errors: {
    nextTool: null,
    hint: '错误检查完成。如有错误：调用 browser_debug { mode: "investigate" } 诊断根因，或调用 browser_counterfactual_analyze 分析失败原因。如无错误：继续下一步验证',
    workflowRef: null
  },
  browser_screenshot: {
    nextTool: null,
    hint: '截图完成。检查 errorAnalysis.visibleErrorCount 和 imageErrors，如有可见错误调用 browser_debug 诊断',
    workflowRef: null
  },
  validation_check: {
    nextTool: 'evidence',
    hint: '验证完成。如 passed=true：调用 evidence { mode: "pack" } 收集证据。如 passed=false：调用 browser_debug 诊断失败原因',
    workflowRef: '如需其他类型的验证流程，调用 dev_workflow { taskType: "bugfix|refactor|..." }'
  },
  browser_table_verify: {
    nextTool: null,
    hint: '表格验证完成。检查 allAssertionsPassed，如未通过检查 assertions 中的失败项。如需验证操作按钮，调用 browser_click_audit',
    workflowRef: null
  },
  browser_debug: {
    nextTool: 'browser_errors',
    hint: '诊断完成。下一步：调用 browser_errors 查看是否有新错误，或调用 browser_counterfactual_analyze 分析根因',
    workflowRef: null
  },
  browser_full_audit: {
    nextTool: 'evidence',
    hint: '全量审计完成。检查 blockingIssues 和 criticalIssues，如有阻塞性问题优先修复。如无问题，调用 evidence 收集证据',
    workflowRef: null
  },
  security_scan: {
    nextTool: null,
    hint: '安全扫描完成。检查 findings 中的严重级别，high/critical 级别问题必须修复。如需其他安全检查，调用 security_scan { mode: "owasp|sqli|xss|csp" }',
    workflowRef: '如需完整安全审计流程，调用 dev_workflow { taskType: "security", url: "..." }'
  },
  browser_traverse_menu: {
    nextTool: null,
    hint: '菜单遍历完成。检查 results 中的失败项，如某菜单项有错误，调用 browser_navigate 导航到该页面详细诊断',
    workflowRef: null
  }
};

/**
 * 获取工具的下一步验证提示
 * @param {string} toolName - 工具名称
 * @returns {Object|null} 包含 nextTool, hint, workflowRef 的对象
 */
function getToolWorkflowHint(toolName) {
  return TOOL_WORKFLOW_HINTS[toolName] || null;
}

module.exports = {
  SKILL_TOOLS_MAP,
  TASK_SKILL_MAP,
  TOOL_WORKFLOW_HINTS,
  getSkillTools,
  getToolSkills,
  getAllSkillToolsMap,
  getReverseMap,
  validateConsistency,
  extractToolsFromPromptMessages,
  getTaskWorkflow,
  getAllTaskTypes,
  getToolWorkflowHint
};
