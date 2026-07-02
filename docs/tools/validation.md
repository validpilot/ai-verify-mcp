# 验证框架

16 个验证工具，覆盖断言、流程验证、元素验证、报告生成、冒烟测试。

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
| `chain_spec_run` | 按链路规格执行业务链路验证（支持模板） |
| `chain_list_templates` | 列出内置链路模板 |
| `contract_guard` | 从前端实际消费字段生成 consumer contract（支持基线对比） |
| `contract_baseline` | 消费者契约基线管理（保存/加载/对比/删除） |
| `browser_smoke_test` | 快速冒烟测试，检查页面基本可用性 |
| `browser_counterfactual_analyze` | 反事实根因分析，对比成功/失败路径定位问题 |

---

## chain_list_templates

列出所有内置链路规格模板。每个模板包含名称、描述、步骤数、状态源等信息，可直接用于 `chain_spec_run` 的 `template` 参数。

**返回示例**：
```json
{
  "success": true,
  "templates": [
    {
      "name": "marketplace-purchase",
      "description": "Marketplace 商品购买完整功能链路验证",
      "stepsCount": 9,
      "hasStateSources": true,
      "targetUrl": "/dashboard/marketplace"
    },
    {
      "name": "login-basic",
      "description": "登录页基础可用性验证",
      "stepsCount": 4,
      "hasStateSources": false,
      "targetUrl": "/login"
    },
    {
      "name": "credits-balance",
      "description": "点数中心余额与交易记录验证",
      "stepsCount": 2,
      "hasStateSources": true,
      "targetUrl": "/dashboard/credits"
    },
    {
      "name": "shopping-cart",
      "description": "购物车添加/查看/删除完整流程验证",
      "stepsCount": 13,
      "hasStateSources": true,
      "targetUrl": "/dashboard/marketplace"
    },
    {
      "name": "register-flow",
      "description": "用户注册完整流程验证（含表单校验）",
      "stepsCount": 11,
      "hasStateSources": false,
      "targetUrl": "/register"
    },
    {
      "name": "checkout-payment",
      "description": "结账支付流程验证（订单创建 + 支付确认）",
      "stepsCount": 10,
      "hasStateSources": true,
      "targetUrl": "/dashboard/cart"
    }
  ],
  "total": 6
}
```

**适用场景**：快速了解可用模板、选择合适的链路规格、动态生成测试计划

---

## chain_spec_run（模板增强）

按链路规格执行业务链路验证，支持打开页面、点击、输入、等待、断言、状态采集/对比，汇总每步 Console、PageError、Network、状态 diff 和证据。

**v2 新增：template 参数**

指定内置模板名即可加载完整链路规格，无需手写所有步骤。传入的其他参数会覆盖模板默认值。

| 参数 | 必填 | 说明 |
|------|------|------|
| `template` | ❌ | 内置模板名，如 `marketplace-purchase`、`login-basic`、`credits-balance` |
| `targetUrl` | ❌ | 覆盖模板的目标 URL |
| `steps` | ❌ | 覆盖或追加模板步骤 |
| `overrides` | ❌ | 模板字段覆盖对象，可覆盖任意模板顶层字段 |

**示例 - 使用 Marketplace 购买模板**：
```json
{
  "template": "marketplace-purchase",
  "overrides": {
    "targetUrl": "http://localhost:3000/dashboard/marketplace"
  }
}
```

**适用场景**：快速启动标准业务链路验证、模板化复用验证规格、CI 回归测试

---

## contract_guard

从前端实际消费的 API 响应中自动提取字段结构，生成 **consumer contract（消费者契约）**，防止后端 API 漂移导致前端隐性故障。

支持两种数据来源：
1. **直接调用**：传入 endpoints 列表，主动请求并分析响应
2. **网络捕获**：从已捕获的 network 日志中提取 /api/ 请求响应
3. **自动发现**：`autoDiscover` 从 network 日志自动发现 API 端点

| 参数 | 必填 | 说明 |
|------|------|------|
| `endpoints` | ❌ | 要直接调用的端点列表，每项含 path/url/method/headers/body |
| `fromNetwork` | ❌ | 是否从 network 日志提取，默认 true |
| `since` | ❌ | 从 network 日志提取的时间起点，默认当前 checkpoint |
| `urlContains` | ❌ | 只处理 URL 包含此字符串的请求 |
| `autoDiscover` | ❌ | 自动从 network 日志发现 API 端点（当 endpoints 为空时生效），默认 false |
| `saveBaseline` | ❌ | 将本次 contracts 保存为基线，默认 false |
| `compareBaseline` | ❌ | 与已保存基线对比检测漂移，默认 false |
| `baselineName` | ❌ | 基线名称，默认 'default'，支持多套基线 |

**返回示例**：
```json
{
  "success": true,
  "contracts": [
    {
      "endpoint": "/api/marketplace/items",
      "method": "GET",
      "status": 200,
      "schema": {
        "type": "object",
        "properties": {
          "code": { "type": "number" },
          "data": {
            "type": "object",
            "properties": {
              "items": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "id": { "type": "string" },
                    "name": { "type": "string" },
                    "price": { "type": "number" }
                  },
                  "required": ["id", "name", "price"]
                }
              },
              "total": { "type": "number" }
            },
            "required": ["items", "total"]
          }
        },
        "required": ["code", "data"]
      },
      "source": "network"
    }
  ],
  "count": 1
}
```

**适用场景**：消费者契约测试、API 变更检测、前端依赖字段监控、回归验证

---

## contract_baseline

消费者契约基线管理：保存当前 schema 为基线、加载基线、对比当前 schema 与基线检测漂移、列出所有基线、删除基线。配合 `contract_guard` 使用，可实现 API 变更版本化守护。

**典型工作流**：
1. 首次：`contract_guard` 生成 contracts → `contract_baseline` 保存为基线
2. 后续：`contract_guard` 生成新 contracts → `contract_baseline` 对比基线检测漂移

| 参数 | 必填 | 说明 |
|------|------|------|
| `action` | ❌ | 操作类型：`list`/`save`/`load`/`compare`/`delete`，默认 `list` |
| `name` | ❌ | 基线名称，默认 `default`。支持多套基线如 `production`、`v1.0` |
| `contracts` | ❌ | save/compare 时传入的 contracts 列表（来自 contract_guard 输出） |

**漂移检测类型**：
- `endpoint_added`：新增端点（基线中不存在）
- `endpoint_removed`：端点已移除（当前不存在）
- `field_added`：新增字段
- `field_removed`：删除字段
- `field_modified`：字段值修改
- `type_changed`：字段类型变更
- `required_changed`：required 属性变化
- `items_added`/`items_removed`：数组 items schema 变化

**示例 - 保存基线**：
```json
{
  "action": "save",
  "name": "production-v1.0"
}
```

**示例 - 对比基线**：
```json
{
  "action": "compare",
  "name": "production-v1.0"
}
```

**适用场景**：API 版本化守护、回归测试、前后端联调契约一致性检查

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
