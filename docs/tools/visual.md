# 视觉验证工具

像素级视觉回归测试，3 个核心工具。

## 工具列表

| 工具 | 说明 |
|------|------|
| `browser_visual_baseline` | 设置视觉基准（基线图） |
| `browser_visual_compare` | 视觉对比（当前 vs 基线） |
| `browser_visual_report` | 生成视觉回归报告 |
| `browser_responsive_test` | 多视口响应式布局测试 |
| `browser_a11y_check` | 无障碍访问扫描 |
| `browser_performance_check` | 页面性能检查 |
| `browser_lighthouse_audit` | Lighthouse 完整审计 |
| `screenshot_diff` | 两张截图差异对比 |

## browser_visual_baseline

设置视觉基准图，用于后续对比。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `name` | ✅ | 基线名称 |
| `selector` | ❌ | 元素选择器（截取指定元素） |

## browser_visual_compare

对比当前页面与基线图的差异。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `name` | ✅ | 基线名称 |
| `threshold` | ❌ | 差异阈值，默认 0.1 |
| `selector` | ❌ | 元素选择器 |

**返回**：

```json
{
  "pass": true,
  "diffPixels": 0,
  "totalPixels": 1920000,
  "diffRatio": 0,
  "baselinePath": "artifacts/visual/baseline-home.png",
  "actualPath": "artifacts/visual/actual-home.png",
  "diffPath": "artifacts/visual/diff-home.png"
}
```

## browser_visual_report

生成完整的视觉回归报告，包含所有对比项的汇总。

**返回**：HTML + JSON 格式的报告。

## browser_responsive_test

多视口响应式布局测试。模拟 mobile / tablet / desktop 三个标准视口截图对比，检测响应式布局问题。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `url` | ✅ | 目标页面 URL |
| `viewports` | ❌ | 视口列表，默认 `["mobile", "tablet", "desktop"]` |
| `waitMs` | ❌ | 截图前等待毫秒，默认 1000 |
| `fullPage` | ❌ | 是否截取整页，默认 false |

**视口预设**：

| 视口 | 尺寸 | 说明 |
|------|------|------|
| `mobile` | 375×812 | iPhone X 尺寸 |
| `tablet` | 768×1024 | iPad 尺寸 |
| `desktop` | 1280×720 | 主流桌面分辨率 |

**返回示例**：
```json
{
  "url": "https://example.com",
  "viewportCount": 3,
  "screenshots": [
    { "viewport": "Mobile (375×812)", "width": 375, "height": 812, "data": "..." },
    { "viewport": "Tablet (768×1024)", "width": 768, "height": 1024, "data": "..." },
    { "viewport": "Desktop (1280×720)", "width": 1280, "height": 720, "data": "..." }
  ]
}
```

**适用场景**：响应式布局回归测试、多设备兼容验证、CSS 媒体查询验证

## 工作流程

```
第 1 次运行（建立基线）：
  browser_visual_baseline("homepage")
  → 保存基线图

第 2 次及以后（对比验证）：
  browser_visual_compare("homepage")
  → 计算差异
  → 生成差异图
  → 返回通过/失败
```

## 阈值说明

| 阈值 | 敏感度 | 适用场景 |
|------|--------|---------|
| 0.0 | 最严格 | 像素级精确对比 |
| 0.1 | 默认 | 一般 UI 验证 |
| 0.3 | 较宽松 | 允许细微渲染差异 |
| 0.5 | 宽松 | 只关注重大变化 |

## 最佳实践

1. **稳定环境** — 基线图在固定环境下生成
2. **固定视口** — 对比前后使用相同的窗口大小
3. **忽略动态** — 时间戳、随机广告等先处理掉
4. **定期更新** — UI 改版后及时更新基线
