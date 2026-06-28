# MCP 协议速查

快速了解 Model Context Protocol 基础概念和使用方式。

## 什么是 MCP？

MCP（Model Context Protocol）是 Anthropic 2024 年开源的协议，用于 AI 模型与外部工具/数据源通信。基于 JSON-RPC over stdio 或 HTTP。

## 核心概念

### Server（服务器

提供工具的一方，比如 ai-verify-mcp 就是一个 MCP Server。

### Client（客户端

使用工具的一方，比如 Cursor、Claude、Trae 等 AI 客户端。

### Tools（工具

Server 提供的可调用函数，每个工具都有名字、输入 schema、输出结果。

### Resources（资源

Server 提供的可读取的数据资源。

### Prompts（提示）

Server 提供的预设提示模板。

## 通信方式

### stdio 模式（默认）

通过标准输入输出通信，适合本地使用。

```
AI Client ←stdio→ MCP Server
```

### HTTP/SSE 模式

通过 HTTP 通信，适合远程/网络场景。

```
AI Client ←HTTP→ MCP Server
```

## 工具调用流程

```
1. Client → tools/list  （请求工具列表
2. Server →  返回 76 个工具定义
3. Client → tools/call  （调用工具）
4. Server →  返回结果
   ↓
5. （循环调用
```

## 配置格式

### JSON 配置（通用）

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

### 各客户端配置位置

| 客户端 | 配置文件位置 |
|--------|--------------|
| Trae | `%APPDATA%\Trae CN\User\mcp.json` |
| Cursor | `.cursor/mcp.json` |
| Claude Desktop | `~/Library/Application Support/Claude/...` |
| Windsurf | 设置 → MCP Servers |
| Cline / Roo Code | 扩展设置 → MCP |

## 常用工具分类

本项目提供 76 个工具，8 大分类：

1. **浏览器操作** (25) - 页面导航、元素交互
2. **诊断调试** (17) - 错误、网络、性能
3. **验证框架** (14) - 断言、流程、报告
4. **视觉验证** (3) - 截图对比、基线
5. **会话管理** (7) - 多会话、Cookie
6. **证据产物** (4) - 产物、追踪、HAR
7. **无障碍** (1) - a11y 扫描
8. **系统工具** (4) - 健康检查、自检

## 错误处理

每个工具返回统一格式：

```json
{
  "content": [
    {
      "type": "text",
      "text": "结果文本"
    }
  ],
  "isError": false
}
```

## 安全建议

- 使用 allowlist 限制可访问域名
- 启用 redaction 脱敏敏感信息
- HTTP 模式设置 API Key
- 定期更新到最新版本
