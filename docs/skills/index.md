# Skill 指导总览

> Skill 是"场景 → 工具链 → 步骤"的标准用法手册。每个 Skill 解决一类验证问题，告诉你该用什么工具、按什么顺序、关注哪些关键点。

## 什么是 Skill

ValidPilot Verify 提供 **134 个工具**，覆盖浏览器自动化、视觉验证、安全扫描、性能审计、证据收集等 22 大类。工具数量多，新用户和 AI 模型常常不知道"什么场景该用什么工具链"。

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
- `/audit-performance` — 性能审计工作流
- `/audit-security` — 安全审计工作流
- `/visual-regression` — 视觉回归工作流
- `/debug-page` — 页面调试工作流
- `/e2e-flow` — 端到端流程工作流

在支持 MCP Prompts 的客户端（如 Claude Desktop、Cursor、Trae）中输入 `/` 即可看到这些命令。

## 相关文档

- [工具总览](../tools/overview) — 134 个工具按 22 类分组
- [工具选择决策矩阵](../reference/tool-decision-matrix) — "我想做 X"决策树
- [MCP 协议速查](../reference/mcp-cheatsheet) — MCP 客户端配置
- [场景化 Playbook](../scenarios/ecommerce-checkout) — 跨 Skill 的业务场景
