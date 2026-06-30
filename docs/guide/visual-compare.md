# 视觉对比

像素级视觉回归测试，精准捕捉 UI 变化。

## 核心功能

- **像素级对比** — 基于 pixelmatch，逐像素比对
- **差异高亮** — 差异区域红色高亮显示
- **阈值可调** — 支持自定义差异敏感度
- **基线管理** — 支持设置和更新视觉基准图

## 使用方式

### 方式一：通过 MCP 工具

在 AI 客户端中调用 `browser_visual_compare`：

```
帮我对比这个页面和基线图：
1. 打开 http://localhost:5173
2. 设置视觉基线
3. 修改代码后重新打开
4. 视觉对比
5. 告诉我差异在哪里
```

### 方式二：通过 API

```javascript
const { comparePngFiles } = require('ai-verify-mcp');

const result = comparePngFiles({
  baselinePath: 'baseline.png',
  actualPath: 'current.png',
  diffPath: 'diff.png',
  threshold: 0.1
});

console.log(`差异像素数: ${result.diffPixels}`);
```

## 对比参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `threshold` | 0.1 | 差异阈值（0-1），越小越严格 |
| `includeAA` | false | 是否忽略抗锯齿差异 |
| `diffColor` | [255, 0, 0] | 差异高亮颜色（RGB） |

## 工作流程

```
基线截图 → 当前截图 → 像素比对 → 差异图生成 → 结果报告
     ↑                                          │
     └──────── 差异为 0 则通过 ────────────────┘
```

## 最佳实践

1. **稳定的基线** — 确保基线图在稳定环境下生成
2. **一致的视口** — 对比前后使用相同的浏览器尺寸
3. **合理的阈值** — 根据页面类型调整敏感度
4. **忽略动态区域** — 时间、广告等动态内容先排除
5. **定期更新基线** — UI 改版后及时更新基线图
