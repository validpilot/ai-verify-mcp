# 工具总览

AI-Verify MCP 提供 **136 个工具**（v1.9.3），按功能分为 22 大类。

## 工具分类

| 类别 | 数量 | 说明 |
|------|------|------|
| Browser 导航 & 页面 | 10 | 页面打开、刷新、快照、DOM、链接、查找 |
| Browser 交互 | 10 | 点击、输入、悬停、滚动、按键、表单填充 |
| Browser ARIA | 3 | ARIA 快照、点击、输入（无障碍树操作） |
| Browser 视觉 | 10 | 截图、视觉对比、基线、组件、高亮 |
| Browser 错误 & 控制台 | 6 | 错误捕获、聚合、清空、控制台、事件 |
| Browser 网络 & 存储 | 5 | 网络请求、详情、Cookie、存储、HAR |
| Browser 性能 & A11y | 5 | 性能检查、追踪、Lighthouse、无障碍、内存 |
| Browser 高级 | 10 | 遮挡、验证码、反爬、设备模拟、响应式、反事实 |
| Browser 调试 | 6 | 诊断、调试报告、探针、Eval、断言、点击审计 |
| Browser 组合 | 11 | 步骤、批量、链式、流程、智能填充、会话、冒烟、全量审计 |
| Browser Trace & Artifacts | 5 | 追踪开始/停止/链、产物列表/清空 |
| Browser 全量审计 | 2 | 全量审计、全量回归 |
| Browser 矩阵测试 | 1 | 跨浏览器矩阵测试 |
| Security | 6 | 安全头部、CSP、SQL 注入、XSS、OWASP Top10、API 探测 |
| Asset Discovery | 4 | 路由发现、端点枚举、端点探测、架构反推 |
| Validation | 14 | 启动、检查、快速、元素、流程、矩阵、合规、数据完整性、权限、决策、链、报告、导出、执行 |
| Report & Evidence | 2 | 证据索引、证据打包 |
| Contract & Correlate | 5 | 契约基线、契约守护、三重检查、Trace 关联、关联检查 |
| Error Analysis | 3 | 修复建议、错误摘要、调试调查 |
| Memory & ATL | 3 | 记忆召回、ATL 学习、ATL 修复 |
| Exploration & System | 9 | 快速探索、双链探索、健康检查、自检、项目审计、技能验证、CSS 变量、Skill 映射查询、Skill 一致性校验 |
| Chain & Business | 6 | 模板列表、评分报告、规范运行、业务闭环、登录绕过、状态差异 |
| **合计** | **136** | |

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
| `browser_overlay_detect` | 遮挡物检测 |
| `browser_overlay_dismiss` | 遮挡物关闭 |
| `browser_smoke_test` | 冒烟测试 |
| `browser_counterfactual_analyze` | 反事实根因分析 |
| `security_owasp_top10` | OWASP Top 10 快速检查 |
| `asset_routes_discover` | API 路由发现 |

### 按场景选择

> 💡 **新功能**：v1.9.3 新增 [Skill 指导](../skills/index) 和 [场景手册](../scenarios/ecommerce-checkout)，提供"场景 → 工具链 → 步骤"的标准用法手册。下方为快速参考，详细用法请参考对应 Skill 文档。

**快速验证页面：**
`validation_quick_run` → 一键 7 项检查 → 详见 [Skill 指导](../skills/index)

**完整验证流程：**
`validation_start` → `browser_open` → `browser_screenshot` → `browser_errors` → `validation_report`

**诊断页面错误：**
`browser_open` → `browser_errors` → `browser_network` → `browser_diagnose` → `error_fix_suggestion`

**视觉回归测试：**
`browser_visual_baseline` → `browser_visual_compare` → `browser_visual_report`

**修复验证闭环：**
`browser_diagnose` → `browser_quick_fix` → `browser_verify_fix` → `fix_verify`

**遮挡物处理：**
`browser_overlay_detect` → `browser_overlay_dismiss` → `browser_screenshot`

**冒烟测试与根因分析：**
`browser_smoke_test` → `browser_counterfactual_analyze` → `validation_report`

**安全扫描：**
`security_headers_check` → `security_csp_analyze` → `security_owasp_top10` → `security_sql_injection_scan` → `security_xss_scan`

**API 资产发现：**
`asset_routes_discover` → `asset_endpoint_enum` → `asset_endpoint_probe` → `api_probe` → `arch_reverse_probe`

**跨浏览器兼容性测试：**
`browser_matrix_test`（chromium / firefox / webkit 任意组合）

**业务闭环验证：**
`business_loop_validate` → `state_diff_assert` → `validation_chain`

## 版本历史

| 版本 | 工具数 | 主要变更 |
|------|--------|---------|
| v1.9.3 | 136 | 新增 MCP Prompts 原语（7 个工作流模板，含 submit-form）+ 8 篇 Skill 文档 + 5 篇场景 Playbook + 42 个工具描述双语优化 + 2 个 Skill-MCP 协调工具（skill_tools_map、skill_consistency_check） |
| v1.8.0 | 134 | 新增 6 个安全扫描工具 + 3 个 bug 修复 |
| v1.7.3 | 128 | 修复 8 个深度测试发现的 bug |
| v1.7.0 | 128 | 验证码检测增强、API 推导 |
| v1.6.7 | 124 | MCP 协议合规性修复与 trace 模块重构 |

## 相关文档

- [Skill 指导总览](../skills/index) — 场景化工具链用法手册
- [场景手册](../scenarios/ecommerce-checkout) — 跨 Skill 业务场景 Playbook
- [工具选择决策矩阵](../reference/tool-decision-matrix) — "我想做 X"决策树
- [浏览器工具](./browser)
- [视觉验证](./visual)
- [系统工具](./system)
- [验证框架](./validation)
- [MCP 协议速查手册](../reference/mcp-cheatsheet.md)
- [用户操作手册](../public/legacy/USER-MANUAL.md)
- [v1.8.0 全量测试报告](../../test-reports/v1.8.0-full-test-report.md)
