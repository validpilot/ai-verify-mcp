# 快速开始

5 分钟上手 AI-Verify MCP。

## 前置条件

- **Node.js** >= 18（推荐 20 LTS）
- **操作系统** Windows / macOS / Linux
- **浏览器** Playwright 自动管理 Chromium（首次运行自动下载）

## 安装

### 全局安装（推荐）

```bash
npm install -g ai-verify-mcp
```

### 验证安装

```bash
# 查看版本
ai-verify-mcp --version

# 健康检查
ai-verify-mcp health
```

健康检查通过会输出：

```json
{"ok":true,"name":"ai-verify-mcp","version":"1.1.0","message":"Playwright browser is available"}
```

## 快速体验

### 一键验证 URL

```bash
ai-verify-mcp validate --url https://example.com
```

自动执行 7 项核心检查：页面加载、白屏检测、Console 错误、CSS/JS 加载、图片资源、可用性。

### 启动 MCP Server

```bash
# stdio 模式（默认，供 AI 客户端连接）
ai-verify-mcp start

# HTTP 模式
ai-verify-mcp start --http --port 3456
```

## 配置到 AI 客户端

### Trae

在项目根目录创建 `.trae/mcp.json`：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

重启 Trae 会话即可使用。

### Cursor

创建 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

### Claude Desktop

编辑 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### 其他客户端

Windsurf / Cline / Roo Code / OpenClaw / Codex CLI / Hermes / CodeArts / CodeBuddy 等，配置方式类似，命令均为 `npx -y ai-verify-mcp`。

## 下一步

- 查看 [完整安装指南](./installation)
- 了解 [CLI 命令](./cli)
- 浏览 [76 个工具列表](../tools/overview)
