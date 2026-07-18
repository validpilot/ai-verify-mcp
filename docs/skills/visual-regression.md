# Skill: 视觉回归

> 场景：UI 改动前后视觉对比、组件级视觉回归、多 viewport 一致性验证、跨主题（light/dark）UI 对比。

## 1. 场景描述与痛点

视觉回归是前端 UI 改动后验证"非预期视觉变化"的核心手段。AI 生成 UI 或人工改动 CSS 后常出现：

- 改一个组件样式意外影响其他页面布局
- 响应式断点失效（移动端布局错乱但桌面端正常）
- 主题切换后对比度不足、文字不可见
- 动态内容（广告位、时间戳、随机头像）干扰对比结果
- 没有基线导致"改没改"无法量化
- 全页对比噪声过大，看不出关键差异

**本 Skill 提供 3 条工具链**：
- **A. 全页视觉回归**：先建立基线 → 改动后对比 → 生成 diff 报告
- **B. 组件级视觉回归**：一次调用完成组件截图 + 对比（基线不存在时自动创建）
- **C. 无基线 UI 问题扫描**：直接扫描当前页常见 UI 问题（重叠、对比度、alt 缺失等）

## 2. 推荐工具链

### 工具链 A：全页视觉回归（首次建立基线 + 后续对比）

```
┌──────────────────────────────────────────────────────────────┐
│  全页视觉回归                                                 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  【首次建立基线】                                             │
│  Step 1: browser_open             打开页面                   │
│  Step 2: browser_visual_baseline  创建全页基线 PNG            │
│                                                              │
│  【UI 改动后回归对比】                                         │
│  Step 3: browser_open             再次打开页面（改动后）      │
│  Step 4: browser_visual_compare   截取 actual + 与基线对比    │
│  Step 5: browser_visual_report    列出所有对比产物            │
│  Step 6: evidence_pack            收集证据                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 工具链 B：组件级视觉回归（一次调用完成）

```
┌──────────────────────────────────────────────────────────────┐
│  组件级视觉回归                                               │
├──────────────────────────────────────────────────────────────┤
│  Step 1: browser_open                 打开页面                │
│  Step 2: browser_visual_component     指定 selector 一次对比  │
│         （基线不存在时自动创建，返回 baseline_created: true）  │
│  Step 3: evidence_pack                收集证据                │
└──────────────────────────────────────────────────────────────┘
```

### 工具链 C：无基线 UI 问题扫描

```
┌──────────────────────────────────────────────────────────────┐
│  无基线 UI 问题扫描                                           │
├──────────────────────────────────────────────────────────────┤
│  Step 1: browser_open                打开页面                │
│  Step 2: browser_visual_check        扫描 UI 问题             │
│         （重叠/对比度/alt 缺失/z-index/响应式等）             │
│  Step 3: evidence_pack               收集证据                │
└──────────────────────────────────────────────────────────────┘
```

### 每步说明

| 步骤 | 工具 | 作用 | 关键参数 |
|---|---|---|---|
| 1 | `browser_open` | 打开目标页 | `url` |
| 2 | `browser_visual_baseline` | 创建基线 PNG | `name`, `fullPage`, `maskSelectors` |
| 2' | `browser_visual_component` | 组件级一次对比 | `name`, `selector`, `maxDiffPixelRatio` |
| 2'' | `browser_visual_check` | 无基线 UI 问题扫描 | `includeAccessibility`, `includeResponsive`, `viewports`, `severity` |
| 4 | `browser_visual_compare` | 截 actual + 与基线对比 | `name`, `maxDiffPixelRatio`, `maskSelectors` |
| 5 | `browser_visual_report` | 列出所有产物 | 无 |
| 6 | `evidence_pack` | 收集证据 | `name: "visual-regression"` |

## 3. 关键参数说明

### browser_visual_baseline

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 是 | 基线名称，不含扩展名（如 `"login-page-baseline"`） |
| `selector` | string | 否 | CSS 选择器；指定后只截该元素，否则全页 |
| `fullPage` | boolean | 否 | 是否全页截图，默认 `true`；`selector` 存在时忽略 |
| `maskSelectors` | array | 否 | 截图前额外遮挡/脱敏的 CSS 选择器列表（如 `[".ad-banner", ".timestamp"]`） |
| `sessionName` | string | 否 | 浏览器会话名，默认当前活跃会话 |

### browser_visual_compare

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 是 | 要对比的基线名称（需先建过同名基线） |
| `selector` | string | 否 | CSS 选择器；需与基线截图范围一致 |
| `fullPage` | boolean | 否 | 是否全页截图，默认 `true` |
| `maskSelectors` | array | 否 | 截图前额外遮挡的 CSS 选择器（用于忽略动态区域） |
| `maxDiffPixelRatio` | number | 否 | 允许的最大差异像素比例，**默认 `0.01`（1%）**；推荐 0.005-0.02 |
| `sessionName` | string | 否 | 浏览器会话名 |

### browser_visual_component

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 是 | 组件基线名称 |
| `selector` | string | 是 | CSS 选择器，精确选择要对比的组件 |
| `maxDiffPixelRatio` | number | 否 | 允许的最大差异像素比例，默认 `0.01` |
| `sessionName` | string | 否 | 浏览器会话名 |

**关键差异**：`browser_visual_component` 是"一次调用"工具——基线不存在时自动创建并返回 `baseline_created: true`，基线已存在时直接对比。适合组件库快速回归。

### browser_visual_check（无基线扫描）

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `includeAccessibility` | boolean | true | 包含可访问性检查（图片 alt 缺失、对比度检测） |
| `includeResponsive` | boolean | false | 包含响应式检查 |
| `viewports` | array | `["mobile","tablet"]` | 响应式检查的 viewport 列表，可选 `mobile`/`tablet`/`desktop` |
| `severity` | string | `major` | 最低报告级别：`blocking` / `major` / `minor` |

## 4. 预期产出

### browser_visual_compare 输出结构

```json
{
  "ok": true,
  "name": "login-page-baseline",
  "baselinePath": "visual/baselines/login-page-baseline.png",
  "actualPath": "visual/actuals/login-page-baseline.png",
  "diffPath": "visual/diffs/login-page-baseline-diff.png",
  "diffPixels": 152,
  "diffRatio": 0.003,
  "passed": true,
  "threshold": 0.01
}
```

**关键字段**：
- `diffPixels`：差异像素数
- `diffRatio`：差异像素比例（0-1）
- `passed`：`diffRatio <= maxDiffPixelRatio` 时为 `true`
- `diffPath`：差异可视化 PNG（红色高亮差异区域）

### browser_visual_component 输出结构

```json
{
  "ok": true,
  "name": "product-card",
  "selector": ".product-card",
  "baselinePath": "visual/baselines/product-card.png",
  "actualPath": "visual/actuals/product-card.png",
  "diffPath": "visual/diffs/product-card-diff.png",
  "diffPixels": 0,
  "diffRatio": 0,
  "passed": true,
  "baseline_created": false
}
```

### browser_visual_check 输出结构

```json
{
  "ok": true,
  "totalIssues": 3,
  "issues": [
    {
      "severity": "blocking",
      "category": "contrast",
      "description": "Text color #ccc on background #eee has contrast ratio 1.6:1, below WCAG AA 4.5:1",
      "selector": ".footer-text",
      "recommendation": "Darken text color to at least #767676"
    },
    {
      "severity": "major",
      "category": "alt-missing",
      "description": "Image missing alt attribute",
      "selector": "img.hero-banner",
      "recommendation": "Add descriptive alt attribute"
    },
    {
      "severity": "major",
      "category": "z-index",
      "description": "Element with z-index 9999 occludes interactive element",
      "selector": ".modal-overlay",
      "recommendation": "Reduce z-index or hide overlay when not active"
    }
  ],
  "summary": "Found 3 issues: 1 blocking, 2 major"
}
```

### 证据文件

- `visual/baselines/<name>.png` — 基线截图
- `visual/actuals/<name>.png` — 实际截图
- `visual/diffs/<name>-diff.png` — 差异可视化（红色高亮）
- `reports/visual-regression-report.md` — 回归报告
- `screenshots/ui-issues.png` — UI 问题扫描截图（工具链 C）

## 5. 完整端到端示例

### 工具链 A：全页视觉回归（以 https://example.com 为例）

```
# === 首次：建立基线 ===

# Step 1: 打开页面
browser_open({ url: "https://example.com" })

# Step 2: 创建全页基线（mask 掉动态广告位避免噪声）
browser_visual_baseline({
  name: "example-home-baseline",
  fullPage: true,
  maskSelectors: [".ad-banner", ".timestamp"]
})

# === UI 改动后：回归对比 ===

# Step 3: 再次打开页面（假设 UI 已改动）
browser_open({ url: "https://example.com" })

# Step 4: 截 actual 并与基线对比
browser_visual_compare({
  name: "example-home-baseline",
  fullPage: true,
  maskSelectors: [".ad-banner", ".timestamp"],
  maxDiffPixelRatio: 0.005
})

# Step 5: 列出所有产物
browser_visual_report()

# Step 6: 收集证据
evidence_pack({ name: "visual-regression-example" })
```

**预期返回**：
- `browser_visual_baseline` 返回 `ok: true, path: "visual/baselines/example-home-baseline.png"`
- `browser_visual_compare` 返回 `passed: true/false, diffRatio: 0.00X`
- `browser_visual_report` 列出 baselines/actuals/diffs 三个目录的文件

### 工具链 B：组件级视觉回归（以 https://example.com 的 nav 为例）

```
# Step 1: 打开页面
browser_open({ url: "https://example.com" })

# Step 2: 组件级对比（基线不存在时自动创建）
browser_visual_component({
  name: "example-nav",
  selector: "nav",
  maxDiffPixelRatio: 0.005
})

# Step 3: 收集证据
evidence_pack({ name: "visual-component-nav" })
```

**首次返回**：`baseline_created: true, passed: true, diffPixels: 0`
**再次返回**：`baseline_created: false, passed: true/false, diffPixels: N`

## 6. 常见坑与最佳实践

### 常见坑

| 坑 | 现象 | 解决方案 |
|---|---|---|
| 动态内容干扰对比 | `diffPixels` 总是很大 | 用 `maskSelectors` 遮挡广告位、时间戳、随机头像、验证码 |
| 阈值过严 | `passed: false` 但人眼看不出差异 | 调高 `maxDiffPixelRatio` 到 0.01-0.02；抗锯齿差异通常占 0.1-0.5% |
| 阈值过松 | 真实 UI 变化被忽略 | 调低 `maxDiffPixelRatio` 到 0.005；按组件级别对比而非全页 |
| 基线陈旧 | 业务迭代后基线已过时 | UI 升级后用 `browser_visual_baseline` 重新建立基线（同名覆盖） |
| viewport 不一致 | 同名基线对比结果异常 | baseline 和 compare 必须使用相同 viewport；用 `browser_emulate_device` 切换 |
| 全页对比噪声大 | 改一个组件却整页报差异 | 改用 `browser_visual_component` 只对比受影响组件 |
| 字体渲染差异 | 跨平台基线对比失败 | 同一平台建立基线和对比；或 mask 掉文本区域 |
| 响应式断点漏测 | 移动端布局错乱未发现 | 用 `browser_visual_check` 的 `includeResponsive: true` + `viewports: ["mobile","tablet","desktop"]` |

### 最佳实践

1. **基线版本化**：基线按 UI 版本命名（如 `home-v1.9.3-baseline`），避免新旧基线混淆
2. **mask 动态区域**：`maskSelectors` 是视觉回归的"灵魂参数"，能消除 80% 的噪声差异
3. **组件级优先**：能用 `browser_visual_component` 就别用全页对比，定位更准、噪声更小
4. **阈值分层**：核心组件 `maxDiffPixelRatio: 0.005`，次要区域 `0.02`，动态区域直接 mask
5. **多 viewport 必测**：至少 mobile + desktop 两个 viewport 建基线
6. **结合 UI 扫描**：`browser_visual_check` 不需要基线，适合首次 UI 走查
7. **必收证据**：`evidence_pack` 收集 baseline/actual/diff 三张图 + 报告

## 相关 Skill

- [端到端流程](./e2e-flow) — 视觉回归作为端到端验证的一环
- [调试排查](./debug-investigation) — 视觉差异异常时排查
- [安全审计](./security-audit) — UI 安全（XSS、CSP）相关

## MCP Prompt

使用 `/visual-regression` prompt 可快速启动视觉回归工作流（需 ValidPilot v1.9.3+）。在支持 MCP Prompts 的客户端中输入 `/` 即可看到该命令，传入 `url`、`name`、`selector` 参数