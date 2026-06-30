# 登录 Flow 示例

> 场景：标准登录流程 — 打开登录页 → 填写表单 → 提交 → 验证跳转

## 运行方式

```bash
node bin/validpilot.js run --flow examples/login-flow/login-flow.json
```

## Flow 文件

```json
[
  {
    "action": "navigate",
    "url": "https://example.com/login"
  },
  {
    "action": "wait",
    "ms": 2000
  },
  {
    "action": "screenshot",
    "name": "login-page"
  },
  {
    "action": "type",
    "selector": "#username, input[name='username'], input[type='email']",
    "value": "testuser@example.com"
  },
  {
    "action": "type",
    "selector": "#password, input[name='password'], input[type='password']",
    "value": "TestPassword123!"
  },
  {
    "action": "click",
    "selector": "#login-btn, button[type='submit'], input[type='submit']"
  },
  {
    "action": "wait",
    "ms": 3000
  },
  {
    "action": "screenshot",
    "name": "after-login"
  },
  {
    "action": "eval",
    "expression": "() => { return document.querySelector('.alert-error, .error-message, [class*=\"error\"]') === null; }",
    "expected": true,
    "description": "登录后无错误提示"
  },
  {
    "action": "eval",
    "expression": "() => { return window.location.href.includes('dashboard') || window.location.href.includes('home'); }",
    "expected": true,
    "description": "已跳转到 Dashboard 或首页"
  }
]
```

## 验证点

| 步骤 | 验证内容 | 失败处理 |
|------|---------|---------|
| 填写用户名 | 输入框可编辑 | 重试或报告 |
| 填写密码 | 密码框不可见明文 | 正常行为 |
| 点击登录 | 按钮被点击 | 尝试 enter 键 |
| 跳转验证 | URL 包含 dashboard/home | 表单验证失败或网络错误 |
| 无错误提示 | 页面无 error 类元素 | 可能是验证错误 |

## 适用于

- 登录功能冒烟测试
- 多用户并发登录验证
- 登录表单验证规则测试
