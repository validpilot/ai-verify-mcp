# 安全策略

## 支持的版本

| 版本 | 支持状态 |
|------|---------|
| 1.x (latest) | ✅ 活跃维护，接收安全修复 |
| < 1.0 | ❌ 不再维护 |

## 报告安全漏洞

如果你发现了安全漏洞，**请不要公开提交 Issue**。请通过以下方式私密报告：

- **邮箱**: validpilot@outlook.com
- **预期响应时间**: 48 小时内确认收到，7 天内提供修复方案

### 报告时请包含

1. 漏洞类型（XSS、命令注入、信息泄露等）
2. 影响版本
3. 复现步骤（包含最小化 PoC 或示例代码）
4. 影响评估

## 已知安全措施本项目已实现

- DNS 重绑定防护（HTTP 模式 Origin header 验证）
- 本地绑定限制（HTTP 默认监听 127.0.0.1）
- 敏感信息脱敏（`VALIDPILOT_REDACTION` 控制）
- MCP_API_KEY 认证（HTTP 模式可选）
- 域名白名单/黑名单（`VALIDPILOT_ALLOWLIST` / `VALIDPILOT_BLOCKED_HOSTS`）
- Playwright 沙箱隔离

## 安全更新流程

1. 漏洞确认后，修复会先合并到 `main` 分支
2. 发布补丁版本（如 1.0.1）
3. 在 [GitHub Releases](https://github.com/validpilot/ai-verify-mcp/releases) 中说明修复内容
