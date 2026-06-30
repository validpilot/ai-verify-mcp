# CLI 使用指南

## 命令列表

| 命令 | 说明 |
|------|------|
| `@validpilot/@validpilot/@validpilot/ai-verify-mcp health` | 健康检�?|
| `@validpilot/@validpilot/@validpilot/ai-verify-mcp validate` | 一键快速验�?|
| `ai-verify-mcp run` | 执行验证流程 |
| `@validpilot/@validpilot/@validpilot/ai-verify-mcp start` | 启动 MCP Server |
| `@validpilot/@validpilot/@validpilot/ai-verify-mcp --version` | 查看版本 |
| `ai-verify-mcp --help` | 帮助信息 |

## health �?健康检�?
检�?Playwright 浏览器是否可用�?
```bash
@validpilot/@validpilot/@validpilot/ai-verify-mcp health
```

**用�?*：CI 流水线前置检查、Docker 容器健康检查�?
## validate �?快速验�?
一键验证一�?URL �?7 项核心检查�?
```bash
@validpilot/@validpilot/@validpilot/ai-verify-mcp validate --url <URL>
```

**参数**�?
| 参数 | 必填 | 说明 |
|------|------|------|
| `--url <URL>` | �?| 要验证的页面地址 |
| `--ai-provider` | �?| AI 提供�?|
| `--ai-api-key` | �?| AI API Key |

**7 项检�?*�?
1. 页面加载 �?30s 内正常打开
2. 白屏检�?�?有可见内�?3. Console 错误 �?�?JS 异常
4. CSS 加载 �?样式表正�?5. JS 加载 �?脚本正常
6. 图片资源 �?�?4xx/5xx
7. 可用�?�?有可交互元素

## run �?执行验证流程

�?flow JSON 文件执行多步骤验证�?
```bash
ai-verify-mcp run --flow <flow-file.json>
```

**Flow JSON 示例**�?
```json
{
  "name": "登录页面验证",
  "steps": [
    { "type": "open", "url": "http://localhost:5173/login" },
    { "type": "screenshot", "name": "登录�? },
    { "type": "type", "selector": "#username", "text": "admin@test.com" },
    { "type": "type", "selector": "#password", "text": "123456" },
    { "type": "click", "selector": "#login-btn" },
    { "type": "wait", "ms": 2000 },
    { "type": "screenshot", "name": "登录�? },
    { "type": "errors" }
  ]
}
```

## start �?启动 MCP Server

```bash
# stdio 模式（默认）
@validpilot/@validpilot/@validpilot/ai-verify-mcp start

# HTTP 模式
@validpilot/@validpilot/@validpilot/ai-verify-mcp start --http --port 3456
```

启动�?Server 持续运行，等�?AI 客户端发起工具调用�?