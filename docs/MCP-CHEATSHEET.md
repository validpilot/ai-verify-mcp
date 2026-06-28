# MCP 协议速查手册

> 适合群聊交流、面试应答、快速上手使用。基于 [Model Context Protocol](https://modelcontextprotocol.io) 2024-11-05 版本。

---

## 一、MCP 是什么？

**一句话：** AI 领域的 **USB-C 通用接口**。

| 类比 | 说明 |
|------|------|
| USB-C | 一个接口通所有外设（键盘、显示器、充电） |
| MCP | 一个协议通所有 AI 工具（浏览器、数据库、API） |

Anthropic 于 2024 年 11 月开源，目标是为 AI 模型提供统一的工具调用标准。无需为每个工具单独写对接代码。

---

## 二、架构速记

```
AI Client (Host)  ← JSON-RPC 协议 →  MCP Server
    ↓                                    ↓
 Claude Desktop                    ai-verify-mcp（验证平台）
 Cursor / Windsurf                 Playwright（浏览器自动化）
 Trae / Codex                      各种工具服务
```

**两层架构：**

| 角色 | 职责 | 实例 |
|------|------|------|
| **Host** | 运行 AI 模型的客户端，发起工具调用请求 | Claude Desktop, Cursor, Trae |
| **Server** | 封装具体工具能力的进程，响应调用请求 | ai-verify-mcp, Playwright MCP |

**两种传输方式：**

| 方式 | 场景 | 特点 |
|------|------|------|
| stdio | 本地 CLI 启动 | `npx -y ai-verify-mcp`，进程间通过标准输入输出通信 |
| SSE | 远程或 HTTP | 适合分布式部署，服务端推送事件 |

---

## 三、ai-verify-mcp 在生态中的定位

| 维度 | 说明 |
|------|------|
| 角色 | **MCP Server**（提供服务） |
| 传输 | **stdio**（`npx -y` 一键启动） |
| 工具数 | **75 个**验证工具 |
| 核心能力 | 浏览器自动化截图 / Console 错误捕获 / axe a11y 扫描 / CSS 变量追溯 / 截图差异比对 / 证据链报告 |

**理念：** *Don't just generate, verify.* — 不只生成代码，还要验证结果。

### 🤝 Skill + MCP 协同工作

ai-verify-mcp 提供 75 个**原子验证工具**，**Skill 系统**（如 Trae 的 `browser-dev-full-validation-skill`）负责编排验证流程：

| 单独用 MCP | 单独用 Skill | **Skill + MCP 组合** |
|-----------|------------|-------------------|
| 有工具但需手动编排调用 | 有流程但缺执行能力 | ✅ **自动编排 + 自动执行** |
| 验证结果零散、需自行聚合 | 流程模板固定 | ✅ **完整证据链 + 灵活配置** |

> 💡 **最佳实践**：在 Trae 中同时启用 Skill + ai-verify-mcp MCP Server。
> Skill 回答"什么时候验、验什么"，MCP 负责"怎么验"。

---

## 四、对话必备问答

| 问题 | 回答 |
|------|------|
| "怎么装？" | `npx ai-verify-mcp`，npm 包即装即用，无需全局安装 |
| "MCP 配置文件在哪？" | 因客户端而异：[配置速查](../README.md#-mcp-客户端配置速查) |
| "怎么验证装好了？" | `ai-verify --version` 看到版本号即为成功 |
| "和 Playwright 有什么区别？" | Playwright 是浏览器自动化库，ai-verify-mcp 把它包装为 MCP 协议暴露给 AI 客户端，并叠加验证报告、证据链能力 |
| "开源还是收费？" | **MIT 协议**，完全开源免费 |
| "支持哪些 AI 客户端？" | Cursor / Claude Desktop / Windsurf / Trae / Codex / OpenClaw / Hermes / CodeArts / CodeBuddy 等 |
| "有什么限制？" | 需要本地 Node >= 18；Trae 不超过 40 工具/8000 字符描述上限 |

---

## 五、常用命令与自启动

### CLI 子命令

| 命令 | 用途 | 示例 |
|------|------|------|
| `--version` / `-v` | 输出版本号 | `ai-verify-mcp --version` |
| `--help` / `-h` | 显示帮助信息 | `ai-verify-mcp --help` |
| `health` | 检查 Playwright 浏览器可用性 | `ai-verify-mcp health` |
| `validate --url <url>` | 快速验证一个 URL，输出 pass/fail + 错误摘要 | `ai-verify-mcp validate --url http://localhost:5173` |
| `run --flow <file>` | 按 flow JSON 文件执行多步验证流程 | `ai-verify-mcp run --flow flow.json` |

```bash
# 查看版本
npx -y ai-verify-mcp --version

# Playwright 健康检查（exit 0 = 可用）
npx -y ai-verify-mcp health

# 快速验证一个 URL
npx -y ai-verify-mcp validate --url http://localhost:5173
```

> `health` 和 `validate` 无需启动 MCP Server，独立运行，适合 CI/CD 流水线。

### 启动 MCP Server（供 AI 客户端连接）

```bash
# stdio 模式（默认，适合 Cursor / Claude Desktop / Trae 等）
npx -y ai-verify-mcp

# HTTP 模式（端口 3456）
npx -y ai-verify-mcp --http --port 3456
```

### 自启动配置

为方便开发，可在项目 `package.json` 的 `scripts` 中添加自启动命令：

```json
{
  "scripts": {
    "verify": "ai-verify-mcp",
    "verify:http": "ai-verify-mcp --http --port 3456",
    "verify:check": "ai-verify-mcp health"
  }
}
```

然后在 AI 客户端的 MCP 配置中将 `command` 指向 npm script：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npm",
      "args": ["run", "verify"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

或在系统自启动脚本中注册（Windows 任务计划程序 / systemd）：

<details>
<summary><b>Windows 任务计划程序</b></summary>

```
1. 打开 taskschd.msc
2. 创建任务 → 触发器：用户登录时
3. 操作：启动程序 → node %APPDATA%\npm\node_modules\ai-verify-mcp\server.js
```

</details>

<details>
<summary><b>Linux systemd</b></summary>

```ini
[Unit]
Description=ai-verify-mcp MCP Server
After=network.target

[Service]
ExecStart=/usr/bin/npx ai-verify-mcp --http --port 3456
Restart=on-failure
User=<your-user>

[Install]
WantedBy=default.target
```
</details>

---

## 六、推荐阅读

- [MCP 官方文档](https://modelcontextprotocol.io)
- [Anthropic MCP 公告](https://www.anthropic.com/news/model-context-protocol)
- [ai-verify-mcp GitHub](https://github.com/validpilot/ai-verify-mcp)
- [ai-verify-mcp npm](https://www.npmjs.com/package/ai-verify-mcp)
