# 安装与配置

## 环境要求

| 项 | 要求 |
|----|------|
| Node.js | >= 18（推荐 20 LTS） |
| 操作系统 | Windows / macOS / Linux |
| 浏览器 | Playwright 自动管理 Chromium |

## 安装方式

### 方式一：全局安装（推荐）

```bash
npm install -g ai-verify-mcp
```

安装后可直接使用 `ai-verify-mcp` 命令。

### 方式二：npx 临时使用

```bash
npx ai-verify-mcp --version
npx ai-verify-mcp validate --url https://example.com
```

每次使用自动下载最新版，用完即删。

### 方式三：项目本地安装

```bash
cd your-project
npm install --save-dev ai-verify-mcp
```

适合在项目 CI 流程中使用：

```json
{
  "scripts": {
    "verify": "ai-verify-mcp validate --url http://localhost:5173"
  }
}
```

## 验证安装

```bash
ai-verify-mcp --version
ai-verify-mcp health
```

## 卸载

```bash
npm uninstall -g ai-verify-mcp
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3456 | HTTP 模式端口 |
| `VALIDPILOT_ARTIFACTS_DIR` | `./artifacts` | 产物目录路径 |
| `VALIDPILOT_REDACTION` | `false` | 启用敏感信息脱敏 |
| `VALIDPILOT_ALLOWLIST` | `*` | 域名白名单（逗号分隔） |
| `VALIDPILOT_BLOCKED_HOSTS` | — | 域名黑名单（逗号分隔） |
| `MCP_API_KEY` | — | HTTP 模式 API Key 认证 |
| `SSH_PASS` | — | SSH 密码（远程隧道） |
| `SSH_KEY_PATH` | — | SSH 私钥路径 |
| `NODE_ENV` | `production` | 环境模式 |

详细配置说明见 [配置项说明](../reference/config)。

## 客户端配置

### Cursor

1. 打开 Cursor 设置 → Settings → MCP
2. 添加以下配置：

```json
{
  "mcpServers": {
    "ai-verify": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp", "stdio"]
    }
  }
}
```

3. 重启 Cursor 即可使用

### Claude Desktop

1. 打开 Claude Desktop 设置
2. 找到 MCP 配置文件位置：
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
3. 添加：

```json
{
  "mcpServers": {
    "ai-verify": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp", "stdio"]
    }
  }
}
```

4. 重启 Claude Desktop

### Windsurf

1. 打开 Windsurf 设置
2. 搜索 MCP 配置
3. 添加同上配置
4. 重启 Windsurf

### Trae

1. 打开 Trae 设置 → MCP
2. 点击"添加 MCP 服务"
3. 选择"命令行模式"
4. 命令填 `npx`，参数填 `-y ai-verify-mcp stdio`
5. 保存并启用
