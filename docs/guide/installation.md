# 安装与配?
## 环境要求

| ?| 要求 |
|----|------|
| Node.js | >= 18（推?20 LTS?|
| 操作系统 | Windows / macOS / Linux |
| 浏览?| Playwright 自动管理 Chromium |

## 安装方式

### 方式一：全局安装（推荐）

```bash
npm install -g @validpilot/ai-verify-mcp
```

安装后可直接使用 `ai-verify-mcp` 命令?
### 方式二：npx 临时使用

```bash
npx @validpilot/ai-verify-mcp --version
npx @validpilot/ai-verify-mcp validate --url https://example.com
```

每次使用自动下载最新版，用完即删?
### 方式三：项目本地安装

```bash
cd your-project
npm install --save-dev @validpilot/ai-verify-mcp
```

适合在项?CI 流程中使用：

```json
{
  "scripts": {
    "verify": "@validpilot/ai-verify-mcp validate --url http://localhost:5173"
  }
}
```

## 验证安装

```bash
ai-verify-mcp --version
ai-verify-mcp health
```

## 更新到最新版本

查看当前版本和 npm 上的最新版本：

```bash
# 查看本地已安装版本
ai-verify-mcp --version

# 查看 npm 上的最新版本
npm view @validpilot/ai-verify-mcp version
```

根据安装方式选择更新方法：

### npx 方式（MCP 配置中使用）

将 MCP 配置中的版本号改为最新版本或 `@latest`：

```json
// 方式 1：指定具体版本（推荐，确保稳定性）
"args": ["-y", "@validpilot/ai-verify-mcp@1.6.9", "stdio"]

// 方式 2：使用 latest 标签（自动跟随最新）
"args": ["-y", "@validpilot/ai-verify-mcp@latest", "stdio"]
```

改完后重启 IDE。如遇缓存问题，执行 `npx clear-npx-cache` 清除后重试。

### 全局安装方式

```bash
npm install -g @validpilot/ai-verify-mcp@latest
ai-verify-mcp --version  # 验证更新成功
```

### 项目本地安装方式

```bash
npm install @validpilot/ai-verify-mcp@latest
# 或修改 package.json 中的版本号后执行
npm update @validpilot/ai-verify-mcp
```

## 卸载

```bash
npm uninstall -g @validpilot/ai-verify-mcp
```

## 环境变量

| 变量 | 默认?| 说明 |
|------|--------|------|
| `PORT` | 3456 | HTTP 模式端口 |
| `VALIDPILOT_ARTIFACTS_DIR` | `./artifacts` | 产物目录路径 |
| `VALIDPILOT_REDACTION` | `false` | 启用敏感信息脱敏 |
| `VALIDPILOT_ALLOWLIST` | `*` | 域名白名单（逗号分隔?|
| `VALIDPILOT_BLOCKED_HOSTS` | ?| 域名黑名单（逗号分隔?|
| `MCP_API_KEY` | ?| HTTP 模式 API Key 认证 |
| `SSH_PASS` | ?| SSH 密码（远程隧道） |
| `SSH_KEY_PATH` | ?| SSH 私钥路径 |
| `NODE_ENV` | `production` | 环境模式 |

详细配置说明?[配置项说明](../reference/config)?
## 客户端配?
### Cursor

**方案1：开源版本（npx方式）**

使用 npx 自动拉取最新版本：

```json
{
  "mcpServers": {
    "validpilot-ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "@validpilot/ai-verify-mcp", "stdio"]
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
    "validpilot-ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "@validpilot/ai-verify-mcp", "stdio"]
    }
  }
}
```

4. 重启 Claude Desktop

### Windsurf

1. 打开 Windsurf 设置
2. 搜索 MCP 配置
3. 添加：
```json
{
  "mcpServers": {
    "validpilot-ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "@validpilot/ai-verify-mcp", "stdio"]
    }
  }
}
```

4. 重启 Windsurf

### Trae

1. 打开 Trae 设置 → MCP
2. 点击"添加 MCP 服务"
3. 选择"命令行模式"
4. 命令填 `npx`，参数填 `-y @validpilot/ai-verify-mcp stdio`
5. 保存并启动