# 快速开�?
5 分钟上手 AI-Verify MCP�?
## 前置条件

- **Node.js** >= 18（推�?20 LTS�?- **操作系统** Windows / macOS / Linux
- **浏览�?* Playwright 自动管理 Chromium（首次运行自动下载）

## 安装

### 全局安装（推荐）

```bash
npm install -g @validpilot/ai-verify-mcp
```

### 验证安装

```bash
# 查看版本
@validpilot/@validpilot/@validpilot/ai-verify-mcp --version

# 健康检�?@validpilot/@validpilot/@validpilot/ai-verify-mcp health
```

健康检查通过会输出：

```json
{"ok":true,"name":"ai-verify-mcp","version":"1.1.0","message":"Playwright browser is available"}
```

## 快速体�?
### 一键验�?URL

```bash
@validpilot/@validpilot/@validpilot/ai-verify-mcp validate --url https://example.com
```

自动执行 7 项核心检查：页面加载、白屏检测、Console 错误、CSS/JS 加载、图片资源、可用性�?
### 启动 MCP Server

```bash
# stdio 模式（默认，�?AI 客户端连接）
@validpilot/@validpilot/@validpilot/ai-verify-mcp start

# HTTP 模式
@validpilot/@validpilot/@validpilot/ai-verify-mcp start --http --port 3456
```

## 配置�?AI 客户�?
### Trae

在项目根目录创建 `.trae/mcp.json`�?
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

重启 Trae 会话即可使用�?
### Cursor

创建 `.cursor/mcp.json`�?
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

编辑 `claude_desktop_config.json`�?
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

### 其他客户�?
Windsurf / Cline / Roo Code / OpenClaw / Codex CLI / Hermes / CodeArts / CodeBuddy 等，配置方式类似，命令均�?`npx -y ai-verify-mcp`�?
## 下一�?
- 查看 [完整安装指南](./installation)
- 了解 [CLI 命令](./cli)
- 浏览 [83 个工具列表](../tools/overview)
