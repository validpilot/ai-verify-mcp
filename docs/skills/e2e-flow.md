# Skill: 端到端流程

> 场景：完整业务流程的端到端验证（登录→浏览→下单→支付→订单）、多用例验收测试、CI 上线门禁、跨步骤证据链收集。

## 1. 场景描述与痛点

端到端（E2E）验证是确认"完整业务流程可用"的最后一道防线。AI 生成的代码常出现：

- 单个页面功能正常，但跨页面流程断裂（登录后跳转错页面、表单提交后状态丢失）
- 多步骤操作中某一步偶发失败，难以定位
- 缺乏证据链，失败后无法复盘
- 用例之间相互污染（用例 A 修改的数据影响用例 B）
- 网络错误、console 错误未被发现
- 失败后没有自动调查机制

**本 Skill 提供 2 条工具链**：
- **A. 简单链路验证**：用 `validation_chain` 跑 5 步链路（navigate/click/type/wait/validate），适合单流程快速验证
- **B. 完整验收测试**：用 `validation_run` 跑多用例验收计划，适合上线前全量回归

## 2. 推荐工具链

### 工具链 A：简单链路验证（单流程）

```
┌──────────────────────────────────────────────────────────────┐
│  简单链路验证（validation_chain）                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: validation_chain     5 步链路：                     │
│            navigate → click → type → wait → validate         │
│            每步自动检查 console/network 错误                 │
│     ↓                                                        │
│  Step 2: evidence_pack        收集单步证据                   │
│     ↓                                                        │
│  Step 3: validation_report    生成 Markdown 报告             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 工具链 B：完整验收测试（多用例）

```
┌──────────────────────────────────────────────────────────────┐
│  完整验收测试（validation_run）                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: validation_run          执行验收计划（多个 cases）   │
│            - 自动清理错误 checkpoint                          │
│            - 注入运行时探针                                    │
│            - 录制 trace + 导出 HAR                            │
│            - 失败时自动调用 debug_investigate                 │
│     ↓                                                        │
│  Step 2: evidence_index          串联所有证据包生成时间线     │
│     ↓                                                        │
│  Step 3: validation_report       生成六段式 Markdown 报告     │
│     ↓                                                        │
│  Step 4: validation_report_export 导出本地 HTML 报告          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 每步说明

| 步骤 | 工具 | 作用 | 关键参数 |
|---|---|---|---|
| 1 | `validation_chain` | 5 步链路验证（navigate/click/type/wait/validate） | `steps`, `requiredSteps`, `failOnError`, `captureScreenshots` |
| 1' | `validation_run` | 多用例验收计划执行 | `name`, `cases`, `investigateOnFailure`, `continueOnFailure` |
| 2 | `evidence_pack` | 单步证据包（截图/DOM/错误/网络/trace） | `runId`, `stepId`, `label`, `captureStep` |
| 2' | `evidence_index` | 跨步骤证据索引 + 时间线 | `runId`, `includeTraceIds` |
| 3 | `validation_report` | 六段式 Markdown/JSON 报告 | `format`, `strictSchema` |
| 4 | `validation_report_export` | 本地 HTML 报告 | 无 |

## 3. 关键参数说明

### validation_chain

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `steps` | array | **必填** | 验证步骤列表，每步含 `type` 和相关参数 |
| `failOnError` | boolean | true | 发现错误时立即停止 |
| `captureScreenshots` | boolean | false | 每步是否截图 |
| `requiredSteps` | boolean | true | 强制 5 步链路（navigate/click/type/wait/validate），缺少则拒绝执行 |
| `networkFilter` | object | - | 网络请求过滤条件 |
| `timeout` | number | 60000 | 整个流程超时（毫秒） |

**steps 数组结构**：
```javascript
[
  { "type": "navigate", "url": "https://example.com/login" },
  { "type": "type", "selector": "#username", "value": "tomsmith" },
  { "type": "click", "selector": "button[type='submit']" },
  { "type": "wait", "urlContains": "dashboard" },
  { "type": "validate", "assertions": { "urlContains": "dashboard", "noErrors": true } }
]
```

### validation_run

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `name` | string | - | 验证计划名称 |
| `cases` | array | **必填** | 测试用例列表 |
| `clearArtifacts` | boolean | false | 执行前清理截图/trace/har |
| `clearErrors` | boolean | true | 执行前清空错误 checkpoint |
| `instrument` | boolean | true | 注入运行时探针 |
| `trace` | boolean | true | 录制 trace |
| `har` | boolean | true | 导出 HAR JSON |
| `investigateOnFailure` | boolean | true | 失败时自动调用 `debug_investigate` |
| `continueOnFailure` | boolean | false | 用例失败后是否继续 |

**cases 数组结构**：
```javascript
[
  {
    "name": "login-success",
    "flow": [
      { "type": "navigate", "url": "https://example.com/login" },
      { "type": "type", "selector": "#username", "value": "tomsmith" },
      { "type": "type", "selector": "#password", "value": "SuperSecretPassword!" },
      { "type": "click", "selector": "button[type='submit']" },
      { "type": "wait", "urlContains": "secure" },
      { "type": "validate", "assertions": { "urlContains": "secure", "noErrors": true } }
    ]
  },
  {
    "name": "login-wrong-password",
    "flow": [
      { "type": "navigate", "url": "https://example.com/login" },
      { "type": "type", "selector": "#username", "value": "tomsmith" },
      { "type": "type", "selector": "#password", "value": "wrongpassword" },
      { "type": "click", "selector": "button[type='submit']" },
      { "type": "validate", "assertions": { "textContains": "Your password is invalid" } }
    ]
  }
]
```

### evidence_pack

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `runId` | string | 自动生成 | 验证运行 ID |
| `stepId` | string | - | 步骤 ID（如 `marketplace.purchase.after-click`） |
| `label` | string | - | 步骤名称（stepId 未传时作为 stepId） |
| `traceId` | string | - | 链路追踪 ID（关联后端日志） |
| `captureStep` | boolean | true | 同时调用 `browser_step` 采集截图和 DOM |
| `screenshot` | boolean | true | 是否截图 |
| `snapshot` | boolean | true | 是否采集 DOM 快照 |
| `har` | boolean | false | 是否导出 HAR |
| `currentOnly` | boolean | true | 只采集当前 checkpoint 后的错误和网络 |
| `autoAnalyze` | boolean | true | 截图后自动分析可见错误 |
| `networkLimit` | number | 30 | 保留最近网络请求条数 |
| `consoleLimit` | number | 30 | 保留最近 Console 条数 |
| `beforeData` / `afterData` | object | - | 操作前后数据快照，用于生成 data diff |

### validation_report

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `format` | string | markdown | 报告格式：`markdown` / `json` |
| `strictSchema` | boolean | true | 严格遵循六段式结构 |

**六段式报告结构**：
1. 摘要（Summary）
2. 工具链（Toolchain）
3. 发现问题（Findings，含 blocking/critical/general/optimization 四级）
4. 网络证据（NetworkEvidence）
5. 证据产物（Artifacts）
6. 待分类项（Unclassified）

## 4. 预期产出

### validation_chain 输出

```json
{
  "ok": true,
  "totalSteps": 5,
  "passedSteps": 5,
  "failedSteps": 0,
  "steps": [
    { "step": 1, "type": "navigate", "ok": true, "url": "https://example.com/login" },
    { "step": 2, "type": "type", "ok": true, "selector": "#username" },
    { "step": 3, "type": "click", "ok": true, "selector": "button[type='submit']" },
    { "step": 4, "type": "wait", "ok": true, "finalUrl": "https://example.com/dashboard" },
    { "step": 5, "type": "validate", "passed": true, "assertions": { "urlContains": "dashboard", "noErrors": true } }
  ],
  "errors": [],
  "networkErrors": [],
  "duration": 4200
}
```

### validation_run 输出

```json
{
  "ok": true,
  "runId": "run-20260718-153000",
  "name": "login-acceptance",
  "totalCases": 2,
  "passedCases": 2,
  "failedCases": 0,
  "cases": [
    { "name": "login-success", "passed": true, "duration": 3200 },
    { "name": "login-wrong-password", "passed": true, "duration": 2800 }
  ],
  "tracePath": "traces/run-20260718-153000.zip",
  "harPath": "traces/run-20260718-153000.har",
  "reportPath": "reports/run-20260718-153000.md"
}
```

### validation_report 六段式输出

```markdown
# 验证报告：login-acceptance

## 一、摘要
- 运行 ID：run-20260718-153000
- 总用例：2，通过：2，失败：0
- 开始时间：2026-07-18 15:30:00
- 持续时长：6000ms

## 二、工具链
- validation_run（多用例执行）
- debug_investigate（失败时自动调用，本次未触发）
- evidence_pack（每步证据收集）

## 三、发现问题
| 级别 | 数量 | 详情 |
|---|---|---|
| blocking | 0 | - |
| critical | 0 | - |
| general | 0 | - |
| optimization | 1 | 建议增加密码强度校验提示 |

## 四、网络证据
- 总请求数：24
- 慢请求（>1s）：1（POST /api/login，1200ms）
- 失败请求（4xx/5xx）：0

## 五、证据产物
- 截图：6 张
- trace：1 个 zip
- HAR：1 个 json
- 证据包：6 个 evidence.json

## 六、待分类项
无
```

### 证据文件

- `reports/<run-id>.md` — Markdown 验证报告
- `reports/<run-id>.html` — HTML 验证报告（export 后）
- `traces/<run-id>.zip` — 完整操作 trace
- `traces/<run-id>.har` — 网络请求 HAR
- `evidence/<step-id>.evidence.json` — 单步证据包

## 5. 完整端到端示例

### 工具链 A：简单链路验证（以 https://example.com/login 为例）

```
# Step 1: 5 步链路验证
validation_chain({
  steps: [
    { "type": "navigate", "url": "https://the-internet.herokuapp.com/login" },
    { "type": "type", "selector": "#username", "value": "tomsmith" },
    { "type": "click", "selector": "button[type='submit']" },
    { "type": "wait", "urlContains": "secure" },
    { "type": "validate", "assertions": { "urlContains": "secure", "textContains": "secure area", "noErrors": true } }
  ],
  requiredSteps: true,
  failOnError: true,
  captureScreenshots: true,
  timeout: 30000
})

# Step 2: 收集证据
evidence_pack({
  stepId: "login-flow-complete",
  label: "登录流程完成",
  captureStep: true
})

# Step 3: 生成报告
validation_report({ format: "markdown", strictSchema: true })
```

### 工具链 B：完整验收测试（多用例）

```
# Step 1: 执行多用例验收计划
validation_run({
  name: "herokuapp-login-acceptance",
  cases: [
    {
      "name": "login-success",
      "flow": [
        { "type": "navigate", "url": "https://the-internet.herokuapp.com/login" },
        { "type": "type", "selector": "#username", "value": "tomsmith" },
        { "type": "type", "selector": "#password", "value": "SuperSecretPassword!" },
        { "type": "click", "selector": "button[type='submit']" },
        { "type": "wait", "urlContains": "secure" },
        { "type": "validate", "assertions": { "urlContains": "secure", "textContains": "secure area", "noErrors": true } }
      ]
    },
    {
      "name": "login-wrong-password",
      "flow": [
        { "type": "navigate", "url": "https://the-internet.herokuapp.com/login" },
        { "type": "type", "selector": "#username", "value": "tomsmith" },
        { "type": "type", "selector": "#password", "value": "wrongpassword" },
        { "type": "click", "selector": "button[type='submit']" },
        { "type": "validate", "assertions": { "textContains": "Your password is invalid" } }
      ]
    }
  ],
  clearErrors: true,
  instrument: true,
  trace: true,
  har: true,
  investigateOnFailure: true,
  continueOnFailure: true
})

# Step 2: 证据索引
evidence_index({ includeTraceIds: true })

# Step 3: 生成 Markdown 报告
validation_report({ format: "markdown", strictSchema: true })

# Step 4: 导出 HTML 报告
validation_report_export()
```

### 预期返回

- `validation_run` 返回 `runId` + 用例通过/失败统计 + trace/har/report 路径
- `evidence_index` 返回所有证据包时间线，按 `runId` 串联
- `validation_report` 返回六段式 Markdown 报告内容
- `validation_report_export` 返回 HTML 报告本地路径

## 6. 常见坑与最佳实践

### 常见坑

| 坑 | 现象 | 解决方案 |
|---|---|---|
| 用例间数据污染 | 用例 B 因用例 A 修改的数据失败 | 每个用例开头 `navigate` 到干净状态；或用 `clearErrors: true` |
| 必填步骤缺失 | `requiredSteps` 拒绝执行 | 5 步必须齐全：navigate/click/type/wait/validate；或设 `requiredSteps: false` |
| 失败后未调查 | 只看到失败不知道原因 | 设 `investigateOnFailure: true`，自动调用 `debug_investigate` |
| trace 文件过大 | 几十 MB trace 影响存档 | 用例数量控制在 5-10 个；或 `trace: false` 关闭录制 |
| HAR 包含敏感信息 | 密码、token 出现在 HAR | 上线前用脚本脱敏 HAR 文件；或 `har: false` |
| 用例失败后中断 | 后续用例未执行 | 设 `continueOnFailure: true`，跑完全部用例再统一报告 |
| 断言过松 | 用例通过但实际有问题 | 用 `noErrors: true` 检查 console 错误；用 `textContains` 验证关键文本 |
| 证据包遗漏 | 关键步骤未收集证据 | 在用例 flow 中显式插入 `evidence_pack` 调用 |

### 最佳实践

1. **按用户 5 步链路闭合标准设计用例**：每个用例必须覆盖入口可达 → 可操作 → 正确请求 → 正常响应 → 状态更新
2. **测试正反两条路径**：①正常流程应通过；②错误数据应被拦截（如错误密码提示）
3. **continueOnFailure: true**：上线前回归跑完全部用例，避免遗漏
4. **investigateOnFailure: true**：失败时自动调查，省去手动 debug
5. **每步留证据**：关键步骤（提交、支付、下单）必收 `evidence_pack`
6. **六段式报告**：用 `strictSchema: true` 确保报告结构统一，便于 CI 解析
7. **HTML 报告归档**：`validation_report_export` 生成的 HTML 可作为上线审批材料
8. **必收证据**：trace + HAR + 截图 + Markdown 报告 + HTML 报告

## 相关 Skill

- [登录流程验证](./login-validation) — E2E 流程的常见子场景
- [表单提交验证](./form-submission) — E2E 流程的表单环节
- [调试排查](./debug-investigation) — E2E 失败时深入排查
- [安全审计](./security-audit) — 上线门禁组合
- [性能审计](./performance-audit) — 上线门禁组合

## MCP Prompt

使用 `/e2e-flow` prompt 可快速启动端到端工作流（需 ValidPilot v1.9.3+）。在支持 MCP Prompts 的客户端中输入 `/` 即可看到该命令，传入 `url`、`flow` 参数后返回多步指令文本，由 AI 模型按序执行链路验证 + 证据收集 + 报告生成。
