# 工具选择决策矩阵

> "我想做 X，该用什么工具？"——按场景查找工具的决策树和矩阵。
> 共 136 个工具，22 大类。本矩阵帮助你快速找到合适的工具。

## 快速决策树

```
我想做什么？
│
├─ 打开/操作浏览器页面 ─────────→ Browser 导航 & 页面 / 交互
├─ 截图/视觉对比 ───────────────→ Browser 视觉
├─ 检查页面错误/调试问题 ───────→ Browser 错误 & 控制台 / 调试
├─ 查看网络请求/Cookie/存储 ────→ Browser 网络 & 存储
├─ 性能/SEO/可访问性审计 ───────→ Browser 性能 & A11y
├─ 安全漏洞扫描 ───────────────→ Security
├─ 发现 API 路由/端点 ─────────→ Asset Discovery
├─ 跑端到端验证流程 ───────────→ Validation
├─ 收集证据/生成报告 ──────────→ Report & Evidence
├─ 验证 API 契约/前后端一致性 ─→ Contract & Correlate
├─ 分析错误/获取修复建议 ──────→ Error Analysis
├─ 记忆/学习模式 ──────────────→ Memory & ATL
├─ 探索代码库/系统自检 ────────→ Exploration & System
├─ 链式执行/业务闭环 ──────────→ Chain & Business
│
└─ 不知道选什么？ ─────────────→ 见下方"按任务目标"表格
```

## 按任务目标选择工具

### 我要打开和操作浏览器

| 任务 | 推荐工具 | 说明 |
|---|---|---|
| 打开 URL | `browser_open` | 必须先调用，建立浏览器会话 |
| 前进/后退/刷新 | `browser_navigate` | action: forward/back/refresh/reload |
| 获取页面结构 | `browser_snapshot` | 返回可读 DOM 摘要 + 元素 ref |
| 查询特定元素 | `browser_dom` | 返回完整 DOM 或指定选择器内容 |
| 查找页面链接 | `browser_links` | 提取所有 a 标签 |
| 查找元素位置 | `browser_find_element` / `browser_find_page` | 跨页面查找元素 |
| 等待条件 | `browser_wait` | urlContains / textContains / selectorVisible |

### 我要点击/输入/交互

| 任务 | 推荐工具 | 说明 |
|---|---|---|
| 点击元素 | `browser_click` | CSS 选择器，支持 index 选多个 |
| 输入文本 | `browser_type` | 模拟键盘输入 |
| 批量填表单 | `browser_form_fill` | fields 对象，支持 CSS 选择器和字段名两种 key |
| 验证表单规则 | `browser_form_validate` | 检测 required/pattern/length |
| 悬停 | `browser_hover` | 鼠标悬停触发 tooltip/菜单 |
| 滚动 | `browser_scroll` | 滚动到元素或指定位置 |
| 按键 | `browser_press_key` | Enter/Escape/Tab 等 |
| 下拉选择 | `browser_select` | select 元素选项 |
| 智能填充 | `browser_smart_fill` | 自动识别字段类型生成 mock 数据 |
| 遍历菜单 | `browser_traverse_menu` | 自动遍历导航菜单 |

### 我要截图/视觉验证

| 任务 | 推荐工具 | 说明 |
|---|---|---|
| 全页截图 | `browser_screenshot` | fullPage: true |
| 元素截图 | `browser_screenshot_element` | 指定 selector |
| 建立视觉基线 | `browser_visual_baseline` | 首次建立对比基准 |
| 与基线对比 | `browser_visual_compare` | 返回 diffPixels/diffRatio/passed |
| 组件级对比 | `browser_visual_component` | 一次调用，基线不存在自动创建 |
| 列出视觉产物 | `browser_visual_report` | baselines/actuals/diffs 列表 |
| 视觉快照 | `browser_visual_snapshot` | 当前页视觉状态快照 |
| 高亮元素 | `browser_highlight` | 调试用，高亮指定元素 |
| 无基线 UI 扫描 | `browser_visual_check` | 扫描重叠/对比度/alt 缺失等 |
| 截图对比 | `screenshot_diff` | 两张截图直接对比 |

### 我要检查错误/调试问题

| 任务 | 推荐工具 | 说明 |
|---|---|---|
| 查看本轮错误 | `browser_errors` | Console/PageError/HTTP 4xx 5xx/静默失败 |
| 聚合 Top 错误 | `browser_errors_aggregate` | 去重聚合，返回最频繁错误 |
| 清空错误 | `browser_errors_clear` | 建立 checkpoint，隔离本轮错误 |
| 查看 console 日志 | `browser_console` | 按 level 过滤：log/warning/error/debug/info |
| 自动诊断 | `debug_investigate` | 输入症状，返回假设+证据链+建议 |
| 获取修复建议 | `error_fix_suggestion` | 返回 3 个最小修复建议（不自动改码） |
| 错误摘要 | `error_summary_md` | 生成 Markdown 错误摘要 |
| 调试报告 | `browser_debug_report` | 综合调试报告 |
| 注入探针 | `browser_instrument` | 注入运行时探针 |
| 执行 JS | `browser_eval` | 在页面上下文执行 JavaScript |
| 断言 | `browser_assert` | URL/文本/元素可见/无错误 |
| 点击审计 | `browser_click_audit` | 记录点击副作用 |

### 我要查看网络/存储

| 任务 | 推荐工具 | 说明 |
|---|---|---|
| 网络请求列表 | `browser_network` | 按 URL/方法/状态码过滤 |
| 网络请求详情 | `browser_network_detail` | 请求头/响应头/响应体（自动脱敏） |
| Cookie | `browser_cookies` | 查看/设置/清除 Cookie |
| 存储 | `browser_storage` | localStorage/sessionStorage |
| HAR 导出 | `browser_har_export` | 导出完整 HAR JSON |
| 事件监听 | `browser_events` / `browser_events_clear` | 录制/清除页面事件 |

### 我要做性能/SEO/A11y 审计

| 任务 | 推荐工具 | 说明 |
|---|---|---|
| Lighthouse 审计 | `browser_lighthouse_audit` | 4 维度评分（性能/A11y/最佳实践/SEO） |
| 性能指标 + 预算 | `browser_performance_check` | Core Web Vitals + budgets 对比 |
| 性能 trace | `browser_performance_trace` | 完整轨迹 + HAR + 截图 |
| 内存泄漏检测 | `browser_memory_check` | detached DOM/JS heap/事件监听 |
| 无障碍扫描 | `browser_a11y_check` | WCAG 对比度/alt/ARIA 等 |

### 我要做安全扫描

| 任务 | 推荐工具 | 说明 |
|---|---|---|
| HTTP 安全头 | `security_headers_check` | CSP/X-Content-Type-Options/X-Frame-Options/HSTS/Referrer-Policy |
| CSP 深度分析 | `security_csp_analyze` | 检测 unsafe-inline/unsafe-eval/wildcard |
| OWASP Top 10 | `security_owasp_top10` | A01-A10 快速风险扫描 |
| SQL 注入 | `security_sql_injection_scan` | 20 种 payload（URL 需含查询参数） |
| XSS | `security_xss_scan` | 26 种 payload（URL 需含查询参数） |
| API 探测 | `api_probe` | 接口可达性 + CORS 分析 |

### 我要发现 API/端点

| 任务 | 推荐工具 | 说明 |
|---|---|---|
| 路由发现 | `asset_routes_discover` | 从前端代码提取 API 路由 |
| 端点枚举 | `asset_endpoint_enum` | 枚举所有 API 端点 |
| 端点探测 | `asset_endpoint_probe` | 探测端点可达性 |
| 架构反推 | `arch_reverse_probe` | 反推前端架构 |

### 我要跑端到端验证

| 任务 | 推荐工具 | 说明 |
|---|---|---|
| 启动验证 | `validation_start` | 创建验证运行 |
| 检查 | `validation_check` | 单次检查 |
| 快速验证 | `validation_quick_run` | 一键 7 项检查 |
| 元素验证 | `validation_element` | 验证元素存在性/可见性 |
| 流程验证 | `validation_flow` | 多步流程验证 |
| 矩阵验证 | `validation_matrix` | 多用例矩阵 |
| 合规验证 | `validation_compliance` | 合规性检查 |
| 数据完整性 | `validation_data_integrity` | 数据完整性检查 |
| 权限验证 | `validation_permission` | 权限边界检查 |
| 决策验证 | `validation_decision` | 决策点验证 |
| 链路验证 | `validation_chain` | 5 步链路（navigate/click/type/wait/validate） |
| 报告生成 | `validation_report` | 六段式 Markdown/JSON 报告 |
| 报告导出 | `validation_report_export` | HTML 报告 |
| 执行验收 | `validation_run` | 多用例验收计划 |

### 我要收集证据/生成报告

| 任务 | 推荐工具 | 说明 |
|---|---|---|
| 证据包 | `evidence_pack` | 单步证据（截图/DOM/错误/网络/trace） |
| 证据索引 | `evidence_index` | 跨步骤证据时间线 |

### 我要验证 API 契约

| 任务 | 推荐工具 | 说明 |
|---|---|---|
| 契约基线 | `contract_baseline` | 建立接口契约基线 |
| 契约守护 | `contract_guard` | 检测接口契约偏移 |
| 三重检查 | `correlate_triple_check` | 前端/接口/数据库三方对账 |
| Trace 关联 | `trace_correlate` | 跨层 trace 关联（Pro） |
| 关联检查 | `correlate_consistency_check` | 一致性检查 |

### 我要分析错误/获取修复建议

| 任务 | 推荐工具 | 说明 |
|---|---|---|
| 修复建议 | `error_fix_suggestion` | 基于 errorSummary 返回 3 个建议 |
| 错误摘要 | `error_summary_md` | Markdown 错误摘要 |
| 调试调查 | `debug_investigate` | 自动根因分析 |

### 我要记忆/学习模式

| 任务 | 推荐工具 | 说明 |
|---|---|---|
| 记忆召回 | `memory_recall` | 召回历史模式 |
| ATL 学习 | `atl_learn` | 学习测试模式 |
| ATL 修复 | `atl_fix` | 应用学习到的修复模式 |

### 我要探索代码库/系统自检

| 任务 | 推荐工具 | 说明 |
|---|---|---|
| 快速探索 | `exploration_quick` | 快速代码库探索 |
| 双链探索 | `dual_chain_explore` | 双链路探索 |
| 健康检查 | `mcp_health_check` | MCP 服务健康检查 |
| 自检 | `mcp_self_test` | MCP 服务自检 |
| 项目审计 | `project_audit` | 项目整体审计 |
| 技能验证 | `skill_mcp_validate` | 验证 MCP 技能 |
| Skill 映射查询 | `skill_tools_map` | 查询 Skill↔Tool 双向映射（skillName→工具链 / toolName→Skill 列表） |
| Skill 一致性校验 | `skill_consistency_check` | 批量校验所有 Skill 引用工具与实际注册一致，不依赖外部文件 |
| CSS 变量检查 | `css_var_check` | CSS 变量一致性检查 |

### 我要链式执行/业务闭环

| 任务 | 推荐工具 | 说明 |
|---|---|---|
| 模板列表 | `chain_list_templates` | 链式模板列表 |
| 评分报告 | `chain_score_report` | 链式评分报告 |
| 规范运行 | `chain_spec_run` | 按规范运行链 |
| 业务闭环 | `business_loop_validate` | 业务流程闭环验证 |
| 登录绕过 | `bypass_login` | 绕过登录（测试用） |
| 状态差异 | `state_diff_assert` | 状态差异断言 |

## 按工具类别速查（22 大类，136 个工具）

### 1. Browser 导航 & 页面（10）
`browser_open` `browser_navigate` `browser_snapshot` `browser_dom` `browser_links` `browser_find_element` `browser_find_page` `browser_wait` `browser_sessions` `browser_session_create`

### 2. Browser 交互（10）
`browser_click` `browser_type` `browser_hover` `browser_scroll` `browser_press_key` `browser_form_fill` `browser_form_validate` `browser_select` `browser_smart_fill` `browser_traverse_menu`

### 3. Browser ARIA（3）
`browser_aria_snapshot` `browser_aria_click` `browser_aria_type`

### 4. Browser 视觉（10）
`browser_screenshot` `browser_screenshot_element` `browser_visual_baseline` `browser_visual_check` `browser_visual_compare` `browser_visual_report` `browser_visual_snapshot` `browser_visual_component` `browser_highlight` `screenshot_diff`

### 5. Browser 错误 & 控制台（6）
`browser_errors` `browser_errors_aggregate` `browser_errors_clear` `browser_console` `browser_events` `browser_events_clear`

### 6. Browser 网络 & 存储（5）
`browser_network` `browser_network_detail` `browser_cookies` `browser_storage` `browser_har_export`

### 7. Browser 性能 & A11y（5）
`browser_lighthouse_audit` `browser_performance_check` `browser_performance_trace` `browser_a11y_check` `browser_memory_check`

### 8. Browser 高级（10）
`browser_overlay_detect` `browser_overlay_dismiss` `browser_captcha_detect` `browser_captcha_screenshot` `browser_captcha_read` `browser_anti_bot_detect` `browser_emulate_device` `browser_responsive_test` `browser_counterfactual_analyze` `browser_locator_suggest`

### 9. Browser 调试（6）
`debug_investigate` `browser_debug_report` `browser_instrument` `browser_eval` `browser_assert` `browser_click_audit`

### 10. Browser 组合（11）
`browser_step` `browser_batch` `browser_chain` `browser_flow` `browser_smart_fill` `browser_session_create` `browser_session_switch` `browser_smoke_test` `browser_full_audit` `browser_full_regression` `browser_locator_validate`

### 11. Browser Trace & Artifacts（5）
`browser_trace_start` `browser_trace_stop` `browser_trace_chain` `browser_artifacts` `browser_artifacts_clear`

### 12. Browser 全量审计（2）
`browser_full_audit` `browser_full_regression`

### 13. Browser 矩阵测试（1）
`browser_matrix_test`

### 14. Security（6）
`security_headers_check` `security_csp_analyze` `security_sql_injection_scan` `security_xss_scan` `security_owasp_top10` `api_probe`

### 15. Asset Discovery（4）
`asset_routes_discover` `asset_endpoint_enum` `asset_endpoint_probe` `arch_reverse_probe`

### 16. Validation（14）
`validation_start` `validation_check` `validation_quick_run` `validation_element` `validation_flow` `validation_matrix` `validation_compliance` `validation_data_integrity` `validation_permission` `validation_decision` `validation_chain` `validation_report` `validation_report_export` `validation_run`

### 17. Report & Evidence（2）
`evidence_pack` `evidence_index`

### 18. Contract & Correlate（5）
`contract_baseline` `contract_guard` `correlate_triple_check` `trace_correlate` `correlate_consistency_check`

### 19. Error Analysis（3）
`error_fix_suggestion` `error_summary_md` `debug_investigate`

### 20. Memory & ATL（3）
`memory_recall` `atl_learn` `atl_fix`

### 21. Exploration & System（9）
`exploration_quick` `dual_chain_explore` `mcp_health_check` `mcp_self_test` `project_audit` `skill_mcp_validate` `css_var_check` `skill_tools_map` `skill_consistency_check`

### 22. Chain & Business（6）
`chain_list_templates` `chain_score_report` `chain_spec_run` `business_loop_validate` `bypass_login` `state_diff_assert`

## 推荐工具链组合（按场景）

| 场景 | 工具链 | 详细文档 |
|---|---|---|
| 登录流程验证 | open → snapshot → form_fill → click → wait → assert → evidence_pack | [登录 Skill](../skills/login-validation) |
| 表单提交验证 | open → snapshot → form_validate → form_fill → click → assert → evidence_pack | [表单 Skill](../skills/form-submission) |
| 视觉回归 | open → visual_baseline → visual_compare → visual_report → evidence_pack | [视觉 Skill](../skills/visual-regression) |
| 安全审计 | security_headers → security_csp → security_owasp → security_sqli → security_xss → evidence_pack | [安全 Skill](../skills/security-audit) |
| 性能审计 | open → lighthouse → performance_check → performance_trace → memory_check → evidence_pack | [性能 Skill](../skills/performance-audit) |
| 端到端流程 | validation_run → evidence_index → validation_report → validation_report_export | [E2E Skill](../skills/e2e-flow) |
| 调试排查 | open → errors_clear → (复现) → debug_investigate → errors → network_detail → console → error_fix → evidence_pack | [调试 Skill](../skills/debug-investigation) |

## MCP Prompts 速查（v1.9.3+）

斜杠命令快速启动工作流：

| 命令 | 用途 | 参数 |
|---|---|---|
| `/validate-login` | 登录流程验证 | url, username, password, successIndicator |
| `/submit-form` | 表单提交验证 | url, fields, formSelector, submitSelector, expectedText, expectedUrlContains |
| `/audit-performance` | 性能审计 | url, formFactor, throttling |
| `/audit-security` | 安全审计 | url, injectionUrl |
| `/visual-regression` | 视觉回归 | url, baselineName, selector, maxDiffPixelRatio |
| `/debug-page` | 调试排查 | url, symptom, expected, focus |
| `/e2e-flow` | 端到端流程 | url, flowName, flowDescription |

## 相关文档

- [工具总览](../tools/overview) — 136 工具按 22 类分组
- [Skill 指导总览](../skills/index) — 场景化工具链用法手册
- [Skill↔Tool 映射表](./skill-tools-map) — 7 Skill × 工具链双向映射（v1.9.3+）
- [场景手册](../scenarios/ecommerce-checkout) — 跨 Skill 业务场景 Playbook
- [MCP 协议速查](./mcp-cheatsheet) — MCP 客户端配置
