# Skill 使用指南

> v1.9.3+ 起，Skill 编排能力通过 MCP Prompts 原语内置到 MCP 服务器，无需安装 IDE 扩展包即可开箱即用。
>
> 本指南面向第一次接触 Skill 的用户，覆盖：什么是 Skill → 如何触发 → 三种使用方式 → 可选增强路径 → 故障排查。

## 一、什么是 Skill

**Skill = 场景 → 工具链 → 步骤** 的标准用法手册。

ValidPilot Verify 提供 136 个原子工具（浏览器操作、截图、安全扫描、性能审计等），但工具数量太多，新用户和 AI 模型常常不知道"什么场景该用什么工具链、按什么顺序"。

**Skill 解决这个问题**——把"我想验证登录流程"自动翻译成"调用 `browser_open → browser_snapshot → browser_form_fill → browser_click → browser_assert → evidence_pack` 6 个工具，按此顺序执行"。

## 二、三种 Skill 形态

| 形态 | 是什么 | 是否需安装 | v1.9.3+ 状态 |
|------|--------|-----------|--------------|
| **A. MCP Prompts** | `/validate-login`、`/submit-form` 等 7 个斜杠命令，内置在 MCP 服务器中 | ❌ 不需要 | ✅ 开箱即用 |
| **B. Skill 指导文档** | `docs/skills/*.md` 8 篇工具链编排手册 | ❌ 不需要（随 npm 包发布） | ✅ v1.9.3 已有 |
| **C. IDE Skill 扩展包** | Trae 的 `browser-dev-full-validation-skill` 等 IDE 原生扩展 | ✅ 需在 Trae Skill 市场安装 | 可选增强 |

### v1.9.3+ 的关键演进

**v1.9.3 之前**：用户必须装 IDE Skill 扩展包（形态 C）才能获得"流程编排"能力，否则只能手动编排 134 个工具的调用顺序。

**v1.9.3 之后**：7 个 MCP Prompts（形态 A）已把工具链编排**内置到 MCP 服务器**。只要客户端支持 MCP Prompts 协议（Claude Desktop、Cursor、Trae 都支持），用户在聊天框输入 `/` 就能看到这 7 个命令，**无需安装任何 IDE 扩展包即可开箱即用**。

## 三、7 个内置 Skill 工作流

| 斜杠命令 | 解决的问题 | 工具链长度 | 必填参数 |
|---------|-----------|-----------|----------|
| `/validate-login` | 验证登录流程（含跳转断言） | 7 步 | url, username, password, successIndicator |
| `/submit-form` | 验证表单提交（含字段规则检测） | 7 步 | url, fields |
| `/audit-performance` | 性能审计（Lighthouse + Web Vitals + 内存） | 6 步 | url |
| `/audit-security` | 安全扫描（5 类漏洞） | 6 步 | url |
| `/visual-regression` | 视觉回归（基线 + 对比） | 4 步 | url, baselineName |
| `/debug-page` | 调试排查（症状 → 根因 → 修复建议） | 7 步 | url, symptom |
| `/e2e-flow` | 端到端业务流程（验收 + 证据时间线 + 报告） | 4 步 | url, flowName, flowDescription |

> 每个工作流的完整参数说明、调用示例、输出结构详见 [`docs/skills/`](../skills/index) 对应文档。

## 四、三种使用方式

### 方式 1：斜杠命令（最直接）

**适用场景**：已明确知道要做哪类验证。

**操作**：在支持 MCP Prompts 的客户端聊天框中输入 `/`，选择对应命令并填写参数。

**示例**：

```
/validate-login
  url: https://example.com/login
  username: testuser
  password: Test1234!
  successIndicator: /dashboard
```

**返回**：MCP Prompt 返回多步工作流指令文本，AI 模型按序调用工具链（`browser_open → browser_snapshot → browser_form_fill → browser_click → browser_wait → browser_assert → evidence_pack`），自动截图、断言、收集证据。

### 方式 2：自然语言描述（最友好）

**适用场景**：不确定用哪个 Skill，让 AI 自动选择。

**操作**：直接用自然语言描述需求，AI 会调用 `skill_tools_map` 工具反查匹配的 Skill。

**示例**：

```
用户：帮我验证 https://example.com/login 的登录功能

AI 思考过程：
  1. 调用 skill_tools_map({ toolName: "browser_form_fill" })
     → 返回 ["validate-login", "submit-form"]
  2. 根据上下文（"登录"）选择 validate-login
  3. 调用 /validate-login prompt 启动 7 步工作流
  4. 按序执行：browser_open → browser_snapshot → ... → evidence_pack
  5. 汇总截图、断言结果、证据包路径返回给用户
```

### 方式 3：工具反查（最灵活）

**适用场景**：已用某工具，想知道能配合哪些 Skill 完成完整工作流。

**操作**：直接调用 `skill_tools_map` 工具，传入 `toolName` 反查归属 Skill。

**示例**：

```
用户：我刚调了 browser_form_fill，还能配合哪些 Skill？

AI 调用：skill_tools_map({ toolName: "browser_form_fill" })
返回：
{
  "toolName": "browser_form_fill",
  "skills": ["validate-login", "submit-form"],
  "total": 2,
  "nextSteps": [
    "使用 skillName 参数查看某 Skill 的完整工具链",
    "使用 skill_consistency_check 校验一致性"
  ]
}

AI 后续：
  → 用户可选 /validate-login（登录场景）或 /submit-form（表单提交场景）
  → AI 按 Skill 工作流完成剩余 6 步
```

## 五、客户端兼容性

| 客户端 | MCP Prompts 支持 | 触发方式 |
|--------|------------------|----------|
| **Claude Desktop** | ✅ 支持 | 聊天框输入 `/` |
| **Cursor** | ✅ 支持 | Composer 输入 `/` |
| **Trae** | ✅ 支持 | 聊天框输入 `/` |
| **Continue.dev** | ⚠️ 部分支持 | 通过 `skill_tools_map` 工具调用（无斜杠命令 UI） |
| **其他 MCP 客户端** | 视客户端实现 | 至少可通过 `skill_tools_map` 工具查询映射 |

> 💡 即使客户端不支持斜杠命令 UI，AI 仍可通过 `skill_tools_map` 工具查询并按工作流执行，**功能等价**，只是缺少 `/` 快捷入口。

## 六、可选增强：IDE Skill 扩展包

### 何时需要安装

如果你需要以下增强能力，可在 Trae Skill 市场安装 `browser-dev-full-validation-skill` 扩展包：

- **7 阶段细粒度编排**：每个 Skill 内部拆成 7 个执行阶段（扫描、复现、诊断、修复、验证、对比、报告），每阶段独立产物目录
- **回归对比**：自动对比当前验证结果与上一轮（或原始版本），计算回归情况
- **多轮验证汇总**：将多轮验证结果汇总为一份完整报告（成功率、故障清单、修复建议）

### 安装步骤（仅 Trae）

1. 打开 Trae → Settings → Skills
2. 搜索 `browser-dev-full-validation-skill`
3. 点击 Install
4. 启用扩展包

> ⚠️ **不安装也能用**：v1.9.3+ 的 MCP Prompts 已覆盖核心 7 步工作流，IDE 扩展包只是把每步拆得更细。对 90% 的场景，MCP Prompts 已经足够。

## 七、故障排查

### Q1：输入 `/` 看不到斜杠命令

**可能原因**：
1. MCP 服务未启动或版本低于 v1.9.3
2. 客户端不支持 MCP Prompts 协议

**排查步骤**：
```bash
# 1. 检查 MCP 服务版本
ai-verify-mcp --version
# 应输出 ≥ 1.9.3

# 2. 调用 mcp_self_test 验证服务正常
# 通过 MCP 客户端调用 mcp_self_test，应返回 health.version=1.9.3

# 3. 如客户端不支持 MCP Prompts，改用方式 2（自然语言）或方式 3（工具反查）
```

### Q2：调用 `skill_tools_map` 返回 "Unknown skill"

**原因**：传入的 `skillName` 拼写错误。

**正确拼写**（7 个 Skill）：
- `validate-login`（不是 `validate_login` 或 `login`）
- `submit-form`（不是 `submit_form` 或 `form`）
- `audit-performance`（不是 `performance` 或 `audit_perf`）
- `audit-security`（不是 `security` 或 `audit_sec`）
- `visual-regression`（不是 `visual` 或 `regression`）
- `debug-page`（不是 `debug` 或 `debug_page`）
- `e2e-flow`（不是 `e2e` 或 `e2e_flow`）

### Q3：调用 `skill_consistency_check` 返回 `passed: false`

**原因**：SKILL_TOOLS_MAP 中引用的工具未在 `tools/*.json` 注册。

**排查**：
```bash
# 返回的 missing[] 数组会列出缺失的工具名
# 检查 tools/ 目录是否缺少对应 JSON 文件
ls tools/<missing_tool_name>.json
```

**修复**：要么补建 `tools/<missing_tool_name>.json` schema 文件，要么修改 `handlers/skill_map.js` 中的 `SKILL_TOOLS_MAP` 移除该工具引用。

### Q4：客户端提示 "Prompt not found"

**原因**：MCP 服务版本低于 v1.9.3，未实现 MCP Prompts 原语。

**修复**：升级到 v1.9.3+：
```bash
npm install -g @validpilot/ai-verify-mcp@latest
# 然后重启 MCP 服务
```

## 八、相关文档

- [Skill 指导总览](../skills/index) — 8 篇 Skill 文档（每篇含工具链、参数、示例、常见坑）
- [Skill↔Tool 映射表](../reference/skill-tools-map) — 7 Skill × 工具链双向映射
- [工具选择决策矩阵](../reference/tool-decision-matrix) — "我想做 X"决策树
- [工具总览](../tools/overview) — 136 工具按 22 类分组
- [MCP 协议速查](../reference/mcp-cheatsheet) — MCP 客户端配置
- [快速开始](./getting-started) — 5 分钟安装与首次调用
- [CHANGELOG](../reference/changelog) — 版本变更记录
