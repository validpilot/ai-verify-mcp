# 验证框架

14 个验证工具，覆盖断言、流程验证、元素验证、报告生成。

## 工具列表

| 工具 | 说明 |
|------|------|
| `validation_start` | 启动验证会话 |
| `validation_check` | 单项验证检查 |
| `validation_run` | 执行完整验证 |
| `validation_element` | 元素级别验证 |
| `validation_flow` | 多步流程验证 |
| `validation_quick_run` | 一键 7 项快速验证 |
| `validation_matrix` | 多组合验证矩阵 |
| `validation_decision` | 验证决策（AI判断） |
| `validation_report` | 生成验证报告 |
| `validation_report_export` | 导出报告 |
| `validation_suite_run` | 测试套件运行 |

---

## validation_quick_run

一键 7 项快速验证，覆盖最常用的检查项，适合快速冒烟测试。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `url` | ✅ | 目标页面 URL |
| `waitMs` | ❌ | 等待毫秒，默认 2000 |
| `checks` | ❌ | 指定检查项，默认全部 7 项 |

**返回示例**：
```json
{
  "passed": true,
  "checks": [
    { "name": "console_errors", "passed": true, "count": 0, "details": [] },
    { "name": "page_load", "passed": true, "time": "1.2s" },
    { "name": "network_errors", "passed": false, "count": 2, "details": ["404 /api/user", "500 /api/order"] },
    { "name": "a11y_basics", "passed": true, "violations": 0 },
    { "name": "performance", "passed": true, "score": 85 },
    { "name": "visual_smoke", "passed": true, "diffRatio": 0.001 },
    { "name": "dom_ready", "passed": true }
  ],
  "summary": "6/7 passed"
}
```

**适用场景**：CI 集成、快速冒烟、PR 验证

---

## validation_start

启动一个新的验证会话，返回会话 ID 用于后续关联。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `name` | ❌ | 会话名称 |

**返回**：
```json
{
  "sessionId": "vld_abc123",
  "name": "my-validation",
  "startedAt": "2026-07-07T10:00:00Z"
}
```

---

## validation_check

执行单项验证检查，精准验证单个条件。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `type` | ✅ | 检查类型：`console_error`、`network_error`、`selector_exists`、`selector_visible`、`a11y_violation` |
| `value` | ✅ | 检查值（如选择器、URL） |
| `threshold` | ❌ | 阈值（如违规数量上限） |

**返回**：
```json
{
  "passed": true,
  "type": "selector_visible",
  "value": "#submit-btn",
  "actual": true,
  "message": "元素 #submit-btn 可见"
}
```

---

## validation_run

执行完整验证流程，按预设顺序执行多项检查。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `url` | ✅ | 目标页面 URL |
| `checks` | ✅ | 检查项数组 |
| `stopOnFirstFailure` | ❌ | 首次失败停止，默认 false |

**checks 数组项示例**：
```json
{ "type": "console_error", "threshold": 0 },
{ "type": "selector_visible", "value": "#login-form" },
{ "type": "network_error", "threshold": 3 }
```

---

## validation_element

针对单个元素的精确验证，检查元素是否存在、可见、可交互。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `selector` | ✅ | CSS 选择器 |
| `expected` | ✅ | 期望状态：`visible`、`hidden`、`enabled`、`disabled`、`checked` |
| `timeout` | ❌ | 超时毫秒，默认 5000 |

**返回**：
```json
{
  "passed": true,
  "selector": "#username",
  "expected": "enabled",
  "actual": "enabled"
}
```

---

## validation_flow

多步流程验证，支持 navigate/click/type/wait/eval/screenshot 6 种操作。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `steps` | ✅ | 操作步骤数组 |
| `continueOnFailure` | ❌ | 失败后继续，默认 false |
| `timeout` | ❌ | 全局超时（秒），默认 30 |

**steps 示例**：
```json
[
  { "action": "navigate", "url": "https://example.com/login" },
  { "action": "type", "selector": "#username", "value": "testuser" },
  { "action": "type", "selector": "#password", "value": "password123" },
  { "action": "click", "selector": "#login-btn" },
  { "action": "wait", "ms": 2000 },
  { "action": "eval", "expression": "document.querySelector('.alert-success') !== null", "expected": true }
]
```

**返回**：
```json
{
  "passed": true,
  "totalSteps": 6,
  "completedSteps": 6,
  "failedSteps": 0,
  "results": [
    { "step": 1, "action": "navigate", "passed": true },
    { "step": 2, "action": "type", "passed": true },
    ...
  ]
}
```

---

## validation_report

生成当前验证会话的完整报告。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `sessionId` | ❌ | 验证会话 ID，不传则使用最近会话 |
| `format` | ❌ | 报告格式：`json`（默认）/ `markdown` / `html` |

**返回**：
```json
{
  "sessionId": "vld_abc123",
  "generatedAt": "2026-07-07T10:05:00Z",
  "totalChecks": 12,
  "passed": 10,
  "failed": 2,
  "duration": "45s",
  "report": "..."
}
```

---

## validation_report_export

将验证报告导出为文件。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `sessionId` | ❌ | 验证会话 ID |
| `format` | ❌ | 文件格式：`json`（默认）/ `markdown` / `html` |
| `path` | ❌ | 保存路径，默认 `artifacts/reports/` |

---

## validation_matrix

多组合验证矩阵，对多个选择器 × 多个条件进行交叉验证。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `matrix` | ✅ | 矩阵定义，`[{selectors: [], conditions: []}]` |

**适用场景**：表单多字段验证、表格多单元格检查

---

## validation_decision

AI 驱动的验证决策，根据上下文智能判断验证是否通过。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `context` | ✅ | 验证上下文描述 |
| `evidence` | ✅ | 证据数据（截图、日志、指标） |
| `criteria` | ❌ | 通过标准描述 |

---

## validation_suite_run

批量运行测试套件，适合回归测试。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `suite` | ✅ | 测试套件名称或路径 |
| `parallel` | ❌ | 是否并行执行，默认 false |

---

## 常见错误处理

| 错误类型 | 原因 | 处理方式 |
|---------|------|---------|
| `selector not found` | 元素不存在 | 检查选择器是否正确，增加 wait |
| `timeout` | 网络慢或元素延迟 | 增加 `waitMs` 或 `timeout` 参数 |
| `console errors detected` | 前端有未处理异常 | 调用 `browser_diagnose` 排查根因 |
