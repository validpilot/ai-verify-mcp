# 贡献指南

感谢你有兴趣为 **ai-verify-mcp** 做贡献！无论是修复 bug、改进文档、还是添加新功能，都非常欢迎。

---

## 行为准则

请保持专业和友善。本项目采用 [Contributor Covenant](https://www.contributor-covenant.org/) 行为准则。

## 如何贡献

### 报告 Bug

1. 先搜索 [Issues](https://github.com/validpilot/ai-verify-mcp/issues) 确认是否已存在
2. 创建新 Issue，标题简明扼要
3. 包含：
   - 运行环境（Node 版本、OS、AI 客户端）
   - 复现步骤
   - 期望行为 vs 实际行为
   - 相关日志或截图

### 提交功能建议

同样在 [Issues](https://github.com/validpilot/ai-verify-mcp/issues) 中提交，标签选择 `enhancement`。说明使用场景和期望效果即可。

### 提交 Pull Request

1. **先开 Issue** — 任何非 trivial 的改动，先开 Issue 讨论，避免白做
2. **Fork 仓库** — 点击 GitHub 右上角 Fork
3. **创建分支** — 使用描述性分支名：`fix/login-bug`、`feat/add-xxx-tool`
4. **本地开发**

```bash
git clone https://github.com/YOUR_USERNAME/ai-verify-mcp.git
cd ai-verify-mcp
npm install
node bin/validpilot.js health    # 验证环境正常
```

5. **修改代码** — 遵守代码风格（见下文）
6. **测试验证**

```bash
node bin/validpilot.js health    # 确认不影响现有功能
node bin/validpilot.js --version # 确认能正常输出
```

7. **提交 PR** — 描述清楚改动内容和动机

## 开发指南

### 项目结构

```
ai-verify-mcp/
├── bin/validpilot.js    # CLI 入口
├── server.js            # MCP Server 入口
├── start-http.js        # HTTP 模式入口
├── engines/             # 浏览器引擎适配（Playwright）
├── hands/               # 业务逻辑（浏览器操作、证据收集、验证执行）
├── brain/               # 智能分析（错误聚合）
├── core/                # 基础设施（配置、报告、安全）
├── tools/               # MCP 工具定义（JSON）
├── docs/                # 文档
└── rules/               # 规则配置
```

### 添加新工具

1. 在 `tools/` 下创建 JSON 定义文件
2. 在 `server.js` 中注册工具名称和处理函数
3. 验证：`node test-mcp-protocol.js`

### 代码风格

- 使用 `'use strict'`
- 函数使用 `async/await`
- 变量使用 `const`/`let`（不用 `var`）
- 错误使用 `try/catch`，错误消息清晰
- 提交信息使用 [Conventional Commits](https://www.conventionalcommits.org/)：`feat:`、`fix:`、`docs:`、`chore:`

## 联系方式

- 项目维护者：validpilot@outlook.com
- GitHub Issues：https://github.com/validpilot/ai-verify-mcp/issues

---

## English Version

# Contributing Guide

Thank you for your interest in contributing to **ai-verify-mcp**! Whether it's fixing bugs, improving documentation, or adding new features, all contributions are welcome.

---

## Code of Conduct

Please be professional and respectful. This project adopts the [Contributor Covenant](https://www.contributor-covenant.org/) Code of Conduct.

## How to Contribute

### Reporting Bugs

1. Search [Issues](https://github.com/validpilot/ai-verify-mcp/issues) first to confirm if it already exists
2. Create a new Issue with a clear and concise title
3. Include:
   - Environment (Node.js version, OS, AI client)
   - Steps to reproduce
   - Expected behavior vs actual behavior
   - Relevant logs or screenshots

### Submitting Feature Requests

Also submit in [Issues](https://github.com/validpilot/ai-verify-mcp/issues) with the `enhancement` label. Just describe the use case and expected outcome.

### Submitting Pull Requests

1. **Open an Issue first** — For any non-trivial changes, open an Issue to discuss first to avoid wasted effort
2. **Fork the repository** — Click Fork in the top-right corner of GitHub
3. **Create a branch** — Use descriptive branch names: `fix/login-bug`, `feat/add-xxx-tool`
4. **Local development**

```bash
git clone https://github.com/YOUR_USERNAME/ai-verify-mcp.git
cd ai-verify-mcp
npm install
node bin/validpilot.js health    # Verify environment is working
```

5. **Modify code** — Follow the code style (see below)
6. **Test and verify**

```bash
node bin/validpilot.js health    # Confirm existing functionality is not affected
node bin/validpilot.js --version # Confirm normal output
```

7. **Submit PR** — Clearly describe the changes and motivation

## Development Guide

### Project Structure

```
ai-verify-mcp/
├── bin/validpilot.js    # CLI entry point
├── server.js            # MCP Server entry point
├── start-http.js        # HTTP mode entry point
├── engines/             # Browser engine adapter (Playwright)
├── hands/               # Business logic (browser operations, evidence collection, verification execution)
├── brain/               # Intelligent analysis (error aggregation)
├── core/                # Infrastructure (configuration, reporting, security)
├── tools/               # MCP tool definitions (JSON)
├── docs/                # Documentation
└── rules/               # Rule configuration
```

### Adding New Tools

1. Create a JSON definition file under `tools/`
2. Register the tool name and handler function in `server.js`
3. Verify: `node test-mcp-protocol.js`

### Code Style

- Use `'use strict'`
- Use `async/await` for functions
- Use `const`/`let` for variables (no `var`)
- Use `try/catch` for errors with clear error messages
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages: `feat:`, `fix:`, `docs:`, `chore:`

## Contact

- Project maintainer: validpilot@outlook.com
- GitHub Issues: https://github.com/validpilot/ai-verify-mcp/issues
