# ValidPilot Verify

> **Don't just generate, verify.**
>
> 让 AI 代码生成结果可验证、可信赖。证据驱动的 MCP 验证平台。

[![npm version](https://img.shields.io/npm/v/@validpilot/ai-verify-mcp.svg?style=flat-square)](https://www.npmjs.com/package/@validpilot/ai-verify-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@validpilot/ai-verify-mcp.svg?style=flat-square)](https://www.npmjs.com/package/@validpilot/ai-verify-mcp)
[![CI](https://img.shields.io/github/actions/workflow/status/validpilot/ai-verify-mcp/ci.yml?style=flat-square&label=CI)](https://github.com/validpilot/ai-verify-mcp/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
[![MCP Protocol](https://img.shields.io/badge/MCP-136%20tools-brightgreen.svg?style=flat-square)](https://modelcontextprotocol.io/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-green.svg?style=flat-square)](https://nodejs.org/)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg?style=flat-square)](CODE_OF_CONDUCT.md)
[![English](https://img.shields.io/badge/English-blue?style=flat-square)](README.en.md)

> 📘 **MCP 新手入门**：先看 [MCP 协议速查手册](docs/reference/mcp-cheatsheet.md)，5 分钟搞懂 MCP。
> 📖 **详细操作指南**：见 [用户操作手册](docs/public/legacy/USER-MANUAL.md)，从安装到精通。
> 🔧 **遇到问题**：见 [日志排查手册](docs/public/legacy/LOG-TROUBLESHOOTING.md)，常见错误与解决方案。

---

## 📑 目录

- [🎯 一句话介绍](#-一句话介绍)
- [🔄 Skill + MCP = 最佳体验](#-skill--mcp--最佳体验)
- [🚀 快速开始](#-快速开始)
- [🔧 配置 MCP Server](#-配置-mcp-server)
- [🎬 实际使用示例](#-实际使用示例)
- [🏆 为什么选择 ValidPilot Verify？](#-为什么选择-validpilot-verify)
- [📦 完整工具列表](#-完整工具列表)
- [🔬 证据链概念](#-证据链概念)
- [⚙️ 环境变量](#-环境变量)
- [❓ 常见问题](#-常见问题)
- [🔌 MCP Client 配置速查](#-mcp-client-配置速查)
- [🎬 演示：✅ vs ❌ 对比](#-演示-vs--对比)
- [📦 发布自动化](#-发布自动化)
- [🙏 致谢](#-致谢)
- [💬 社区与联系](#-社区与联系)
- [❤️ 支持捐赠](#-支持捐赠)

---

## 🎯 一句话介绍

**ValidPilot Verify** 是一个面向 AI 编程的全息验证平台。通过 MCP 协议，AI 可以自动验证代码生成结果——生成截图证据、诊断错误根因、留存完整证据链。

### 它能做什么？

- 🔍 **验证 AI 生成的代码**：打开页面、点击按钮、填写表单、验证结果
- 📸 **留存证据**：每步操作自动截图，形成可追溯的证据链
- 🐛 **智能诊断错误**：自动分析错误根因，给出置信度评分和修复建议
- ✅ **断言验证**：验证元素存在、文本内容、URL 匹配等
- 📊 **生成验证报告**：Markdown 报告，包含截图证据和诊断结果

---

## 🔄 Skill + MCP = 最佳体验

ai-verify-mcp 提供 136 个底层验证工具（浏览器操作、截图、a11y 扫描、断言验证、视觉比对、网络监控、性能分析、内存检测、证据链采集、安全扫描等），但这些工具需要被**编排调用**才能完成完整的验证任务。

**v1.9.3+ 起，编排能力已通过 MCP Prompts 原语内置到 MCP 服务器**——无需安装任何 IDE 扩展包，在支持 MCP Prompts 的客户端（Claude Desktop、Cursor、Trae）输入 `/` 即可看到 7 个斜杠命令工作流。

```mermaid
flowchart LR
    A[AI 生成代码] --> B[Skill 编排验证流程]
    B --> C[ai-verify-mcp 执行验证]
    C --> D{验证通过?}
    D -->|失败| E[AI 自动修复]
    E --> C
    D -->|通过| F[留存证据链]
```

### 三种 Skill 形态

| 形态 | 是什么 | 是否需安装 | v1.9.3+ 状态 |
|------|--------|-----------|--------------|
| **A. MCP Prompts** | `/validate-login`、`/submit-form` 等 7 个斜杠命令，内置在 MCP 服务器中 | ❌ 不需要 | ✅ 开箱即用 |
| **B. Skill 指导文档** | `docs/skills/*.md` 8 篇工具链编排手册 | ❌ 不需要（随 npm 包发布） | ✅ v1.9.3 已有 |
| **C. IDE Skill 扩展包** | Trae 的 `browser-dev-full-validation-skill` 等 IDE 原生扩展 | ✅ 需在 Trae Skill 市场安装 | 可选增强 |

### Skill 负责

| 职责 | 说明 |
|------|------|
| **流程编排** | 定义验证步骤顺序：打开页面 → 截图 → 检查 a11y → 断言结果 |
| **证据管理** | 统一存放截图、日志、HAR 文件到各阶段产物目录 |
| **生成验证报告** | 将多轮验证结果汇总为一份完整报告（成功率、故障清单、修复建议） |
| **对比基准** | 对比当前验证结果与上一轮（或原始版本），计算回归情况 |

### ai-verify-mcp 负责

| 职责 | 说明 |
|------|------|
| **136 个原子验证工具** | `browser_open` / `browser_overlay_detect` / `browser_smoke_test` / `browser_counterfactual_analyze` / `browser_assert` / `browser_a11y_check` / `browser_smart_fill` / `browser_memory_check` / `browser_visual_component` / `security_headers_check` / `security_owasp_top10` / `api_probe` 等 |
| **7 个 MCP Prompts** | `/validate-login`、`/submit-form`、`/audit-performance`、`/audit-security`、`/visual-regression`、`/debug-page`、`/e2e-flow` 内置工作流 |
| **证据链采集** | 每步操作自动截图，记录 Console 日志和网络请求 |
| **对比与 CSS 变量扫描** | axe-core 集成、CSS 变量追踪 |
| **报告输出** | 结构化 JSON + Markdown 报告 |

> 💡 **最佳实践**（v1.9.3+）：
> - **最小依赖路径（推荐）**：只装 `@validpilot/ai-verify-mcp` MCP Server，输入 `/` 即可触发 7 个 Skill 工作流。无需任何 IDE 扩展包。
> - **增强路径（可选）**：在 Trae 中额外启用 `browser-dev-full-validation-skill` 扩展包，获得 7 阶段细粒度流程编排（每个 Skill 内部拆成 7 个执行阶段）。
> - 详见 [Skill 使用指南](docs/guide/skill-usage.md)。

---

## 🚀 快速开始

### 方式一：1 分钟快速体验

```bash
# 1. 安装
npm install @validpilot/ai-verify-mcp

# 2. 启动服务
npx @validpilot/ai-verify-mcp start

# 3. 在 AI 助手中配置 MCP（以 Cursor 为例）
```

### 方式二：直接验证（无需 MCP）

```bash
# 快速验证一个网站
npx @validpilot/ai-verify-mcp validate --url https://example.com

# 截图留证
npx @validpilot/ai-verify-mcp screenshot --url https://example.com --name evidence-001

# 一键检查
npx @validpilot/ai-verify-mcp quick-check --url https://example.com
```

### 📦 更新到最新版本

查看当前版本：

```bash
# 查看 npm 上的最新版本
npm view @validpilot/ai-verify-mcp version

# 查看本地已安装版本（全局安装方式）
npm list -g @validpilot/ai-verify-mcp
```

**根据您的使用方式选择对应的更新方法**：

#### 场景 A：MCP 配置中使用 `npx`（推荐，多数用户）

如果您的 MCP 配置是这种形式：

```json
"validpilot-ai-verify-mcp": {
  "command": "npx",
  "args": ["-y", "@validpilot/ai-verify-mcp@1.6.2"]
}
```

**更新方法**：将版本号改为最新版本（当前为 `1.6.9`），或使用 `@latest` 自动跟随最新：

```json
// 方式 1：指定具体版本（推荐，确保稳定性）
"args": ["-y", "@validpilot/ai-verify-mcp@1.6.9"]

// 方式 2：使用 latest 标签（每次启动自动拉取最新）
"args": ["-y", "@validpilot/ai-verify-mcp@latest"]
```

改完后**重启 IDE** 或**重载 MCP Server** 即可生效。`npx` 会自动下载新版本到缓存。

> 💡 **提示**：如果之前用过旧版本，`npx` 缓存可能残留旧包。如遇异常，执行 `npx clear-npx-cache` 清除缓存后重试。

#### 场景 B：全局安装方式

如果您的 MCP 配置是这种形式：

```json
"validpilot-ai-verify-mcp": {
  "command": "ai-verify-mcp",
  "args": []
}
```

**更新方法**：

```bash
# 更新到最新版本
npm install -g @validpilot/ai-verify-mcp@latest

# 或指定具体版本
npm install -g @validpilot/ai-verify-mcp@1.6.9

# 验证更新成功
ai-verify-mcp --version
```

更新后重启 IDE 即可生效，无需修改 MCP 配置。

#### 场景 C：项目本地安装方式

如果是在项目中 `npm install @validpilot/ai-verify-mcp` 安装的：

```bash
# 更新到最新版本
npm install @validpilot/ai-verify-mcp@latest

# 或在 package.json 中修改版本号后执行
npm update @validpilot/ai-verify-mcp
```

---

## 🔧 配置 MCP Server

### 在 Cursor 中使用

1. 打开 Cursor → 设置 → MCP Servers → Add
2. 填写配置

或在 IDE 的 MCP 配置文件中添加（项目级 `.cursor/mcp.json` 或用户级配置）：

```json
{
  "ai-verify-mcp": {
    "command": "npx",
    "args": ["-y", "@validpilot/ai-verify-mcp"],
    "env": {
      "MCP_MODE": "http",
      "MCP_HTTP_PORT": "3456"
    }
  }
}
```

### 在 Claude Code 中使用

在项目根目录创建 `.mcp.json`：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "@validpilot/ai-verify-mcp"],
      "env": {
        "MCP_MODE": "http",
        "MCP_HTTP_PORT": "3456"
      }
    }
  }
}
```

### 在 Windsurf 中使用

Settings → MCP Servers → Add：

```json
{
  "ai-verify-mcp": {
    "command": "npx",
    "args": ["-y", "@validpilot/ai-verify-mcp"]
  }
}
```

---

## 🎬 实际使用示例

### 场景：验证 AI 生成的登录页面

**你告诉 AI：**
> "帮我验证这个登录页面：打开 https://example.com/login，输入用户名 test 和密码 123，点击登录按钮，验证是否跳转到首页。"

**AI 调用的工具链：**

```
1. browser_open → 打开登录页面（截图：login-page.png）
2. browser_type → 输入用户名（截图：username-filled.png）
3. browser_type → 输入密码（截图：password-filled.png）
4. browser_click → 点击登录按钮（截图：login-clicked.png）
5. validation_check → 验证跳转到首页（截图：homepage.png）
6. browser_assert → 断言 URL 包含 /home（生成证据报告）
```

**结果：完整证据链**

```
artifacts/
├── login-page.png          # 页面初始状态
├── username-filled.png     # 输入用户名后
├── password-filled.png     # 输入密码后
├── login-clicked.png       # 点击登录后
├── homepage.png            # 登录成功后
└── validation-report.md    # 验证报告（含诊断结果）
```

---

## 🏆 为什么选择 ValidPilot Verify？

| 特性 | ValidPilot Verify | Playwright | Puppeteer |
|------|-------------------|------------|-----------|
| **MCP 协议原生** | ✅ 开箱即用 | ❌ 需自己封装 | ❌ 需自己封装 |
| **AI Agent 友好** | ✅ 136 个专用工具 | ❌ 通用 API | ❌ 通用 API |
| **证据链留存** | ✅ 自动截图 + 时间戳 | ❌ 手动实现 | ❌ 手动实现 |
| **智能诊断** | ✅ 错误根因 + 置信度 | ❌ 仅日志 | ❌ 仅日志 |
| **验证报告** | ✅ Markdown + 截图 | ❌ 需自己写 | ❌ 需自己写 |
| **快速验证** | ✅ 一键检查 | ❌ 需编写测试 | ❌ 需编写测试 |

**核心差异**：Playwright/Puppeteer 是"手"（负责操作），ValidPilot Verify 是"眼+脑"（负责检查和验证）。

### Skill + MCP 协同优势

| 单独用 MCP | 单独用 Skill | **Skill + MCP 组合** |
|-----------|------------|-------------------|
| ✅ 136 个工具但需手动编排 | ✅ 有流程但缺执行能力 | ✅ 自动编排 + 自动执行 |
| ❌ 验证结果零散 | ❌ 流程模板固定 | ✅ 完整证据链 + 灵活配置 |
| ❌ 需手动对比差异 | ❌ 无法直接操控浏览器 | ✅ 全自动闭环 |

> ✅ **推荐配置**：在 Trae 中启用 `browser-dev-full-validation-skill`，同时配置 `ai-verify-mcp` 作为 MCP Server。Skill 负责"什么时候验、验什么"，MCP 负责"怎么验"。

### 🎨 验证流程可视化

```
┌─────────────────────────────────────────────────────────────┐
│                    AI 生成代码 → 验证流程                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐ │
│  │ 1. 打开   │ -> │ 2. 操作   │ -> │ 3. 断言   │ -> │ 4. 报告 │ │
│  │ browser_  │    │ browser_  │    │ browser_  │    │ evidence│ │
│  │ open      │    │ type/click│    │ assert    │    │ _pack  │ │
│  └──────────┘    └──────────┘    └──────────┘    └────────┘ │
│       │               │               │               │      │
│       ▼               ▼               ▼               ▼      │
│  📸 screenshot    📸 screenshot    📸 screenshot    📄 .md   │
│  login.png        input.png       result.png       report   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 完整工具列表

### ✅ 验证框架（8个）

| 工具 | 说明 |
|------|------|
| `validation_check` | 检查点验证（负载时间、JS错误、HTTP错误等）|
| `validation_element` | 元素状态验证（存在、可见、文本包含等）|
| `validation_flow` | 流程验证（多步骤验证流程）|
| `validation_quick_run` | 一键快速验证（7项检查）|
| `validation_report` | 生成验证报告 |
| `validation_report_export` | 导出验证报告 |
| `browser_assert` | 断言验证（URL、标题、元素等）|
| `screenshot_diff` | 视觉回归对比 |

### 🔍 智能诊断（9个）

| 工具 | 说明 |
|------|------|
| `browser_diagnose` | 错误自动诊断（根因分析 + 置信度）|
| `browser_element_status` | 元素状态检查（可见性、可交互性、遮挡）|
| `browser_quick_fix` | 快速修复（8种策略自动尝试）|
| `browser_verify_fix` | 修复验证闭环 |
| `browser_debug_report` | 调试报告生成 |
| `browser_errors_aggregate` | 错误聚合统计 |
| `error_fix_suggestion` | 修复建议（基于规则）|
| `error_summary_md` | 错误摘要（Markdown）|
| `debug_investigate` | 深度调查 |

### 📸 证据收集（6个）

| 工具 | 说明 |
|------|------|
| `browser_screenshot` | 全屏截图 |
| `browser_screenshot_element` | 元素截图 |
| `browser_artifacts` | 工件管理 |
| `browser_artifacts_clear` | 清理工件 |
| `browser_har_export` | 导出 HAR 文件 |
| `browser_snapshot` | 页面快照 |

### 🌐 浏览器操作（21个）

完整浏览器操作能力：打开、点击、输入、滚动、等待、Cookie、存储、网络、控制台等。

### 🎯 智能定位（4个）

| 工具 | 说明 |
|------|------|
| `browser_find_element` | 按文本智能查找元素 |
| `browser_locator_suggest` | 选择器建议 |
| `browser_locator_validate` | 选择器验证 |
| `browser_find_page` | 页面类型识别 |

### 🔒 安全扫描（6个）

| 工具 | 说明 |
|------|------|
| `security_headers_check` | HTTP 安全头部检查（CSP、HSTS、XFO 等 7 项 + 信息泄露检测）|
| `security_csp_analyze` | CSP 策略深度分析（unsafe-inline/eval 检测、评分）|
| `security_sql_injection_scan` | SQL 注入扫描（20 个 payload，多数据库错误检测）|
| `security_xss_scan` | XSS 漏洞扫描（26 个 payload，未转义检测）|
| `security_owasp_top10` | OWASP Top 10 快速检查（A1-A10 全覆盖）|
| `api_probe` | API 端点探测（多 HTTP 方法 + CORS 分析）|

---

## 🔬 证据链概念

**证据链**是 ValidPilot Verify 的核心概念：

1. **每步操作自动截图**：时间戳 + 操作类型 + 结果状态
2. **错误自动诊断**：错误类型 + 根因分析 + 置信度评分
3. **修复建议生成**：基于规则的修复建议 + 验证闭环
4. **报告自动生成**：Markdown 报告 + 截图引用 + 诊断结果

**示例证据链报告：**

```markdown
# 验证报告 - 登录流程

## ✅ 通过的步骤

| 步骤 | 操作 | 截图 | 时间戳 |
|------|------|------|--------|
| 1 | 打开登录页 | login-page.png | 2026-06-28T10:00:00Z |
| 2 | 输入用户名 | username-filled.png | 2026-06-28T10:00:05Z |
| 3 | 点击登录 | login-clicked.png | 2026-06-28T10:00:10Z |

## ❌ 失败的步骤

| 步骤 | 操作 | 错误 | 截图 | 诊断 |
|------|------|------|------|------|
| 4 | 验证首页 | URL不匹配 | homepage.png | 置信度 85% - 登录可能失败 |

**错误类型**: 验证失败
**置信度**: 85%
**建议**: 检查登录是否成功，查看是否有错误提示。
```

---

## ⚙️ 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MCP_MODE` | MCP 运行模式（stdio/http）| stdio |
| `MCP_HTTP_PORT` | HTTP 端口 | 3456 |
| `VALIDPILOT_ARTIFACTS_DIR` | 证据存放目录 | ./artifacts |
| `SCREENSHOT_QUALITY` | 截图质量 | 80 |

---

## ❓ 常见问题

### Q: 和 browser-mcp 有什么区别？

**browser-mcp** 是"手"——负责操作浏览器（打开、点击、输入）。
**ai-verify-mcp** 是"眼+脑"——负责验证和诊断（检查结果、留存证据、诊断错误）。

两者可以配合使用：browser-mcp 操作，ai-verify-mcp 验证。

### Q: 支持哪些 AI 助手？

支持所有 MCP 协议兼容的 AI 助手：Cursor、Claude Code、Windsurf、Cline 等。

### Q: 证据存放在哪里？

默认存放在 `./artifacts` 目录，包含截图、HAR 文件、验证报告等。

### Q: 如何更新到最新版本？

详见上方 [📦 更新到最新版本](#-更新到最新版本) 章节。简要说明：

- **npx 方式**：将 MCP 配置中的版本号改为 `@latest` 或具体新版本号（如 `@1.6.9`），重启 IDE
- **全局安装**：执行 `npm install -g @validpilot/ai-verify-mcp@latest`
- **查看最新版本**：执行 `npm view @validpilot/ai-verify-mcp version`

### Q: 启动失败，`Error: Playwright browser failed to launch`

- **原因 A**: Playwright 浏览器二进制未安装
- **解决**: 运行 `npx playwright install chromium`
- **原因 B**: Linux 系统缺少系统依赖
- **解决**: Debian/Ubuntu 执行 `apt-get install libnspr4 libnss3 libatk1.0-0 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2`

### Q: MCP 连接失败，`MCP error -32000: Connection closed`

- **原因**: `node` 可执行文件路径在 MCP Host 里找不到
- **解决**: 在 MCP config 中使用 `command: "npx" args: ["-y", "@validpilot/ai-verify-mcp"]` 而非 `node .../start-http.js`

### Q: 端口 3456 已被占用

- **解决**: 在 MCP config 中指定自定义端口: `"env": { "MCP_HTTP_PORT": "3557" }`

### Q: 截图没生成到 ./artifacts

- **检查1**: 进程对当前目录有写权限
- **检查2**: 通过环境变量覆盖: `"env": { "VALIDPILOT_ARTIFACTS_DIR": "C:/temp/evidence" }`
- **检查3**: AI 是否真的调用了 `browser_screenshot` 工具（在 MCP 调试模式下看 ListTools 调用日志）

---

## 🔌 MCP Client 配置速查

> 所有客户端的 stdio/HTTP shape 一致，下面列出**可直接复制粘贴**的配置块。

### 在 Cursor（项目级推荐）

`.cursor/mcp.json`（项目根目录）：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "@validpilot/ai-verify-mcp"],
      "env": {
        "MCP_HTTP_PORT": "3456"
      }
    }
  }
}
```

### 在 Claude Desktop

编辑 `%APPDATA%/Claude/claude_desktop_config.json`（Windows）或 `~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "@validpilot/ai-verify-mcp"],
      "env": {
        "MCP_HTTP_PORT": "3456"
      }
    }
  }
}
```

> ⚠️ Claude Desktop 只会加载用户级 config 文件，重启 Claude Desktop 才能看到新工具。

### 在 Windsurf

`~/.codeium/windsurf/mcp_config.json`：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "@validpilot/ai-verify-mcp"],
      "env": {
        "MCP_HTTP_PORT": "3456"
      }
    }
  }
}
```

### 在 Claude Code（本地安装）

项目根目录的 `.mcp.json`：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "@validpilot/ai-verify-mcp"]
    }
  }
}
```

### 在 Cline / Continue / 其他 stdio MCP 客户端

```json
{
  "name": "ai-verify-mcp",
  "command": "npx",
  "args": ["-y", "@validpilot/ai-verify-mcp"]
}
```

### 在 Trae IDE

**两种入口二选一，推荐项目级。**

#### 方式 A：项目级（推荐，多人共享）

在项目根目录创建 `.trae/mcp.json`：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "@validpilot/ai-verify-mcp"],
      "env": {
        "MCP_HTTP_PORT": "3456"
      }
    }
  }
}
```

#### 方式 B：用户级（全局生效）

`%APPDATA%\Trae\User\mcp.json`（Windows）或 `~/.config/Trae/User/mcp.json`（macOS/Linux）：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "@validpilot/ai-verify-mcp"],
      "env": {
        "MCP_HTTP_PORT": "3456"
      }
    }
  }
}
```

> 💡 Trae 在 settings → MCP → "+ Add" → "Raw Config (JSON)" 按钮可直接弹出对应路径；保存后重启 Trae 会话加载新工具。

#### ⚠️ Trae MCP 限制提醒

Trae 因模型上下文窗口有限，对 MCP 引入的**两道硬性上限**：

| 限制项 | 上限值 | 触达后果 |
|--------|--------|---------|
| 所有 MCP Server **工具描述总字符数** | ≈ 8000 字符 | 超出后按工具粒度丢弃多余的工具描述 |
| 所有 MCP Server **工具总数** | ≈ 40 个工具 | 超出后按工具粒度丢弃装不下的工具 |

> 📌 数据来源：[Trae 官方 FAQ｜MCP 工具 · 2026-02](https://forum.trae.cn/t/topic/65)

大量堆叠 MCP 后，可能出现"`list tools failed`"或工具显示不全的现象——并非 ai-verify-mcp 自身问题，而是触达 Trae 上限后按工具粒度丢失描述。具体规避措施请参考 Trae 官方文档。

### 在 Codex CLI（OpenAI）

`~/.codex/config.toml`（TOML 格式，注意与 JSON 区别）：

```toml
[mcp_servers.ai-verify-mcp]
command = "npx"
args = ["-y", "@validpilot/ai-verify-mcp"]

[mcp_servers.ai-verify-mcp.env]
MCP_HTTP_PORT = "3456"
```

或使用 CLI 一次性添加：

```bash
codex mcp add ai-verify-mcp -- npx -y @validpilot/ai-verify-mcp
```

> 💡 Codex CLI 默认用 stdio，HTTP 端口仅在 `MCP_MODE=http` 时使用；如需用 HTTP 暴露给浏览器调试，需用 `start-http.js` 启动后让 Codex 通过 SSE/HTTP 连接（Codex 0.40+ 支持）。

### 在 OpenClaw（开源 Claude Code 替代品）

`~/.openclaw/openclaw.json`：

```json
{
  "mcp": {
    "servers": {
      "ai-verify-mcp": {
        "command": "npx",
        "args": ["-y", "@validpilot/ai-verify-mcp"],
        "env": {
          "MCP_HTTP_PORT": "3456"
        }
      }
    }
  }
}
```

> 💡 OpenClaw 使用 `mcp.servers.<name>` 嵌套结构（不是 servers 后缀是另一种风格），与 Claude Code 同源协议，可平滑迁移。

### 在 Hermes Agent（Nous Research）

`~/.hermes/config.yaml`（YAML 格式，与 JSON 路径不同）：

```yaml
mcp_servers:
  ai-verify-mcp:
    command: "npx"
    args: ["-y", "@validpilot/ai-verify-mcp"]
    env:
      MCP_HTTP_PORT: "3456"
```

或使用 CLI 交互式添加：

```bash
hermes mcp add ai-verify-mcp \
  --command "npx" \
  --args "-y,ai-verify-mcp"
```

> 💡 Hermes 会自动 discover 工具列表，启动后用 `hermes tools list` 可看到 `browser_*`、`validation_*` 等工具已注册。

### 在华为云 CodeArts（码云 IDE）

设置 → MCP工具 → "配置MCP" → 编辑 `mcp_settings.json`：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "@validpilot/ai-verify-mcp"],
      "env": {
        "MCP_HTTP_PORT": "3456"
      }
    }
  }
}
```

或在 IDE 命令面板执行：

1. `Ctrl+Shift+P` → "CodeArts: Add MCP Server"
2. 选 stdio → 填 `npx` → 填 `-y,ai-verify-mcp`
3. 配置自动写入 `mcp_settings.json`

> ⚠️ 华为云码云建议开启 MCP 不超过 8 个，启用 3 个最佳，本工具是验证类，建议与 Playwright、Context7 等共用并设置 defer_loading 避免冲突。

### 在 Tencent CodeBuddy

**方式 A（推荐）：`~/.codebuddy/.mcp.json`（推荐）**

`~/.codebuddy/.mcp.json`（全局）或项目级 `.mcp.json`（项目级）：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "@validpilot/ai-verify-mcp"],
      "env": {
        "MCP_HTTP_PORT": "3456"
      }
    }
  }
}
```

**方式 B：Settings.json 集成**

设置 → "Add MCP" → 自动打开 `settings.json`，追加：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "@validpilot/ai-verify-mcp"]
    }
  }
}
```

> 💡 CodeBuddy 支持 STDIO / SSE / HTTP 三种 transports，本节配置均用 STDIO（最常用）；如需用 HTTP 模式，把 `command/args` 替换为 `url: "http://localhost:3456/sse"` 即可。

---

## 🎬 演示：✅ vs ❌ 对比

### ❌ 没有验证（普通 AI 编程）

```
👤 "帮我写一个登录页"
🤖 "已生成 login.html / login.js ..."
👤 "能跑吗？"
🤖 "应该没问题"
👤 "......"   ❌ 没有证据
```

### ✅ 使用 ValidPilot Verify

```
👤 "帮我写一个登录页，跑完之后验证一下"
🤖 "好的，我边写边验证：
    1. 打开页面 → validation_quick_run ✅
    2. 输入用户名 → screenshot 已留存
    3. 输入密码 → screenshot 已留存
    4. 点击登录 → screenshot + URL断言 ✅
    5. 验证首页 → evidence/report.md ✅
👤 *(点击 evidence/login-flow-report.md 查看截图证据)*
```

完整证据链文件结构：

```
artifacts/
├── step-1-login-page.png
├── step-2-username-typed.png
├── step-3-password-typed.png
├── step-4-login-clicked.png
├── step-5-home-verified.png
└── login-flow-report.md
```

---

## 📦 发布自动化

发布到 npm 时会自动执行健康校验。

```json
{
  "scripts": {
    "start": "node server.js",
    "http": "node start-http.js",
    "cli": "node bin/validpilot.js",
    "validate": "node bin/validpilot.js health",
    "pack:dry": "npm pack --dry-run",
    "prepublishOnly": "node bin/validpilot.js health && npm pack --dry-run"
  }
}
```

执行流程：
```bash
$ npm publish
> @validpilot/ai-verify-mcp@1.6.9 prepublishOnly
> node bin/validpilot.js health && npm pack --dry-run

{ "ok": true, "name": "@validpilot/ai-verify-mcp", "version": "1.6.9", ... }
npm notice package size: 649.9 kB
npm notice total files: 220
+ @validpilot/ai-verify-mcp@1.6.9 → 上传 npm registry
```

发布前可手动验证：
- `npm run validate` → Playwright 健康检查
- `npm run pack:dry` → 打包预览（不实际打包）

---

## 🙏 致谢

感谢以下项目和技术的启发：
- [Playwright](https://playwright.dev/) 浏览器自动化引擎
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) MCP 协议 SDK
- [axe-core](https://github.com/dequelabs/axe-core) 无障碍检查

---

## 💬 社区与联系

### 钉钉交流群

扫码加入 `ai-verify-mcp` 官方交流群，提问、反馈、交流最佳实践：

![钉钉交流群](https://ghproxy.net/https://raw.githubusercontent.com/validpilot/ai-verify-mcp/main/docs/images/dingtalk-group.jpg)

> 此二维码永久有效

### 联系邮箱

📧 [validpilot@outlook.com](mailto:validpilot@outlook.com)

- 商务合作
- 安全漏洞报告（请优先使用 [SECURITY.md](SECURITY.md) 流程）
- 其他问题

---

## ❤️ 支持捐赠 / Donations

感谢您对本项目的关注与支持！如果您觉得这个项目对您有帮助，欢迎通过捐赠的方式给予鼓励。

_Thank you for your interest and support! If you find this project helpful, consider buying me a coffee._

> 捐赠将用于项目维护、功能开发、服务器开销等，所有资金将透明公开，专款专用。
>
> _Donations will be used for project maintenance, feature development, and server costs. All funds will be transparent and project-dedicated._

### 捐赠方式 / Donation Methods

| 支付宝 (Alipay) | 微信支付 (WeChat) | PayPal |
|:---:|:---:|:---:|
| ![支付宝](https://ghproxy.net/https://raw.githubusercontent.com/validpilot/ai-verify-mcp/main/docs/images/alipay.jpg) | ![微信支付](https://ghproxy.net/https://raw.githubusercontent.com/validpilot/ai-verify-mcp/main/docs/images/weixinpay.jpg) | [![PayPal](https://img.shields.io/badge/PayPal-00457C?style=for-the-badge&logo=paypal&logoColor=white)](https://paypal.me/qianzhiliang) |

> 无论金额大小，都是对我莫大的鼓励。再次感谢您的支持！
>
> _No matter the amount, every bit of support means a lot. Thank you!_

> **GitHub Sponsors**：暂未开通，敬请期待。_Not yet available, stay tuned._

---

**Contributing**：欢迎贡献！阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 了解如何参与。请遵守 [Code of Conduct](CODE_OF_CONDUCT.md)。

**Security**：发现漏洞？查看 [SECURITY.md](SECURITY.md) 了解安全策略。

**AI Agents**：你是 AI Agent？查看 [AGENTS.md](AGENTS.md) 获取编码指南和项目约定。

**License**：[MIT](LICENSE) © 2026 ValidPilot

## 📜 许可证

[MIT](LICENSE) © 2026 ValidPilot Team

---

> **Don't just generate, verify.** 让 AI 编程可信赖。