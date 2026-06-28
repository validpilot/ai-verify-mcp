# 系统工具

辅助工具，用于健康检查、自检、基准测试等。

## 工具列表

| 工具 | 说明 |
|------|------|
| `mcp_health_check` | MCP Server 健康检查 |
| `mcp_self_test` | MCP 自检（协议 + 工具数） |
| `benchmark_run` | 基准性能测试 |
| `ai_debug_investigate` | AI 辅助深度排查 |

## mcp_health_check

检查 MCP Server 是否正常运行。

**返回示例：**

```json
{
  "ok": true,
  "name": "ai-verify-mcp",
  "version": "1.1.0",
  "tools": 76,
  "playwright": "available"
}
```

## mcp_self_test

运行完整自检，包括：

- MCP 协议兼容性
- 工具注册完整性
- Playwright 可用性
- 配置正确性

## benchmark_run

运行基准性能测试。

**测试项：**

- 页面加载速度
- 截图性能
- DOM 查询速度
- 对比速度

## ai_debug_investigate

AI 辅助深度排查复杂问题。

**适用场景：**

- 疑难杂症
- 间歇性问题
- 复杂根因分析
- 多因素问题

## CLI 命令

除了 MCP 工具，还可以直接使用 CLI：

```bash
# 健康检查
ai-verify-mcp health

# 快速验证
ai-verify-mcp validate --url https://example.com

# 查看版本
ai-verify-mcp --version
```
