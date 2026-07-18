# Skill: 表单提交验证

> 场景：验证任意 Web 表单的填写、提交、校验、反馈闭环——包括注册、联系表单、搜索、设置表单等通用场景。

## 1. 场景描述与痛点

表单是 Web 应用收集用户输入的核心载体。AI 生成的表单经常出现以下问题：

- 字段未标记 `required`，提交空表单也能通过
- 邮箱、URL、电话等格式校验缺失或错误
- 字段长度限制未实现（如密码少于 8 位也能提交）
- 提交后无加载状态、无成功/失败反馈
- 必填字段空提交时未显示错误提示
- 提交按钮在表单未填完时就可点击
- 表单提交后未清空或未跳转

**本 Skill 通过 7 步工具链**，先用 `browser_form_validate` 自动检测表单的验证规则，再用 `browser_form_fill` 批量填充并提交，最后用 `browser_assert` 验证反馈，自动收集证据。

与 [登录流程验证](./login-validation) 的区别：登录 Skill 聚焦"账号密码 + 跳转"这一特定场景；本 Skill 聚焦"任意表单的字段规则 + 提交反馈"通用场景。

## 2. 推荐工具链

```
┌──────────────────────────────────────────────────────────────┐
│  表单提交验证工具链                                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: browser_open           打开目标表单页                │
│     ↓                                                        │
│  Step 2: browser_snapshot       截取页面结构，识别表单元素     │
│     ↓                                                        │
│  Step 3: browser_form_validate  自动检测表单验证规则           │
│     ↓                                                        │
│  Step 4: browser_form_fill      批量填充字段（不自动提交）     │
│     ↓                                                        │
│  Step 5: browser_click          点击提交按钮                  │
│     ↓                                                        │
│  Step 6: browser_assert         断言提交反馈（成功/失败提示）  │
│     ↓                                                        │
│  Step 7: evidence_pack          打包验证证据                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 每步说明

| 步骤 | 工具 | 作用 | 关键参数 |
|---|---|---|---|
| 1 | `browser_open` | 打开表单页 | `url` |
| 2 | `browser_snapshot` | 获取表单元素 ref | 无 |
| 3 | `browser_form_validate` | 自动检测 required/pattern/length 规则 | `formSelector`, `checkRequired`, `checkPattern`, `checkLength` |
| 4 | `browser_form_fill` | 批量填充字段 | `url`, `fields`（对象）, `submit: false` |
| 5 | `browser_click` | 点击提交按钮 | `selector` |
| 6 | `browser_assert` | 断言反馈文本/URL/无错误 | `textContains`, `urlContains`, `noErrors` |
| 7 | `evidence_pack` | 收集证据 | `name: "form-submission"` |

## 3. 关键参数说明

### browser_form_validate

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `url` | string | 当前页 | 目标表单页 URL |
| `formSelector` | string | 自动检测 | 表单 CSS 选择器，不填则用页面第一个 `form` |
| `validateSubmit` | boolean | true | 是否尝试提交表单检测验证 |
| `checkRequired` | boolean | true | 检测必填字段 |
| `checkPattern` | boolean | true | 检测格式模式（email、url 等） |
| `checkLength` | boolean | true | 检测长度限制 |

### browser_form_fill

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `url` | string | 是 | 目标页面 URL |
| `selector` | string | 否 | 表单选择器，默认 `form` |
| `fields` | object | 否 | 字段值映射，**支持两种 key 格式** |
| `submit` | boolean | 否 | 填充后是否自动提交，默认 `true`（本 Skill 推荐 `false`，用 `browser_click` 单独控制） |
| `submitSelector` | string | 否 | 提交按钮选择器，默认自动查找 |

**fields 对象的两种 key 格式**：

```javascript
// 方式 1：CSS 选择器模式（key 以 #/./[//>/:/ 开头）
{
  "#email": "user@test.com",
  "#password": "Pass1234!",
  "input[name='phone']": "13800138000"
}

// 方式 2：字段名模式（key 为 input 的 name 属性）
{
  "email": "user@test.com",
  "password": "Pass1234!",
  "phone": "13800138000"
}
```

CSS 选择器模式直接用 Playwright 定位填充，字段名模式通过表单自动发现机制匹配。推荐使用 CSS 选择器模式（更明确、容错性更好）。

### browser_assert

| 参数 | 类型 | 说明 |
|---|---|---|
| `urlContains` | string | 断言 URL 包含该字符串（如 `"success"`、`"thank-you"`） |
| `textContains` | string | 断言页面文本包含该内容（如 `"提交成功"`、`"Thank you"`） |
| `selectorVisible` | string | 断言成功提示元素可见（如 `".alert-success"`） |
| `selectorHidden` | string | 断言表单已隐藏（如 `"form"`） |
| `noErrors` | boolean | 断言无 console 错误 |
| `timeout` | number | 读取文本超时，默认 5000ms |

## 4. 预期产出

### browser_form_validate 输出结构

```json
{
  "ok": true,
  "formSelector": "form",
  "fields": [
    {
      "name": "email",
      "type": "email",
      "required": true,
      "pattern": "^[^@]+@[^@]+\\.[^@]+$",
      "maxLength": 100
    },
    {
      "name": "password",
      "type": "password",
      "required": true,
      "minLength": 8,
      "maxLength": 64
    }
  ],
  "rules": {
    "requiredCount": 2,
    "patternCount": 1,
    "lengthCount": 2
  },
  "issues": [
    { "field": "phone", "issue": "missing pattern validation" }
  ]
}
```

### 完整流程输出

```json
{
  "ok": true,
  "planName": "form-submission",
  "steps": [
    { "step": 1, "tool": "browser_open", "ok": true, "url": "https://example.com/register" },
    { "step": 2, "tool": "browser_snapshot", "ok": true, "formFound": true },
    { "step": 3, "tool": "browser_form_validate", "ok": true, "rulesDetected": 5, "issues": 1 },
    { "step": 4, "tool": "browser_form_fill", "ok": true, "fieldsFilled": 3 },
    { "step": 5, "tool": "browser_click", "ok": true, "clickedSelector": "button[type='submit']" },
    { "step": 6, "tool": "browser_assert", "passed": true, "checks": [
      { "name": "textContains", "pass": true, "actual": "注册成功" },
      { "name": "noErrors", "pass": true }
    ]},
    { "step": 7, "tool": "evidence_pack", "ok": true, "artifacts": ["form-before.png", "form-after.png", "trace.zip"] }
  ]
}
```

### 证据文件

- `screenshots/form-before.png` — 填充前表单截图
- `screenshots/form-after.png` — 提交后反馈截图
- `traces/form-flow.zip` — 完整操作 trace
- `reports/form-validation-report.md` — 表单规则检测报告

## 5. 完整端到端示例

以 [the-internet.herokuapp.com/login](https://the-internet.herokuapp.com/login) 为例（公开测试表单页）：

### 调用序列

```
# Step 1: 打开表单页
browser_open({ url: "https://the-internet.herokuapp.com/login" })

# Step 2: 截取快照，确认表单结构
browser_snapshot()

# Step 3: 检测表单验证规则
browser_form_validate({
  url: "https://the-internet.herokuapp.com/login",
  formSelector: "form",
  checkRequired: true,
  checkPattern: true,
  checkLength: true
})

# Step 4: 填充表单（用 CSS 选择器模式，不自动提交）
browser_form_fill({
  url: "https://the-internet.herokuapp.com/login",
  fields: {
    "#username": "tomsmith",
    "#password": "SuperSecretPassword!"
  },
  submit: false
})

# Step 5: 点击提交按钮
browser_click({ selector: "button[type='submit']" })

# Step 6: 断言提交反馈
browser_assert({
  urlContains: "secure",
  textContains: "You logged into a secure area",
  noErrors: true
})

# Step 7: 收集证据
evidence_pack({ name: "form-submission-herokuapp" })
```

### 预期返回

- `browser_form_validate` 返回表单字段规则（username/password 都是 required）
- `browser_form_fill` 返回 `fieldsFilled: 2`
- `browser_assert` 返回 `passed: true`，所有断言通过
- `evidence_pack` 返回证据文件路径列表

## 6. 常见坑与最佳实践

### 常见坑

| 坑 | 现象 | 解决方案 |
|---|---|---|
| 表单选择器错误 | `form not found` | 先用 `browser_snapshot` 看真实结构；用 `formSelector` 明确指定，如 `"#signup-form"` |
| 字段 key 模式混用 | 部分字段未填充 | 同一 `fields` 对象内不要混用 CSS 选择器模式和字段名模式；推荐统一用 CSS 选择器模式 |
| 提交按钮找不到 | `submit button not found` | 用 `submitSelector` 明确指定，如 `"button[type='submit']"` 或 `"#submit-btn"` |
| 自动提交导致断点丢失 | 提交后无法断言 | 设置 `submit: false`，改用 `browser_click` 单独控制提交时机 |
| 必填字段未检测 | 空表单也能提交 | 用 `browser_form_validate` 的 `checkRequired: true` 先检测，再测空提交场景 |
| 提交后反馈延迟 | `browser_assert` 超时 | 增大 `timeout` 到 10000ms；或在 Step 5 后加 `browser_wait({ textContains: "成功" })` |
| 富文本编辑器无法填充 | `element not found` | 富文本（如 Quill、TinyMCE）不在 `form` 内，需用 `browser_eval` 直接操作编辑器 API |

### 最佳实践

1. **先 validate 再 fill**：用 `browser_form_validate` 检测规则，可以发现 AI 生成的表单是否漏了必填/格式校验
2. **测试两条路径**：①正确数据应提交成功；②错误数据（如空必填、错误邮箱格式）应被拦截
3. **submit: false + click 分离**：便于在提交前插入 `browser_screenshot` 留证
4. **断言要全面**：URL 跳转、文本反馈、错误元素隐藏、无 console 错误四方面都要断言
5. **测必填字段空提交**：故意只填部分字段，验证后端是否真的拦截
6. **测格式校验**：填入 `"invalid-email"` 验证 email 字段是否被前端拦截
7. **必收证据**：`evidence_pack` 收集 form-before/after 截图、trace、validation 报告

## 相关 Skill

- [登录流程验证](./login-validation) — 登录场景的专用 Skill
- [端到端流程](./e2e-flow) — 多步表单 + 业务流程
- [调试排查](./debug-investigation) — 表单提交失败时排查

## MCP Prompt

使用 `/submit-form` prompt 可快速启动表单提交验证工作流（需 ValidPilot v1.9.3+）。在支持 MCP Prompts 的客户端（如 Claude Desktop、Cursor、Trae）中输入 `/` 即可看到该命令。

必填参数：
- `url` — 表单页 URL
- `fields` — 字段值映射对象，例如 `{ "#email": "user@test.com", "#password": "Pass1234!" }`

可选参数：
- `formSelector` — 表单 CSS 选择器（默认 `form`）
- `submitSelector` — 提交按钮选择器（默认 `button[type='submit']`）
- `expectedText` — 提交后预期文本（如 `"提交成功"`）
- `expectedUrlContains` — 提交后预期 URL 子串（如 `"thank-you"`）

调用后返回 7 步指令文本，与本 Skill 第 2 节工具链完全对齐：`browser_open → browser_snapshot → browser_form_validate → browser_form_fill(submit:false) → browser_click → browser_assert → evidence_pack`。
