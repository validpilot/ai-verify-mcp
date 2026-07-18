# Skill: 调试排查

> 场景：白屏问题排查、接口 500 错误定位、JS 异常根因分析、网络请求失败诊断、console 错误聚合分析。

## 1. 场景描述与痛点

前端 Bug 排查常面临"现象可见、根因不明"的困境：

- 页面白屏，但不知道是 JS 异常、接口 500、还是资源加载失败
- 接口返回 500，但看不出是前端传参错误还是后端逻辑问题
- 偶发性错误难以复现，缺乏现场证据
- Console 错误太多，找不到关键错误
- 跨域脚本报 `Script error.`，无法定位
- 网络请求失败但不知道具体哪个请求、什么状态码、响应内容
- 修复后无法验证是否真的解决

**本 Skill 通过 7 步工具链**，从问题现象输入到根因假设、证据链、修复建议、复测验证，形成完整调试闭环。

## 2. 推荐工具链

```
┌──────────────────────────────────────────────────────────────┐
│  调试排查工具链                                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: browser_open              打开问题页                │
│  Step 2: browser_errors_clear      清空旧错误，建立 checkpoint│
│  Step 3: (复现问题操作)            点击/输入触发问题          │
│  Step 4: debug_investigate         输入症状 → 假设 + 证据链    │
│  Step 5: browser_errors            查看本轮统一错误           │
│  Step 6: browser_network_detail    查看失败网络请求详情       │
│  Step 7: browser_console           查看控制台日志             │
│  Step 8: error_fix_suggestion      获取修复建议               │
│  Step 9: evidence_pack             收集证据                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 每步说明

| 步骤 | 工具 | 作用 | 关键参数 |
|---|---|---|---|
| 1 | `browser_open` | 打开问题页 | `url` |
| 2 | `browser_errors_clear` | 清空旧错误，建立新 checkpoint | 无 |
| 3 | （复现操作） | 用 `browser_click` / `browser_type` 触发问题 | - |
| 4 | `debug_investigate` | 输入症状，自动汇总证据 + 假设 + 建议 | `symptom`, `expected`, `focus`, `statusMin` |
| 5 | `browser_errors` | 查看本轮 Console/PageError/HTTP 4xx 5xx | `urlContains`, `statusMin`, `includeWarnings` |
| 6 | `browser_network_detail` | 查看失败请求的请求头/响应头/响应体 | `urlContains`, `statusMin`, `method` |
| 7 | `browser_console` | 按级别查看 console 日志 | `level`, `urlContains`, `limit` |
| 8 | `error_fix_suggestion` | 基于 errorSummary + contextFiles 返回 3 个修复建议 | `errorSummary`, `contextFiles`, `maxSuggestions` |
| 9 | `evidence_pack` | 收集证据 | `stepId: "debug-investigation"` |

## 3. 关键参数说明

### debug_investigate（核心工具）

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `symptom` | string | 推荐 | 问题现象描述，如 `"点击登录后页面白屏"` |
| `expected` | string | 推荐 | 期望结果，如 `"跳转到 dashboard 页面"` |
| `focus` | string | 否 | 关注的 URL/API 关键字，如 `/api/login` |
| `urlContains` | string | 否 | `focus` 的别名，按 URL 过滤网络和事件 |
| `statusMin` | number | 否 | 只关注状态码 ≥ 该值的网络记录（如 `400` 只看错误响应） |
| `limit` | number | 否 | 网络和事件最多返回条数，默认 20/50 |
| `includeStorage` | boolean | 否 | 是否包含 storage 脱敏快照，默认 true |
| `includeArtifacts` | boolean | 否 | 是否包含 artifacts 列表，默认 true |

**输出结构**：
- `hypothesis`：根因假设（多个，按可能性排序）
- `evidenceChain`：证据链（errors + network + DOM + storage + artifacts）
- `suggestions`：下一步修复/复测建议

### browser_errors

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `includeWarnings` | boolean | false | 是否包含 warning/warn 日志 |
| `limit` | number | 50 | MCP 服务错误日志最多返回条数 |
| `since` | string | - | ISO 时间戳，只返回该时间之后的错误 |
| `currentOnly` | boolean | true | 只返回当前 checkpoint 之后的错误 |
| `urlContains` | string | - | 只返回 URL 包含该关键字的网络错误 |
| `method` | string | - | 只返回指定 HTTP 方法的网络错误 |
| `statusMin` | number | - | 只返回状态码 ≥ 该值的记录 |
| `statusMax` | number | - | 只返回状态码 ≤ 该值的记录 |

**覆盖的错误类型**：
- Console Error（`console.error`）
- PageError（`window.onerror` 同步异常 + `unhandledrejection`）
- HTTP 4xx / 5xx
- 静默失败（200 响应体含 SQL 错误等）

### browser_network_detail

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `contains` / `urlContains` | string | - | URL 过滤关键字 |
| `method` | string | - | HTTP 方法过滤 |
| `statusMin` / `statusMax` | number | - | 状态码范围过滤 |
| `since` | string | - | ISO 时间戳过滤 |
| `currentOnly` | boolean | true | 只返回当前 checkpoint 之后的记录 |
| `limit` | number | 50 | 最多返回条数 |

**输出包含**：请求头、响应头、请求体、响应体摘要、耗时、失败原因。**自动脱敏**（密码、token 等敏感字段）。

### browser_console

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `level` | string | `all` | 日志级别：`log` / `warning` / `error` / `debug` / `info` |
| `since` | string | - | 时间过滤（ISO 时间戳或 `'5m'` 表示最近 5 分钟） |
| `limit` | number | 50 | 返回日志数量限制 |
| `urlContains` | string | - | 按 URL 关键字过滤 |

**覆盖范围**：
- `console.error` / `warn` / `log` / `debug`
- `window.onerror` 同步异常
- `unhandledrejection` 未处理 Promise 拒绝

**边界说明**：跨域脚本（`<script>` 指向第三方域名）且未设 `crossorigin` 时只显示 `Script error.`，需在第三方脚本加 `crossorigin="anonymous"` 才能获取详细错误。

### error_fix_suggestion

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `errorSummary` | string/object | **是** | 错误摘要，可为字符串或对象 |
| `contextFiles` | array | 否 | 相关文件路径列表 |
| `file` | string | 否 | 单个相关文件路径 |
| `maxSuggestions` | number | 否 | 返回建议最大数量，默认 3 |

**重要**：`error_fix_suggestion` 只返回建议，**不自动改码**。需开发者根据建议手动修复。

## 4. 预期产出

### debug_investigate 输出

```json
{
  "ok": true,
  "symptom": "点击登录后页面白屏",
  "expected": "跳转到 dashboard 页面",
  "hypothesis": [
    {
      "rank": 1,
      "description": "登录接口返回 500，前端未捕获错误导致白屏",
      "confidence": "high",
      "evidence": ["POST /api/login 返回 500", "Console: Uncaught TypeError: Cannot read property 'token' of undefined"]
    },
    {
      "rank": 2,
      "description": "登录成功但跳转逻辑错误，dashboard 路由未注册",
      "confidence": "medium",
      "evidence": ["URL 仍为 /login", "Console: router.push('/dashboard') called but no route matched"]
    }
  ],
  "evidenceChain": {
    "errors": [
      { "type": "pageError", "message": "Uncaught TypeError: Cannot read property 'token' of undefined", "stack": "at handleLogin (app.js:42)" },
      { "type": "network", "url": "/api/login", "method": "POST", "status": 500, "response": "Internal Server Error" }
    ],
    "domVisible": "页面 body 为空，无内容渲染",
    "storage": { "localStorage": {}, "sessionStorage": {} },
    "artifacts": ["screenshots/blank-page.png"]
  },
  "suggestions": [
    "检查 /api/login 后端日志，确认 500 错误原因",
    "前端 handleLogin 函数 app.js:42 增加 try/catch，处理 token 为 undefined 的情况",
    "复测：修复后再次执行登录流程，确认跳转到 /dashboard"
  ]
}
```

### browser_errors 输出

```json
{
  "ok": true,
  "totalErrors": 3,
  "errors": [
    {
      "type": "pageError",
      "message": "Uncaught TypeError: Cannot read property 'token' of undefined",
      "stack": "at handleLogin (https://example.com/app.js:42:15)",
      "timestamp": "2026-07-18T15:30:01.234Z"
    },
    {
      "type": "network",
      "url": "https://api.example.com/login",
      "method": "POST",
      "status": 500,
      "response": "Internal Server Error",
      "timestamp": "2026-07-18T15:30:00.890Z"
    },
    {
      "type": "console",
      "level": "error",
      "message": "Login failed: TypeError",
      "timestamp": "2026-07-18T15:30:01.240Z"
    }
  ]
}
```

### browser_network_detail 输出（单条失败请求）

```json
{
  "ok": true,
  "total": 1,
  "records": [
    {
      "url": "https://api.example.com/login",
      "method": "POST",
      "status": 500,
      "requestHeaders": {
        "Content-Type": "application/json",
        "Authorization": "[REDACTED]"
      },
      "requestBody": { "username": "tomsmith", "password": "[REDACTED]" },
      "responseHeaders": {
        "Content-Type": "application/json",
        "X-Request-Id": "req-abc123"
      },
      "responseBody": { "error": "Database connection failed" },
      "duration": 1250,
      "failureReason": "HTTP 500"
    }
  ]
}
```

### error_fix_suggestion 输出

```json
{
  "ok": true,
  "suggestions": [
    {
      "rank": 1,
      "title": "后端数据库连接修复",
      "description": "/api/login 返回 500 'Database connection failed'，检查后端数据库连接池配置",
      "files": ["server/db.js", "server/routes/login.js"],
      "effort": "low"
    },
    {
      "rank": 2,
      "title": "前端错误边界处理",
      "description": "app.js:42 handleLogin 函数未处理接口失败场景，增加 try/catch 和错误提示",
      "files": ["src/handlers/login.js"],
      "effort": "low"
    },
    {
      "rank": 3,
      "title": "增加接口超时处理",
      "description": "登录请求耗时 1250ms，建议增加 5s 超时和重试机制",
      "files": ["src/api/client.js"],
      "effort": "medium"
    }
  ]
}
```

## 5. 完整端到端示例

以排查"https://example.com/login 点击登录后白屏"为例：

### 调用序列

```
# Step 1: 打开问题页
browser_open({ url: "https://example.com/login" })

# Step 2: 清空旧错误，建立 checkpoint
browser_errors_clear()

# Step 3: 复现问题（填充表单 + 点击登录）
browser_form_fill({
  url: "https://example.com/login",
  fields: { "#username": "tomsmith", "#password": "SuperSecretPassword!" },
  submit: false
})
browser_click({ selector: "button[type='submit']" })

# Step 4: 输入症状，自动汇总证据 + 假设
debug_investigate({
  symptom: "点击登录后页面白屏",
  expected: "跳转到 /dashboard 页面",
  focus: "/api/login",
  statusMin: 400,
  includeStorage: true,
  includeArtifacts: true
})

# Step 5: 查看本轮统一错误
browser_errors({
  urlContains: "/api/login",
  statusMin: 400,
  includeWarnings: false
})

# Step 6: 查看失败网络请求详情
browser_network_detail({
  urlContains: "/api/login",
  statusMin: 500,
  method: "POST"
})

# Step 7: 查看 console 日志（error 级别）
browser_console({
  level: "error",
  limit: 20
})

# Step 8: 获取修复建议
error_fix_suggestion({
  errorSummary: "POST /api/login 返回 500 'Database connection failed'; 前端 app.js:42 Uncaught TypeError: Cannot read property 'token' of undefined",
  contextFiles: ["src/handlers/login.js", "server/routes/login.js"],
  maxSuggestions: 3
})

# Step 9: 收集证据
evidence_pack({
  stepId: "debug-blank-screen",
  label: "白屏问题调试证据",
  captureStep: true
})
```

### 预期返回

- `debug_investigate` 返回 2-3 个根因假设 + 证据链 + 修复/复测建议
- `browser_errors` 返回 3 条错误（1 PageError + 1 Network 500 + 1 Console error）
- `browser_network_detail` 返回登录接口的完整请求/响应详情（已脱敏）
- `browser_console` 返回 error 级别日志
- `error_fix_suggestion` 返回 3 个修复建议，按优先级排序
- `evidence_pack` 返回证据包路径

## 6. 常见坑与最佳实践

### 常见坑

| 坑 | 现象 | 解决方案 |
|---|---|---|
| 旧错误干扰 | 看到的错误与本问题无关 | 复现前先 `browser_errors_clear` 建立 checkpoint |
| 症状描述太模糊 | `debug_investigate` 假设不精准 | 症状写具体：`"点击登录按钮后页面白屏"` 而非 `"页面坏了"` |
| 跨域脚本 `Script error.` | 看不到具体错误堆栈 | 第三方脚本加 `crossorigin="anonymous"`；服务端设 CORS 头 |
| 静默失败漏检 | 接口返回 200 但业务失败 | `browser_errors` 自动检测 200 响应体含 SQL 错误等静默失败 |
| 网络详情含敏感信息 | 密码、token 泄露 | `browser_network_detail` 自动脱敏；切勿将原始 HAR 提交到公开仓库 |
| 修复建议被忽略 | AI 给了建议但未执行 | `error_fix_suggestion` 只返回建议不自动改码；需开发者手动修复 + 复测 |
| 复测未清错误 | 修复后仍报旧错误 | 修复后必须 `browser_errors_clear` 再复测，确认无新错误 |
| 只看 console 不看 network | 漏掉接口失败 | console 错误常是 network 错误的下游表现，两者都要查 |

### 最佳实践

1. **先 clear 再复现**：每次调试前 `browser_errors_clear` 建立 checkpoint，确保只看本轮错误
2. **症状 + 期望 + focus 三件套**：`debug_investigate` 的三个关键参数，描述越精准假设越准
3. **statusMin: 400**：只看失败请求，过滤掉成功的 200 噪声
4. **network_detail 优于 network**：`browser_network_detail` 返回完整请求/响应，`browser_network` 只返回摘要
5. **console 按 level 过滤**：调试时优先看 `level: "error"`，避免被 info/log 干扰
6. **error_fix_suggestion 配合 contextFiles**：传入相关文件路径，建议更精准
7. **修复后必复测**：修复 → `browser_errors_clear` → 复现操作 → `browser_errors` 确认无错误
8. **必收证据**：`evidence_pack` 收集调试证据，用于团队复盘和 Bug 归档

## 相关 Skill

- [端到端流程](./e2e-flow) — E2E 失败时自动调用 `debug_investigate`
- [登录流程验证](./login-validation) — 登录失败时排查
- [表单提交验证](./form-submission) — 表单提交失败时排查
- [性能审计](./performance-audit) — 性能问题也是调试场景

## MCP Prompt

使用 `/debug-page` prompt 可快速启动调试排查工作流（需 ValidPilot v1.9.3+）。在支持 MCP Prompts 的客户端中输入 `/` 即可看到该命令，传入 `url`、`symptom`、`expected` 参数后返回多步指令文本，由 AI 模型按序执行证据收集 + 假设分析 + 修复建议。
