---
layout: home

hero:
  name: AI-Verify MCP
  text: 拒绝 AI 幻觉
  tagline: 让每一行 AI 生成的代码，都有证据、可追溯、敢上线。基于 MCP 协议，一键接入 Cursor、Claude、Windsurf，76 个工具全自动验证，截图 / DOM / 网络请求全链路留痕。
  image:
    src: /logo.svg
    alt: AI-Verify MCP
  actions:
    - theme: brand
      text: 立即安装 (npm)
      link: /guide/getting-started
    - theme: alt
      text: 查看 76+ 工具
      link: /tools/overview
    - theme: alt
      text: ⭐ GitHub
      link: https://github.com/validpilot/ai-verify-mcp

features:
  - icon: 🔍
    title: 多维证据链
    details: 截图、DOM 快照、网络请求三重取证，Bug 无所遁形
  - icon: 🔌
    title: 无缝接入主流 AI
    details: Cursor / Claude / Windsurf / Trae 开箱即用，零配置
  - icon: 🧰
    title: 76+ 原子工具
    details: 浏览器操作·视觉对比·数据校验·错误修复·一应俱全
  - icon: ♻️
    title: 自动修复闭环
    details: 发现问题自动定位、自动重试、人工只需确认结果
  - icon: 📊
    title: 像素级视觉回归
    details: pixelmatch 精准比对，基线图管理，UI 变化一目了然
  - icon: 🛡️
    title: 安全脱敏
    details: 敏感信息自动遮蔽，日志/截图/URL 全程安全可控
---

<div class="hero-bg"></div>

## 谁在用

<div class="scene-grid">
  <div class="scene-card">
    <div class="scene-icon">🎨</div>
    <div class="scene-title">前端工程师</div>
    <div class="scene-desc">AI 写的页面敢直接上线吗？像素级视觉对比，让 UI 还原度有保障</div>
  </div>
  <div class="scene-card">
    <div class="scene-icon">🧪</div>
    <div class="scene-title">测试工程师</div>
    <div class="scene-desc">不用写脚本，一句话让 AI 跑完回归测试，结果带截图带证据</div>
  </div>
  <div class="scene-card">
    <div class="scene-icon">🚀</div>
    <div class="scene-title">全栈开发者</div>
    <div class="scene-desc">接口返回对不对？数据库有没有脏数据？AI 帮你验证得明明白白</div>
  </div>
  <div class="scene-card">
    <div class="scene-icon">🤖</div>
    <div class="scene-title">AI 应用开发者</div>
    <div class="scene-desc">给你的 Agent 装上验证引擎，输出结果不再靠猜，可信可追溯</div>
  </div>
</div>

## 30 秒启动验证服务

> 💡 复制下面的命令，体验一下验证有多简单

```bash
# 全局安装
npm install -g ai-verify-mcp

# 健康检查（验证环境是否就绪）
ai-verify-mcp health

# HTTP 模式启动（默认端口 3000）
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

::: tip 已支持的 AI 客户端
Cursor · Claude Desktop · Windsurf · Trae · Cline · Copilot · Continue.dev
:::

## 为什么选择 AI-Verify MCP

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
    <div class="stat-num">0</div>
    <div class="stat-label">人工猜测</div>
  </div>
</div>

<div class="cta-section">
  <div class="cta-title">别再靠感觉验证 AI 输出了</div>
  <div class="cta-desc">安装只需 30 秒，从此每一行代码都有证据</div>
  <a href="/guide/getting-started" class="cta-btn">立即开始 →</a>
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

.cta-section {
  margin: 48px 0 24px;
  padding: 40px 32px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1));
  border: 1px solid var(--vp-c-divider);
  text-align: center;
}

.cta-title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 8px;
}

.cta-desc {
  font-size: 15px;
  color: var(--vp-c-text-2);
  margin-bottom: 20px;
}

.cta-btn {
  display: inline-block;
  padding: 12px 32px;
  border-radius: 8px;
  background: var(--vp-c-brand);
  color: white !important;
  text-decoration: none;
  font-weight: 600;
  transition: all 0.2s;
}

.cta-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
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
  .cta-section {
    padding: 32px 20px;
  }
  .cta-title {
    font-size: 20px;
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
