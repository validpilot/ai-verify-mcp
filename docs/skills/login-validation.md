# Skill: 登录流程验证

> 场景：验证登录页面是否正常工作——从打开页面、填写表单、提交、到验证登录成功后的跳转和状态。

## 1. 场景描述与痛点

登录是几乎所有 Web 应用的入口。AI 生成的登录页面经常出现以下问题：

- 表单字段选择器错误，导致无法自动填充
- 提交按钮不可点击或被遮挡
- 登录成功后未正确跳转（URL 未变化）
- 登录失败时错误提示未显示
- 密码框未做 type="password" 处理，明文显示
- Session/Cookie 未正确设置

**本 Skill 通过 7 步工具链**，完整验证登录流程的可用性、正确性和安全性，并自动收集证据。

## 2. 推荐工具链

```
┌──────────────────────────────────────────────────────────────┐
│  登录流程验证工具链                                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: browser_open          打开登录页 URL                 │
│     ↓                                                        │
│  Step 2: browser_snapshot      截取页面结构，识别表单元素      │
│     ↓                                                        │
│  Step 3: browser_form_fill     填充用户名和密码               │
│     ↓                                                        │
│  Step 4: browser_click         点击提交按钮                   │
│     ↓                                                        │
│  Step 5: browser_wait          等待页面跳转完成               │
│     ↓                                                        │
│  Step 6: browser_assert        断言登录成功（URL/文本/元素）   │
│     ↓                                                        │
│  Step 7: evidence_pack         打包验证证据                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 每步说明

| 步骤 | 工具 | 作用 | 关键参数 |
|---|---|---|---|
| 1 | `browser_open` | 打开登录页 | `url` |
| 2 | `browser_snapshot` | 获取页面结构，确认表单存在 | 无 |
| 3 | `browser_form_fill` | 批量填充用户名/密码 | `fields: [{selector, value}]` |
| 4 | `browser_click` | 点击登录按钮 | `selector` |
| 5 | `browser_wait` | 等待跳转 | `urlContains: "dashboard"` |
| 6 | `browser_assert` | 断言成功条件 | `urlContains`, `textContains`, `noErrors` |
| 7 | `evidence_pack` | 收集证据 | `name: "login-validation"` |

## 3. 关键参数说明

### browser_open
- `url`（必填）：登录页完整 URL，如 `https://app.example.com/login`

### browser_form_fill
- `fields`（必填）：表单字段数组，每项含：
  - `selector`：CSS 选择器，推荐用多选择器备选：`"#username, input[name='username'], input[type='email']"`
  - `value`：要输入的值
- `submit`（可选）：是否自动提交，默认 false（推荐用 browser_click 单独控制）

### browser_click
- `selector`（必填）：提交按钮选择器，推荐备选：`"#login-btn, button[type='submit'], button:has-text('Log In')"`

### browser_wait
- `urlContains`（推荐）：等待 URL 包含特定字符串（如 `dashboard`、`home`）
- `timeout`：超时毫秒数，默认 10000，网络慢可调到 30000

### browser_assert
- `urlContains`：验证 URL 跳转正确
- `textContains`：验证页面包含欢迎文本
- `noErrors: true`：验证无 console 错误
- `selectorVisible`：验证关键元素可见（如用户头像）

## 4. 预期产出

### 成功时的输出结构

```json
{
  "ok": true,
  "planName": "login-validation",
  "steps": [
    { "step": 1, "tool": "browser_open", "ok": true, "url": "https://app.example.com/login" },
    { "step": 2, "tool": "browser_snapshot", "ok": true, "elementsFound": ["#username", "#password", "#login-btn"] },
    { "step": 3, "tool": "browser_form_fill", "ok": true, "fieldsFilled": 2 },
    { "step": 4, "tool": "browser_click", "ok": true, "clickedSelector": "#login-btn" },
    { "step": 5, "tool": "browser_wait", "ok": true, "finalUrl": "https://app.example.com/dashboard" },
    { "step": 6, "tool": "browser_assert", "passed": true, "checks": [
      { "name": "urlContains", "pass": true, "actual": "https://app.example.com/dashboard" },
      { "name": "noErrors", "pass": true }
    ]},
    { "step": 7, "tool": "evidence_pack", "ok": true, "artifacts": ["login-page.png", "after-login.png", "trace.zip", "har.json"] }
  ]
}
```

### 证据文件

- `screenshots/login-page.png` — 登录页初始截图
- `screenshots/after-login.png` — 登录后截图
- `traces/login-flow.zip` — 完整操作 trace
- `har/network.har` — 网络请求记录
- `reports/login-validation-report.md` — 验证报告

## 5. 完整端到端示例

以 [the-internet.herokuapp.com/login](https://the-internet.herokuapp.com/login)（公开测试登录页）为例：

### 调用序列

```
# Step 1: 打开登录页
browser_open({ url: "https://the-internet.herokuapp.com/login" })

# Step 2: 截取快照，确认表单结构
browser_snapshot()

# Step 3: 填充表单（tomsmith / SuperSecretPassword!）
browser_form_fill({
  fields: [
    { selector: "#username", value: "tomsmith" },
    { selector: "#password", value: "SuperSecretPassword!" }
  ]
})

# Step 4: 点击登录按钮
browser_click({ selector: "button[type='submit']" })

# Step 5: 等待跳转
browser_wait({ urlContains: "secure", timeout: 10000 })

# Step 6: 断言登录成功
browser_assert({
  urlContains: "secure",
  textContains: "You logged into a secure area",
  noErrors: true
})

# Step 7: 收集证据
evidence_pack({ name: "login-validation-herokuapp" })
```

### 预期返回

- `browser_assert` 返回 `passed: true`，所有断言通过
- `evidence_pack` 返回证据文件路径列表
- 截图中可见登录后的 "Secure Area" 页面

## 6. 常见坑与最佳实践

### 常见坑

| 坑 | 现象 | 解决方案 |
|---|---|---|
| 选择器找不到表单 | `element not found` | 用 `browser_snapshot` 先看页面结构；用多选择器备选 `#username, input[name='username']` |
| 提交按钮被遮挡 | `element not clickable` | 用 `browser_overlay_detect` 检测遮挡；用 `browser_overlay_dismiss` 关闭 |
| 登录后未跳转 | `browser_wait` 超时 | 检查表单是否真的提交（看 `browser_network`）；可能密码错误，检查 `browser_errors` |
| 密码框明文 | 安全隐患 | 用 `browser_dom` 检查 `input.type` 是否为 `password` |
| Session 未设置 | 登录后刷新又回到登录页 | 用 `browser_cookies` 检查 session cookie 是否存在 |

### 最佳实践

1. **先用 snapshot 再操作**：不要盲目猜选择器，先 `browser_snapshot` 看真实结构
2. **用多选择器备选**：`"#username, input[name='username'], input[type='email']"` 提高容错
3. **单独控制提交**：用 `browser_click` 而非 `form_fill` 的 `submit: true`，便于断点调试
4. **断言要全面**：不只检查 URL，还要检查文本、错误、元素可见性
5. **必收证据**：`evidence_pack` 是最后一步，确保有可追溯的证据链
6. **测试失败路径**：除了正确密码，也要测试错误密码场景，验证错误提示

## 相关 Skill

- [表单提交验证](./form-submission) — 更通用的表单验证
- [端到端流程](./e2e-flow) — 多步骤业务流程
- [调试排查](./debug-investigation) — 登录失败时排查

## MCP Prompt

使用 `/validate-login` prompt 可快速启动此工作流（需 ValidPilot v1.9.3+）。在支持 MCP Prompts 的客户端（如 Claude Desktop、Cursor、Trae）中输入 `/` 即可看到该命令，传入 `url`、`username`、`password` 三个参数后，会返回本 Skill 的完整 7 步指令文本，由 AI 模型按序执行。