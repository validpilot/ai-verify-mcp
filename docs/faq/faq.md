# 常见问题

## 基础问题

### Q: AI-Verify MCP 是什么？

A: 一个基�?MCP 协议�?AI 编程验证平台，提�?83 个浏览器自动化和验证工具，帮助你验证 AI 生成的代码是否真的能运行�?
### Q: 支持哪些 AI 客户端？

A: 支持所有兼�?MCP 协议的客户端�?- Cursor
- Claude Desktop / Claude Code
- Trae
- Windsurf
- Cline / Roo Code / OpenClaw
- Codex CLI
- Hermes
- CodeArts
- CodeBuddy
- Continue.dev

### Q: 需要付费吗�?
A: 基础功能**完全免费开�?*（MIT License），包括浏览器操作、基础验证、错误聚合等。AI 深度分析（如根因分析、修复建议）需要付费，通过云端 API 实现（�?9/月起）。详见[定价说明](https://validpilot.com/pricing)�?
## 安装使用

### Q: 安装失败怎么办？

A: 常见原因�?1. Node.js 版本过低（需 >= 18�?2. 网络问题导致下载慢，尝试�?npm 镜像
3. 权限问题，Windows 用管理员身份运行

### Q: Playwright 下载慢怎么办？

A: 设置国内镜像�?```bash
set PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright
npx playwright install chromium
```

### Q: 怎么确认安装成功�?
```bash
@validpilot/@validpilot/@validpilot/ai-verify-mcp health
```

输出 `ok: true` 就是成功了�?
## 功能相关

### Q: 为什么有 83 个工具这么多�?
A: 因为覆盖了完整的验证流程：浏览器操作、截图、DOM 查询、错误诊断、视觉对比、报告生成等。多不代表复杂，你可以只用常用的几个，其他按需调用�?
### Q: 视觉对比准确吗？

A: 基于 pixelmatch 像素级对比，支持阈值调整�?.1 阈值下，细微的渲染差异不会误报�?
### Q: 支持移动端测试吗�?
A: 支持，可以设置移动端视口�?user-agent�?
### Q: 能测 API 吗？

A: 当前主要专注于前�?/ 浏览器验证。API 测试支持在规划中�?
## 安全相关

### Q: 会泄露敏感信息吗�?
A: 不会。你可以�?1. 设置 `VALIDPILOT_REDACTION=true` 启用脱敏
2. �?`VALIDPILOT_ALLOWLIST` 限制可访问域�?3. HTTP 模式设置 `MCP_API_KEY` 认证

### Q: 能访问内网页面吗�?
A: 可以。Server 运行在你本地，能访问你本地网络能访问的所有页面�?
## 开发相�?
### Q: 怎么贡献代码�?
A: �?[贡献指南](https://github.com/validpilot/ai-verify-mcp/blob/main/CONTRIBUTING.md)�?
### Q: 怎么�?Bug�?
A: �?GitHub Issues 提交，尽量附上：
- 复现步骤
- 期望行为
- 实际行为
- 环境信息（系统、Node 版本等）

### Q: 有企业版吗？

A: 当前是社区版。有企业需求可以发邮件�?validpilot@outlook.com 联系�?
## 其他

### Q: �?Playwright 有什么区别？

A: Playwright 是浏览器自动化引擎，AI-Verify MCP 是基�?Playwright 构建的验证工具集，封装了 83 个高阶工具，专门用于 AI 编程验证场景�?
### Q: �?Cypress / Selenium 比怎么样？

A: 定位不同。Cypress/Selenium 是给人写测试用的，AI-Verify MCP 是给 AI 用的验证工具，通过 MCP 协议�?AI 调用�?