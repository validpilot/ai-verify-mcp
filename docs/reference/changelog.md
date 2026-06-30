# CHANGELOG

所有重要变更都记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
本项目遵循 [语义化版本 (SemVer)](https://semver.org/lang/zh-CN/) 规范。

---

## [1.1.0] - 2025-06-29

### ✨ 新增 Features

- **单元测试**：新增 60 个单元测试，覆盖 result / config / security / artifacts / redaction / report / tools 七大模块
- **VitePress 文档站**：搭建完整的文档网站，支持导航、搜索、响应式布局
- **FUNDING.yml**：GitHub Sponsor 赞助按钮配置
- **.env.example**：环境变量示例文件
- **CI Test Step**：GitHub Actions CI/CD 工作流新增 `npm test` 步骤

### 🐛 修复 Fixes

- **Schema 命名统一**：7 个工具的 schema 参数命名从 `arguments` 统一为 `inputSchema`
  - browser_batch / browser_console / browser_highlight / browser_hover
  - browser_press_key / browser_scroll / browser_select
- **Badge 链接**：修复 README 中 MCP / Node.js badge 的空链接问题
- **图片 CDN**：国内图片访问从 jsDelivr 切换到 ghproxy.net，解决国内访问失败问题
- **仓库清理**：完善 .gitignore / .npmignore，清理临时文件

### ⬆️ 依赖 Dependencies

- pixelmatch: 5.3.0 → 7.2.0（大版本升级，已修复兼容性）
- playwright: 1.61.0 → 1.61.1
- 新增 devDependency: vitepress（文档站构建）

### 🔧 其他

- Dependabot：移除不存在的 labels 配置，修复标签找不到的错误
- 完善 package.json scripts

---

## [1.0.1] - 2025-06-28

### ✨ 新增 Features

- 83 个 MCP 工具正式发布
- 浏览器操作（25 个）
- 诊断与调试（17 个）
- 验证框架（14 个）
- 会话管理（7 个）
- 证据与产物（4 个）
- 视觉回归（3 个）
- 无障碍检查（1 个）
- 辅助工具（4 个）
- 内置 23 种错误修复模式

### 📝 文档

- README 中英双语版本
- 用户操作手册
- MCP 协议速查手册
- 日志排查手册
- 贡献指南
- 安全政策
- 行为准则
- Issue / PR 模板

---

## [1.0.0] - 2025-06-01

### 🎉 初始发布

- 项目初始化
- MCP Server 基础框架
- Playwright 浏览器集成
- pixelmatch 视觉对比
