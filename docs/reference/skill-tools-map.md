# Skill↔Tool 映射表

> 7 个 Skill × 工具链的双向映射关系。
> 单一数据源：[`handlers/skill_map.js`](https://github.com/validpilot/ai-verify-mcp/blob/main/handlers/skill_map.js) 中的 `SKILL_TOOLS_MAP` 常量。

## 设计原则

| 原则 | 说明 |
|------|------|
| **单一数据源** | `SKILL_TOOLS_MAP` 是显式常量，不解析 markdown，避免"常见坑"段落被误捕获 |
| **纯内存计算** | 不依赖 `fs`/`path`，便于单元测试和快速调用 |
| **双向可查** | 既可由 Skill 查工具链（正向），也可由工具反查归属 Skill（反向） |
| **mapDrift 仅告警** | Skill 工具链与对应 MCP Prompt 不一致时记为 warning，不 fail，便于渐进迁移 |

## 正向映射（Skill → 工具链）

### 1. validate-login — 登录流程验证

- **MCP Prompt**：`/validate-login`
- **文档**：[`docs/skills/login-validation.md`](../skills/login-validation)
- **工具数**：7

| Step | 工具 | 必需 | 说明 |
|------|------|------|------|
| 1 | `browser_open` | ✅ | 打开登录页 |
| 2 | `browser_snapshot` | ✅ | 截取登录页结构 |
| 3 | `browser_form_fill` | ✅ | 填充用户名密码（不自动提交） |
| 4 | `browser_click` | ✅ | 点击登录按钮 |
| 5 | `browser_wait` | ✅ | 等待跳转完成 |
| 6 | `browser_assert` | ✅ | 断言登录成功 |
| 7 | `evidence_pack` | ✅ | 收集证据 |

### 2. submit-form — 表单提交验证

- **MCP Prompt**：`/submit-form`
- **文档**：[`docs/skills/form-submission.md`](../skills/form-submission)
- **工具数**：7

| Step | 工具 | 必需 | 说明 |
|------|------|------|------|
| 1 | `browser_open` | ✅ | 打开表单页 |
| 2 | `browser_snapshot` | ✅ | 截取页面结构 |
| 3 | `browser_form_validate` | ✅ | 检测表单验证规则 |
| 4 | `browser_form_fill` | ✅ | 批量填充字段（不自动提交） |
| 5 | `browser_click` | ✅ | 点击提交按钮 |
| 6 | `browser_assert` | ✅ | 断言提交反馈 |
| 7 | `evidence_pack` | ✅ | 收集证据 |

### 3. audit-performance — 性能审计

- **MCP Prompt**：`/audit-performance`
- **文档**：[`docs/skills/performance-audit.md`](../skills/performance-audit)
- **工具数**：6

| Step | 工具 | 必需 | 说明 |
|------|------|------|------|
| 1 | `browser_open` | ✅ | 打开目标页 |
| 2 | `browser_lighthouse_audit` | ✅ | 运行 Lighthouse 审计 |
| 3 | `browser_performance_check` | ✅ | 采集 Core Web Vitals |
| 4 | `browser_performance_trace` | ✅ | 记录性能 trace + HAR |
| 5 | `browser_memory_check` | ✅ | 检测内存泄漏 |
| 6 | `evidence_pack` | ✅ | 收集证据 |

### 4. audit-security — 安全审计

- **MCP Prompt**：`/audit-security`
- **文档**：[`docs/skills/security-audit.md`](../skills/security-audit)
- **工具数**：6

| Step | 工具 | 必需 | 说明 |
|------|------|------|------|
| 1 | `security_headers_check` | ✅ | 检查安全响应头 |
| 2 | `security_csp_analyze` | ✅ | CSP 深度分析 |
| 3 | `security_owasp_top10` | ✅ | OWASP Top 10 扫描 |
| 4 | `security_sql_injection_scan` | ✅ | SQL 注入扫描 |
| 5 | `security_xss_scan` | ✅ | XSS 漏洞扫描 |
| 6 | `evidence_pack` | ✅ | 收集证据 |

### 5. visual-regression — 视觉回归

- **MCP Prompt**：`/visual-regression`
- **文档**：[`docs/skills/visual-regression.md`](../skills/visual-regression)
- **工具数**：6（其中 3 个为条件工具，按模式二选一）

| Step | 工具 | 必需 | 变体 | 说明 |
|------|------|------|------|------|
| 1 | `browser_open` | ✅ | — | 打开目标页 |
| 2 | `browser_visual_baseline` | ⚠️ | full-page | 建立基线（仅 full-page 模式） |
| 2 | `browser_visual_compare` | ⚠️ | full-page | 与基线对比（仅 full-page 模式） |
| 2 | `browser_visual_component` | ⚠️ | component | 组件级对比（仅 component 模式） |
| 3 | `browser_visual_report` | ✅ | — | 列出视觉产物 |
| 4 | `evidence_pack` | ✅ | — | 收集证据 |

> ⚠️ 标记的工具为条件工具：full-page 模式使用 `browser_visual_baseline` + `browser_visual_compare`，component 模式使用 `browser_visual_component`（自动建基线）。

### 6. debug-page — 调试排查

- **MCP Prompt**：`/debug-page`
- **文档**：[`docs/skills/debug-investigation.md`](../skills/debug-investigation)
- **工具数**：7

| Step | 工具 | 必需 | 说明 |
|------|------|------|------|
| 1 | `browser_open` | ✅ | 打开问题页 |
| 2 | `browser_errors_clear` | ✅ | 清理旧错误建立 checkpoint |
| 3 | _（复现用户操作）_ | — | 此步骤由 AI 根据症状自由组合 |
| 4 | `debug_investigate` | ✅ | 运行自动诊断 |
| 5 | `browser_errors` | ✅ | 查看统一错误 |
| 6 | `browser_network_detail` | ✅ | 检查失败网络请求 |
| 7 | `error_fix_suggestion` | ✅ | 获取修复建议 |
| 8 | `evidence_pack` | ✅ | 收集证据 |

### 7. e2e-flow — 端到端流程

- **MCP Prompt**：`/e2e-flow`
- **文档**：[`docs/skills/e2e-flow.md`](../skills/e2e-flow)
- **工具数**：4
- **特殊**：使用 `evidence_index`（跨步骤时间线）而非 `evidence_pack`（单步证据）

| Step | 工具 | 必需 | 说明 |
|------|------|------|------|
| 1 | _（前置：用户描述业务流程）_ | — | AI 解析 flowName/flowDescription |
| 2 | `validation_run` | ✅ | 执行验收计划 |
| 3 | `evidence_index` | ✅ | 构建证据时间线 |
| 4 | `validation_report` | ✅ | 生成 Markdown 报告 |
| 5 | `validation_report_export` | ✅ | 导出 HTML 报告 |

## 反向映射（Tool → Skills）

按工具名查询其归属哪些 Skill。完整反查可通过 `skill_tools_map` 工具的 `toolName` 参数获得。

| 工具 | 归属 Skill 数 | Skills |
|------|---------------|--------|
| `browser_open` | 5 | validate-login, submit-form, audit-performance, visual-regression, debug-page |
| `browser_snapshot` | 2 | validate-login, submit-form |
| `browser_form_fill` | 2 | validate-login, submit-form |
| `browser_form_validate` | 1 | submit-form |
| `browser_click` | 2 | validate-login, submit-form |
| `browser_wait` | 1 | validate-login |
| `browser_assert` | 2 | validate-login, submit-form |
| `browser_errors_clear` | 1 | debug-page |
| `browser_errors` | 1 | debug-page |
| `browser_network_detail` | 1 | debug-page |
| `browser_lighthouse_audit` | 1 | audit-performance |
| `browser_performance_check` | 1 | audit-performance |
| `browser_performance_trace` | 1 | audit-performance |
| `browser_memory_check` | 1 | audit-performance |
| `browser_visual_baseline` | 1 | visual-regression (full-page) |
| `browser_visual_compare` | 1 | visual-regression (full-page) |
| `browser_visual_component` | 1 | visual-regression (component) |
| `browser_visual_report` | 1 | visual-regression |
| `security_headers_check` | 1 | audit-security |
| `security_csp_analyze` | 1 | audit-security |
| `security_owasp_top10` | 1 | audit-security |
| `security_sql_injection_scan` | 1 | audit-security |
| `security_xss_scan` | 1 | audit-security |
| `debug_investigate` | 1 | debug-page |
| `error_fix_suggestion` | 1 | debug-page |
| `evidence_pack` | 6 | validate-login, submit-form, audit-performance, audit-security, visual-regression, debug-page |
| `evidence_index` | 1 | e2e-flow |
| `validation_run` | 1 | e2e-flow |
| `validation_report` | 1 | e2e-flow |
| `validation_report_export` | 1 | e2e-flow |

> 💡 `evidence_pack`（单步证据）vs `evidence_index`（跨步骤时间线）：6 个 Skill 用 `evidence_pack` 收尾；仅 `e2e-flow` 因涉及多步验收计划，改用 `evidence_index` 串联完整时间线。

## 一致性校验

### 工具入口

| 工具 | 用途 | 关键参数 |
|------|------|----------|
| [`skill_consistency_check`](../tools/system) | 批量校验所有 Skill 引用工具与实际注册一致 | `mode: strict\|warn`，`skillName`（可选单 Skill 过滤） |
| [`skill_tools_map`](../tools/system) | 双向查询 Skill↔Tool 映射 | `skillName` 或 `toolName`（anyOf 二选一） |
| [`mcp_self_test`](../tools/system) | MCP 服务自检 | 返回对象含 `skillConsistencyV2` 字段 |

### 校验维度

1. **工具存在性**：SKILL_TOOLS_MAP 中每个工具必须在 `tools/*.json` 实际注册。缺失 → `missing[]` → `passed: false`
2. **mapDrift 检测**：SKILL_TOOLS_MAP 中 `required: true` 的工具，必须出现在对应 MCP Prompt 的 `buildMessages` 输出中。差异 → `mapDrift[]` → warning（不 fail）

### strict vs warn 模式

| 模式 | missing 影响 passed | mapDrift 影响 passed | 适用场景 |
|------|---------------------|----------------------|----------|
| `strict`（默认） | ✅ 影响 | ❌ 仅 warning | 发布前 CI 校验、回归测试 |
| `warn` | ❌ 不影响 | ❌ 仅 warning | 开发期渐进迁移、监控告警 |

### 输出示例（节选）

```json
{
  "passed": true,
  "mode": "strict",
  "availableToolsCount": 136,
  "summary": { "total": 7, "passed": 7, "warnings": 0 },
  "skills": [
    {
      "skillName": "validate-login",
      "promptName": "validate-login",
      "passed": true,
      "missing": [],
      "extra": [],
      "mapDrift": [],
      "totalTools": 7
    }
  ],
  "checkedAt": "2026-07-18T12:00:00.000Z"
}
```

## 在 AI 工作流中的使用

### 场景 1：AI 不知道该用哪些工具

```
用户：帮我验证登录功能
AI：调用 skill_tools_map({ skillName: "validate-login" })
    → 返回 7 工具链 + nextSteps 引导
AI：按 nextSteps 调用 /validate-login prompt 启动工作流
```

### 场景 2：AI 拿到一个工具，想知道归属哪些 Skill

```
用户：我刚调了 browser_form_fill，还能配合哪些 Skill？
AI：调用 skill_tools_map({ toolName: "browser_form_fill" })
    → 返回 ["validate-login", "submit-form"]
AI：可选择 /validate-login 或 /submit-form prompt 完成后续步骤
```

### 场景 3：发布前一致性校验

```
开发者：CI 中调用 skill_consistency_check({ mode: "strict" })
        → passed: true → 通过
        → passed: false → 检查 missing[] 列表，定位未注册工具
```

## 相关文档

- [工具选择决策矩阵](./tool-decision-matrix) — "我想做 X"决策树
- [Skill 指导总览](../skills/index) — 8 篇 Skill 文档
- [工具总览](../tools/overview) — 136 工具按 22 类分组
- [MCP 协议速查](./mcp-cheatsheet) — MCP 客户端配置
- [CHANGELOG](./changelog) — 版本变更记录
