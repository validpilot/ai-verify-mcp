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
| `evidence_pack` | 生成单步证据包（v2.0，含 API 响应、data diff、traceId 汇总） |
| `evidence_index` | 证据包索引（按 runId 串联时间线） |
| `trace_correlate` | traceId 深度关联（前端证据 + 后端日志闭环） |

---

## evidence_pack

生成单步证据包（v2.0），把截图、DOM 摘要、错误、网络请求、**API 响应摘要**、**数据 diff**、**traceId 汇总**、Console、PageError、HAR 和现有产物汇总成一个 JSON 文件。

**v2.0 新增能力**：
- **apiResponses**：自动提取 `/api/` 请求的响应数据，附带 traceId、状态码、响应大小
- **dataDiff**：传入 beforeData/afterData 自动计算数据差异（新增/删除/修改/类型变更/长度变化）
- **traceIds**：汇总本步骤涉及的所有 traceId，便于后端日志关联
- **beforeState / afterState**：保存操作前后状态快照引用

| 参数 | 必填 | 说明 |
|------|------|------|
| `runId` | ❌ | 验证运行 ID，不传自动生成 |
| `stepId` | ❌ | 当前步骤 ID，如 `marketplace.purchase.after-click` |
| `label` | ❌ | 步骤名称，stepId 未传时作为 stepId |
| `traceId` | ❌ | 主链路追踪 ID |
| `captureStep` | ❌ | 是否同时采集截图和 DOM，默认 true |
| `screenshot` | ❌ | 是否截图，默认 true |
| `snapshot` | ❌ | 是否采集 DOM 快照，默认 true |
| `har` | ❌ | 是否导出 HAR，默认 false |
| `currentOnly` | ❌ | 是否只采集当前 checkpoint 后的数据，默认 true |
| `includeWarnings` | ❌ | 错误摘要是否包含 warning，默认 false |
| `networkLimit` | ❌ | 保留最近网络请求条数，默认 30 |
| `consoleLimit` | ❌ | 保留最近 Console 条数，默认 30 |
| `pageErrorLimit` | ❌ | 保留最近 PageError 条数，默认 10 |
| `apiResponseLimit` | ❌ | 保留最近 API 响应摘要数，默认 10 |
| `beforeData` | ❌ | 操作前数据快照，用于生成 data diff |
| `afterData` | ❌ | 操作后数据快照，用于生成 data diff |
| `beforeState` | ❌ | 操作前状态快照引用 |
| `afterState` | ❌ | 操作后状态快照引用 |

**返回示例（v2.1 关键字段）**：
```json
{
  "type": "evidence_pack",
  "version": "2.1",
  "runId": "vp-run-123456",
  "stepId": "purchase.after",
  "traceId": "abc-123",
  "traceIds": ["abc-123", "def-456", "ghi-789"],
  "apiResponses": [
    {
      "path": "/api/marketplace/purchase",
      "method": "POST",
      "status": 200,
      "traceId": "abc-123",
      "duration": 250,
      "responseData": { "success": true, "orderId": "ORD001" },
      "responseSize": 128
    }
  ],
  "dataDiff": [
    { "path": "creditsBalance", "before": 1000, "after": 800, "change": "modified" },
    { "path": "orders.length", "before": 0, "after": 1, "change": "length_change" }
  ],
  "errors": { "consoleErrors": 0, "pageErrors": 0, "networkErrors": 0 },
  "errorAggregation": {
    "totalErrors": 0,
    "byType": { "console": 0, "page": 0, "network": 0 },
    "byStatus": {},
    "topPatterns": []
  },
  "beforeState": { "balance": 1000 },
  "afterState": { "balance": 800 }
}
```

**errorAggregation 错误聚合**（v2.1 新增）：
- `totalErrors`：错误总数
- `byType`：按类型分类（console/page/network）
- `byStatus`：按 HTTP 状态码分类（如 `{ "404": 5, "403": 3 }`）
- `topPatterns`：Top 5 错误模式（自动归一化数字和 ID，聚合相似错误）

**dataDiff 变更类型**：
- `added`：新增字段
- `removed`：删除字段
- `modified`：值修改
- `type_change`：类型变更
- `length_change`：数组长度变化

**适用场景**：双链路验证复盘、Bug 证据归档、CI 产物留存、traceId 全链路关联、错误模式分析

---

## evidence_index

证据包索引：扫描 reports 目录所有 evidence.json 文件，按 runId 串联多个证据包生成完整验证时间线。支持跨步骤、跨 runId 检索，汇总 traceId、错误数、API 响应数、数据 diff 数等关键指标。

| 参数 | 必填 | 说明 |
|------|------|------|
| `runId` | ❌ | 只返回指定 runId 的证据包时间线。不传则返回所有 |
| `includeTraceIds` | ❌ | 是否在结果中包含所有 traceId 列表，默认 false |

**返回关键字段**：
- `timeline`：按时间排序的证据包列表，每项含 runId、stepId、traceId、错误数、API 响应数、数据 diff 数
- `totalPacks`：匹配的证据包总数
- `totalRuns`：不同 runId 数量（不传 runId 时返回）
- `totalTraceIds`：涉及的不同 traceId 数量
- `summary.hasDriftEvidence`：是否存在数据 diff 证据
- `summary.hasApiEvidence`：是否存在 API 响应证据

**适用场景**：验证时间线复盘、跨步骤证据串联、runId 维度的回归对比

---

## trace_correlate

traceId 深度关联：根据 traceIds 反查前端证据包和后端日志，实现前后端联调闭环。前端扫描 evidence.json 中匹配的 traceId，后端可从本地日志文件或 SSH 远程日志检索，输出完整调用链。

**后端日志自动检测**（v2.1 增强）：当未指定 `backendLogPath` 时，自动按以下顺序检测：
1. `{cwd}/logs/app.log`、`{cwd}/logs/server.log`
2. `{cwd}/app.log`、`{cwd}/server.log`
3. `{cwd}/api-server/logs/app.log`、`{cwd}/backend/logs/app.log`
4. 环境变量 `BACKEND_LOG_PATH`

| 参数 | 必填 | 说明 |
|------|------|------|
| `traceIds` | ❌ | 要关联的 traceId 列表（与 traceId 二选一） |
| `traceId` | ❌ | 单个 traceId |
| `backendLogPath` | ❌ | 后端日志文件本地路径，未指定时自动检测（见上方） |
| `useSshBackend` | ❌ | 是否通过 SSH 远程查询后端日志，默认 false |
| `backendLogLines` | ❌ | 每个 traceId 返回的后端日志行数上限，默认 10 |

**返回结构**：
- `frontendEvidence`：匹配的前端证据包列表，含 API 响应、数据 diff、错误摘要
- `backendCorrelation`：每个 traceId 的后端匹配结果，含 services、logs、traceChain
- `summary.hasFullChain`：前端证据 + 后端日志同时命中，构成完整闭环
- `summary.servicesInvolved`：涉及的所有后端服务名

**典型工作流**：
1. `evidence_pack` 生成带 traceId 的证据
2. `evidence_index` 获取所有 traceId
3. `trace_correlate` 根据 traceId 反查后端日志

**适用场景**：前后端联调、跨服务调用链追踪、生产故障根因定位

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
