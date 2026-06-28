---
layout: home

hero:
  name: AI-Verify MCP
  text: 拒绝 AI 幻觉
  tagline: 让每一行生成的代码都经过自动化验证。基于 MCP 协议，为 Cursor、Claude、Windsurf 提供证据级验证能力，支持截图、DOM、网络请求全链路回溯。
  image:
    src: /logo.svg
    alt: AI-Verify MCP
  actions:
    - theme: brand
      text: 立即安装
      link: /guide/getting-started
    - theme: alt
      text: 76+ 工具库
      link: /tools/overview
    - theme: alt
      text: GitHub
      link: https://github.com/validpilot/ai-verify-mcp

features:
  - icon: 🛡️
    title: 多维证据链
    details: 自动捕获截图、DOM 快照与网络请求，让 Bug 无处遁形。
  - icon: 🧩
    title: 无缝接入主流 AI
    details: 完美适配 Cursor、Claude Desktop、Windsurf、Trae，无需复杂配置即可调用。
  - icon: 🎯
    title: 76+ 原子化工具库
    details: 涵盖浏览器操作、视觉对比、数据库校验，开箱即用。
  - icon: 🔄
    title: 7 阶段验证闭环
    details: 从环境准备到最终验证，完整自动化流程，发现问题自动修复并重试。
  - icon: 📸
    title: 像素级视觉对比
    details: pixelmatch 精准对比，支持基线图管理和差异高亮，UI 变化一目了然。
  - icon: 🔧
    title: 自愈式错误修复
    details: 内置 23 种修复模式，覆盖前后端数据库常见问题，自动定位快速修复。
---

## 适用场景

<div class="scene-grid">
  <div class="scene-card">
    <div class="scene-icon">🎨</div>
    <div class="scene-title">前端开发</div>
    <div class="scene-desc">UI 走查自动化，像素级还原度检测，告别人工点来点去</div>
  </div>
  <div class="scene-card">
    <div class="scene-icon">🧪</div>
    <div class="scene-title">测试工程师</div>
    <div class="scene-desc">无需写代码，自然语言驱动 AI 执行回归测试</div>
  </div>
  <div class="scene-card">
    <div class="scene-icon">🚀</div>
    <div class="scene-title">全栈开发者</div>
    <div class="scene-desc">API 接口返回值实时结构化验证，数据库断言更可靠</div>
  </div>
  <div class="scene-card">
    <div class="scene-icon">🤖</div>
    <div class="scene-title">AI 应用构建者</div>
    <div class="scene-desc">为 AI Agent 加上验证闭环，让输出结果可信、可追溯</div>
  </div>
</div>

## 快速体验

> 💡 **只需 30 秒**，在终端运行以下命令即可启动服务：

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

## 为什么选择我们

<div class="stats-grid">
  <div class="stat-item">
    <div class="stat-num">76+</div>
    <div class="stat-label">验证工具</div>
  </div>
  <div class="stat-item">
    <div class="stat-num">23+</div>
    <div class="stat-label">修复模式</div>
  </div>
  <div class="stat-item">
    <div class="stat-num">7</div>
    <div class="stat-label">验证阶段</div>
  </div>
  <div class="stat-item">
    <div class="stat-num">100%</div>
    <div class="stat-label">证据可追溯</div>
  </div>
</div>

<style>
.scene-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-top: 16px 0 32px;
}

.scene-card {
  padding: 20px;
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  transition: all 0.2s;
}

.scene-card:hover {
  border-color: var(--vp-c-brand);
  transform: translateY(-2px);
}

.scene-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.scene-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.scene-desc {
  font-size: 14px;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-top: 16px 0 32px;
  text-align: center;
}

.stat-item {
  padding: 24px 12px;
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
}

.stat-num {
  font-size: 32px;
  font-weight: 700;
  color: var(--vp-c-brand);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 14px;
  color: var(--vp-c-text-2);
}

@media (max-width: 768px) {
  .scene-grid {
    grid-template-columns: 1fr;
  }
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
