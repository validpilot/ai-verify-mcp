# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-06-28

### Added

- 🎯 **核心定位**: AI 编程验证平台 — 让 AI 代码生成结果可验证、可信赖
- 📸 **证据链留存**: 每步操作自动截图，形成可追溯的证据链
- 🔍 **智能诊断**: 自动分析错误根因，给出置信度评分和修复建议
- ✅ **验证框架**: 14 个验证工具（检查点验证、元素验证、流程验证等）
- 🐛 **诊断工具**: 12 个诊断工具（错误诊断、元素状态检查、修复验证闭环）
- 🌐 **浏览器操作**: 21 个浏览器操作工具（打开、点击、输入、滚动等）
- 🎯 **智能定位**: 4 个智能定位工具（按文本查找、选择器建议、验证）
- 📊 **报告生成**: Markdown 报告 + 截图证据 + 诊断结果

### Security

- 🔒 **HTTP 服务器认证**: 支持 `MCP_API_KEY` 环境变量配置 API 密钥认证
- ⚠️ 未配置认证时显示安全警告日志

### Fixed

- 🐛 日志数组添加边界控制（MAX_LOG_ENTRIES=500），防止内存泄漏
- 🐛 browserPool 清理逻辑完善，关闭会话时正确清理所有池实例
- 🐛 关键空 catch 块添加错误日志记录
- 🐛 Schema 命名统一：`input_schema` → `inputSchema`（3个文件）
- 🐛 browser_eval 添加表达式长度限制（10KB）和审计日志
- 🐛 CLI 参数传递 API 密钥时添加安全警告提示
- 🐛 删除 chrome_mcp_adapter.js 中重复的 isConnected 检查代码
- 🐛 standalone-start.js 错误处理添加 process.exit(1)
- 🐛 browserPool 操作添加错误日志记录
- 🐛 requestStartTimes Map 添加超时清理机制（5分钟）
- 🐛 Math.random() 改用 crypto.randomBytes（加密安全）
- 🐛 file:// 协议使用时添加安全警告日志
- 🐛 redactString 重复定义添加注释说明不同用途

### Features

- **75 MCP 工具**: 完整的 MCP 协议原生支持
- **一键验证**: `validation_quick_run` 7 项快速检查
- **证据链**: 自动截图 + 时间戳 + 操作类型
- **诊断闭环**: 错误诊断 → 修复建议 → 验证闭环
- **AI Agent 友好**: 支持 Cursor、Claude、Windsurf 等 AI 助手

### Documentation

- README 重写：强调"验证"和"证据链"
- 新增"为什么选择 ValidPilot Verify"对比表
- 新增"证据链概念"章节
- 新增实际使用示例

---

> **Don't just generate, verify.** — 让 AI 编程可信赖。

---

## English Version

# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-06-28

### Added

- 🎯 **Core Positioning**: AI programming verification platform — make AI code generation results verifiable and trustworthy
- 📸 **Evidence Chain Preservation**: Automatic screenshots at each step, forming a traceable evidence chain
- 🔍 **Intelligent Diagnosis**: Auto-analyze root causes of errors, provide confidence scores and fix suggestions
- ✅ **Verification Framework**: 14 verification tools (checkpoint verification, element verification, process verification, etc.)
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
- 🐛 Unified Schema naming: `input_schema` → `inputSchema` (3 files)
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
- **Diagnosis Closed-loop**: Error diagnosis → fix suggestions → verification closed-loop
- **AI Agent Friendly**: Supports AI assistants like Cursor, Claude, Windsurf, etc.

### Documentation

- README rewrite: Emphasize "verification" and "evidence chain"
- Added "Why Choose ValidPilot Verify" comparison table
- Added "Evidence Chain Concept" section
- Added practical usage examples

---

> **Don't just generate, verify.** — Make AI programming trustworthy.