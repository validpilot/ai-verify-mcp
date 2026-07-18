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
      { name: 'evidence_pack', step: 7, required: true, description: '收集证据' }
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
      { name: 'evidence_pack', step: 7, required: true, description: '收集证据' }
    ]
  },
  {
    skillName: 'audit-performance',
    promptName: 'audit-performance',
    docFile: 'docs/skills/performance-audit.md',
    tools: [
      { name: 'browser_open', step: 1, required: true, description: '打开目标页' },
      { name: 'browser_lighthouse_audit', step: 2, required: true, description: '运行 Lighthouse 审计' },
      { name: 'browser_performance_check', step: 3, required: true, description: '采集 Core Web Vitals' },
      { name: 'browser_performance_trace', step: 4, required: true, description: '记录性能 trace + HAR' },
      { name: 'browser_memory_check', step: 5, required: true, description: '检测内存泄漏' },
      { name: 'evidence_pack', step: 6, required: true, description: '收集证据' }
    ]
  },
  {
    skillName: 'audit-security',
    promptName: 'audit-security',
    docFile: 'docs/skills/security-audit.md',
    tools: [
      { name: 'security_headers_check', step: 1, required: true, description: '检查安全响应头' },
      { name: 'security_csp_analyze', step: 2, required: true, description: 'CSP 深度分析' },
      { name: 'security_owasp_top10', step: 3, required: true, description: 'OWASP Top 10 扫描' },
      { name: 'security_sql_injection_scan', step: 4, required: true, description: 'SQL 注入扫描' },
      { name: 'security_xss_scan', step: 5, required: true, description: 'XSS 漏洞扫描' },
      { name: 'evidence_pack', step: 6, required: true, description: '收集证据' }
    ]
  },
  {
    skillName: 'visual-regression',
    promptName: 'visual-regression',
    docFile: 'docs/skills/visual-regression.md',
    tools: [
      { name: 'browser_open', step: 1, required: true, description: '打开目标页' },
      { name: 'browser_visual_baseline', step: 2, required: false, variant: 'full-page', description: '建立基线（仅 full-page 模式）' },
      { name: 'browser_visual_compare', step: 2, required: false, variant: 'full-page', description: '与基线对比（仅 full-page 模式）' },
      { name: 'browser_visual_component', step: 2, required: false, variant: 'component', description: '组件级对比（仅 component 模式）' },
      { name: 'browser_visual_report', step: 3, required: true, description: '列出视觉产物' },
      { name: 'evidence_pack', step: 4, required: true, description: '收集证据' }
    ]
  },
  {
    skillName: 'debug-page',
    promptName: 'debug-page',
    docFile: 'docs/skills/debug-investigation.md',
    tools: [
      { name: 'browser_open', step: 1, required: true, description: '打开问题页' },
      { name: 'browser_errors_clear', step: 2, required: true, description: '清理旧错误建立 checkpoint' },
      { name: 'debug_investigate', step: 4, required: true, description: '运行自动诊断' },
      { name: 'browser_errors', step: 5, required: true, description: '查看统一错误' },
      { name: 'browser_network_detail', step: 6, required: true, description: '检查失败网络请求' },
      { name: 'error_fix_suggestion', step: 7, required: true, description: '获取修复建议' },
      { name: 'evidence_pack', step: 8, required: true, description: '收集证据' }
    ]
  },
  {
    skillName: 'e2e-flow',
    promptName: 'e2e-flow',
    docFile: 'docs/skills/e2e-flow.md',
    tools: [
      { name: 'validation_run', step: 2, required: true, description: '执行验收计划' },
      { name: 'evidence_index', step: 3, required: true, description: '构建证据时间线' },
      { name: 'validation_report', step: 4, required: true, description: '生成 Markdown 报告' },
      { name: 'validation_report_export', step: 5, required: true, description: '导出 HTML 报告' }
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

module.exports = {
  SKILL_TOOLS_MAP,
  getSkillTools,
  getToolSkills,
  getAllSkillToolsMap,
  getReverseMap,
  validateConsistency,
  extractToolsFromPromptMessages
};
