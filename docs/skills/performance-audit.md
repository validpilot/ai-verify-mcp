# Skill: 性能审计

> 场景：上线前性能评估、Lighthouse 评分回归、Core Web Vitals 监控、性能瓶颈定位、内存泄漏检测。

## 1. 场景描述与痛点

Web 性能直接影响用户体验和 SEO 排名。AI 生成的代码常出现：

- Lighthouse 性能评分低于 70（红灯）
- LCP（最大内容绘制）> 2.5s，FCP（首次内容绘制）> 1.8s
- CLS（累积布局偏移）> 0.1，页面跳动严重
- 长任务（> 50ms）过多，主线程阻塞
- 慢请求（> 1s）拖累整体加载
- 内存泄漏（DOM 节点持续增长、事件监听未解绑）
- 未做资源压缩、未启用 HTTP/2、未设置缓存策略

**本 Skill 通过 5 步工具链**，从 Lighthouse 评分到内存泄漏全方位审计，输出可执行的优化建议。

## 2. 推荐工具链

```
┌──────────────────────────────────────────────────────────────┐
│  性能审计工具链                                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: browser_open               打开目标页               │
│     ↓                                                        │
│  Step 2: browser_lighthouse_audit   Lighthouse 4 维度评分     │
│     ↓                                                        │
│  Step 3: browser_performance_check  Core Web Vitals + 预算    │
│     ↓                                                        │
│  Step 4: browser_performance_trace  完整性能 trace + HAR       │
│     ↓                                                        │
│  Step 5: browser_memory_check       内存泄漏检测              │
│     ↓                                                        │
│  Step 6: evidence_pack              收集证据                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 每步说明

| 步骤 | 工具 | 作用 | 关键参数 |
|---|---|---|---|
| 1 | `browser_open` | 打开目标页 | `url` |
| 2 | `browser_lighthouse_audit` | Performance / Accessibility / Best Practices / SEO 评分 | `url`, `categories`, `formFactor`, `throttling` |
| 3 | `browser_performance_check` | 采集 Core Web Vitals + 预算对比 | `budgets`, `slowRequestMs` |
| 4 | `browser_performance_trace` | 完整性能轨迹 + HAR 导出 | `url`, `categories`, `duration`, `exportHar` |
| 5 | `browser_memory_check` | 内存泄漏检测（detached DOM、JS heap） | `sessionName` |
| 6 | `evidence_pack` | 收集证据 | `name: "performance-audit"` |

## 3. 关键参数说明

### browser_lighthouse_audit

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `url` | string | 当前页 | 要审计的 URL |
| `categories` | array | 全部 | 审计类别：`performance` / `accessibility` / `best_practices` / `seo` |
| `formFactor` | string | `desktop` | 模拟设备：`mobile` / `desktop` |
| `throttling` | boolean | false | 是否模拟 3G 网络节流（仅 mobile 推荐） |

**关键特性**：每次审计启动独立 Headless Chrome 实例，与活跃会话隔离，结束后自动关闭。

### browser_performance_check

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `budgets` | object | - | 预算阈值对象 |
| `slowRequestMs` | number | 1000 | 慢请求阈值（毫秒） |
| `sessionName` | string | 当前活跃 | 浏览器会话名 |

**budgets 对象结构**：
```javascript
{
  "domContentLoaded": 1500,    // ms
  "load": 3000,                // ms
  "fcp": 1800,                 // First Contentful Paint, ms
  "lcp": 2500,                 // Largest Contentful Paint, ms
  "cls": 0.1,                  // Cumulative Layout Shift
  "longTaskCount": 5,          // 长任务数量上限
  "resourceCount": 50,         // 资源数量上限
  "slowRequestMs": 1000        // 慢请求阈值
}
```

### browser_performance_trace

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `url` | string | 当前页 | 要追踪的 URL |
| `categories` | array | 全部 | 性能类别：paint / timing / resource |
| `duration` | number | 5000 | 追踪持续时间（毫秒） |
| `enableScreenshots` | boolean | false | 追踪期间是否定期截图 |
| `exportHar` | boolean | true | 是否导出 HAR 格式 |

### browser_memory_check

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `sessionName` | string | 当前活跃 | 浏览器会话名 |

**检测维度**：
- Detached DOM 节点数（已从文档移除但仍在 JS 引用）
- 事件监听器泄漏风险
- JS Heap 大小
- 总 DOM 节点数

## 4. 预期产出

### browser_lighthouse_audit 输出

```json
{
  "ok": true,
  "url": "https://example.com",
  "scores": {
    "performance": 85,
    "accessibility": 92,
    "bestPractices": 88,
    "seo": 95
  },
  "metrics": {
    "lcp": 2100,
    "fid": 120,
    "cls": 0.05,
    "tbt": 150,
    "si": 1800
  },
  "diagnostics": [
    {
      "id": "render-blocking-resources",
      "title": "Eliminate render-blocking resources",
      "score": 0.5,
      "description": "Resources are blocking the first paint...",
      "items": ["https://example.com/styles.css", "https://example.com/app.js"]
    }
  ],
  "reportPath": "reports/lighthouse-example-com.html"
}
```

**评分等级**：
- 0-49：红灯（差）
- 50-89：黄灯（需改进）
- 90-100：绿灯（良好）

### browser_performance_check 输出

```json
{
  "ok": true,
  "metrics": {
    "navigation": { "domContentLoaded": 1200, "load": 2400 },
    "paint": { "fp": 800, "fcp": 850 },
    "lcp": 2100,
    "cls": 0.05,
    "longTasks": { "count": 3, "totalDuration": 280 },
    "resources": {
      "count": 42,
      "slowRequests": [{ "url": "https://api.example.com/users", "duration": 1500 }]
    }
  },
  "budgets": {
    "lcp": { "budget": 2500, "actual": 2100, "pass": true },
    "cls": { "budget": 0.1, "actual": 0.05, "pass": true },
    "fcp": { "budget": 1800, "actual": 850, "pass": true }
  },
  "allBudgetsPassed": true,
  "coreWebVitals": {
    "lcp": { "value": 2100, "rating": "good" },
    "cls": { "value": 0.05, "rating": "good" },
    "fid": { "value": 120, "rating": "needs-improvement" }
  }
}
```

**Core Web Vitals 评级**：
- LCP：`good` ≤ 2500ms，`needs-improvement` ≤ 4000ms，`poor` > 4000ms
- CLS：`good` ≤ 0.1，`needs-improvement` ≤ 0.25，`poor` > 0.25
- FID：`good` ≤ 100ms，`needs-improvement` ≤ 300ms，`poor` > 300ms

### browser_performance_trace 输出

```json
{
  "ok": true,
  "url": "https://example.com",
  "duration": 5000,
  "harPath": "traces/example-com.har",
  "tracePath": "traces/example-com.trace.json",
  "screenshots": ["traces/example-com-1.png", "traces/example-com-2.png"],
  "events": { "paint": 12, "timing": 8, "resource": 42 }
}
```

### browser_memory_check 输出

```json
{
  "ok": true,
  "leakRisk": "low",
  "metrics": {
    "detachedDomNodes": 5,
    "totalDomNodes": 1240,
    "jsHeapSize": "12.3 MB",
    "jsHeapLimit": "2048 MB",
    "eventListeners": 87
  },
  "suggestions": [
    {
      "type": "detached-dom",
      "description": "Found 5 detached DOM nodes, likely from removed elements still referenced by JS",
      "severity": "minor",
      "recommendation": "Audit event listeners and references on removed elements"
    }
  ]
}
```

**leakRisk 等级**：`low` / `medium` / `high` / `critical`

## 5. 完整端到端示例

以 https://example.com 为例：

### 调用序列

```
# Step 1: 打开页面
browser_open({ url: "https://example.com" })

# Step 2: Lighthouse 审计（mobile + 3G 节流，模拟真实移动端场景）
browser_lighthouse_audit({
  url: "https://example.com",
  categories: ["performance", "accessibility", "best_practices", "seo"],
  formFactor: "mobile",
  throttling: true
})

# Step 3: Core Web Vitals + 预算对比
browser_performance_check({
  budgets: {
    "lcp": 2500,
    "cls": 0.1,
    "fcp": 1800,
    "load": 3000,
    "longTaskCount": 5
  },
  slowRequestMs: 1000
})

# Step 4: 完整性能 trace + HAR
browser_performance_trace({
  url: "https://example.com",
  categories: ["paint", "timing", "resource"],
  duration: 10000,
  enableScreenshots: true,
  exportHar: true
})

# Step 5: 内存泄漏检测
browser_memory_check()

# Step 6: 收集证据
evidence_pack({ name: "performance-audit-example" })
```

### 预期返回

- `browser_lighthouse_audit`：4 维度评分 + 关键诊断建议 + HTML 报告路径
- `browser_performance_check`：Core Web Vitals 评级 + 预算对比结果
- `browser_performance_trace`：HAR 文件路径 + trace JSON + 截图
- `browser_memory_check`：泄漏风险等级 + 具体指标
- `evidence_pack`：综合性能审计报告路径

## 6. 常见坑与最佳实践

### 常见坑

| 坑 | 现象 | 解决方案 |
|---|---|---|
| 桌面端评分虚高 | 移动端实际体验差 | 用 `formFactor: "mobile"` + `throttling: true` 模拟真实移动端 |
| 单次采样不准 | Lighthouse 评分波动大 | 跑 3 次取中位数；或用 `browser_performance_check` 多次采样 |
| 预算过严 | 全部红灯但实际体验可接受 | 按 Core Web Vitals 官方阈值设预算（LCP 2500/CLS 0.1/FID 100） |
| 长任务漏检 | `longTaskCount: 0` 但页面卡顿 | 增大 `duration` 到 10000ms；或检查 `browser_performance_trace` 的事件 |
| 内存泄漏误报 | `detachedDomNodes > 0` 但无实际泄漏 | 5 个以内的 detached 节点通常是 GC 未回收，不算泄漏 |
| HAR 文件过大 | `harPath` 文件几十 MB | 减少追踪时长；用 `categories: ["paint"]` 只记录关键事件 |
| 第三方脚本拖累 | 评分低但非自身代码问题 | 区分 first-party 和 third-party 资源，优化可控部分 |

### 最佳实践

1. **mobile 优先审计**：移动端评分更能反映真实用户体验，优先用 `formFactor: "mobile"`
2. **预算驱动**：用 `browser_performance_check` 的 `budgets` 设硬性指标，CI 中失败即阻断
3. **Core Web Vitals 三件套**：LCP + CLS + FID 是 Google 排名信号，必须达标
4. **trace 用于深挖**：Lighthouse 评分低时，用 `browser_performance_trace` 定位瓶颈
5. **内存检查常态化**：长运行 SPA 必测内存泄漏，尤其是路由切换、列表加载场景
6. **对比基线**：每次发版前后对比 Lighthouse 评分，回归超 5 分需排查
7. **必收证据**：`evidence_pack` 收集 HTML 报告 + HAR + trace + 内存报告

## 相关 Skill

- [安全审计](./security-audit) — 安全与性能综合评估
- [视觉回归](./visual-regression) — UI 改动可能影响性能（重排重绘）
- [端到端流程](./e2e-flow) — 性能审计作为上线门禁

## MCP Prompt

使用 `/audit-performance` prompt 可快速启动性能审计工作流（需 ValidPilot v1.9.3+）。在支持 MCP Prompts 的客户端中输入 `/` 即可看到该命令，传入 `url`、`formFactor` 参数后返回多步指令文本，由 AI 模型按序执行 5 步审计。
