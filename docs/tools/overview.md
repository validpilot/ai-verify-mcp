# 工具总览

AI-Verify MCP 提供 **83 个工具**，按功能分为 8 大类。

## 工具分类

| 类别 | 数量 | 说明 |
|------|------|------|
| [浏览器操作](./browser) | 25 | 页面导航、元素操作、截图等 |
| 诊断与调试 | 17 | 错误捕获、网络分析、性能检查 |
| 验证框架 | 14 | 断言、流程验证、报告生成 |
| [视觉验证](./visual) | 3 | 视觉对比、基线管理 |
| 会话管理 | 7 | 多会话、Cookie、存储 |
| 证据产物 | 4 | 产物管理、追踪、HAR 导出 |
| [错误修复](./fix) | 内置 23 模式 | 自动诊断 + 修复建议 |
| [系统工具](./system) | 4 | 健康检查、自检、基准测试 |

## 快速查找

### 最常用的工具

| 工具 | 用途 |
|------|------|
| `browser_open` | 打开页面 |
| `browser_screenshot` | 截图 |
| `browser_click` | 点击元素 |
| `browser_type` | 输入文本 |
| `browser_errors` | 查看 Console 错误 |
| `browser_network` | 查看网络请求 |
| `browser_diagnose` | 自动错误诊断 |
| `validation_quick_run` | 一键 7 项快速验证 |
| `browser_a11y_check` | 无障碍扫描 |
| `browser_visual_compare` | 视觉对比 |

### 按场景选择

**快速验证页面：**
`validation_quick_run` → 一键 7 项检查

**完整验证流程：**
`validation_start` → `browser_open` → `browser_screenshot` → `browser_errors` → `validation_report`

**诊断页面错误：**
`browser_open` → `browser_errors` → `browser_network` → `browser_diagnose` → `error_fix_suggestion`

**视觉回归测试：**
`browser_visual_baseline` → `browser_visual_compare` → `browser_visual_report`

**修复验证闭环：**
`browser_diagnose` → `browser_quick_fix` → `browser_verify_fix` → `fix_verify`
