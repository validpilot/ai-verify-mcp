---
layout: home

hero:
  name: AI-Verify MCP
  text: 让 AI 代码生成结果可验证、可信赖
  tagline: MCP 协议原生支持的 AI 编程验证平台。证据驱动，自动化验证，76 个工具全覆盖。
  image:
    src: /logo.svg
    alt: AI-Verify MCP
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 工具列表
      link: /tools/overview
    - theme: alt
      text: GitHub
      link: https://github.com/validpilot/ai-verify-mcp

features:
  - icon: 🛡️
    title: 证据驱动验证
    details: 每一条验证结论都有截图、DOM 快照、网络请求等多维度证据支撑，结果可追溯、可复核。
  - icon: 🧩
    title: MCP 原生协议
    details: 基于 Model Context Protocol，无缝接入 Cursor、Claude、Windsurf、Trae 等主流 AI 客户端。
  - icon: 🎯
    title: 76 个工具全覆盖
    details: 浏览器操作、视觉对比、元素定位、错误修复、会话管理、系统工具，开箱即用。
  - icon: 🔄
    title: 7 阶段验证闭环
    details: 从环境准备到最终验证，完整的自动化验证流程，发现问题自动修复并重新验证。
  - icon: 📸
    title: 视觉回归测试
    details: pixelmatch 像素级对比，支持基线图管理和差异高亮，精准捕捉 UI 变化。
  - icon: 🔧
    title: 智能错误修复
    details: 内置 23 种错误修复模式，覆盖前端、后端、数据库等常见问题，自动定位快速修复。
---

## 快速体验

```bash
# 全局安装
npm install -g ai-verify-mcp

# 健康检查
ai-verify-mcp health

# HTTP 模式启动
ai-verify-mcp http --port 3000
```

::: tip 支持的 AI 客户端
Cursor · Claude Desktop · Windsurf · Trae · Cline · Copilot · Continue.dev
:::
