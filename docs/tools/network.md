# 网络与存储工具

6 个工具，覆盖网络请求、Cookie、localStorage、Console 日志、事件监听。

## 工具列表

| 工具 | 说明 |
|------|------|
| `browser_network` | 获取网络请求日志列表 |
| `browser_network_detail` | 获取单个请求的详细信息 |
| `browser_cookies` | Cookie 管理（get / clear / set） |
| `browser_storage` | localStorage / sessionStorage 查看 |
| `browser_console` | 读取 Console 日志 |
| `browser_events` / `browser_events_clear` | 事件监听管理 |

---

## browser_network

获取页面的网络请求日志列表。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `urlPattern` | ❌ | URL 过滤（包含匹配） |
| `method` | ❌ | 请求方法过滤（如 GET/POST） |
| `status` | ❌ | 状态码过滤（如 404, 500） |
| `limit` | ❌ | 返回数量上限，默认 50 |

**返回示例**：
```json
{
  "total": 42,
  "requests": [
    {
      "url": "https://api.example.com/users",
      "method": "GET",
      "status": 200,
      "duration": "245ms",
      "size": "12.4KB",
      "timestamp": "2026-07-07T10:00:00Z"
    },
    {
      "url": "https://api.example.com/orders",
      "method": "POST",
      "status": 500,
      "duration": "1203ms",
      "error": "Internal Server Error",
      "timestamp": "2026-07-07T10:00:01Z"
    }
  ],
  "summary": {
    "totalRequests": 42,
    "failedRequests": 2,
    "totalSize": "3.2MB"
  }
}
```

**适用场景**：分析 API 调用、检查 404/500 错误、监控请求性能

---

## browser_network_detail

获取单个网络请求的详细信息，包含请求头、响应头、响应体（如果有）。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `requestId` | ✅ | 请求 ID（从 browser_network 返回中获取） |

**返回示例**：
```json
{
  "requestId": "req_abc123",
  "url": "https://api.example.com/users/1",
  "method": "GET",
  "status": 200,
  "requestHeaders": { "Authorization": "Bearer ******", "Content-Type": "application/json" },
  "responseHeaders": { "Content-Type": "application/json", "Cache-Control": "no-cache" },
  "responseBody": "{\"id\":1,\"name\":\"Alice\",\"email\":\"alice@example.com\"}",
  "timing": { "dns": "12ms", "tcp": "30ms", "ttfb": "80ms", "total": "245ms" }
}
```

---

## browser_cookies

Cookie 管理工具，支持查看、清除、设置。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `action` | ❌ | 操作类型：`get`（默认）/ `clear` / `set` |
| `url` | ❌ | 过滤特定 URL 的 cookie |
| `name` | ❌ | 过滤特定名称的 cookie |
| `domain` | ❌ | 过滤特定域名的 cookie |
| `cookie` | ❌ | 设置 cookie（action=set 时必填），包含 name/value/domain/path |

**返回示例（action=get）**：
```json
{
  "action": "get",
  "total": 5,
  "cookies": [
    { "name": "session_id", "value": "******", "domain": ".example.com", "path": "/", "httpOnly": true, "secure": true },
    { "name": "user_prefs", "value": "******", "domain": ".example.com", "path": "/" }
  ]
}
```

> 注意：Cookie value 已自动脱敏（JWT / Bearer Token / API Key 等敏感值会被截断）

**返回示例（action=clear）**：
```json
{
  "action": "clear",
  "success": true,
  "clearedCount": 5
}
```

---

## browser_storage

查看 localStorage 和 sessionStorage 内容。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `type` | ❌ | 存储类型：`localStorage`（默认）/ `sessionStorage` |
| `key` | ❌ | 读取指定 key，不传则返回全部 |

**返回示例**：
```json
{
  "type": "localStorage",
  "total": 3,
  "entries": [
    { "key": "auth_token", "value": "******", "size": "256B" },
    { "key": "user_profile", "value": "{\"id\":1,\"name\":\"Alice\"}", "size": "48B" },
    { "key": "theme", "value": "dark", "size": "4B" }
  ]
}
```

> 注意：敏感值（token/key 等）已自动脱敏

---

## browser_console

读取页面的 Console 日志（包含 console.log / warn / error / info）。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `level` | ❌ | 日志级别过滤：`log`（默认）/ `warn` / `error` / `info` |
| `limit` | ❌ | 返回数量上限，默认 100 |
| `text` | ❌ | 文本内容过滤（包含匹配） |

**返回示例**：
```json
{
  "total": 15,
  "logs": [
    { "level": "error", "text": "Failed to load resource: net::ERR_CONNECTION_REFUSED", "timestamp": "2026-07-07T10:00:01Z" },
    { "level": "warn", "text": "ResizeObserver loop limit exceeded", "timestamp": "2026-07-07T10:00:02Z" },
    { "level": "log", "text": "User logged in: alice@example.com", "timestamp": "2026-07-07T10:00:03Z" }
  ],
  "summary": { "error": 1, "warn": 1, "log": 13 }
}
```

---

## browser_events / browser_events_clear

管理页面事件监听器。`browser_events` 返回当前已注册的事件监听器列表，`browser_events_clear` 清除指定事件类型的监听器。

**browser_events 参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `type` | ❌ | 事件类型（如 `click`、`submit`、`change`），不传则返回全部 |

**返回示例**：
```json
{
  "total": 8,
  "events": [
    { "type": "click", "selector": "#btn-submit", "listeners": 2 },
    { "type": "submit", "selector": "#login-form", "listeners": 1 },
    { "type": "change", "selector": "#country-select", "listeners": 1 }
  ]
}
```

**browser_events_clear 参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `type` | ✅ | 事件类型 |
| `selector` | ❌ | 清除特定选择器的监听器 |

**返回**：
```json
{ "cleared": 2, "message": "已清除 2 个 click 事件监听器" }
```
