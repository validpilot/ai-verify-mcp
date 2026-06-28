import{_ as a,o as n,c as e,a2 as t}from"./chunks/framework.CIFdlppq.js";const u=JSON.parse('{"title":"ai-verify-mcp 日志排查手册","description":"","frontmatter":{},"headers":[],"relativePath":"public/legacy/LOG-TROUBLESHOOTING.md","filePath":"public/legacy/LOG-TROUBLESHOOTING.md","lastUpdated":1782678748000}'),i={name:"public/legacy/LOG-TROUBLESHOOTING.md"};function p(l,s,o,r,d,c){return n(),e("div",null,[...s[0]||(s[0]=[t(`<h1 id="ai-verify-mcp-日志排查手册" tabindex="-1">ai-verify-mcp 日志排查手册 <a class="header-anchor" href="#ai-verify-mcp-日志排查手册" aria-label="Permalink to &quot;ai-verify-mcp 日志排查手册&quot;">​</a></h1><blockquote><p>快速定位 MCP Server 启动问题、工具调用失败、浏览器崩溃、HTTP 认证等常见故障。</p></blockquote><hr><h2 id="一、日志在哪里" tabindex="-1">一、日志在哪里？ <a class="header-anchor" href="#一、日志在哪里" aria-label="Permalink to &quot;一、日志在哪里？&quot;">​</a></h2><h3 id="运行时日志" tabindex="-1">运行时日志 <a class="header-anchor" href="#运行时日志" aria-label="Permalink to &quot;运行时日志&quot;">​</a></h3><table tabindex="0"><thead><tr><th>日志源</th><th>查看方式</th><th>说明</th></tr></thead><tbody><tr><td><strong>控制台 (stdio)</strong></td><td>终端窗口</td><td>MCP Server 的主进程日志，包含启动信息和运行时错误</td></tr><tr><td><strong>浏览器 Console</strong></td><td><code>browser_errors</code> 工具</td><td>目标页面内的 JS 错误、网络请求失败</td></tr><tr><td><strong>浏览器网络</strong></td><td><code>browser_network</code> 工具</td><td>目标页面的所有 HTTP 请求状态码</td></tr><tr><td><strong>MCP stderr</strong></td><td>AI 客户端日志（IDE 输出面板）</td><td>MCP 协议层的错误，无法序列化或工具未注册</td></tr></tbody></table><h3 id="产物文件" tabindex="-1">产物文件 <a class="header-anchor" href="#产物文件" aria-label="Permalink to &quot;产物文件&quot;">​</a></h3><table tabindex="0"><thead><tr><th>目录</th><th>默认路径</th><th>内容</th></tr></thead><tbody><tr><td>截图</td><td><code>./screenshots/</code></td><td>浏览器操作过程中的截图证据</td></tr><tr><td>跟踪</td><td><code>./traces/</code></td><td>Playwright 跟踪文件（.zip）</td></tr><tr><td>HAR</td><td><code>./har/</code></td><td>网络请求归档文件（.har）</td></tr><tr><td>差异报告</td><td><code>./artifacts/phase1/</code></td><td>像素级截图差异对比图</td></tr><tr><td>证据摘要</td><td><code>./artifacts/</code></td><td>Console/Network/DOM 综合摘要</td></tr></tbody></table><blockquote><p>可通过环境变量 <code>VALIDPILOT_ARTIFACTS_DIR</code> 自定义产物输出目录。</p></blockquote><hr><h2 id="二、常用排查流程" tabindex="-1">二、常用排查流程 <a class="header-anchor" href="#二、常用排查流程" aria-label="Permalink to &quot;二、常用排查流程&quot;">​</a></h2><h3 id="流程-1-server-启动不了" tabindex="-1">流程 1：Server 启动不了 <a class="header-anchor" href="#流程-1-server-启动不了" aria-label="Permalink to &quot;流程 1：Server 启动不了&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>无法启动</span></span>
<span class="line"><span>  ├─ node 版本 &lt; 18？</span></span>
<span class="line"><span>  │   └─ node --version → 升级到 ≥ 18</span></span>
<span class="line"><span>  ├─ 先试试 CLI 子命令能否独立运行？</span></span>
<span class="line"><span>  │   ├─ ai-verify-mcp --version       → 看版本号（验证包安装正常）</span></span>
<span class="line"><span>  │   ├─ ai-verify-mcp health           → 看 Playwright 可用性（不依赖 MCP Server）</span></span>
<span class="line"><span>  │   └─ ai-verify-mcp validate --url &lt;url&gt; → 看能不能直接验证一个页面</span></span>
<span class="line"><span>  ├─ 端口 3456 被占用？（HTTP 模式）</span></span>
<span class="line"><span>  │   └─ netstat -ano | findstr :3456 → 换端口或关冲突进程</span></span>
<span class="line"><span>  ├─ npm 包损坏？</span></span>
<span class="line"><span>  │   └─ npm cache clean --force &amp;&amp; npm install -g ai-verify-mcp</span></span>
<span class="line"><span>  └─ 权限不足？</span></span>
<span class="line"><span>      └─ 检查 npm 安装目录权限</span></span></code></pre></div><h3 id="流程-2-ai-客户端提示-tool-not-found" tabindex="-1">流程 2：AI 客户端提示 &quot;tool not found&quot; <a class="header-anchor" href="#流程-2-ai-客户端提示-tool-not-found" aria-label="Permalink to &quot;流程 2：AI 客户端提示 &quot;tool not found&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>工具不可见</span></span>
<span class="line"><span>  ├─ 包没装上？</span></span>
<span class="line"><span>  │   └─ npx ai-verify-mcp health → 检查返回</span></span>
<span class="line"><span>  ├─ MCP 配置错误？</span></span>
<span class="line"><span>  │   └─ 检查 mcp.json → command/args 是否正确</span></span>
<span class="line"><span>  ├─ Trae 40 工具上限？</span></span>
<span class="line"><span>  │   └─ 超过 40 工具会被丢弃 → 减少 MCP Server 数量</span></span>
<span class="line"><span>  └─ Trae 8000 字符上限？</span></span>
<span class="line"><span>      └─ 工具描述超长会被截断 → 参考 Trae FAQ</span></span></code></pre></div><h3 id="流程-3-浏览器操作失败" tabindex="-1">流程 3：浏览器操作失败 <a class="header-anchor" href="#流程-3-浏览器操作失败" aria-label="Permalink to &quot;流程 3：浏览器操作失败&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>页面操作报错</span></span>
<span class="line"><span>  ├─ 浏览器未启动？</span></span>
<span class="line"><span>  │   └─ browser_sessions → 检查是否有活跃会话</span></span>
<span class="line"><span>  ├─ 目标页面无法访问？</span></span>
<span class="line"><span>  │   └─ 手动浏览器打开 target URL 检查</span></span>
<span class="line"><span>  ├─ 元素选择器无效？</span></span>
<span class="line"><span>  │   └─ browser_find_element → 用实际 DOM 查选择器</span></span>
<span class="line"><span>  └─ 无头模式异常？</span></span>
<span class="line"><span>      └─ 设置 VALIDPILOT_HEADLESS=false 启动有头模式调试</span></span></code></pre></div><hr><h2 id="三、常见错误与解决方案" tabindex="-1">三、常见错误与解决方案 <a class="header-anchor" href="#三、常见错误与解决方案" aria-label="Permalink to &quot;三、常见错误与解决方案&quot;">​</a></h2><h3 id="错误-1-econnrefused-或端口被占用" tabindex="-1">错误 1：<code>ECONNREFUSED</code> 或端口被占用 <a class="header-anchor" href="#错误-1-econnrefused-或端口被占用" aria-label="Permalink to &quot;错误 1：\`ECONNREFUSED\` 或端口被占用&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误示例：</span></span>
<span class="line"><span>  Error: listen EADDRINUSE :::3456</span></span>
<span class="line"><span>  Port 3456 已被占用</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原因：</span></span>
<span class="line"><span>  另一个进程已经占用了该端口</span></span>
<span class="line"><span></span></span>
<span class="line"><span>解决：</span></span>
<span class="line"><span>  1. netstat -ano | findstr :3456  → 查 PID</span></span>
<span class="line"><span>  2. taskkill /PID &lt;PID&gt; /F          → 杀进程</span></span>
<span class="line"><span>  3. 或使用其他端口启动：--port 3457</span></span></code></pre></div><h3 id="错误-2-mcp-api-key-认证失败-http-模式" tabindex="-1">错误 2：MCP API Key 认证失败（HTTP 模式） <a class="header-anchor" href="#错误-2-mcp-api-key-认证失败-http-模式" aria-label="Permalink to &quot;错误 2：MCP API Key 认证失败（HTTP 模式）&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误示例：</span></span>
<span class="line"><span>  HTTP 401 Unauthorized</span></span>
<span class="line"><span>  Invalid API Key</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原因：</span></span>
<span class="line"><span>  HTTP 模式启动了 MCP_API_KEY 认证，但请求未携带正确的 key</span></span>
<span class="line"><span></span></span>
<span class="line"><span>解决：</span></span>
<span class="line"><span>  1. 确认服务端设置的 MCP_API_KEY 环境变量值</span></span>
<span class="line"><span>  2. 请求头中加 Authorization: Bearer &lt;key&gt;</span></span>
<span class="line"><span>  3. 或设置 MCP_API_KEY= 空值禁用认证（仅开发环境）</span></span></code></pre></div><h3 id="错误-3-浏览器会话超时" tabindex="-1">错误 3：浏览器会话超时 <a class="header-anchor" href="#错误-3-浏览器会话超时" aria-label="Permalink to &quot;错误 3：浏览器会话超时&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误示例：</span></span>
<span class="line"><span>  Timeout 30000ms exceeded</span></span>
<span class="line"><span>  page.click: target closed</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原因：</span></span>
<span class="line"><span>  浏览器页面长时间无操作，自动关闭</span></span>
<span class="line"><span></span></span>
<span class="line"><span>解决：</span></span>
<span class="line"><span>  1. 重新创建会话：browser_session_create</span></span>
<span class="line"><span>  2. 操作之间不要间隔太久</span></span>
<span class="line"><span>  3. 检查浏览器是否被手动关闭</span></span></code></pre></div><h3 id="错误-4-playwright-未安装" tabindex="-1">错误 4：Playwright 未安装 <a class="header-anchor" href="#错误-4-playwright-未安装" aria-label="Permalink to &quot;错误 4：Playwright 未安装&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误示例：</span></span>
<span class="line"><span>  browserType.launch: Executable doesn&#39;t exist at ...</span></span>
<span class="line"><span>  ╔══════════════════════════════════════════════════════════╗</span></span>
<span class="line"><span>  ║ Looks like Playwright Test or Playwright was just       ║</span></span>
<span class="line"><span>  ║ installed. Please install browser dependencies...       ║</span></span>
<span class="line"><span>  ╚══════════════════════════════════════════════════════════╝</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原因：</span></span>
<span class="line"><span>  Playwright 浏览器二进制文件未安装</span></span>
<span class="line"><span></span></span>
<span class="line"><span>解决：</span></span>
<span class="line"><span>  npx playwright install chromium    # 安装 Chromium</span></span>
<span class="line"><span>  npx playwright install-deps chromium  # 安装系统依赖（Linux）</span></span></code></pre></div><h3 id="错误-5-截图路径不存在" tabindex="-1">错误 5：截图路径不存在 <a class="header-anchor" href="#错误-5-截图路径不存在" aria-label="Permalink to &quot;错误 5：截图路径不存在&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误示例：</span></span>
<span class="line"><span>  ENOENT: no such file or directory, open &#39;screenshots/...png&#39;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原因：</span></span>
<span class="line"><span>  screenshots/ 目录未自动创建（极端情况）</span></span>
<span class="line"><span></span></span>
<span class="line"><span>解决：</span></span>
<span class="line"><span>  1. 手动创建：mkdir screenshots</span></span>
<span class="line"><span>  2. 或执行一次 browser_open 让系统自动创建</span></span></code></pre></div><h3 id="错误-6-stderr-出现-json-解析错误" tabindex="-1">错误 6：stderr 出现 JSON 解析错误 <a class="header-anchor" href="#错误-6-stderr-出现-json-解析错误" aria-label="Permalink to &quot;错误 6：stderr 出现 JSON 解析错误&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>错误示例：</span></span>
<span class="line"><span>  [STDERR] SyntaxError: Unexpected token ...</span></span>
<span class="line"><span>  [STDERR]   at JSON.parse (...)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>原因：</span></span>
<span class="line"><span>  MCP 协议通信中出现了非 JSON 格式的输出混入 stdout</span></span>
<span class="line"><span></span></span>
<span class="line"><span>解决：</span></span>
<span class="line"><span>  1. 检查是否有 console.log 语句混入 stdin/stdout 流</span></span>
<span class="line"><span>  2. 使用 --http 模式代替 stdio 模式</span></span>
<span class="line"><span>  3. 在 AI 客户端配置中加 &quot;stderr&quot;: true 将 stderr 输出到日志</span></span></code></pre></div><hr><h2 id="四、调试技巧" tabindex="-1">四、调试技巧 <a class="header-anchor" href="#四、调试技巧" aria-label="Permalink to &quot;四、调试技巧&quot;">​</a></h2><h3 id="开启详细日志" tabindex="-1">开启详细日志 <a class="header-anchor" href="#开启详细日志" aria-label="Permalink to &quot;开启详细日志&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># HTTP 模式（带有请求日志）</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">node</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> server.js</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --http</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --port</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 3456</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 设置环境变量</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> VALIDPILOT_REDACTION=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # 关闭敏感信息脱敏，看到完整内容</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> VALIDPILOT_HEADLESS=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # 关闭无头模式，看到浏览器界面</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 保存 stderr 到文件</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">npx</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -y</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ai-verify-mcp</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> 2&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> mcp-error.log</span></span></code></pre></div><h3 id="验证-mcp-协议握手" tabindex="-1">验证 MCP 协议握手 <a class="header-anchor" href="#验证-mcp-协议握手" aria-label="Permalink to &quot;验证 MCP 协议握手&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 用 test-mcp-protocol.js 验证完整的 initialize → tools/list 流程</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">node</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> test-mcp-protocol.js</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 预期输出：</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># === initialize 响应 ===</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># serverInfo: {&quot;name&quot;:&quot;ai-verify-mcp&quot;,&quot;version&quot;:&quot;1.0.0&quot;}</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># === tools/list 响应 ===</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 工具数量: 75</span></span></code></pre></div><h3 id="检查-http-接口" tabindex="-1">检查 HTTP 接口 <a class="header-anchor" href="#检查-http-接口" aria-label="Permalink to &quot;检查 HTTP 接口&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 启动 HTTP 模式后</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> http://localhost:3456/health</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># 预期返回：</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># {&quot;ok&quot;:true,&quot;name&quot;:&quot;ai-verify-mcp&quot;,&quot;version&quot;:&quot;1.0.0&quot;,&quot;mode&quot;:&quot;http&quot;}</span></span></code></pre></div><hr><h2 id="五、ai-客户端日志查看" tabindex="-1">五、AI 客户端日志查看 <a class="header-anchor" href="#五、ai-客户端日志查看" aria-label="Permalink to &quot;五、AI 客户端日志查看&quot;">​</a></h2><table tabindex="0"><thead><tr><th>客户端</th><th>查看日志的方式</th></tr></thead><tbody><tr><td><strong>Cursor</strong></td><td><code>Cmd+Shift+P</code> → &quot;Developer: Toggle Developer Tools&quot; → Console 面板</td></tr><tr><td><strong>Claude Desktop</strong></td><td>设置 → 开发者 → 查看 MCP Server 日志</td></tr><tr><td><strong>Windsurf</strong></td><td>终端面板 → MCP Server 标签页</td></tr><tr><td><strong>Trae</strong></td><td>设置 → MCP → Server 状态 → 查看日志</td></tr><tr><td><strong>Claude Code</strong></td><td><code>claude mcp logs</code></td></tr><tr><td><strong>Cline</strong></td><td>扩展程序输出面板 → Cline 日志</td></tr></tbody></table><hr><h2 id="六、日志中的关键标记" tabindex="-1">六、日志中的关键标记 <a class="header-anchor" href="#六、日志中的关键标记" aria-label="Permalink to &quot;六、日志中的关键标记&quot;">​</a></h2><table tabindex="0"><thead><tr><th>标记</th><th>含义</th><th>应对</th></tr></thead><tbody><tr><td><code>[AUDIT]</code></td><td>审计日志，记录所有工具调用</td><td>用于安全审计</td></tr><tr><td><code>[SECURITY]</code></td><td>安全相关警告</td><td>按提示建议处理</td></tr><tr><td><code>[browserPool]</code></td><td>浏览器连接池状态</td><td>排查会话泄漏</td></tr><tr><td><code>[STDERR]</code></td><td>stderr 输出，通常是错误</td><td>需要重点排查</td></tr><tr><td><code>console.error</code></td><td>页面内 JS 报错</td><td>修复页面代码</td></tr><tr><td><code>pageerror</code></td><td>页面未捕获异常</td><td>修复页面代码</td></tr></tbody></table><hr><h2 id="七、环境变量速查" tabindex="-1">七、环境变量速查 <a class="header-anchor" href="#七、环境变量速查" aria-label="Permalink to &quot;七、环境变量速查&quot;">​</a></h2><table tabindex="0"><thead><tr><th>变量</th><th>默认值</th><th>作用</th></tr></thead><tbody><tr><td><code>MCP_API_KEY</code></td><td>未设置</td><td>HTTP 模式认证密钥，不设置则无认证</td></tr><tr><td><code>MCP_HTTP_PORT</code></td><td><code>3456</code></td><td>HTTP 模式监听端口</td></tr><tr><td><code>MCP_MODE</code></td><td><code>stdio</code></td><td>运行模式，设为 <code>http</code> 启用 HTTP</td></tr><tr><td><code>VALIDPILOT_ARTIFACTS_DIR</code></td><td><code>./artifacts/</code></td><td>产物目录路径</td></tr><tr><td><code>VALIDPILOT_REDACTION</code></td><td><code>true</code></td><td>是否脱敏敏感信息</td></tr><tr><td><code>VALIDPILOT_HEADLESS</code></td><td><code>true</code></td><td>是否启用无头模式</td></tr><tr><td><code>VALIDPILOT_ALLOWLIST</code></td><td><code>localhost,127.0.0.1,::1</code></td><td>允许访问的域名白名单</td></tr><tr><td><code>VALIDPILOT_BLOCKED_HOSTS</code></td><td>空</td><td>禁止访问的域名黑名单</td></tr></tbody></table><hr><h2 id="english-version" tabindex="-1">English Version <a class="header-anchor" href="#english-version" aria-label="Permalink to &quot;English Version&quot;">​</a></h2><h1 id="ai-verify-mcp-log-troubleshooting-guide" tabindex="-1">ai-verify-mcp Log Troubleshooting Guide <a class="header-anchor" href="#ai-verify-mcp-log-troubleshooting-guide" aria-label="Permalink to &quot;ai-verify-mcp Log Troubleshooting Guide&quot;">​</a></h1><blockquote><p>Quickly locate common issues such as MCP Server startup failures, tool invocation errors, browser crashes, and HTTP authentication problems.</p></blockquote><hr><h2 id="_1-where-are-the-logs" tabindex="-1">1. Where Are the Logs? <a class="header-anchor" href="#_1-where-are-the-logs" aria-label="Permalink to &quot;1. Where Are the Logs?&quot;">​</a></h2><h3 id="runtime-logs" tabindex="-1">Runtime Logs <a class="header-anchor" href="#runtime-logs" aria-label="Permalink to &quot;Runtime Logs&quot;">​</a></h3><table tabindex="0"><thead><tr><th>Log Source</th><th>How to View</th><th>Description</th></tr></thead><tbody><tr><td><strong>Console (stdio)</strong></td><td>Terminal window</td><td>MCP Server main process logs, including startup info and runtime errors</td></tr><tr><td><strong>Browser Console</strong></td><td><code>browser_errors</code> tool</td><td>JS errors and network request failures within the target page</td></tr><tr><td><strong>Browser Network</strong></td><td><code>browser_network</code> tool</td><td>HTTP request status codes for the target page</td></tr><tr><td><strong>MCP stderr</strong></td><td>AI client logs (IDE output panel)</td><td>MCP protocol layer errors, serialization failures, or unregistered tools</td></tr></tbody></table><h3 id="artifact-files" tabindex="-1">Artifact Files <a class="header-anchor" href="#artifact-files" aria-label="Permalink to &quot;Artifact Files&quot;">​</a></h3><table tabindex="0"><thead><tr><th>Directory</th><th>Default Path</th><th>Content</th></tr></thead><tbody><tr><td>Screenshots</td><td><code>./screenshots/</code></td><td>Screenshot evidence during browser operations</td></tr><tr><td>Traces</td><td><code>./traces/</code></td><td>Playwright trace files (.zip)</td></tr><tr><td>HAR</td><td><code>./har/</code></td><td>Network request archive files (.har)</td></tr><tr><td>Diff Reports</td><td><code>./artifacts/phase1/</code></td><td>Pixel-level screenshot diff comparison images</td></tr><tr><td>Evidence Summary</td><td><code>./artifacts/</code></td><td>Console/Network/DOM comprehensive summary</td></tr></tbody></table><blockquote><p>You can customize the artifact output directory via the environment variable <code>VALIDPILOT_ARTIFACTS_DIR</code>.</p></blockquote><hr><h2 id="_2-common-troubleshooting-flows" tabindex="-1">2. Common Troubleshooting Flows <a class="header-anchor" href="#_2-common-troubleshooting-flows" aria-label="Permalink to &quot;2. Common Troubleshooting Flows&quot;">​</a></h2><h3 id="flow-1-server-won-t-start" tabindex="-1">Flow 1: Server Won&#39;t Start <a class="header-anchor" href="#flow-1-server-won-t-start" aria-label="Permalink to &quot;Flow 1: Server Won&#39;t Start&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Unable to start</span></span>
<span class="line"><span>  ├─ Node version &lt; 18?</span></span>
<span class="line"><span>  │   └─ node --version → Upgrade to ≥ 18</span></span>
<span class="line"><span>  ├─ Try running CLI subcommands independently first?</span></span>
<span class="line"><span>  │   ├─ ai-verify-mcp --version       → Check version (verifies package installation)</span></span>
<span class="line"><span>  │   ├─ ai-verify-mcp health           → Check Playwright availability (independent of MCP Server)</span></span>
<span class="line"><span>  │   └─ ai-verify-mcp validate --url &lt;url&gt; → Test if a page can be validated directly</span></span>
<span class="line"><span>  ├─ Port 3456 occupied? (HTTP mode)</span></span>
<span class="line"><span>  │   └─ netstat -ano | findstr :3456 → Change port or terminate conflicting process</span></span>
<span class="line"><span>  ├─ npm package corrupted?</span></span>
<span class="line"><span>  │   └─ npm cache clean --force &amp;&amp; npm install -g ai-verify-mcp</span></span>
<span class="line"><span>  └─ Insufficient permissions?</span></span>
<span class="line"><span>      └─ Check npm installation directory permissions</span></span></code></pre></div><h3 id="flow-2-ai-client-shows-tool-not-found" tabindex="-1">Flow 2: AI Client Shows &quot;tool not found&quot; <a class="header-anchor" href="#flow-2-ai-client-shows-tool-not-found" aria-label="Permalink to &quot;Flow 2: AI Client Shows &quot;tool not found&quot;&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Tools not visible</span></span>
<span class="line"><span>  ├─ Package not installed?</span></span>
<span class="line"><span>  │   └─ npx ai-verify-mcp health → Check response</span></span>
<span class="line"><span>  ├─ MCP configuration error?</span></span>
<span class="line"><span>  │   └─ Check mcp.json → Verify command/args are correct</span></span>
<span class="line"><span>  ├─ Trae 40-tool limit?</span></span>
<span class="line"><span>  │   └─ Tools beyond 40 are dropped → Reduce number of MCP Servers</span></span>
<span class="line"><span>  └─ Trae 8000-character limit?</span></span>
<span class="line"><span>      └─ Tool descriptions exceeding limit get truncated → Refer to Trae FAQ</span></span></code></pre></div><h3 id="flow-3-browser-operation-failed" tabindex="-1">Flow 3: Browser Operation Failed <a class="header-anchor" href="#flow-3-browser-operation-failed" aria-label="Permalink to &quot;Flow 3: Browser Operation Failed&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Page operation error</span></span>
<span class="line"><span>  ├─ Browser not launched?</span></span>
<span class="line"><span>  │   └─ browser_sessions → Check for active sessions</span></span>
<span class="line"><span>  ├─ Target page inaccessible?</span></span>
<span class="line"><span>  │   └─ Manually open target URL in browser to verify</span></span>
<span class="line"><span>  ├─ Invalid element selector?</span></span>
<span class="line"><span>  │   └─ browser_find_element → Test selector against actual DOM</span></span>
<span class="line"><span>  └─ Headless mode anomaly?</span></span>
<span class="line"><span>      └─ Set VALIDPILOT_HEADLESS=false to launch in headed mode for debugging</span></span></code></pre></div><hr><h2 id="_3-common-errors-and-solutions" tabindex="-1">3. Common Errors and Solutions <a class="header-anchor" href="#_3-common-errors-and-solutions" aria-label="Permalink to &quot;3. Common Errors and Solutions&quot;">​</a></h2><h3 id="error-1-econnrefused-or-port-already-in-use" tabindex="-1">Error 1: <code>ECONNREFUSED</code> or Port Already in Use <a class="header-anchor" href="#error-1-econnrefused-or-port-already-in-use" aria-label="Permalink to &quot;Error 1: \`ECONNREFUSED\` or Port Already in Use&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Error example:</span></span>
<span class="line"><span>  Error: listen EADDRINUSE :::3456</span></span>
<span class="line"><span>  Port 3456 已被占用</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Cause:</span></span>
<span class="line"><span>  Another process is already using this port</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Solution:</span></span>
<span class="line"><span>  1. netstat -ano | findstr :3456  → Find PID</span></span>
<span class="line"><span>  2. taskkill /PID &lt;PID&gt; /F          → Kill process</span></span>
<span class="line"><span>  3. Or start with a different port: --port 3457</span></span></code></pre></div><h3 id="error-2-mcp-api-key-authentication-failed-http-mode" tabindex="-1">Error 2: MCP API Key Authentication Failed (HTTP Mode) <a class="header-anchor" href="#error-2-mcp-api-key-authentication-failed-http-mode" aria-label="Permalink to &quot;Error 2: MCP API Key Authentication Failed (HTTP Mode)&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Error example:</span></span>
<span class="line"><span>  HTTP 401 Unauthorized</span></span>
<span class="line"><span>  Invalid API Key</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Cause:</span></span>
<span class="line"><span>  MCP_API_KEY authentication is enabled in HTTP mode, but the request does not carry the correct key</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Solution:</span></span>
<span class="line"><span>  1. Confirm the MCP_API_KEY environment variable value set on the server</span></span>
<span class="line"><span>  2. Add Authorization: Bearer &lt;key&gt; to request headers</span></span>
<span class="line"><span>  3. Or set MCP_API_KEY= (empty value) to disable authentication (dev environment only)</span></span></code></pre></div><h3 id="error-3-browser-session-timeout" tabindex="-1">Error 3: Browser Session Timeout <a class="header-anchor" href="#error-3-browser-session-timeout" aria-label="Permalink to &quot;Error 3: Browser Session Timeout&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Error example:</span></span>
<span class="line"><span>  Timeout 30000ms exceeded</span></span>
<span class="line"><span>  page.click: target closed</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Cause:</span></span>
<span class="line"><span>  Browser page was automatically closed after prolonged inactivity</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Solution:</span></span>
<span class="line"><span>  1. Recreate session: browser_session_create</span></span>
<span class="line"><span>  2. Avoid long intervals between operations</span></span>
<span class="line"><span>  3. Check if browser was manually closed</span></span></code></pre></div><h3 id="error-4-playwright-not-installed" tabindex="-1">Error 4: Playwright Not Installed <a class="header-anchor" href="#error-4-playwright-not-installed" aria-label="Permalink to &quot;Error 4: Playwright Not Installed&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Error example:</span></span>
<span class="line"><span>  browserType.launch: Executable doesn&#39;t exist at ...</span></span>
<span class="line"><span>  ╔══════════════════════════════════════════════════════════╗</span></span>
<span class="line"><span>  ║ Looks like Playwright Test or Playwright was just       ║</span></span>
<span class="line"><span>  ║ installed. Please install browser dependencies...       ║</span></span>
<span class="line"><span>  ╚══════════════════════════════════════════════════════════╝</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Cause:</span></span>
<span class="line"><span>  Playwright browser binaries are not installed</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Solution:</span></span>
<span class="line"><span>  npx playwright install chromium    # Install Chromium</span></span>
<span class="line"><span>  npx playwright install-deps chromium  # Install system dependencies (Linux)</span></span></code></pre></div><h3 id="error-5-screenshot-path-does-not-exist" tabindex="-1">Error 5: Screenshot Path Does Not Exist <a class="header-anchor" href="#error-5-screenshot-path-does-not-exist" aria-label="Permalink to &quot;Error 5: Screenshot Path Does Not Exist&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Error example:</span></span>
<span class="line"><span>  ENOENT: no such file or directory, open &#39;screenshots/...png&#39;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Cause:</span></span>
<span class="line"><span>  screenshots/ directory was not auto-created (edge case)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Solution:</span></span>
<span class="line"><span>  1. Create manually: mkdir screenshots</span></span>
<span class="line"><span>  2. Or run browser_open once to let the system auto-create it</span></span></code></pre></div><h3 id="error-6-json-parse-error-in-stderr" tabindex="-1">Error 6: JSON Parse Error in stderr <a class="header-anchor" href="#error-6-json-parse-error-in-stderr" aria-label="Permalink to &quot;Error 6: JSON Parse Error in stderr&quot;">​</a></h3><div class="language- vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang"></span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Error example:</span></span>
<span class="line"><span>  [STDERR] SyntaxError: Unexpected token ...</span></span>
<span class="line"><span>  [STDERR]   at JSON.parse (...)</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Cause:</span></span>
<span class="line"><span>  Non-JSON formatted output was mixed into stdout during MCP protocol communication</span></span>
<span class="line"><span></span></span>
<span class="line"><span>Solution:</span></span>
<span class="line"><span>  1. Check if console.log statements are mixing into the stdin/stdout stream</span></span>
<span class="line"><span>  2. Use --http mode instead of stdio mode</span></span>
<span class="line"><span>  3. Add &quot;stderr&quot;: true in the AI client configuration to output stderr to logs</span></span></code></pre></div><hr><h2 id="_4-debugging-tips" tabindex="-1">4. Debugging Tips <a class="header-anchor" href="#_4-debugging-tips" aria-label="Permalink to &quot;4. Debugging Tips&quot;">​</a></h2><h3 id="enable-verbose-logging" tabindex="-1">Enable Verbose Logging <a class="header-anchor" href="#enable-verbose-logging" aria-label="Permalink to &quot;Enable Verbose Logging&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># HTTP mode (with request logs)</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">node</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> server.js</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --http</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> --port</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 3456</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Set environment variables</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> VALIDPILOT_REDACTION=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">   # Disable sensitive data redaction, see full content</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">set</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> VALIDPILOT_HEADLESS=</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">false</span><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">    # Disable headless mode, see browser UI</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Save stderr to file</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">npx</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -y</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ai-verify-mcp</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> 2&gt;</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> mcp-error.log</span></span></code></pre></div><h3 id="verify-mcp-protocol-handshake" tabindex="-1">Verify MCP Protocol Handshake <a class="header-anchor" href="#verify-mcp-protocol-handshake" aria-label="Permalink to &quot;Verify MCP Protocol Handshake&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Use test-mcp-protocol.js to verify the full initialize → tools/list flow</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">node</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> test-mcp-protocol.js</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Expected output:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># === initialize response ===</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># serverInfo: {&quot;name&quot;:&quot;ai-verify-mcp&quot;,&quot;version&quot;:&quot;1.0.0&quot;}</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># === tools/list response ===</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Tool count: 75</span></span></code></pre></div><h3 id="check-http-endpoint" tabindex="-1">Check HTTP Endpoint <a class="header-anchor" href="#check-http-endpoint" aria-label="Permalink to &quot;Check HTTP Endpoint&quot;">​</a></h3><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># After starting HTTP mode</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">curl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> http://localhost:3456/health</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Expected response:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># {&quot;ok&quot;:true,&quot;name&quot;:&quot;ai-verify-mcp&quot;,&quot;version&quot;:&quot;1.0.0&quot;,&quot;mode&quot;:&quot;http&quot;}</span></span></code></pre></div><hr><h2 id="_5-ai-client-log-viewing" tabindex="-1">5. AI Client Log Viewing <a class="header-anchor" href="#_5-ai-client-log-viewing" aria-label="Permalink to &quot;5. AI Client Log Viewing&quot;">​</a></h2><table tabindex="0"><thead><tr><th>Client</th><th>How to View Logs</th></tr></thead><tbody><tr><td><strong>Cursor</strong></td><td><code>Cmd+Shift+P</code> → &quot;Developer: Toggle Developer Tools&quot; → Console panel</td></tr><tr><td><strong>Claude Desktop</strong></td><td>Settings → Developer → View MCP Server logs</td></tr><tr><td><strong>Windsurf</strong></td><td>Terminal panel → MCP Server tab</td></tr><tr><td><strong>Trae</strong></td><td>Settings → MCP → Server status → View logs</td></tr><tr><td><strong>Claude Code</strong></td><td><code>claude mcp logs</code></td></tr><tr><td><strong>Cline</strong></td><td>Extension output panel → Cline logs</td></tr></tbody></table><hr><h2 id="_6-key-markers-in-logs" tabindex="-1">6. Key Markers in Logs <a class="header-anchor" href="#_6-key-markers-in-logs" aria-label="Permalink to &quot;6. Key Markers in Logs&quot;">​</a></h2><table tabindex="0"><thead><tr><th>Marker</th><th>Meaning</th><th>Action</th></tr></thead><tbody><tr><td><code>[AUDIT]</code></td><td>Audit log, records all tool calls</td><td>Used for security audit</td></tr><tr><td><code>[SECURITY]</code></td><td>Security-related warning</td><td>Follow the suggested remediation</td></tr><tr><td><code>[browserPool]</code></td><td>Browser connection pool status</td><td>Troubleshoot session leaks</td></tr><tr><td><code>[STDERR]</code></td><td>stderr output, usually errors</td><td>Requires priority investigation</td></tr><tr><td><code>console.error</code></td><td>In-page JS error</td><td>Fix page code</td></tr><tr><td><code>pageerror</code></td><td>Uncaught page exception</td><td>Fix page code</td></tr></tbody></table><hr><h2 id="_7-environment-variable-quick-reference" tabindex="-1">7. Environment Variable Quick Reference <a class="header-anchor" href="#_7-environment-variable-quick-reference" aria-label="Permalink to &quot;7. Environment Variable Quick Reference&quot;">​</a></h2><table tabindex="0"><thead><tr><th>Variable</th><th>Default</th><th>Purpose</th></tr></thead><tbody><tr><td><code>MCP_API_KEY</code></td><td>Not set</td><td>HTTP mode authentication key, no auth if not set</td></tr><tr><td><code>MCP_HTTP_PORT</code></td><td><code>3456</code></td><td>HTTP mode listening port</td></tr><tr><td><code>MCP_MODE</code></td><td><code>stdio</code></td><td>Runtime mode, set to <code>http</code> to enable HTTP</td></tr><tr><td><code>VALIDPILOT_ARTIFACTS_DIR</code></td><td><code>./artifacts/</code></td><td>Artifact directory path</td></tr><tr><td><code>VALIDPILOT_REDACTION</code></td><td><code>true</code></td><td>Whether to redact sensitive information</td></tr><tr><td><code>VALIDPILOT_HEADLESS</code></td><td><code>true</code></td><td>Whether to enable headless mode</td></tr><tr><td><code>VALIDPILOT_ALLOWLIST</code></td><td><code>localhost,127.0.0.1,::1</code></td><td>Domain whitelist for allowed access</td></tr><tr><td><code>VALIDPILOT_BLOCKED_HOSTS</code></td><td>Empty</td><td>Domain blacklist for forbidden access</td></tr></tbody></table>`,98)])])}const g=a(i,[["render",p]]);export{u as __pageData,g as default};
