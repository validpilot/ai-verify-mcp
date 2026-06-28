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
      text: 立即安装 (npm)
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

<div class="hero-bg"></div>

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

> 💡 **只需 30 秒**，验证你的环境是否就绪：

```bash
# 全局安装
npm install -g ai-verify-mcp

# 健康检查
ai-verify-mcp health

# HTTP 模式启动
ai-verify-mcp http --port 3000
```

<div class="terminal-demo">
  <div class="terminal-header">
    <div class="terminal-dot red"></div>
    <div class="terminal-dot yellow"></div>
    <div class="terminal-dot green"></div>
    <span class="terminal-title">Terminal — ai-verify-mcp</span>
  </div>
  <div class="terminal-body">
    <div class="terminal-line"><span class="prompt">$</span> npm install -g ai-verify-mcp</div>
    <div class="terminal-line dim">added 47 packages in 3s</div>
    <div class="terminal-line">&nbsp;</div>
    <div class="terminal-line"><span class="prompt">$</span> ai-verify-mcp health</div>
    <div class="terminal-line"><span class="success">✓</span> Node.js: v20.10.0 <span class="ok">OK</span></div>
    <div class="terminal-line"><span class="success">✓</span> Playwright: 1.61.1 <span class="ok">OK</span></div>
    <div class="terminal-line"><span class="success">✓</span> Tools loaded: 76 <span class="ok">OK</span></div>
    <div class="terminal-line"><span class="success">✓</span> MCP server: ready <span class="ok">OK</span></div>
    <div class="terminal-line">&nbsp;</div>
    <div class="terminal-line success-bold">🎉 All checks passed! Ready to verify.</div>
  </div>
</div>

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
.hero-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 600px;
  background:
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.15), transparent),
    radial-gradient(ellipse 60% 40% at 80% 10%, rgba(139, 92, 246, 0.1), transparent),
    radial-gradient(ellipse 50% 30% at 10% 30%, rgba(59, 130, 246, 0.08), transparent);
  pointer-events: none;
  z-index: 0;
}

.VPHomeHero {
  position: relative;
  z-index: 1;
}

.scene-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin: 16px 0 32px;
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
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.12);
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

.terminal-demo {
  margin: 24px 0;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.terminal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
}

.terminal-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.terminal-dot.red { background: #ff5f57; }
.terminal-dot.yellow { background: #febc2e; }
.terminal-dot.green { background: #28c840; }

.terminal-title {
  margin-left: 8px;
  font-size: 13px;
  color: var(--vp-c-text-2);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.terminal-body {
  padding: 16px 20px;
  background: #0d1117;
  color: #c9d1d9;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.7;
}

.terminal-line {
  white-space: pre-wrap;
}

.terminal-line .prompt {
  color: #58a6ff;
  margin-right: 8px;
}

.terminal-line.dim {
  color: #6e7681;
}

.terminal-line .success {
  color: #3fb950;
  margin-right: 4px;
}

.terminal-line .ok {
  color: #3fb950;
  font-weight: 600;
  margin-left: 8px;
}

.terminal-line.success-bold {
  color: #3fb950;
  font-weight: 600;
  margin-top: 4px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin: 16px 0 32px;
  text-align: center;
}

.stat-item {
  padding: 24px 12px;
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  transition: all 0.2s;
}

.stat-item:hover {
  border-color: var(--vp-c-brand);
  transform: translateY(-2px);
}

.stat-num {
  font-size: 32px;
  font-weight: 700;
  color: var(--vp-c-brand);
  margin-bottom: 4px;
  background: linear-gradient(135deg, var(--vp-c-brand), #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
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
  .terminal-body {
    font-size: 12px;
    padding: 12px;
  }
}

.dark .terminal-demo {
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.dark .scene-card:hover,
.dark .stat-item:hover {
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.2);
}
</style>
