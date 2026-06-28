# AI 代理指南

本文档为在 ai-verify-mcp 项目上工作的 AI 编程代理（Claude、Cursor、Trae、Copilot 等）提供指导。

## 项目概述

**ai-verify-mcp** 是一个 MCP（模型上下文协议）服务器，为 AI 代理提供 76 个浏览器验证工具。它使 AI 代理能够通过标准化的 MCP 接口执行端到端的 Web 验证、调试和自动化修复。

**核心技术栈**：Node.js + Playwright + @modelcontextprotocol/sdk

## 架构

```
server.js                    # 主 MCP 服务器（所有工具处理器位于 switch 语句中）
tools/                       # 76 个 JSON schema 文件（每个工具一个）
engines/                     # Playwright / Chrome 适配器引擎
core/                        # 核心工具（产物、配置、安全、脱敏、报告）
hands/                       # 高级操作器（browser_operator、evidence_collector、verification_runner）
brain/                       # AI 逻辑（error_aggregator）
rules/                       # 验证规则（suggested-rules.json）
docs/                        # 用户文档
examples/                    # 演示示例
bin/                         # CLI 入口点
```

## 核心约定

1. **工具 schema 与实现必须完全匹配** — `tools/*.json` 中的每个工具在 `server.js` 的 switch 语句中都必须有对应的处理器。参数、类型和描述必须保持一致。

2. **安全第一** — 切勿在工具输出中暴露 API 密钥、令牌、密码或 Cookie。使用 `core/redaction.js` 中的脱敏工具。`browser_eval` 工具存在已知安全风险，需要仔细进行输入验证。

3. **敏感数据脱敏** — 所有可能包含敏感数据的工具输出（Cookie、存储、带认证头的网络响应）在返回给 MCP 客户端之前必须经过脱敏处理。

4. **错误处理** — 禁止空 catch 块。始终记录错误。HTTP 服务器未经认证不得暴露于公共网络。

5. **会话管理** — 浏览器会话必须能够完全关闭，以防止资源泄漏。池操作必须处理竞态条件以确保线程安全。

6. **日志数组边界控制** — 日志数组必须有大小限制，以防止内存泄漏。

7. **Schema 命名** — 使用 `inputSchema`（驼峰命名），而非 `input_schema`（下划线命名），以与 MCP SDK 约定保持一致。

8. **CLI 参数** — 对于敏感配置，优先使用环境变量而非命令行参数。

## 代码风格

- 所有 JS 文件顶部使用 `'use strict';`
- 2 空格缩进
- 字符串使用单引号
- 行尾不使用分号？ — 不，使用分号（参见现有代码）
- 优先使用 `const` > `let` > `var`
- 所有异步操作使用 async/await

## 添加新工具

1. 创建 `tools/<tool_name>.json`，包含完整的 JSON schema（name、description、inputSchema）
2. 将工具对象添加到 `server.js` 的 `tools` 数组中
3. 在工具处理器 switch 语句中添加 `case '<tool_name>':` 代码块
4. 更新 README.md 和 docs/USER-MANUAL.md 中的工具数量
5. 如适用，添加测试或验证脚本
6. 更新 CHANGELOG.md

## 测试

提交更改前请运行以下命令：

```bash
# 语法检查
node -c server.js

# 自测（MCP 协议 + 浏览器工具）
node test-mcp.js

# 验证工具数量与 schema 匹配
node check-tools-final.js
```

## 发布流程

1. 更新 `package.json` 中的版本号（遵循 SemVer）
2. 更新 `CHANGELOG.md` 记录变更
3. 运行 `npm pack --dry-run` 验证包内容
4. 运行 `npm publish`（需要 2FA/OTP）
5. 在 git 中标记发布版本

---

## English Version

# AI Agent Instructions

This document provides guidance for AI coding agents (Claude, Cursor, Trae, Copilot, etc.) working on the ai-verify-mcp project.

## Project Overview

**ai-verify-mcp** is an MCP (Model Context Protocol) server that provides 76 browser validation tools for AI agents. It enables AI agents to perform end-to-end web validation, debugging, and automated fixes through a standardized MCP interface.

**Core stack**: Node.js + Playwright + @modelcontextprotocol/sdk

## Architecture

```
server.js                    # Main MCP server (all tool handlers in switch statement)
tools/                       # 76 JSON schema files (one per tool)
engines/                     # Playwright / Chrome adapter engines
core/                        # Core utilities (artifacts, config, security, redaction, report)
hands/                       # High-level operators (browser_operator, evidence_collector, verification_runner)
brain/                       # AI logic (error_aggregator)
rules/                       # Validation rules (suggested-rules.json)
docs/                        # User documentation
examples/                    # Demo examples
bin/                         # CLI entry points
```

## Key Conventions

1. **Tool schema and implementation must match exactly** — Every tool in `tools/*.json` must have a corresponding handler in `server.js`'s switch statement. Parameters, types, and descriptions must be consistent.

2. **Security first** — Never expose API keys, tokens, passwords, or cookies in tool outputs. Use the redaction utilities in `core/redaction.js`. The `browser_eval` tool has known security risks and requires careful input validation.

3. **Sensitive data redaction** — All tool outputs that might contain sensitive data (cookies, storage, network responses with auth headers) must pass through redaction before being returned to the MCP client.

4. **Error handling** — Empty catch blocks are forbidden. Always log errors. HTTP servers must not be exposed to public networks without authentication.

5. **Session management** — Browser sessions must be fully closeable to prevent resource leaks. Pool operations must handle race conditions for thread safety.

6. **Log array boundary controls** — Log arrays must have size limits to prevent memory leaks.

7. **Schema naming** — Use `inputSchema` (camelCase), not `input_schema` (snake_case), to be consistent with the MCP SDK convention.

8. **CLI parameters** — Prefer environment variables over command-line arguments for sensitive configuration.

## Code Style

- Use `'use strict';` at the top of all JS files
- 2-space indentation
- Single quotes for strings
- No semicolons at end of lines? — No, use semicolons (see existing code)
- Prefer `const` over `let` over `var`
- Async/await for all asynchronous operations

## Adding a New Tool

1. Create `tools/<tool_name>.json` with full JSON schema (name, description, inputSchema)
2. Add the tool object to the `tools` array in `server.js`
3. Add a `case '<tool_name>':` block in the tool handler switch statement
4. Update the tool count in README.md and docs/USER-MANUAL.md
5. Add a test or verification script if applicable
6. Update CHANGELOG.md

## Testing

Run the following before submitting changes:

```bash
# Syntax check
node -c server.js

# Self-test (MCP protocol + browser tools)
node test-mcp.js

# Verify tool count matches schemas
node check-tools-final.js
```

## Release Process

1. Update version in `package.json` (follow SemVer)
2. Update `CHANGELOG.md` with changes
3. Run `npm pack --dry-run` to verify package contents
4. Run `npm publish` (requires 2FA/OTP)
5. Tag the release in git
