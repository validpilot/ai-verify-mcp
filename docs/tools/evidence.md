# 证据收集工具

6 个工具，覆盖截图、产物管理、追踪、HAR 导出，用于构建完整的测试证据链。

## 工具列表

| 工具 | 说明 |
|------|------|
| `browser_screenshot` | 页面截图 |
| `browser_screenshot_element` | 元素级截图 |
| `browser_artifacts` | 列出测试产物文件 |
| `browser_artifacts_clear` | 清理旧产物 |
| `browser_har_export` | 导出 HAR 网络记录 |
| `browser_trace_start` / `browser_trace_stop` / `browser_trace_chain` | W3C Trace Context 追踪 |

---

## browser_screenshot

对当前页面或指定区域截图，作为测试证据。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `selector` | ❌ | 元素选择器，不传则截整个页面 |
| `fullPage` | ❌ | 是否截取整页，默认 false |
| `name` | ❌ | 截图文件名（不含扩展名） |
| `annotate` | ❌ | 是否标注（高亮重要区域），默认 false |

**返回示例**：
```json
{
  "path": "artifacts/screenshots/screenshot-20260707-100000.png",
  "width": 1280,
  "height": 720,
  "size": "245KB",
  "timestamp": "2026-07-07T10:00:00Z"
}
```

---

## browser_screenshot_element

对指定元素进行精确截图，适合截图对比测试。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `selector` | ✅ | CSS 选择器 |
| `name` | ❌ | 文件名（不含扩展名） |
| `padding` | ❌ | 元素周围额外 padding 像素，默认 0 |

**返回示例**：
```json
{
  "selector": "#login-form",
  "path": "artifacts/screenshots/login-form-20260707-100000.png",
  "width": 480,
  "height": 320,
  "size": "24KB"
}
```

---

## browser_artifacts

列出所有测试产物文件（截图、报告、Har 等）。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `type` | ❌ | 文件类型过滤：`screenshot` / `report` / `har` / `trace`，不传则全部 |
| `limit` | ❌ | 返回数量上限，默认 50 |
| `recursive` | ❌ | 是否递归子目录，默认 true |

**返回示例**：
```json
{
  "total": 15,
  "artifacts": [
    { "name": "screenshot-20260707-100000.png", "type": "screenshot", "size": "245KB", "mtime": "2026-07-07T10:00:00Z" },
    { "name": "report-20260707-093000.json", "type": "report", "size": "12KB", "mtime": "2026-07-07T09:30:00Z" }
  ]
}
```

---

## browser_artifacts_clear

清理旧的测试产物文件，释放磁盘空间。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `olderThan` | ❌ | 清理多少天前的文件，默认 7 |
| `type` | ❌ | 文件类型过滤，不传则清理全部 |

**返回示例**：
```json
{
  "deleted": 12,
  "freedSpace": "48MB",
  "remaining": 3
}
```

---

## browser_har_export

导出页面的完整网络请求记录（HAR 格式），用于离线分析和抓包。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `name` | ❌ | 文件名（不含 .har 扩展名） |
| `urlPattern` | ❌ | 仅导出匹配该 URL 模式的请求 |

**返回示例**：
```json
{
  "path": "artifacts/har/network-20260707-100000.har",
  "size": "1.2MB",
  "entries": 342,
  "totalSize": "15.8MB",
  "duration": "8.5s"
}
```

**适用场景**：网络请求离线分析、API 调试、性能分析、第三方请求审计

---

## browser_trace_start / browser_trace_stop / browser_trace_chain

W3C Trace Context 标准追踪工具，支持跨服务请求链路追踪。

### browser_trace_start

启动追踪会话，返回 traceId 和 spanId。

**参数**：无

**返回示例**：
```json
{
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "spanId": "00f067aa0ba902b7",
  "startedAt": "2026-07-07T10:00:00Z",
  "active": true
}
```

### browser_trace_stop

停止追踪，返回收集到的所有 trace 链路数据。

**参数**：无

**返回示例**：
```json
{
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "totalSpans": 12,
  "spans": [
    { "spanId": "00f067aa0ba902b7", "name": "page.load", "duration": "1.2s", "parentId": null },
    { "spanId": "a1b2c3d4e5f6", "name": "api.users", "duration": "245ms", "parentId": "00f067aa0ba902b7" }
  ],
  "stoppedAt": "2026-07-07T10:00:05Z"
}
```

### browser_trace_chain

获取当前 trace 链路中所有 span 的完整调用链。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `traceId` | ❌ | 指定 traceId，不传则使用当前活跃 trace |
| `limit` | ❌ | 返回 span 数量上限，默认 100 |

---

## 证据链构建示例

```
1. browser_trace_start          → 获取 traceId
2. browser_navigate (url=...)   → 触发页面加载
3. browser_screenshot            → 截图证据
4. browser_har_export           → 导出网络记录
5. browser_network               → 获取 API 请求
6. browser_console               → 获取错误日志
7. browser_trace_stop            → 获取完整链路
8. browser_artifacts             → 汇总所有产物
```
