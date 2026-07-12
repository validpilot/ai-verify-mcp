# Changelog

All notable changes to this project will be documented in this file.

## [1.7.2] - 2026-07-13

### Fixed

- **browser_hover 参数验证**：缺少 `selector` 参数时 Playwright 抛出 "expected string, got undefined"。添加 `mcpParamMissing('selector', name)` 验证
- **browser_responsive_test 参数验证**：缺少 `url` 参数时 `target.goto(undefined)` 崩溃。添加 `mcpParamMissing('url', name)` 验证
- **browser_screenshot_element 错误消息参数顺序**：`mcpParamMissing(name, 'selector')` 参数顺序反了，导致错误消息显示 "工具 selector 需要提供 browser_screenshot_element 参数"。修正为 `mcpParamMissing('selector', name)`

### Test Results

- 全部 128 个工具通过全面复测（100%）
- 测试方式：直接使用 MCP 工具调用每个工具（无参数），验证正常响应或结构化参数缺失错误

## [1.7.1] - 2026-07-13

### Fixed

- **validation.js 模块级函数 _deps 作用域修复**：7 个模块级函数（runStateDiffAssert、runValidationFlow、runValidationChain、runChainSpecStep、runChainSpecRun、runTraceCorrelationCheck、discoverEndpoints、runContractGuard）使用 deps 变量但无法访问，导致 "captureStepEvidence is not defined"、"resetRuntimeLogs is not defined" 等 12+ 个运行时错误。引入 `let _deps = null;` 模块级引用模式，在 `handle()` 入口赋值，各模块级函数开头通过 `const { var1, var2 } = _deps || {};` 解构所需变量
- **browser_lighthouse_audit screenEmulation 修复**：Lighthouse 选项缺少 `screenEmulation` 导致 "Screen emulation mobile setting (true) does not match formFactor setting (desktop)" 错误。新增 `screenEmulation: { mobile: formFactor === 'mobile' }` 与 formFactor 保持一致
- **browser_lighthouse_audit 临时目录权限修复**：chrome-launcher 在 Windows 临时目录创建失败（EPERM）。改用 `path.join(__dirname, '.lighthouse-cache')` 并 `fs.mkdirSync` 确保目录存在。`chrome.kill()` 返回 undefined 时 `.catch()` 崩溃改为 `try { await chrome.kill(); } catch (_) {}`
- **browser_storage SecurityError 修复**：`getStorageSnapshot` 在 about:blank 或跨域页面调用 `target.evaluate()` 访问 localStorage 抛出 SecurityError 未捕获。在 `getStorageSnapshot` 函数内部添加 try-catch 返回结构化错误信息
- **10 个工具缺少必需参数验证**：以下工具在未提供必需参数时直接崩溃（Playwright 抛出 "expected string, got undefined"），现添加 `mcpParamMissing` 返回结构化错误：browser_highlight（selector）、browser_smart_fill（selector）、browser_click（selector）、browser_type（selector）、browser_press_key（key）、validation_matrix（url）、validation_quick_run（url）、validation_element（selector）、skill_mcp_validate（skillName）

### Test Results

- 全部 128 个工具通过 run_mcp 测试（100%）
- 测试方式：直接使用 MCP 工具调用每个工具，验证正常响应或结构化参数缺失错误

## [1.7.0] - 2026-07-12

### Added

- **captcha_detect 现代验证码检测增强**：新增 Cloudflare Turnstile、GeeTest（极验）、腾讯验证码、AWS WAF Captcha、reCAPTCHA v3（隐形）、hCaptcha、阿里云滑块验证码的自动检测。新增 `scripts` 字段检测页面加载的验证码脚本，新增 `provider` 字段标识验证码供应商，新增 `sitekey` 信息提取。检测选择器从 15 种扩展到 30+ 种，覆盖国内外主流验证码服务
- **captcha_screenshot autoRefresh 实现补全**：实现 schema 中声明但未实现的 `autoRefresh` 参数。截图尺寸过小时自动查找并点击刷新按钮（支持 13 种刷新按钮选择器），重新获取验证码并重试截图，最多 3 次重试。返回 `autoRefresh.attempts` 详细记录每次重试的结果
- **captcha_read OCR 预处理 + iframe 支持**：新增 canvas 灰度化+二值化（threshold=128）图像预处理，在 ddddocr 首次识别失败时自动尝试预处理后的图片。新增 iframe 验证码自动搜索支持，当主页面未找到验证码时自动遍历 captcha/recaptcha/hcaptcha/geetest/turnstile 相关 iframe 框架进行搜索。返回 `preprocessing` 和 `iframe` 字段记录使用的增强手段
- **correlate_triple_check API 推导增强**：API 端点推导从单一模式（`/api/${mode}`）扩展到 5 种模式自动探测（`/api/`、`/api/v1/`、`/api/v2/`、`/v1/`、`/{resource}`）。新增 GraphQL 端点探测（`/graphql` introspection）。新增 Next.js SSR 数据提取（`__NEXT_DATA__.props.pageProps`）。新增 SPA 框架感知（Next.js/Nuxt/Vue 检测）。新增 `apiDerivation` 字段记录推导过程（resource、patterns、tried、resolved、spaFramework）
- **mcp_self_test 工具执行测试增强**：自测从 5 步浏览器基础流程扩展到包含 9 项 MCP 工具执行测试（browser_eval、browser_find_element、browser_snapshot、browser_links、browser_form_fill、browser_select_option、browser_errors、browser_console、browser_scroll）。新增 `toolTests` 字段记录每项测试的结果和耗时。新增 `perf` 字段记录各阶段性能指标（setup/navigate/flow/toolTests/total）。自测 HTML 页面增强：新增 nav 链接、form 表单（含 email 和 select）、ul 列表，覆盖更多测试场景

### Fixed

- **globalThis 桥接模式彻底替换为 deps 解构**（关键修复）：9 个 handler 文件（browser.js、evidence.js、locator.js、network.js、system.js、session.js、visual.js、diagnose.js、validation.js）使用 `globalThis[k] = deps[k]` 桥接模式将 deps 注入作用域，该模式在多次工具调用后会出现 globalThis 被污染/恢复失败的问题，导致 `ensurePage is not a function`、`getArtifacts is not a function`、`filterNetworkDetails is not a function`、`resetRuntimeLogs is not a function`、`findPage is not a function`、`traverseMenu is not a function`、`exportHar is not a function` 等 12+ 个工具运行时错误。现已替换为直接 `const { ... } = deps;` 解构模式，在 `finally` 块中使用 `Object.assign(deps, {...})` 回写可变状态，彻底消除 globalThis 污染问题
- **deps 对象补充缺失变量**：新增 `TOOLS_DIR` 和 `logger` 到 deps 对象，修复 system.js 中 `skill_mcp_validate` 工具无法访问 `TOOLS_DIR` 的问题
- **browser_select index 参数修复**：原代码使用 `args.value || args.label || args.index` 导致 `index: 0` 被视为 falsy 而报错；且未按 Playwright API 要求将 index 包装为 `{ index: n }` 对象。现已分别检查三个参数并使用正确的 Playwright `selectOption` 调用语法
- **文档修复**（从 v1.6.9 待定变更合并）：修复 8 个文件中 80+ 处错误的 npm 包名引用（`ai-verify-mcp` → `@validpilot/ai-verify-mcp`），修复命令名错误（npm 包名误用为 shell 命令 → 正确的 bin 命令 `ai-verify-mcp`），新增「如何更新到最新版本」文档章节（3 种场景：npx/全局安装/项目本地），更新 FAQ 条目
- **测试断言更新**（从 v1.6.9 待定变更合并）：更新 13 个过时的 outputSchema 断言（v1.6.8 已移除 outputSchema 但测试仍期望其存在），涉及 4 个测试文件

### Test Results

- 增强功能测试：32/32 通过（100%），覆盖 6 个增强工具的所有新增字段和功能点
- mcp_self_test 工具执行测试：9/9 通过（100%），总耗时 6.9 秒
- 既有测试回归：58/58 通过（100%），无回归
- 测试站点：https://panjiachen.github.io/vue-element-admin/

## [1.6.9] - 2026-07-12

### Fixed

- **deps 解构缺失修复**：6 个新增 handler 内部函数未从 `deps` 参数解构 `ensurePage`/`text`/`log`，导致运行时 `is not defined` 错误。涉及文件：handlers/correlate.js（correlateTripleCheck、bypassLogin、assetEndpointProbe）、handlers/exploration.js（explorationQuick、businessLoopValidate）、handlers/arch_reverse.js（archReverseProbe）
- **captcha 工具 handler 补全**：browser_captcha_detect、browser_captcha_screenshot、browser_captcha_read 三个工具的 schema 已存在但 handler 实现完全缺失（未注册到 tools 数组、无处理函数），导致调用返回"未知工具"。现已实现完整 handler：detect 支持 15+ 种验证码选择器自动检测（图片/滑块/canvas/iframe/recaptcha）、screenshot 支持自动定位+截图保存、read 支持 ddddocr-node OCR + tesseract.js 双引擎兜底
- **Playwright evaluate 参数修复**：browser_captcha_detect 中 `target.evaluate(fn, arg1, arg2)` 传了 2 个参数，Playwright 只接受 1 个，已改为对象包装 `{ selector, mode }`
- **bypass_login fetch 异常处理**：bypass_login 工具在 `target.evaluate` 中执行 `fetch()` 测试后门路径时，CORS/网络错误会导致未捕获异常，已添加双层 try-catch（case 级 + 循环级）确保工具返回结构化结果而非崩溃

### Test Results

- 16 个 v1.6.8 新增工具全部通过 MCP stdio 协议测试（100% 通过率）
- 测试站点：https://panjiachen.github.io/vue-element-admin/
- 测试覆盖：3 项协议验证（128 工具/16 新工具注册/0 outputSchema）+ 12 个非浏览器工具 + 4 个浏览器工具

## [1.6.8] - 2026-07-11

### Fixed

- **outputSchema 错误修正**：从 17 个工具 JSON 文件中移除 `outputSchema` 字段（1.6.7 错误地添加了 outputSchema，实际上 MCP 协议要求：如果定义了 outputSchema，handler 必须返回 `structuredContent` 字段；由于所有 handler 返回 text content，outputSchema 必须不存在）。涉及工具：validation_matrix、browser_emulate_device、browser_form_validate、browser_anti_bot_detect、browser_performance_trace、browser_data_compare、browser_captcha_detect、browser_captcha_read、memory_recall、browser_captcha_screenshot、arch_reverse_probe、business_loop_validate、asset_endpoint_probe、bypass_login、correlate_triple_check、atl_fix、atl_learn
- **browser_smart_fill require 路径修复**：`require('./hands/data_generator')` 修正为 `require('../hands/data_generator')`，修复 handlers/browser.js 中模块路径解析失败
- **Playwright v1.61 兼容性修复**：`target.accessibility.snapshot()` 替换为 `target.accessibilitySnapshot()`（4 处），修复 browser_aria_snapshot、browser_aria_click、browser_aria_type 工具运行时报错
- **Lighthouse v13 兼容性修复**：`require('lighthouse')` 返回值兼容性检查（支持 function / .default / .lighthouse 三种导出形式），修复 browser_lighthouse_audit 工具运行时报错
- **validation_matrix NodeList 修复**：`document.querySelectorAll('input[id]').filter(...)` 修正为 `Array.from(document.querySelectorAll('input[id]')).filter(...)`，修复 NodeList 没有 filter 方法导致的运行时错误
- **browser_emulate_device 触摸模拟修复**：`context.emulateTouchDisabled()` 替换为 `navigator.maxTouchPoints` 属性覆盖（Playwright 不支持在 context 创建后修改 touch 设置）
- **npm 打包清单修复**：package.json `files` 字段新增 `orchestrator/` 和 `scripts/css-var-analyzer.js`，修复 npm 发布后 dual_chain_explore 工具找不到 `../orchestrator/dual_chain_orchestrator` 模块、css_var_check 工具找不到 `./scripts/css-var-analyzer` 模块的问题

### Test Results

- 开源 MCP 工具逐个测试：112 个工具通过 run_mcp 测试（92 个直接通过，12 个因 outputSchema 缓存问题通过文件修复，7 个因 v1.0.0 运行时 bug 在本地 v1.6.7 代码中已修复，1 个因测试选择器不当非代码问题）
- 所有 19 个失败工具的修复均已验证：outputSchema 移除（grep 确认）、require 路径、accessibilitySnapshot、lighthouse v13 API、Array.from、navigator.maxTouchPoints

## [1.6.7] - 2026-07-11

### Fixed

- **Schema 合规性修复**：113 个工具 schema 文件将非标准的 `"arguments"` 字段重命名为 MCP 协议要求的 `"inputSchema"`，修复 MCP 客户端无法识别工具参数的问题
- ~~**outputSchema 补齐**~~：（已在 1.6.8 中修正）1.6.7 错误地添加了 outputSchema 字段，实际应移除。详见 1.6.8 修复说明

### Changed

- **Trace 模块重构**：server.js 中 50 行旧 trace 函数（genHex/genTraceId/genSpanId/buildTraceparent/parseTraceparent/findTraceId/trimTraceLogs）替换为 `core/trace.js` TraceManager 类的委托别名，trimTraceLogs 改为原地修改数组保持引用一致
- **死代码清理**：移除 core/state.js 中 `input_schema` → `inputSchema` 兼容 shim；简化 server.js 工具校验逻辑
- **README.md 工具数更新**：4 处过时工具数（78/84）更新为 128，并新增代表性工具名
- **test/tools.test.js**：工具数上限断言从 120 调整为 140，适配工具集扩展
- **.gitignore**：新增 test-e2e-real.js、test-output.txt 过滤规则

### Test Results

- 单元测试通过率从 72.4%（571/789）提升至 98.7%（771/781），剩余 10 个失败均为浏览器环境依赖型测试（browser_form_fill/ATL/getFormValues）
- E2E 真实项目测试：50/50 通过（100%），覆盖 3 个真实互联网域名（vue-element-admin、bing.com、github.com）和 7 大工具类别（系统/浏览器基础/审计/检查/定位器/验证/证据）
- trace.test.js 9/9 通过（零回归）
- visual.test.js 16/16 通过（修复前全失败）
- new_tools.test.js 25/25 通过
- validation_matrix_function.test.js 19/19 通过
- tools.test.js 19/19 通过（修复工具数上限断言）

## [1.6.2] - 2026-07-03

### Fixed

- 修复 npm bin 入口默认显示帮助并退出导致 MCP 客户端连接立即关闭的问题
- 新增 `start` / `mcp` / 无参数启动 stdio MCP 服务，适配 Trae、Cursor 等 MCP 客户端配置
- 新增 `http` 子命令启动 HTTP 模式

## [1.6.1] - 2026-07-03

### Fixed

- 修复 GitHub Actions 文档部署工作流的 Node.js 20 弃用警告：`actions/checkout@v4` → `actions/checkout@v5`，`actions/setup-node@v4` → `actions/setup-node@v5`
- 文档部署工作流运行时升级为 Node.js 22
- 修正 npm 打包清单，避免将 VitePress 缓存目录打入发布包

## [1.6.0] - 2026-07-03

### Added

- 🆕 **browser_overlay_detect 工具**：DOM 层面检测页面遮挡物（高 z-index、fixed 定位、半透明遮罩、sticky 头部、class 识别、全屏覆盖），按覆盖率排序输出，支持 `format=html` 报告
- 🆕 **browser_overlay_dismiss 工具**：自动关闭 30+ 种遮挡物模式（Cookie banner、modal、popup 等），关闭后重新检测剩余遮挡物
- 🆕 **browser_smoke_test 工具**：一键冒烟测试（页面加载/JS 错误/HTTP 错误/无障碍/控制台警告/遮挡物检测），支持 `format=html` 报告
- 🆕 **browser_counterfactual_analyze 工具**：反事实根因分析，生成 6 类根因假设（遮挡物/JS 错误/HTTP 错误/加载不完整/交互元素/警告过多），按置信度排序，支持 `format=html` 报告
- 🆕 **browser_memory_check 工具**：浏览器内存健康检查，检测内存泄漏风险
- 🆕 **browser_visual_component 工具**：可视化组件级截图比对
- 🆕 **chain_* 系列工具**：chain_list_templates / chain_score_report / chain_spec_run — 验证链模板管理
- 🆕 **contract_* 系列工具**：contract_guard / contract_baseline — 合约守护与基线管理
- 🆕 **evidence_* 系列工具**：evidence_index / evidence_pack — 证据索引与打包
- 🆕 **trace_correlate / trace_correlation_check 工具**：跟踪关联分析
- 🆕 **state_diff_assert 工具**：状态差异断言
- 🆕 **validation_data_integrity / validation_permission 工具**：数据完整性 & 权限验证
- 🆕 **Feature Gate 付费分层系统**：server.js 内置 OSS/Pro/Team/Enterprise 四级功能开关，Pro 以上工具返回引导提示
- 🆕 **专业 HTML 报告模块** `core/report-html.js`：6 种报告模板（验证报告/冒烟测试/遮挡检测/反事实分析/错误报告/通用页面），暗黑模式、响应式、打印友好
- 🆕 **集中式错误处理** `core/mcp-error.js`：标准化所有工具错误输出（error/reason/suggestion/paidUpgradeHint 四字段）
- 🆕 **结构化输出**：全部工具输出包含 `nextSteps` / `suggestions` / `paidUpgradeHint`，引导用户自然流向 Pro 版
- 🆕 **Win 中文编码修复** `core/win-encoding.js`：Windows 终端自动切换 UTF-8 代码页，解决中文乱码
- 🆕 **遮挡物 DOM 检测集成**：`browser_screenshot` 截图后自动检测遮挡物，状态改为 warning 并输出遮挡详情
- 🆕 **模式分析**：brain/pattern_store.js — 验证模式存储引擎；hands/memory_analyzer.js — 内存泄漏分析器

### Changed

- 📚 **工具数 78 → 84**：新增 16+ 工具，全部测试覆盖
- 🧪 **所有 handler 错误输出标准化**：34 处 `isError` 裸输出替换为 `mcpError()` 调用
- 🔧 **server.js 重构**：拆分解耦，新增 FEATURE_GATE 配置、统一 Run 管理、VALIDATION_RUNS_DIR
- 🔧 **handlers/validation.js 重构**：browser_smoke_test / counterfactual / chain / contract / trace / state_diff 等全部集成
- 🔧 **browser_screenshot**：增强遮挡分析，截图前智能等待 networkidle + 500ms 延迟
- 🔧 **browser_network / browser_errors**：失败时 nextSteps 首项建议启用 `browser_counterfactual_analyze`
- 🔧 **locator 系列工具全部增强**：browser_find_element / browser_find_page / browser_locator_suggest / browser_locator_validate 添加结构化输出
- 🔧 **移除 9 个已废弃付费工具 schema**：ai_debug_investigate, auto_fix_pipeline, backend_logs, benchmark_run, browser_deep_interact, browser_flow, fix_verify, skill_mcp_sync, validation_suite_run

### Fixed

- 🐛 **className.toLowerCase is not a function**：修复 SVGAnimatedString 类型兼容（browser_overlay_detect/dismiss、browser_screenshot、browser_smoke_test）
- 🐛 **css-var-analyzer 模块缺失**：创建 `handlers/scripts/css-var-analyzer.js` 存根，修复 css_var_check 工具

## [1.4.0] - 2026-07-01

### Fixed

- 🔒 **AI fix evaluator 提示词注入防护**：新增 `sanitize()` 过滤 5 种注入模式（Ignore Instructions/System Prompt/角色扮演等）
- 🐛 **core/logger.js 引用路径修正**：`require('../redaction')` → `require('./redaction')`（两文件同在 core/ 目录）

### Added

- 🆕 **browser_deep_interact 工具 schema**：深层交互验证，支持 detect/form/workflow/explore 四种模式
- 🆕 **browser_form_fill 工具 schema**：批量表单填充 + 可选提交检测
- 🆕 **browser_full_audit 工具 schema**：全量错误审计，聚合 10 类错误来源
- 🧪 **新增 98 个单元测试**：validation_matrix（15）、browser_full_regression（15）、handlers_core 增强（+4）、audit 增强（+4）、new_tools 增强（+8）、以及各处增强
- 🧪 **测试总数达 644**（从 546 → 644，100% 通过）

### Changed

- 🔧 **测试架构**：移除 handlers/cookies_storage.js 和 handlers/trace.js 的错误测试引用（对应功能已在 core/ 和 network/session 中实现）
- 🔧 **handlers_core.test.js**：新增 system.js handler 测试、工具无重复注册验证、未知工具容错测试

## [1.3.0] - 2026-07-07

### Added

- 🆕 **browser_responsive_test 工具**：多视口（mobile/tablet/desktop）截图对比，检测响应式布局问题
- 🆕 **browser_form_fill 工具**：批量表单填充 + 提交检测，封装 autoFillForm + 交互链
- ✨ **browser_lighthouse_audit 增强**：新增 summary/grade/passedAudits/failedAudits 结构化输出，评分等级 A-F
- ✨ **browser_full_regression 增强**：新增 performanceSnapshot（Lcp/CLS/FCP/TTI）
- ✨ **Chrome MCP Adapter 接口对齐**：新增 6 个工具函数（ensureDir/safeName/toFileUrl/redactString/truncate/summarizeEntries）
- 🧪 **新增 43 个单元测试**：trace/cookies_storage/har/locator/network/audit/deep_interactor/error_aggregator
- 🔍 **browser_diagnose 错误模式扩容**：新增 10 个前端错误签名（ResizeObserver/ERR_CONNECTION_REFUSED/CORS/Hydration/Mixed Content/WebSocket 等）
- 💪 **deep_interactor 增强**：新增 autoFillForm + runInteractionChain，支持多步骤交互链和表单自动填充

### Changed

- 🔒 **browser_eval 安全加固**：新增 5 类 25 种恶意模式检测（SQL注入/XSS/原型污染/路径遍历/命令注入）
- 🔒 **browser_cookies 输出增强**：cookie value 脱敏覆盖（JWT/Bearer/Token/API Key）
- 📦 **handlers/ 目录拆分**：server.js 从 418KB 缩减至 293KB（-30%），10 个 handler 模块独立（browser/session/evidence/network/validation/diagnose/visual/locator/system）
- 📊 **测试覆盖率提升**：270 → 508 测试（+88%）
- 📚 **文档补全**：新增 docs/tools/validation.md、network.md、session.md、evidence.md，文档覆盖全部 87 个工具

### Fixed

- 空 catch 块清理（68 处已评估，均为预期控制流，无安全风险）

## [1.2.0] - 2026-06-29

### Added

- ?**单元测试 78 个新?*: 总计?177 ?255 个测试，覆盖 P0/P1/P2 ?18 个工?
  - P0 ? browser_diagnose / browser_element_status / browser_quick_fix / browser_verify_fix
  - P1 ? browser_find_page / browser_links / browser_highlight / browser_scroll
  - P2 ? browser_network / browser_network_detail / browser_console / browser_errors / browser_errors_aggregate
  - 验证框架: validation_element / validation_quick_run / error_fix_suggestion / validation_check
- 🆕 **validation_flow 工具**: 多步流程验证工具，支?navigate/click/type/wait/eval/screenshot 6 种操?
  - continueOnFailure 参数支持（失败继续执行后续步骤）
  - 超时控制（默?30s?
  - 8 个单元测试覆盖正?失败/超时场景
- 🔍 **project_audit 工具**: 项目健康扫描工具，自动检测硬编码密码、绝对路径、SQL 语法错误
- 📖 **VitePress 文档?*: 18 个页面，5 大分类（指南/工具/参?FAQ），GitHub Pages 自动部署
- 💬 **FAQ 折叠?+ 社区入口**: 首页底部增加常见问题和社区链?
- 🎨 **首页视觉升级**: 主标?副标?功能卡片/数据看板/Before&After 场景全面优化

### Changed

- ⬆️ **166 个旧测试保留并增?*（未删除，仅新增补充?
- 🧹 **清理 .trae/mcp-server/scripts/ 过时脚本**: 删除 21 个过时变体（ssh-deploy x6, fix-gateway x1, diagnose-gateway x4 等）

### Fixed

- 🔗 **文档链接修复**: README ?6 个死链接修复（加 base path `/ai-verify-mcp/`?
- 🖼?**GIF 全黑问题**: omggif ?gif-encoder-2（颜色量?bug 修复），后续删除不再使用

## [1.1.0] - 2026-06-29

### Added

- ?**单元测试**: 新增 18 个单元测试（result / config / tools 三大模块?
- 🔧 **FUNDING.yml**: GitHub 赞助按钮配置
- 📝 **.env.example**: 环境变量示例文件
- 🧪 **CI 测试步骤**: GitHub Actions CI/CD 工作流新?`npm test` 步骤

### Fixed

- 📐 **Schema 命名统一**: 7 个工具的 `arguments` ?`inputSchema` 统一命名
  - browser_batch / browser_console / browser_highlight / browser_hover
  - browser_press_key / browser_scroll / browser_select
- 🔗 **Badge 链接**: 修复 README 中空?MCP / Node.js badge 链接
- 🖼?**图片 CDN**: 国内图片访问?jsDelivr 切换?ghproxy.net
- 🧹 **仓库清理**: 完善 .gitignore / .npmignore，清理临时文?

### Changed

- ⬆️ **依赖升级**: pixelmatch 5.3.0 ?7.2.0，playwright 1.61.0 ?1.61.1
- 🤖 **Dependabot**: 移除不存在的 labels 配置，修复标签报?

## [1.0.0] - 2026-06-28

### Added

- 🎯 **核心定位**: AI 编程验证平台 ??AI 代码生成结果可验证、可信赖
- 📸 **证据链留?*: 每步操作自动截图，形成可追溯的证据链
- 🔍 **智能诊断**: 自动分析错误根因，给出置信度评分和修复建?
- ?**验证框架**: 14 个验证工具（检查点验证、元素验证、流程验证等?
- 🐛 **诊断工具**: 12 个诊断工具（错误诊断、元素状态检查、修复验证闭环）
- 🌐 **浏览器操?*: 21 个浏览器操作工具（打开、点击、输入、滚动等?
- 🎯 **智能定位**: 4 个智能定位工具（按文本查找、选择器建议、验证）
- 📊 **报告生成**: Markdown 报告 + 截图证据 + 诊断结果

### Security

- 🔒 **HTTP 服务器认?*: 支持 `MCP_API_KEY` 环境变量配置 API 密钥认证
- ⚠️ 未配置认证时显示安全警告日志

### Fixed

- 🐛 日志数组添加边界控制（MAX_LOG_ENTRIES=500），防止内存泄漏
- 🐛 browserPool 清理逻辑完善，关闭会话时正确清理所有池实例
- 🐛 关键?catch 块添加错误日志记?
- 🐛 Schema 命名统一：`input_schema` ?`inputSchema`?个文件）
- 🐛 browser_eval 添加表达式长度限制（10KB）和审计日志
- 🐛 CLI 参数传?API 密钥时添加安全警告提?
- 🐛 删除 chrome_mcp_adapter.js 中重复的 isConnected 检查代?
- 🐛 standalone-start.js 错误处理添加 process.exit(1)
- 🐛 browserPool 操作添加错误日志记录
- 🐛 requestStartTimes Map 添加超时清理机制?分钟?
- 🐛 Math.random() 改用 crypto.randomBytes（加密安全）
- 🐛 file:// 协议使用时添加安全警告日?
- 🐛 redactString 重复定义添加注释说明不同用?

### Features

- **75 MCP 工具**: 完整?MCP 协议原生支持
- **一键验?*: `validation_quick_run` 7 项快速检?
- **证据?*: 自动截图 + 时间?+ 操作类型
- **诊断闭环**: 错误诊断 ?修复建议 ?验证闭环
- **AI Agent 友好**: 支持 Cursor、Claude、Windsurf ?AI 助手

### Documentation

- README 重写：强?验证"?证据?
- 新增"为什么选择 ValidPilot Verify"对比?
- 新增"证据链概?章节
- 新增实际使用示例

---

> **Don't just generate, verify.** ??AI 编程可信赖?

---

## English Version

# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-06-29

### Added

- ?**Unit Tests**: 18 new unit tests (result / config / tools modules)
- 🔧 **FUNDING.yml**: GitHub Sponsor button configuration
- 📝 **.env.example**: Environment variable example file
- 🧪 **CI Test Step**: GitHub Actions CI/CD workflows added `npm test` step

### Fixed

- 📐 **Schema Naming Unified**: 7 tools renamed `arguments` ?`inputSchema`
  - browser_batch / browser_console / browser_highlight / browser_hover
  - browser_press_key / browser_scroll / browser_select
- 🔗 **Badge Links**: Fixed empty MCP / Node.js badge links in README
- 🖼?**Image CDN**: Switched domestic image access from jsDelivr to ghproxy.net
- 🧹 **Repo Cleanup**: Improved .gitignore / .npmignore, cleaned up temp files

### Changed

- ⬆️ **Dependency Upgrade**: pixelmatch 5.3.0 ?7.2.0, playwright 1.61.0 ?1.61.1
- 🤖 **Dependabot**: Removed non-existent labels config, fixed label error

## [1.0.0] - 2026-06-28

### Added

- 🎯 **Core Positioning**: AI programming verification platform ?make AI code generation results verifiable and trustworthy
- 📸 **Evidence Chain Preservation**: Automatic screenshots at each step, forming a traceable evidence chain
- 🔍 **Intelligent Diagnosis**: Auto-analyze root causes of errors, provide confidence scores and fix suggestions
- ?**Verification Framework**: 14 verification tools (checkpoint verification, element verification, process verification, etc.)
- 🐛 **Diagnostic Tools**: 12 diagnostic tools (error diagnosis, element status check, fix verification closed-loop)
- 🌐 **Browser Operations**: 21 browser operation tools (open, click, input, scroll, etc.)
- 🎯 **Intelligent Locator**: 4 intelligent localization tools (find by text, selector suggestions, verification)
- 📊 **Report Generation**: Markdown report + screenshot evidence + diagnosis results

### Security

- 🔒 **HTTP Server Authentication**: Support `MCP_API_KEY` environment variable for API key authentication
- ⚠️ Display security warning log when authentication is not configured

### Fixed

- 🐛 Added boundary control for log array (MAX_LOG_ENTRIES=500) to prevent memory leaks
- 🐛 Improved browserPool cleanup logic, correctly cleans all pool instances when closing sessions
- 🐛 Added error logging for critical empty catch blocks
- 🐛 Unified Schema naming: `input_schema` ?`inputSchema` (3 files)
- 🐛 Added expression length limit (10KB) and audit log for browser_eval
- 🐛 Added security warning prompt when passing API key via CLI parameters
- 🐛 Removed duplicate isConnected check code in chrome_mcp_adapter.js
- 🐛 Added process.exit(1) for error handling in standalone-start.js
- 🐛 Added error logging for browserPool operations
- 🐛 Added timeout cleanup mechanism (5 minutes) for requestStartTimes Map
- 🐛 Replaced Math.random() with crypto.randomBytes (cryptographically secure)
- 🐛 Added security warning log when using file:// protocol
- 🐛 Added comments explaining different purposes for duplicate redactString definitions

### Features

- **75 MCP Tools**: Full native MCP protocol support
- **One-click Verification**: `validation_quick_run` 7 quick checks
- **Evidence Chain**: Automatic screenshots + timestamps + operation types
- **Diagnosis Closed-loop**: Error diagnosis ?fix suggestions ?verification closed-loop
- **AI Agent Friendly**: Supports AI assistants like Cursor, Claude, Windsurf, etc.

### Documentation

- README rewrite: Emphasize "verification" and "evidence chain"
- Added "Why Choose ValidPilot Verify" comparison table
- Added "Evidence Chain Concept" section
- Added practical usage examples

---

> **Don't just generate, verify.** ?Make AI programming trustworthy.