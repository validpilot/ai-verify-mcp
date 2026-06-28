# CLI 使用指南

## 命令列表

| 命令 | 说明 |
|------|------|
| `ai-verify-mcp health` | 健康检查 |
| `ai-verify-mcp validate` | 一键快速验证 |
| `ai-verify-mcp run` | 执行验证流程 |
| `ai-verify-mcp start` | 启动 MCP Server |
| `ai-verify-mcp --version` | 查看版本 |
| `ai-verify-mcp --help` | 帮助信息 |

## health — 健康检查

检查 Playwright 浏览器是否可用。

```bash
ai-verify-mcp health
```

**用途**：CI 流水线前置检查、Docker 容器健康检查。

## validate — 快速验证

一键验证一个 URL 的 7 项核心检查。

```bash
ai-verify-mcp validate --url <URL>
```

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `--url <URL>` | ✅ | 要验证的页面地址 |
| `--ai-provider` | ❌ | AI 提供商 |
| `--ai-api-key` | ❌ | AI API Key |

**7 项检查**：

1. 页面加载 — 30s 内正常打开
2. 白屏检测 — 有可见内容
3. Console 错误 — 无 JS 异常
4. CSS 加载 — 样式表正常
5. JS 加载 — 脚本正常
6. 图片资源 — 无 4xx/5xx
7. 可用性 — 有可交互元素

## run — 执行验证流程

按 flow JSON 文件执行多步骤验证。

```bash
ai-verify-mcp run --flow <flow-file.json>
```

**Flow JSON 示例**：

```json
{
  "name": "登录页面验证",
  "steps": [
    { "type": "open", "url": "http://localhost:5173/login" },
    { "type": "screenshot", "name": "登录页" },
    { "type": "type", "selector": "#username", "text": "admin@test.com" },
    { "type": "type", "selector": "#password", "text": "123456" },
    { "type": "click", "selector": "#login-btn" },
    { "type": "wait", "ms": 2000 },
    { "type": "screenshot", "name": "登录后" },
    { "type": "errors" }
  ]
}
```

## start — 启动 MCP Server

```bash
# stdio 模式（默认）
ai-verify-mcp start

# HTTP 模式
ai-verify-mcp start --http --port 3456
```

启动后 Server 持续运行，等待 AI 客户端发起工具调用。
