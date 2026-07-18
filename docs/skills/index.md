# Skill 指导总览

> Skill 是"场景 → 工具链 → 步骤"的标准用法手册。每个 Skill 解决一类验证问题，告诉你该用什么工具、按什么顺序、关注哪些关键点。

## 快速开始 3 步走（v1.9.3+）

```mermaid
flowchart LR
    A[1. 安装 MCP Server] --> B[2. 输入 / 触发斜杠命令]
    B --> C[3. AI 按工作流自动执行]
```

1. **安装 MCP Server**：`npm install -g @validpilot/ai-verify-mcp`，在 Claude Desktop / Cursor / Trae 中配置 MCP 服务
2. **输入 `/` 触发斜杠命令**：聊天框输入 `/` 即可看到 7 个 Skill 工作流（`/validate-login`、`/submit-form` 等）
3. **AI 自动执行**：MCP Prompt 返回多步工作流指令，AI 模型按序调用工具链，自动截图、断言、收集证据

> 💡 **无需安装 IDE Skill 扩展包**。v1.9.3+ 起编排能力已通过 MCP Prompts 原语内置到 MCP 服务器，开箱即用。详见 [Skill 使用指南](../guide/skill-usage)。

## 什么是 Skill

ValidPilot Verify 提供 **136 个工具**，覆盖浏览器自动化、视觉验证、安全扫描、性能审计、证据收集等 22 大类。工具数量多，新用户和 AI 模型常常不知道"什么场景该用什么工具链"。

**Skill 就是答案**——把"我想验证登录流程"翻译成"调用 browser_open → browser_snapshot → browser_form_fill → browser_click → browser_assert → evidence_pack 这 6 个工具，按此顺序执行"。

## Skill 与 MCP 工具的关系

```
┌─────────────────────────────────────────────────────────┐
│  Skill（场景层）                                          │
│  "验证登录流程" / "性能审计" / "安全扫描"                  │
│  ↓ 决定工具选择与编排顺序                                  │
├─────────────────────────────────────────────────────────┤
│  MCP Tools（能力层）                                      │
│  browser_open / browser_click / security_owasp_top10    │
│  ↓ 执行具体操作                                           │
├─────────────────────────────────────────────────────────┤
│  Evidence（证据层）                                       │
│  截图 / trace / HAR / 报告                                │
└─────────────────────────────────────────────────────────┘
```

- **Skill 是方法**：告诉你"该做什么、按什么顺序做"
- **工具是手段**：执行具体操作（点击、截图、扫描）
- **证据是产出**：可追溯的验证结果

## 如何选择 Skill

| 我想做... | 推荐 Skill | 核心工具链 |
|---|---|---|
| 验证登录/注册流程 | [登录流程验证](./login-validation) | open → snapshot → form_fill → click → assert |
| 提交表单并验证 | [表单提交验证](./form-submission) | form_fill → form_validate → click → assert |
| 视觉回归测试 | [视觉回归](./visual-regression) | visual_baseline → visual_check → visual_compare |
| 安全漏洞扫描 | [安全审计](./security-audit) | security_headers → security_csp → owasp_top10 → xss → sqli |
| 性能与 SEO 审计 | [性能审计](./performance-audit) | lighthouse_audit → performance_trace → memory_check |
| 端到端业务流程 | [端到端流程](./e2e-flow) | validation_chain → evidence_pack → report_export |
| 排查页面错误 | [调试排查](./debug-investigation) | debug_investigate → errors → network → console |

## Skill 文档统一结构

每个 Skill 文档都包含以下 6 个部分：

1. **场景描述与痛点** — 什么情况下需要这个 Skill
2. **推荐工具链** — 调用顺序图 + 每步说明
3. **关键参数说明** — 必填参数和推荐值
4. **预期产出** — JSON 输出结构和证据文件
5. **完整端到端示例** — 真实 URL 调用与返回结果
6. **常见坑与最佳实践** — 经验总结

## 与 MCP Prompts 的关系

ValidPilot Verify v1.9.3+ 实现了 MCP Prompts 原语，将核心 Skill 以斜杠命令形式暴露：

- `/validate-login` — 登录流程验证工作流
- `/submit-form` — 表单提交验证工作流
- `/audit-performance` — 性能审计工作流
- `/audit-security` — 安全审计工作流
- `/visual-regression` — 视觉回归工作流
- `/debug-page` — 页面调试工作流
- `/e2e-flow` — 端到端流程工作流

在支持 MCP Prompts 的客户端（如 Claude Desktop、Cursor、Trae）中输入 `/` 即可看到这些命令。

### 3 种使用方式

| 方式 | 操作 | 适用场景 |
|------|------|----------|
| **方式 1：斜杠命令** | 聊天框输入 `/validate-login` 等命令 + 参数 | 已明确知道要做哪类验证 |
| **方式 2：自然语言描述** | 直接说"帮我验证登录页 xxx.com" | 不确定用哪个 Skill，让 AI 自动选择 |
| **方式 3：工具反查** | 调用 `skill_tools_map({ toolName: "browser_form_fill" })` | 已用某工具，想知道能配合哪些 Skill |

**方式 1 示例**：
```
/validate-login url=https://example.com/login username=test password=pass123 successIndicator=/dashboard
```

**方式 2 示例**：
```
用户：帮我验证 https://example.com/login 的登录功能
AI：  自动调用 skill_tools_map({ skillName: "validate-login" }) 查询工具链
      → 调用 /validate-login prompt 启动 7 步工作流
      → 按序执行 browser_open → browser_snapshot → ... → evidence_pack
```

**方式 3 示例**：
```
用户：我刚调了 browser_form_fill，还能配合哪些 Skill？
AI：  调用 skill_tools_map({ toolName: "browser_form_fill" })
      → 返回 ["validate-login", "submit-form"]
      → 用户可选 /validate-login 或 /submit-form 完成后续步骤
```

> 💡 **何时用 IDE Skill 扩展包（可选）**：如需 Trae 的 7 阶段细粒度编排（每个 Skill 内部拆成 7 个执行阶段，含独立的产物目录和回归对比），可在 Trae Skill 市场安装 `browser-dev-full-validation-skill`。详见 [Skill 使用指南](../guide/skill-usage)。

## 相关文档

- [工具总览](../tools/overview) — 136 个工具按 22 类分组
- [工具选择决策矩阵](../reference/tool-decision-matrix) — "我想做 X"决策树
- [MCP 协议速查](../reference/mcp-cheatsheet) — MCP 客户端配置
- [场景化 Playbook](../scenarios/ecommerce-checkout) — 跨 Skill 的业务场景
