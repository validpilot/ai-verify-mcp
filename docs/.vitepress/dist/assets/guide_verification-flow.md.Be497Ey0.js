import{_ as s,o as n,c as l,a2 as i}from"./chunks/framework.CIFdlppq.js";const u=JSON.parse('{"title":"验证流程","description":"","frontmatter":{},"headers":[],"relativePath":"guide/verification-flow.md","filePath":"guide/verification-flow.md","lastUpdated":1782678748000}'),e={name:"guide/verification-flow.md"};function p(t,a,o,c,r,h){return n(),l("div",null,[...a[0]||(a[0]=[i(`<h1 id="验证流程" tabindex="-1">验证流程 <a class="header-anchor" href="#验证流程" aria-label="Permalink to &quot;验证流程&quot;">​</a></h1><p>AI-Verify MCP 支持完整的 7 阶段验证闭环，从环境准备到最终验证，全流程自动化。</p><h2 id="_7-阶段验证流程" tabindex="-1">7 阶段验证流程 <a class="header-anchor" href="#_7-阶段验证流程" aria-label="Permalink to &quot;7 阶段验证流程&quot;">​</a></h2><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>┌─────────────┐    ┌─────────────┐    ┌─────────────┐</span></span>
<span class="line"><span>│  1. 环境准备  │ →  │ 2. 页面打开  │ →  │  3. 证据收集  │</span></span>
<span class="line"><span>└─────────────┘    └─────────────┘    └─────────────┘</span></span>
<span class="line"><span>                                                       ↓</span></span>
<span class="line"><span>┌─────────────┐    ┌─────────────┐    ┌─────────────┐</span></span>
<span class="line"><span>│  6. 报告生成  │ ←  │ 5. 问题修复  │ ←  │  4. 错误诊断  │</span></span>
<span class="line"><span>└─────────────┘    └─────────────┘    └─────────────┘</span></span>
<span class="line"><span>          ↓</span></span>
<span class="line"><span>    ┌─────────────┐</span></span>
<span class="line"><span>    │  7. 验证闭环  │</span></span>
<span class="line"><span>    └─────────────┘</span></span></code></pre></div><h2 id="阶段详解" tabindex="-1">阶段详解 <a class="header-anchor" href="#阶段详解" aria-label="Permalink to &quot;阶段详解&quot;">​</a></h2><h3 id="阶段-1-环境准备" tabindex="-1">阶段 1：环境准备 <a class="header-anchor" href="#阶段-1-环境准备" aria-label="Permalink to &quot;阶段 1：环境准备&quot;">​</a></h3><ul><li>创建浏览器会话</li><li>配置视口大小</li><li>注入追踪器</li><li>设置网络拦截</li></ul><h3 id="阶段-2-页面打开" tabindex="-1">阶段 2：页面打开 <a class="header-anchor" href="#阶段-2-页面打开" aria-label="Permalink to &quot;阶段 2：页面打开&quot;">​</a></h3><ul><li>导航到目标 URL</li><li>等待页面加载完成</li><li>首屏截图</li><li>基础 DOM 快照</li></ul><h3 id="阶段-3-证据收集" tabindex="-1">阶段 3：证据收集 <a class="header-anchor" href="#阶段-3-证据收集" aria-label="Permalink to &quot;阶段 3：证据收集&quot;">​</a></h3><ul><li>全页截图</li><li>DOM 结构快照</li><li>Console 错误捕获</li><li>网络请求记录</li><li>无障碍扫描（a11y）</li><li>性能指标采集</li></ul><h3 id="阶段-4-错误诊断" tabindex="-1">阶段 4：错误诊断 <a class="header-anchor" href="#阶段-4-错误诊断" aria-label="Permalink to &quot;阶段 4：错误诊断&quot;">​</a></h3><ul><li>Console 错误聚合</li><li>网络失败请求分析</li><li>根因自动定位</li><li>置信度评估</li><li>修复模式匹配（23 种内置模式）</li></ul><h3 id="阶段-5-问题修复" tabindex="-1">阶段 5：问题修复 <a class="header-anchor" href="#阶段-5-问题修复" aria-label="Permalink to &quot;阶段 5：问题修复&quot;">​</a></h3><ul><li>自动生成修复建议</li><li>前端问题修复（CSS/JS/元素定位）</li><li>后端问题修复（API/数据库）</li><li>多策略尝试</li></ul><h3 id="阶段-6-报告生成" tabindex="-1">阶段 6：报告生成 <a class="header-anchor" href="#阶段-6-报告生成" aria-label="Permalink to &quot;阶段 6：报告生成&quot;">​</a></h3><ul><li>JSON 结构化报告</li><li>Markdown 可读报告</li><li>HTML 可视化报告</li><li>证据链归档</li></ul><h3 id="阶段-7-验证闭环" tabindex="-1">阶段 7：验证闭环 <a class="header-anchor" href="#阶段-7-验证闭环" aria-label="Permalink to &quot;阶段 7：验证闭环&quot;">​</a></h3><ul><li>修复后重新验证</li><li>对比修复前后差异</li><li>确认问题是否解决</li><li>输出最终结论</li></ul><h2 id="典型验证场景" tabindex="-1">典型验证场景 <a class="header-anchor" href="#典型验证场景" aria-label="Permalink to &quot;典型验证场景&quot;">​</a></h2><h3 id="场景-1-ai-生成页面验证" tabindex="-1">场景 1：AI 生成页面验证 <a class="header-anchor" href="#场景-1-ai-生成页面验证" aria-label="Permalink to &quot;场景 1：AI 生成页面验证&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户: &quot;帮我验证这个登录页面&quot;</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>1. 打开页面 + 截图</span></span>
<span class="line"><span>2. 输入账号密码 + 点击登录</span></span>
<span class="line"><span>3. 检查 Console 错误 + 网络请求</span></span>
<span class="line"><span>4. 生成验证报告</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>输出: 通过/失败 + 证据链</span></span></code></pre></div><h3 id="场景-2-视觉回归测试" tabindex="-1">场景 2：视觉回归测试 <a class="header-anchor" href="#场景-2-视觉回归测试" aria-label="Permalink to &quot;场景 2：视觉回归测试&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户: &quot;对比一下这个页面和基线图&quot;</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>1. 加载基线截图</span></span>
<span class="line"><span>2. 当前页面截图</span></span>
<span class="line"><span>3. pixelmatch 像素对比</span></span>
<span class="line"><span>4. 生成差异高亮图</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>输出: 差异像素数 + 对比图</span></span></code></pre></div><h3 id="场景-3-错误诊断修复" tabindex="-1">场景 3：错误诊断修复 <a class="header-anchor" href="#场景-3-错误诊断修复" aria-label="Permalink to &quot;场景 3：错误诊断修复&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户: &quot;这个页面报错了，帮我看看&quot;</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>1. 打开页面复现问题</span></span>
<span class="line"><span>2. 收集 Console 错误和网络请求</span></span>
<span class="line"><span>3. 自动诊断根因</span></span>
<span class="line"><span>4. 生成修复建议</span></span>
<span class="line"><span>5. 应用修复 + 重新验证</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>输出: 问题原因 + 修复方案 + 验证结果</span></span></code></pre></div>`,26)])])}const b=s(e,[["render",p]]);export{u as __pageData,b as default};
