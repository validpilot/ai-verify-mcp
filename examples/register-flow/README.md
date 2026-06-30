# 注册 Flow 示例

> 场景：标准注册流程 — 打开注册页 → 填写表单 → 提交 → 验证注册成功

## 运行方式

```bash
node bin/validpilot.js run --flow examples/register-flow/register-flow.json
```

## Flow 文件

```json
[
  {
    "action": "navigate",
    "url": "https://example.com/register"
  },
  {
    "action": "wait",
    "ms": 2000
  },
  {
    "action": "screenshot",
    "name": "register-page"
  },
  {
    "action": "type",
    "selector": "#email, input[name='email'], input[type='email']",
    "value": "newuser@example.com"
  },
  {
    "action": "type",
    "selector": "#username, input[name='username']",
    "value": "newtestuser"
  },
  {
    "action": "type",
    "selector": "#password, input[name='password'], input[type='password']",
    "value": "SecurePass123!"
  },
  {
    "action": "type",
    "selector": "#confirm-password, input[name='confirmPassword']",
    "value": "SecurePass123!"
  },
  {
    "action": "click",
    "selector": "#register-btn, button[type='submit'], input[type='submit']"
  },
  {
    "action": "wait",
    "ms": 3000
  },
  {
    "action": "screenshot",
    "name": "after-register"
  },
  {
    "action": "eval",
    "expression": "() => { return document.querySelector('.alert-success, .success-message, [class*=\"success\"]') !== null || window.location.href.includes('welcome'); }",
    "expected": true,
    "description": "注册成功（出现成功提示或跳转到欢迎页）"
  }
]
```

## 验证点

| 步骤 | 验证内容 | 失败处理 |
|------|---------|---------|
| 填写邮箱 | 邮箱格式正确 | 检查选择器 |
| 填写用户名 | 非空 | 正常行为 |
| 填写密码 | 符合复杂度要求 | 检查表单要求 |
| 确认密码 | 与密码一致 | 正常行为 |
| 点击注册 | 按钮被点击 | 尝试 enter 键 |
| 注册成功验证 | 出现成功提示或跳转到欢迎页 | 可能是邮箱已存在 |

## 适用于

- 注册功能冒烟测试
- 注册表单验证规则测试
- 邮箱/用户名重复注册测试
