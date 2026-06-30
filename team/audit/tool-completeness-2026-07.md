# ai-verify-mcp 工具完整性审计报告
> 日期：2026-06-30 | 版本：v1.2.0+

## 概览

| 指标 | 数量 |
|------|------|
| Schema 文件数（tools/*.json） | 87 |
| Handler 模块数 | 9（+1 state 共享状态） |
| Handler 覆盖工具数 | 87 |
| 差异 - 仅 Schema 有 | 0 |
| 差异 - 仅 Handler 有 | 0 |
| 有专用测试覆盖的工具 | 20 |
| 无专用测试覆盖的工具 | 67 |
| 桩代码/占位实现 | 5 |

## 三方完整性结论

**✅ Schema ↔ Handler 100% 匹配**，无缺失或冗余。每个 `tools/*.json` 文件都在对应 handler 的 `tools[]` 数组中注册，且每个 handler 中的工具都有对应的 JSON schema 文件。

## 审计清单

### Handler: browser.js（20 工具）

| # | 工具名 | Schema | Handler | 实现 | 测试 | 状态 |
|---|--------|--------|---------|------|------|------|
| 1 | browser_open | ✅ tools/browser_open.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |
| 2 | browser_click | ✅ tools/browser_click.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |
| 3 | browser_click_audit | ✅ tools/browser_click_audit.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |
| 4 | browser_type | ✅ tools/browser_type.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |
| 5 | browser_hover | ✅ tools/browser_hover.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |
| 6 | browser_scroll | ✅ tools/browser_scroll.json | ✅ browser.js | ✅ 有实现 | ✅ browser_p1 | PASS |
| 7 | browser_press_key | ✅ tools/browser_press_key.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |
| 8 | browser_snapshot | ✅ tools/browser_snapshot.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |
| 9 | browser_batch | ✅ tools/browser_batch.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |
| 10 | browser_eval | ✅ tools/browser_eval.json | ✅ browser.js | ✅ 有实现 | ✅ eval_security | PASS |
| 11 | browser_dom | ✅ tools/browser_dom.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |
| 12 | browser_highlight | ✅ tools/browser_highlight.json | ✅ browser.js | ✅ 有实现 | ✅ browser_p1 | PASS |
| 13 | browser_select | ✅ tools/browser_select.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |
| 14 | browser_navigate | ✅ tools/browser_navigate.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |
| 15 | browser_wait | ✅ tools/browser_wait.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |
| 16 | browser_assert | ✅ tools/browser_assert.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |
| 17 | browser_flow | ✅ tools/browser_flow.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |
| 18 | browser_instrument | ✅ tools/browser_instrument.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |
| 19 | browser_events | ✅ tools/browser_events.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |
| 20 | browser_events_clear | ✅ tools/browser_events_clear.json | ✅ browser.js | ✅ 有实现 | ❌ | PASS |

### Handler: session.js（4 工具）

| # | 工具名 | Schema | Handler | 实现 | 测试 | 状态 |
|---|--------|--------|---------|------|------|------|
| 21 | browser_sessions | ✅ tools/browser_sessions.json | ✅ session.js | ✅ 有实现 | ❌ | PASS |
| 22 | browser_session_create | ✅ tools/browser_session_create.json | ✅ session.js | ✅ 有实现 | ❌ | PASS |
| 23 | browser_session_switch | ✅ tools/browser_session_switch.json | ✅ session.js | ✅ 有实现 | ❌ | PASS |
| 24 | browser_session_close | ✅ tools/browser_session_close.json | ✅ session.js | ✅ 有实现 | ❌ | PASS |

### Handler: evidence.js（8 工具）

| # | 工具名 | Schema | Handler | 实现 | 测试 | 状态 |
|---|--------|--------|---------|------|------|------|
| 25 | browser_screenshot | ✅ tools/browser_screenshot.json | ✅ evidence.js | ✅ 有实现 | ❌ | PASS |
| 26 | browser_screenshot_element | ✅ tools/browser_screenshot_element.json | ✅ evidence.js | ✅ 有实现 | ❌ | PASS |
| 27 | browser_artifacts | ✅ tools/browser_artifacts.json | ✅ evidence.js | ✅ 有实现 | ❌ | PASS |
| 28 | browser_artifacts_clear | ✅ tools/browser_artifacts_clear.json | ✅ evidence.js | ✅ 有实现 | ❌ | PASS |
| 29 | browser_har_export | ✅ tools/browser_har_export.json | ✅ evidence.js | ✅ 有实现 | ❌ | PASS |
| 30 | browser_step | ✅ tools/browser_step.json | ✅ evidence.js | ✅ 有实现 | ❌ | PASS |
| 31 | browser_trace_start | ✅ tools/browser_trace_start.json | ✅ evidence.js | ✅ 有实现 | ❌ | PASS |
| 32 | browser_trace_stop | ✅ tools/browser_trace_stop.json | ✅ evidence.js | ✅ 有实现 | ❌ | PASS |

### Handler: network.js（7 工具）

| # | 工具名 | Schema | Handler | 实现 | 测试 | 状态 |
|---|--------|--------|---------|------|------|------|
| 33 | browser_network | ✅ tools/browser_network.json | ✅ network.js | ✅ 有实现 | ✅ browser_p2 | PASS |
| 34 | browser_network_detail | ✅ tools/browser_network_detail.json | ✅ network.js | ✅ 有实现 | ✅ browser_p2 | PASS |
| 35 | browser_console | ✅ tools/browser_console.json | ✅ network.js | ✅ 有实现 | ✅ browser_p2 | PASS |
| 36 | browser_errors | ✅ tools/browser_errors.json | ✅ network.js | ✅ 有实现 | ✅ browser_p2 | PASS |
| 37 | browser_errors_clear | ✅ tools/browser_errors_clear.json | ✅ network.js | ✅ 有实现 | ❌ | PASS |
| 38 | browser_storage | ✅ tools/browser_storage.json | ✅ network.js | ✅ 有实现 | ❌ | PASS |
| 39 | browser_cookies | ✅ tools/browser_cookies.json | ✅ network.js | ✅ 有实现 | ❌ | PASS |

### Handler: diagnose.js（9 工具）

| # | 工具名 | Schema | Handler | 实现 | 测试 | 状态 |
|---|--------|--------|---------|------|------|------|
| 40 | browser_diagnose | ✅ tools/browser_diagnose.json | ✅ diagnose.js | ✅ 有实现 | ✅ browser_p0 | PASS |
| 41 | browser_debug_report | ✅ tools/browser_debug_report.json | ✅ diagnose.js | ✅ 有实现 | ❌ | PASS |
| 42 | browser_element_status | ✅ tools/browser_element_status.json | ✅ diagnose.js | ✅ 有实现 | ✅ browser_p0 | PASS |
| 43 | browser_quick_fix | ✅ tools/browser_quick_fix.json | ✅ diagnose.js | ✅ 有实现 | ✅ browser_p0 | PASS |
| 44 | browser_verify_fix | ✅ tools/browser_verify_fix.json | ✅ diagnose.js | ✅ 有实现 | ✅ browser_p0 | PASS |
| 45 | browser_errors_aggregate | ✅ tools/browser_errors_aggregate.json | ✅ diagnose.js | ✅ 有实现 | ✅ browser_p2 | PASS |
| 46 | error_fix_suggestion | ✅ tools/error_fix_suggestion.json | ✅ diagnose.js | ✅ 有实现 | ✅ error_fix_suggestion | PASS |
| 47 | error_summary_md | ✅ tools/error_summary_md.json | ✅ diagnose.js | ✅ 有实现 | ❌ | PASS |
| 48 | debug_investigate | ✅ tools/debug_investigate.json | ✅ diagnose.js | ✅ 有实现 | ❌ | PASS |

### Handler: validation.js（11 工具）

| # | 工具名 | Schema | Handler | 实现 | 测试 | 状态 |
|---|--------|--------|---------|------|------|------|
| 49 | validation_start | ✅ tools/validation_start.json | ✅ validation.js | ✅ 有实现 | ❌ | PASS |
| 50 | validation_check | ✅ tools/validation_check.json | ✅ validation.js | ✅ 有实现 | ✅ validation_check | PASS |
| 51 | validation_run | ✅ tools/validation_run.json | ✅ validation.js | ✅ 有实现 | ❌ | PASS |
| 52 | validation_suite_run | ✅ tools/validation_suite_run.json | ✅ validation.js | ⚠️ 付费占位 | ❌ | PASS* |
| 53 | validation_element | ✅ tools/validation_element.json | ✅ validation.js | ✅ 有实现 | ✅ validation_element | PASS |
| 54 | validation_flow | ✅ tools/validation_flow.json | ✅ validation.js | ✅ 有实现 | ✅ validation_flow | PASS |
| 55 | validation_report | ✅ tools/validation_report.json | ✅ validation.js | ✅ 有实现 | ❌ | PASS |
| 56 | validation_report_export | ✅ tools/validation_report_export.json | ✅ validation.js | ✅ 有实现 | ❌ | PASS |
| 57 | validation_quick_run | ✅ tools/validation_quick_run.json | ✅ validation.js | ✅ 有实现 | ✅ validation_quick_run | PASS |
| 58 | validation_matrix | ✅ tools/validation_matrix.json | ✅ validation.js | ⚠️ 闭源占位 | ❌ | PASS* |
| 59 | validation_decision | ✅ tools/validation_decision.json | ✅ validation.js | ⚠️ 闭源占位 | ❌ | PASS* |

### Handler: visual.js（8 工具）

| # | 工具名 | Schema | Handler | 实现 | 测试 | 状态 |
|---|--------|--------|---------|------|------|------|
| 60 | browser_visual_baseline | ✅ tools/browser_visual_baseline.json | ✅ visual.js | ✅ 有实现 | ❌ | PASS |
| 61 | browser_visual_compare | ✅ tools/browser_visual_compare.json | ✅ visual.js | ✅ 有实现 | ❌ | PASS |
| 62 | browser_visual_report | ✅ tools/browser_visual_report.json | ✅ visual.js | ✅ 有实现 | ❌ | PASS |
| 63 | browser_a11y_check | ✅ tools/browser_a11y_check.json | ✅ visual.js | ✅ 有实现 | ❌ | PASS |
| 64 | screenshot_diff | ✅ tools/screenshot_diff.json | ✅ visual.js | ✅ 有实现 | ❌ | PASS |
| 65 | browser_full_audit | ✅ tools/browser_full_audit.json | ✅ visual.js | ✅ 有实现 | ❌ | PASS |
| 66 | browser_performance_check | ✅ tools/browser_performance_check.json | ✅ visual.js | ✅ 有实现 | ❌ | PASS |
| 67 | browser_lighthouse_audit | ✅ tools/browser_lighthouse_audit.json | ✅ visual.js | ✅ 有实现 | ❌ | PASS |

### Handler: locator.js（4 工具）

| # | 工具名 | Schema | Handler | 实现 | 测试 | 状态 |
|---|--------|--------|---------|------|------|------|
| 68 | browser_find_element | ✅ tools/browser_find_element.json | ✅ locator.js | ✅ 有实现 | ❌ | PASS |
| 69 | browser_find_page | ✅ tools/browser_find_page.json | ✅ locator.js | ✅ 有实现 | ✅ browser_p1 | PASS |
| 70 | browser_locator_suggest | ✅ tools/browser_locator_suggest.json | ✅ locator.js | ✅ 有实现 | ❌ | PASS |
| 71 | browser_locator_validate | ✅ tools/browser_locator_validate.json | ✅ locator.js | ✅ 有实现 | ❌ | PASS |

### Handler: system.js（16 工具）

| # | 工具名 | Schema | Handler | 实现 | 测试 | 状态 |
|---|--------|--------|---------|------|------|------|
| 72 | project_audit | ✅ tools/project_audit.json | ✅ system.js | ✅ 有实现 | ✅ project_audit_sql_col | PASS |
| 73 | css_var_check | ✅ tools/css_var_check.json | ✅ system.js | ✅ 有实现 | ❌ | PASS |
| 74 | skill_mcp_validate | ✅ tools/skill_mcp_validate.json | ✅ system.js | ✅ 有实现 | ❌ | PASS |
| 75 | skill_mcp_sync | ✅ tools/skill_mcp_sync.json | ✅ system.js | ✅ 有实现 | ❌ | PASS |
| 76 | browser_trace_chain | ✅ tools/browser_trace_chain.json | ✅ system.js | ✅ 有实现 | ❌ | PASS |
| 77 | backend_logs | ✅ tools/backend_logs.json | ✅ system.js | ✅ 有实现 | ❌ | PASS |
| 78 | browser_full_regression | ✅ tools/browser_full_regression.json | ✅ system.js | ✅ 有实现 | ❌ | PASS |
| 79 | browser_deep_interact | ✅ tools/browser_deep_interact.json | ✅ system.js | ✅ 有实现 | ❌ | PASS |
| 80 | browser_links | ✅ tools/browser_links.json | ✅ system.js | ✅ 有实现 | ✅ browser_p1 | PASS |
| 81 | browser_traverse_menu | ✅ tools/browser_traverse_menu.json | ✅ system.js | ✅ 有实现 | ❌ | PASS |
| 82 | mcp_health_check | ✅ tools/mcp_health_check.json | ✅ system.js | ✅ 有实现 | ❌ | PASS |
| 83 | mcp_self_test | ✅ tools/mcp_self_test.json | ✅ system.js | ✅ 有实现 | ❌ | PASS |
| 84 | benchmark_run | ✅ tools/benchmark_run.json | ✅ system.js | ⚠️ 闭源占位 | ❌ | PASS* |
| 85 | ai_debug_investigate | ✅ tools/ai_debug_investigate.json | ✅ system.js | ⚠️ 闭源占位 | ❌ | PASS* |
| 86 | auto_fix_pipeline | ✅ tools/auto_fix_pipeline.json | ✅ system.js | ✅ 有实现 | ❌ | PASS |
| 87 | fix_verify | ✅ tools/fix_verify.json | ✅ system.js | ✅ 有实现 | ❌ | PASS |

## 差异详细

### 仅 Schema 有的工具
**无。** 所有 87 个 schema 文件均有对应的 handler 注册。

### 仅 Handler 有的工具
**无。** 所有 handler 中注册的工具均存在对应的 JSON schema 文件。

## 桩代码 / 占位实现（5 个）

以下工具在 handler 中有注册和处理分支，但返回的是占位信息而非完整实现：

| # | 工具名 | Handler | 占位说明 |
|---|--------|---------|----------|
| 1 | validation_suite_run | validation.js | 付费功能占位：返回 "该工具为付费版本功能，请升级到团队版或企业版" |
| 2 | validation_matrix | validation.js | 闭源占位：返回 "validation_matrix: 权限矩阵验证。该能力在闭源端完整实现，开源版本仅作为占位" |
| 3 | validation_decision | validation.js | 闭源占位：返回 "validation_decision: 决策建议。该能力在闭源端完整实现，开源版本仅作为占位" |
| 4 | benchmark_run | system.js | 闭源占位：返回 "benchmark_run: 基准测试。该能力在闭源端完整实现，开源版本仅作为占位" |
| 5 | ai_debug_investigate | system.js | 闭源占位：返回 "ai_debug_investigate: AI调试调查。该能力在闭源端完整实现，开源版本建议使用 debug_investigate" |

## 测试覆盖详情

### 有专用测试的工具（20 个）

| 工具名 | 测试文件 | 测试类型 |
|--------|----------|----------|
| browser_diagnose | test/browser_p0.test.js | Schema + handler + toolNames 注册验证 |
| browser_element_status | test/browser_p0.test.js | Schema + handler + toolNames 注册验证 |
| browser_quick_fix | test/browser_p0.test.js | Schema + handler + toolNames 注册验证 |
| browser_verify_fix | test/browser_p0.test.js | Schema + handler + toolNames 注册验证 |
| browser_find_page | test/browser_p1.test.js | Schema + handler + toolNames 注册验证 |
| browser_links | test/browser_p1.test.js | Schema + handler + toolNames 注册验证 |
| browser_highlight | test/browser_p1.test.js | Schema + handler + toolNames 注册验证 |
| browser_scroll | test/browser_p1.test.js | Schema + handler + toolNames 注册验证 |
| browser_network | test/browser_p2.test.js | Schema + handler + toolNames 注册验证 |
| browser_network_detail | test/browser_p2.test.js | Schema + handler + toolNames 注册验证 |
| browser_console | test/browser_p2.test.js | Schema + handler + toolNames 注册验证 |
| browser_errors | test/browser_p2.test.js | Schema + handler + toolNames 注册验证 |
| browser_errors_aggregate | test/browser_p2.test.js | Schema + handler + toolNames 注册验证 |
| browser_eval | test/browser_eval_security.test.js | 安全审计：拒绝危险表达式、放行安全表达式 |
| validation_check | test/validation_check.test.js | Schema + handler + toolNames 注册验证 |
| validation_element | test/validation_element.test.js | Schema + handler + toolNames 注册验证 |
| validation_flow | test/validation_flow.test.js | Schema + handler + toolNames + 运行时功能测试 |
| validation_quick_run | test/validation_quick_run.test.js | Schema + handler + toolNames 注册验证 |
| error_fix_suggestion | test/error_fix_suggestion.test.js | Schema + handler + toolNames + 模式匹配逻辑 |
| project_audit | test/project_audit_sql_col.test.js | SQL-COL 检测专项 |

### 通用测试（覆盖所有工具的 schema）
- **test/tools.test.js**：验证所有 tools/*.json 是合法 JSON、具有必要字段（name/description/inputSchema），且 handlerMap 覆盖所有 schema 工具。

### 无专用测试的工具（67 个）

按 Handler 分组：

**browser.js（17 个）**：browser_open, browser_click, browser_click_audit, browser_type, browser_hover, browser_press_key, browser_snapshot, browser_batch, browser_dom, browser_select, browser_navigate, browser_wait, browser_assert, browser_flow, browser_instrument, browser_events, browser_events_clear

**session.js（4 个）**：browser_sessions, browser_session_create, browser_session_switch, browser_session_close

**evidence.js（8 个）**：browser_screenshot, browser_screenshot_element, browser_artifacts, browser_artifacts_clear, browser_har_export, browser_step, browser_trace_start, browser_trace_stop

**network.js（3 个）**：browser_errors_clear, browser_storage, browser_cookies

**diagnose.js（3 个）**：browser_debug_report, error_summary_md, debug_investigate

**validation.js（7 个）**：validation_start, validation_run, validation_suite_run, validation_report, validation_report_export, validation_matrix, validation_decision

**visual.js（8 个）**：browser_visual_baseline, browser_visual_compare, browser_visual_report, browser_a11y_check, screenshot_diff, browser_full_audit, browser_performance_check, browser_lighthouse_audit

**locator.js（3 个）**：browser_find_element, browser_locator_suggest, browser_locator_validate

**system.js（14 个）**：css_var_check, skill_mcp_validate, skill_mcp_sync, browser_trace_chain, backend_logs, browser_full_regression, browser_deep_interact, browser_traverse_menu, mcp_health_check, mcp_self_test, benchmark_run, ai_debug_investigate, auto_fix_pipeline, fix_verify

## Handler 模块分布

| Handler 文件 | 工具数 | 行数（约） |
|-------------|--------|-----------|
| handlers/browser.js | 20 | ~750 |
| handlers/system.js | 16 | ~505 |
| handlers/validation.js | 11 | ~102 |
| handlers/diagnose.js | 9 | ~1304 |
| handlers/evidence.js | 8 | ~140 |
| handlers/visual.js | 8 | ~76 |
| handlers/network.js | 7 | ~133 |
| handlers/session.js | 4 | ~73 |
| handlers/locator.js | 4 | ~51 |
| handlers/state.js | 0（共享状态） | — |

## 结论

1. **Schema ↔ Handler 匹配度：100%** — 87 个 JSON schema 与 87 个 handler 注册的工具完全一一对应，无遗漏、无冗余。
2. **实现质量：82/87 有完整实现（94.3%）** — 5 个工具为闭源/付费版的占位实现，在开源版本中属于预期行为。
3. **测试覆盖率：20/87 有专用测试（23.0%）** — 测试覆盖率偏低，大量工具仅通过 tools.test.js 进行 schema 格式验证，缺乏运行时行为和集成测试。
4. **建议**：
   - 为高频工具（browser_open, browser_click, browser_screenshot 等）补充基本功能测试
   - 为 session/evidence 模块补充测试
   - 占位工具可在后续闭源版本发布后补充完整实现和测试
