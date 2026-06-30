# Changelog

All notable changes to this project will be documented in this file.

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

- �?**单元测试 78 个新�?*: 总计�?177 �?255 个测试，覆盖 P0/P1/P2 �?18 个工�?
  - P0 �? browser_diagnose / browser_element_status / browser_quick_fix / browser_verify_fix
  - P1 �? browser_find_page / browser_links / browser_highlight / browser_scroll
  - P2 �? browser_network / browser_network_detail / browser_console / browser_errors / browser_errors_aggregate
  - 验证框架: validation_element / validation_quick_run / error_fix_suggestion / validation_check
- 🆕 **validation_flow 工具**: 多步流程验证工具，支�?navigate/click/type/wait/eval/screenshot 6 种操�?
  - continueOnFailure 参数支持（失败继续执行后续步骤）
  - 超时控制（默�?30s�?
  - 8 个单元测试覆盖正�?失败/超时场景
- 🔍 **project_audit 工具**: 项目健康扫描工具，自动检测硬编码密码、绝对路径、SQL 语法错误
- 📖 **VitePress 文档�?*: 18 个页面，5 大分类（指南/工具/参�?FAQ），GitHub Pages 自动部署
- 💬 **FAQ 折叠�?+ 社区入口**: 首页底部增加常见问题和社区链�?
- 🎨 **首页视觉升级**: 主标�?副标�?功能卡片/数据看板/Before&After 场景全面优化

### Changed

- ⬆️ **166 个旧测试保留并增�?*（未删除，仅新增补充�?
- 🧹 **清理 .trae/mcp-server/scripts/ 过时脚本**: 删除 21 个过时变体（ssh-deploy x6, fix-gateway x1, diagnose-gateway x4 等）

### Fixed

- 🔗 **文档链接修复**: README �?6 个死链接修复（加 base path `/ai-verify-mcp/`�?
- 🖼�?**GIF 全黑问题**: omggif �?gif-encoder-2（颜色量�?bug 修复），后续删除不再使用

## [1.1.0] - 2026-06-29

### Added

- �?**单元测试**: 新增 18 个单元测试（result / config / tools 三大模块�?
- 🔧 **FUNDING.yml**: GitHub 赞助按钮配置
- 📝 **.env.example**: 环境变量示例文件
- 🧪 **CI 测试步骤**: GitHub Actions CI/CD 工作流新�?`npm test` 步骤

### Fixed

- 📐 **Schema 命名统一**: 7 个工具的 `arguments` �?`inputSchema` 统一命名
  - browser_batch / browser_console / browser_highlight / browser_hover
  - browser_press_key / browser_scroll / browser_select
- 🔗 **Badge 链接**: 修复 README 中空�?MCP / Node.js badge 链接
- 🖼�?**图片 CDN**: 国内图片访问�?jsDelivr 切换�?ghproxy.net
- 🧹 **仓库清理**: 完善 .gitignore / .npmignore，清理临时文�?

### Changed

- ⬆️ **依赖升级**: pixelmatch 5.3.0 �?7.2.0，playwright 1.61.0 �?1.61.1
- 🤖 **Dependabot**: 移除不存在的 labels 配置，修复标签报�?

## [1.0.0] - 2026-06-28

### Added

- 🎯 **核心定位**: AI 编程验证平台 �?�?AI 代码生成结果可验证、可信赖
- 📸 **证据链留�?*: 每步操作自动截图，形成可追溯的证据链
- 🔍 **智能诊断**: 自动分析错误根因，给出置信度评分和修复建�?
- �?**验证框架**: 14 个验证工具（检查点验证、元素验证、流程验证等�?
- 🐛 **诊断工具**: 12 个诊断工具（错误诊断、元素状态检查、修复验证闭环）
- 🌐 **浏览器操�?*: 21 个浏览器操作工具（打开、点击、输入、滚动等�?
- 🎯 **智能定位**: 4 个智能定位工具（按文本查找、选择器建议、验证）
- 📊 **报告生成**: Markdown 报告 + 截图证据 + 诊断结果

### Security

- 🔒 **HTTP 服务器认�?*: 支持 `MCP_API_KEY` 环境变量配置 API 密钥认证
- ⚠️ 未配置认证时显示安全警告日志

### Fixed

- 🐛 日志数组添加边界控制（MAX_LOG_ENTRIES=500），防止内存泄漏
- 🐛 browserPool 清理逻辑完善，关闭会话时正确清理所有池实例
- 🐛 关键�?catch 块添加错误日志记�?
- 🐛 Schema 命名统一：`input_schema` �?`inputSchema`�?个文件）
- 🐛 browser_eval 添加表达式长度限制（10KB）和审计日志
- 🐛 CLI 参数传�?API 密钥时添加安全警告提�?
- 🐛 删除 chrome_mcp_adapter.js 中重复的 isConnected 检查代�?
- 🐛 standalone-start.js 错误处理添加 process.exit(1)
- 🐛 browserPool 操作添加错误日志记录
- 🐛 requestStartTimes Map 添加超时清理机制�?分钟�?
- 🐛 Math.random() 改用 crypto.randomBytes（加密安全）
- 🐛 file:// 协议使用时添加安全警告日�?
- 🐛 redactString 重复定义添加注释说明不同用�?

### Features

- **75 MCP 工具**: 完整�?MCP 协议原生支持
- **一键验�?*: `validation_quick_run` 7 项快速检�?
- **证据�?*: 自动截图 + 时间�?+ 操作类型
- **诊断闭环**: 错误诊断 �?修复建议 �?验证闭环
- **AI Agent 友好**: 支持 Cursor、Claude、Windsurf �?AI 助手

### Documentation

- README 重写：强�?验证"�?证据�?
- 新增"为什么选择 ValidPilot Verify"对比�?
- 新增"证据链概�?章节
- 新增实际使用示例

---

> **Don't just generate, verify.** �?�?AI 编程可信赖�?

---

## English Version

# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-06-29

### Added

- �?**Unit Tests**: 18 new unit tests (result / config / tools modules)
- 🔧 **FUNDING.yml**: GitHub Sponsor button configuration
- 📝 **.env.example**: Environment variable example file
- 🧪 **CI Test Step**: GitHub Actions CI/CD workflows added `npm test` step

### Fixed

- 📐 **Schema Naming Unified**: 7 tools renamed `arguments` �?`inputSchema`
  - browser_batch / browser_console / browser_highlight / browser_hover
  - browser_press_key / browser_scroll / browser_select
- 🔗 **Badge Links**: Fixed empty MCP / Node.js badge links in README
- 🖼�?**Image CDN**: Switched domestic image access from jsDelivr to ghproxy.net
- 🧹 **Repo Cleanup**: Improved .gitignore / .npmignore, cleaned up temp files

### Changed

- ⬆️ **Dependency Upgrade**: pixelmatch 5.3.0 �?7.2.0, playwright 1.61.0 �?1.61.1
- 🤖 **Dependabot**: Removed non-existent labels config, fixed label error

## [1.0.0] - 2026-06-28

### Added

- 🎯 **Core Positioning**: AI programming verification platform �?make AI code generation results verifiable and trustworthy
- 📸 **Evidence Chain Preservation**: Automatic screenshots at each step, forming a traceable evidence chain
- 🔍 **Intelligent Diagnosis**: Auto-analyze root causes of errors, provide confidence scores and fix suggestions
- �?**Verification Framework**: 14 verification tools (checkpoint verification, element verification, process verification, etc.)
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
- 🐛 Unified Schema naming: `input_schema` �?`inputSchema` (3 files)
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
- **Diagnosis Closed-loop**: Error diagnosis �?fix suggestions �?verification closed-loop
- **AI Agent Friendly**: Supports AI assistants like Cursor, Claude, Windsurf, etc.

### Documentation

- README rewrite: Emphasize "verification" and "evidence chain"
- Added "Why Choose ValidPilot Verify" comparison table
- Added "Evidence Chain Concept" section
- Added practical usage examples

---

> **Don't just generate, verify.** �?Make AI programming trustworthy.