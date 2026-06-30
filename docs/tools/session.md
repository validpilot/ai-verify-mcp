# 会话管理工具

4 个工具，支持多浏览器会话的创建、切换、关闭、列表查看。

## 工具列表

| 工具 | 说明 |
|------|------|
| `browser_sessions` | 列出所有浏览器会话 |
| `browser_session_create` | 创建新的浏览器会话 |
| `browser_session_switch` | 切换到指定会话 |
| `browser_session_close` | 关闭指定会话 |

---

## browser_sessions

列出当前所有活跃的浏览器会话。

**参数**：无

**返回示例**：
```json
{
  "total": 2,
  "sessions": [
    {
      "id": "session_001",
      "name": "default",
      "browser": "chromium",
      "pages": 1,
      "createdAt": "2026-07-07T09:00:00Z",
      "active": true
    },
    {
      "id": "session_002",
      "name": "test-user-a",
      "browser": "chromium",
      "pages": 3,
      "createdAt": "2026-07-07T09:30:00Z",
      "active": false
    }
  ]
}
```

---

## browser_session_create

创建一个新的浏览器会话，支持指定浏览器类型和配置。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `name` | ❌ | 会话名称，用于标识 |
| `browser` | ❌ | 浏览器类型：`chromium`（默认）/ `firefox` / `webkit` |
| `headless` | ❌ | 是否无头模式，默认 false |
| `args` | ❌ | 浏览器启动参数（如 `--disable-popups`） |

**返回示例**：
```json
{
  "sessionId": "session_003",
  "name": "checkout-test",
  "browser": "chromium",
  "createdAt": "2026-07-07T10:00:00Z",
  "pages": 0
}
```

---

## browser_session_switch

切换当前操作的活跃会话。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `sessionId` | ✅ | 目标会话 ID |

**返回示例**：
```json
{
  "sessionId": "session_002",
  "name": "test-user-a",
  "switched": true,
  "previousSession": "session_001"
}
```

> 注意：切换会话后，后续所有 browser 操作都作用于新会话

---

## browser_session_close

关闭指定会话。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `sessionId` | ✅ | 要关闭的会话 ID |
| `force` | ❌ | 是否强制关闭（忽略未保存数据），默认 false |

**返回示例**：
```json
{
  "sessionId": "session_002",
  "closed": true,
  "closedPages": 3
}
```

---

## 常见使用模式

### 多用户并发测试
```
1. browser_session_create (name="user1") → session_001
2. browser_session_create (name="user2") → session_002
3. browser_session_switch (sessionId=session_001)
   → 在 user1 会话中操作
4. browser_session_switch (sessionId=session_002)
   → 在 user2 会话中操作
```

### 清理测试环境
```
browser_sessions  → 查看所有会话
browser_session_close (sessionId=session_003, force=true)
```
