# ai-verify-mcp 日志排查手册

> 快速定�?MCP Server 启动问题、工具调用失败、浏览器崩溃、HTTP 认证等常见故障�?

---

## 一、日志在哪里�?

### 运行时日�?

| 日志�?| 查看方式 | 说明 |
|--------|---------|------|
| **控制�?(stdio)** | 终端窗口 | MCP Server 的主进程日志，包含启动信息和运行时错�?|
| **浏览�?Console** | `browser_errors` 工具 | 目标页面内的 JS 错误、网络请求失�?|
| **浏览器网�?* | `browser_network` 工具 | 目标页面的所�?HTTP 请求状态码 |
| **MCP stderr** | AI 客户端日志（IDE 输出面板�?| MCP 协议层的错误，无法序列化或工具未注册 |

### 产物文件

| 目录 | 默认路径 | 内容 |
|------|---------|------|
| 截图 | `./screenshots/` | 浏览器操作过程中的截图证�?|
| 跟踪 | `./traces/` | Playwright 跟踪文件�?zip�?|
| HAR | `./har/` | 网络请求归档文件�?har�?|
| 差异报告 | `./artifacts/phase1/` | 像素级截图差异对比图 |
| 证据摘要 | `./artifacts/` | Console/Network/DOM 综合摘要 |

> 可通过环境变量 `VALIDPILOT_ARTIFACTS_DIR` 自定义产物输出目录�?

---

## 二、常用排查流�?

### 流程 1：Server 启动不了

```
无法启动
  ├─ node 版本 < 18�?
  �?  └─ node --version �?升级�?�?18
  ├─ 先试�?CLI 子命令能否独立运行？
  �?  ├─ @validpilot/@validpilot/@validpilot/ai-verify-mcp --version       �?看版本号（验证包安装正常�?
  �?  ├─ @validpilot/@validpilot/@validpilot/ai-verify-mcp health           �?�?Playwright 可用性（不依�?MCP Server�?
  �?  └─ @validpilot/@validpilot/@validpilot/ai-verify-mcp validate --url <url> �?看能不能直接验证一个页�?
  ├─ 端口 3456 被占用？（HTTP 模式�?
  �?  └─ netstat -ano | findstr :3456 �?换端口或关冲突进�?
  ├─ npm 包损坏？
  �?  └─ npm cache clean --force && npm install -g @validpilot/ai-verify-mcp
  └─ 权限不足�?
      └─ 检�?npm 安装目录权限
```

### 流程 2：AI 客户端提�?"tool not found"

```
工具不可�?
  ├─ 包没装上�?
  �?  └─ npx @validpilot/@validpilot/@validpilot/@validpilot/ai-verify-mcp health �?检查返�?
  ├─ MCP 配置错误�?
  �?  └─ 检�?mcp.json �?command/args 是否正确
  ├─ Trae 40 工具上限�?
  �?  └─ 超过 40 工具会被丢弃 �?减少 MCP Server 数量
  └─ Trae 8000 字符上限�?
      └─ 工具描述超长会被截断 �?参�?Trae FAQ
```

### 流程 3：浏览器操作失败

```
页面操作报错
  ├─ 浏览器未启动�?
  �?  └─ browser_sessions �?检查是否有活跃会话
  ├─ 目标页面无法访问�?
  �?  └─ 手动浏览器打开 target URL 检�?
  ├─ 元素选择器无效？
  �?  └─ browser_find_element �?用实�?DOM 查选择�?
  └─ 无头模式异常�?
      └─ 设置 VALIDPILOT_HEADLESS=false 启动有头模式调试
```

---

## 三、常见错误与解决方案

### 错误 1：`ECONNREFUSED` 或端口被占用

```
错误示例�?
  Error: listen EADDRINUSE :::3456
  Port 3456 已被占用

原因�?
  另一个进程已经占用了该端�?

解决�?
  1. netstat -ano | findstr :3456  �?�?PID
  2. taskkill /PID <PID> /F          �?杀进程
  3. 或使用其他端口启动：--port 3457
```

### 错误 2：MCP API Key 认证失败（HTTP 模式�?

```
错误示例�?
  HTTP 401 Unauthorized
  Invalid API Key

原因�?
  HTTP 模式启动�?MCP_API_KEY 认证，但请求未携带正确的 key

解决�?
  1. 确认服务端设置的 MCP_API_KEY 环境变量�?
  2. 请求头中�?Authorization: Bearer <key>
  3. 或设�?MCP_API_KEY= 空值禁用认证（仅开发环境）
```

### 错误 3：浏览器会话超时

```
错误示例�?
  Timeout 30000ms exceeded
  page.click: target closed

原因�?
  浏览器页面长时间无操作，自动关闭

解决�?
  1. 重新创建会话：browser_session_create
  2. 操作之间不要间隔太久
  3. 检查浏览器是否被手动关�?
```

### 错误 4：Playwright 未安�?

```
错误示例�?
  browserType.launch: Executable doesn't exist at ...
  ╔══════════════════════════════════════════════════════════╗
  �?Looks like Playwright Test or Playwright was just       �?
  �?installed. Please install browser dependencies...       �?
  ╚══════════════════════════════════════════════════════════╝

原因�?
  Playwright 浏览器二进制文件未安�?

解决�?
  npx playwright install chromium    # 安装 Chromium
  npx playwright install-deps chromium  # 安装系统依赖（Linux�?
```

### 错误 5：截图路径不存在

```
错误示例�?
  ENOENT: no such file or directory, open 'screenshots/...png'

原因�?
  screenshots/ 目录未自动创建（极端情况�?

解决�?
  1. 手动创建：mkdir screenshots
  2. 或执行一�?browser_open 让系统自动创�?
```

### 错误 6：stderr 出现 JSON 解析错误

```
错误示例�?
  [STDERR] SyntaxError: Unexpected token ...
  [STDERR]   at JSON.parse (...)

原因�?
  MCP 协议通信中出现了�?JSON 格式的输出混�?stdout

解决�?
  1. 检查是否有 console.log 语句混入 stdin/stdout �?
  2. 使用 --http 模式代替 stdio 模式
  3. �?AI 客户端配置中�?"stderr": true �?stderr 输出到日�?
```

---

## 四、调试技�?

### 开启详细日�?

```bash
# HTTP 模式（带有请求日志）
node server.js --http --port 3456

# 设置环境变量
set VALIDPILOT_REDACTION=false   # 关闭敏感信息脱敏，看到完整内�?
set VALIDPILOT_HEADLESS=false    # 关闭无头模式，看到浏览器界面

# 保存 stderr 到文�?
npx -y ai-verify-mcp 2> mcp-error.log
```

### 验证 MCP 协议握手

```bash
# �?test-mcp-protocol.js 验证完整�?initialize �?tools/list 流程
node test-mcp-protocol.js

# 预期输出�?
# === initialize 响应 ===
# serverInfo: {"name":"ai-verify-mcp","version":"1.0.0"}
# === tools/list 响应 ===
# 工具数量: 75
```

### 检�?HTTP 接口

```bash
# 启动 HTTP 模式�?
curl http://localhost:3456/health

# 预期返回�?
# {"ok":true,"name":"ai-verify-mcp","version":"1.0.0","mode":"http"}
```

---

## 五、AI 客户端日志查�?

| 客户�?| 查看日志的方�?|
|--------|--------------|
| **Cursor** | `Cmd+Shift+P` �?"Developer: Toggle Developer Tools" �?Console 面板 |
| **Claude Desktop** | 设置 �?开发�?�?查看 MCP Server 日志 |
| **Windsurf** | 终端面板 �?MCP Server 标签�?|
| **Trae** | 设置 �?MCP �?Server 状�?�?查看日志 |
| **Claude Code** | `claude mcp logs` |
| **Cline** | 扩展程序输出面板 �?Cline 日志 |

---

## 六、日志中的关键标�?

| 标记 | 含义 | 应对 |
|------|------|------|
| `[AUDIT]` | 审计日志，记录所有工具调�?| 用于安全审计 |
| `[SECURITY]` | 安全相关警告 | 按提示建议处�?|
| `[browserPool]` | 浏览器连接池状�?| 排查会话泄漏 |
| `[STDERR]` | stderr 输出，通常是错�?| 需要重点排�?|
| `console.error` | 页面�?JS 报错 | 修复页面代码 |
| `pageerror` | 页面未捕获异�?| 修复页面代码 |

---

## 七、环境变量速查

| 变量 | 默认�?| 作用 |
|------|--------|------|
| `MCP_API_KEY` | 未设�?| HTTP 模式认证密钥，不设置则无认证 |
| `MCP_HTTP_PORT` | `3456` | HTTP 模式监听端口 |
| `MCP_MODE` | `stdio` | 运行模式，设�?`http` 启用 HTTP |
| `VALIDPILOT_ARTIFACTS_DIR` | `./artifacts/` | 产物目录路径 |
| `VALIDPILOT_REDACTION` | `true` | 是否脱敏敏感信息 |
| `VALIDPILOT_HEADLESS` | `true` | 是否启用无头模式 |
| `VALIDPILOT_ALLOWLIST` | `localhost,127.0.0.1,::1` | 允许访问的域名白名单 |
| `VALIDPILOT_BLOCKED_HOSTS` | �?| 禁止访问的域名黑名单 |

---

## English Version

# ai-verify-mcp Log Troubleshooting Guide

> Quickly locate common issues such as MCP Server startup failures, tool invocation errors, browser crashes, and HTTP authentication problems.

---

## 1. Where Are the Logs?

### Runtime Logs

| Log Source | How to View | Description |
|------------|-------------|-------------|
| **Console (stdio)** | Terminal window | MCP Server main process logs, including startup info and runtime errors |
| **Browser Console** | `browser_errors` tool | JS errors and network request failures within the target page |
| **Browser Network** | `browser_network` tool | HTTP request status codes for the target page |
| **MCP stderr** | AI client logs (IDE output panel) | MCP protocol layer errors, serialization failures, or unregistered tools |

### Artifact Files

| Directory | Default Path | Content |
|-----------|-------------|---------|
| Screenshots | `./screenshots/` | Screenshot evidence during browser operations |
| Traces | `./traces/` | Playwright trace files (.zip) |
| HAR | `./har/` | Network request archive files (.har) |
| Diff Reports | `./artifacts/phase1/` | Pixel-level screenshot diff comparison images |
| Evidence Summary | `./artifacts/` | Console/Network/DOM comprehensive summary |

> You can customize the artifact output directory via the environment variable `VALIDPILOT_ARTIFACTS_DIR`.

---

## 2. Common Troubleshooting Flows

### Flow 1: Server Won't Start

```
Unable to start
  ├─ Node version < 18?
  �?  └─ node --version �?Upgrade to �?18
  ├─ Try running CLI subcommands independently first?
  �?  ├─ @validpilot/@validpilot/@validpilot/ai-verify-mcp --version       �?Check version (verifies package installation)
  �?  ├─ @validpilot/@validpilot/@validpilot/ai-verify-mcp health           �?Check Playwright availability (independent of MCP Server)
  �?  └─ @validpilot/@validpilot/@validpilot/ai-verify-mcp validate --url <url> �?Test if a page can be validated directly
  ├─ Port 3456 occupied? (HTTP mode)
  �?  └─ netstat -ano | findstr :3456 �?Change port or terminate conflicting process
  ├─ npm package corrupted?
  �?  └─ npm cache clean --force && npm install -g @validpilot/ai-verify-mcp
  └─ Insufficient permissions?
      └─ Check npm installation directory permissions
```

### Flow 2: AI Client Shows "tool not found"

```
Tools not visible
  ├─ Package not installed?
  �?  └─ npx @validpilot/@validpilot/@validpilot/@validpilot/ai-verify-mcp health �?Check response
  ├─ MCP configuration error?
  �?  └─ Check mcp.json �?Verify command/args are correct
  ├─ Trae 40-tool limit?
  �?  └─ Tools beyond 40 are dropped �?Reduce number of MCP Servers
  └─ Trae 8000-character limit?
      └─ Tool descriptions exceeding limit get truncated �?Refer to Trae FAQ
```

### Flow 3: Browser Operation Failed

```
Page operation error
  ├─ Browser not launched?
  �?  └─ browser_sessions �?Check for active sessions
  ├─ Target page inaccessible?
  �?  └─ Manually open target URL in browser to verify
  ├─ Invalid element selector?
  �?  └─ browser_find_element �?Test selector against actual DOM
  └─ Headless mode anomaly?
      └─ Set VALIDPILOT_HEADLESS=false to launch in headed mode for debugging
```

---

## 3. Common Errors and Solutions

### Error 1: `ECONNREFUSED` or Port Already in Use

```
Error example:
  Error: listen EADDRINUSE :::3456
  Port 3456 已被占用

Cause:
  Another process is already using this port

Solution:
  1. netstat -ano | findstr :3456  �?Find PID
  2. taskkill /PID <PID> /F          �?Kill process
  3. Or start with a different port: --port 3457
```

### Error 2: MCP API Key Authentication Failed (HTTP Mode)

```
Error example:
  HTTP 401 Unauthorized
  Invalid API Key

Cause:
  MCP_API_KEY authentication is enabled in HTTP mode, but the request does not carry the correct key

Solution:
  1. Confirm the MCP_API_KEY environment variable value set on the server
  2. Add Authorization: Bearer <key> to request headers
  3. Or set MCP_API_KEY= (empty value) to disable authentication (dev environment only)
```

### Error 3: Browser Session Timeout

```
Error example:
  Timeout 30000ms exceeded
  page.click: target closed

Cause:
  Browser page was automatically closed after prolonged inactivity

Solution:
  1. Recreate session: browser_session_create
  2. Avoid long intervals between operations
  3. Check if browser was manually closed
```

### Error 4: Playwright Not Installed

```
Error example:
  browserType.launch: Executable doesn't exist at ...
  ╔══════════════════════════════════════════════════════════╗
  �?Looks like Playwright Test or Playwright was just       �?
  �?installed. Please install browser dependencies...       �?
  ╚══════════════════════════════════════════════════════════╝

Cause:
  Playwright browser binaries are not installed

Solution:
  npx playwright install chromium    # Install Chromium
  npx playwright install-deps chromium  # Install system dependencies (Linux)
```

### Error 5: Screenshot Path Does Not Exist

```
Error example:
  ENOENT: no such file or directory, open 'screenshots/...png'

Cause:
  screenshots/ directory was not auto-created (edge case)

Solution:
  1. Create manually: mkdir screenshots
  2. Or run browser_open once to let the system auto-create it
```

### Error 6: JSON Parse Error in stderr

```
Error example:
  [STDERR] SyntaxError: Unexpected token ...
  [STDERR]   at JSON.parse (...)

Cause:
  Non-JSON formatted output was mixed into stdout during MCP protocol communication

Solution:
  1. Check if console.log statements are mixing into the stdin/stdout stream
  2. Use --http mode instead of stdio mode
  3. Add "stderr": true in the AI client configuration to output stderr to logs
```

---

## 4. Debugging Tips

### Enable Verbose Logging

```bash
# HTTP mode (with request logs)
node server.js --http --port 3456

# Set environment variables
set VALIDPILOT_REDACTION=false   # Disable sensitive data redaction, see full content
set VALIDPILOT_HEADLESS=false    # Disable headless mode, see browser UI

# Save stderr to file
npx -y ai-verify-mcp 2> mcp-error.log
```

### Verify MCP Protocol Handshake

```bash
# Use test-mcp-protocol.js to verify the full initialize �?tools/list flow
node test-mcp-protocol.js

# Expected output:
# === initialize response ===
# serverInfo: {"name":"ai-verify-mcp","version":"1.0.0"}
# === tools/list response ===
# Tool count: 75
```

### Check HTTP Endpoint

```bash
# After starting HTTP mode
curl http://localhost:3456/health

# Expected response:
# {"ok":true,"name":"ai-verify-mcp","version":"1.0.0","mode":"http"}
```

---

## 5. AI Client Log Viewing

| Client | How to View Logs |
|--------|-----------------|
| **Cursor** | `Cmd+Shift+P` �?"Developer: Toggle Developer Tools" �?Console panel |
| **Claude Desktop** | Settings �?Developer �?View MCP Server logs |
| **Windsurf** | Terminal panel �?MCP Server tab |
| **Trae** | Settings �?MCP �?Server status �?View logs |
| **Claude Code** | `claude mcp logs` |
| **Cline** | Extension output panel �?Cline logs |

---

## 6. Key Markers in Logs

| Marker | Meaning | Action |
|--------|---------|--------|
| `[AUDIT]` | Audit log, records all tool calls | Used for security audit |
| `[SECURITY]` | Security-related warning | Follow the suggested remediation |
| `[browserPool]` | Browser connection pool status | Troubleshoot session leaks |
| `[STDERR]` | stderr output, usually errors | Requires priority investigation |
| `console.error` | In-page JS error | Fix page code |
| `pageerror` | Uncaught page exception | Fix page code |

---

## 7. Environment Variable Quick Reference

| Variable | Default | Purpose |
|----------|---------|---------|
| `MCP_API_KEY` | Not set | HTTP mode authentication key, no auth if not set |
| `MCP_HTTP_PORT` | `3456` | HTTP mode listening port |
| `MCP_MODE` | `stdio` | Runtime mode, set to `http` to enable HTTP |
| `VALIDPILOT_ARTIFACTS_DIR` | `./artifacts/` | Artifact directory path |
| `VALIDPILOT_REDACTION` | `true` | Whether to redact sensitive information |
| `VALIDPILOT_HEADLESS` | `true` | Whether to enable headless mode |
| `VALIDPILOT_ALLOWLIST` | `localhost,127.0.0.1,::1` | Domain whitelist for allowed access |
| `VALIDPILOT_BLOCKED_HOSTS` | Empty | Domain blacklist for forbidden access |
