# ai-verify-mcp 日志排查手册

> 快速定位 MCP Server 启动问题、工具调用失败、浏览器崩溃、HTTP 认证等常见故障。

---

## 一、日志在哪里？

### 运行时日志

| 日志源 | 查看方式 | 说明 |
|--------|---------|------|
| **控制台 (stdio)** | 终端窗口 | MCP Server 的主进程日志，包含启动信息和运行时错误 |
| **浏览器 Console** | `browser_errors` 工具 | 目标页面内的 JS 错误、网络请求失败 |
| **浏览器网络** | `browser_network` 工具 | 目标页面的所有 HTTP 请求状态码 |
| **MCP stderr** | AI 客户端日志（IDE 输出面板） | MCP 协议层的错误，无法序列化或工具未注册 |

### 产物文件

| 目录 | 默认路径 | 内容 |
|------|---------|------|
| 截图 | `./screenshots/` | 浏览器操作过程中的截图证据 |
| 跟踪 | `./traces/` | Playwright 跟踪文件（.zip） |
| HAR | `./har/` | 网络请求归档文件（.har） |
| 差异报告 | `./artifacts/phase1/` | 像素级截图差异对比图 |
| 证据摘要 | `./artifacts/` | Console/Network/DOM 综合摘要 |

> 可通过环境变量 `VALIDPILOT_ARTIFACTS_DIR` 自定义产物输出目录。

---

## 二、常用排查流程

### 流程 1：Server 启动不了

```
无法启动
  ├─ node 版本 < 18？
  │   └─ node --version → 升级到 ≥ 18
  ├─ 先试试 CLI 子命令能否独立运行？
  │   ├─ ai-verify-mcp --version       → 看版本号（验证包安装正常）
  │   ├─ ai-verify-mcp health           → 看 Playwright 可用性（不依赖 MCP Server）
  │   └─ ai-verify-mcp validate --url <url> → 看能不能直接验证一个页面
  ├─ 端口 3456 被占用？（HTTP 模式）
  │   └─ netstat -ano | findstr :3456 → 换端口或关冲突进程
  ├─ npm 包损坏？
  │   └─ npm cache clean --force && npm install -g ai-verify-mcp
  └─ 权限不足？
      └─ 检查 npm 安装目录权限
```

### 流程 2：AI 客户端提示 "tool not found"

```
工具不可见
  ├─ 包没装上？
  │   └─ npx ai-verify-mcp health → 检查返回
  ├─ MCP 配置错误？
  │   └─ 检查 mcp.json → command/args 是否正确
  ├─ Trae 40 工具上限？
  │   └─ 超过 40 工具会被丢弃 → 减少 MCP Server 数量
  └─ Trae 8000 字符上限？
      └─ 工具描述超长会被截断 → 参考 Trae FAQ
```

### 流程 3：浏览器操作失败

```
页面操作报错
  ├─ 浏览器未启动？
  │   └─ browser_sessions → 检查是否有活跃会话
  ├─ 目标页面无法访问？
  │   └─ 手动浏览器打开 target URL 检查
  ├─ 元素选择器无效？
  │   └─ browser_find_element → 用实际 DOM 查选择器
  └─ 无头模式异常？
      └─ 设置 VALIDPILOT_HEADLESS=false 启动有头模式调试
```

---

## 三、常见错误与解决方案

### 错误 1：`ECONNREFUSED` 或端口被占用

```
错误示例：
  Error: listen EADDRINUSE :::3456
  Port 3456 已被占用

原因：
  另一个进程已经占用了该端口

解决：
  1. netstat -ano | findstr :3456  → 查 PID
  2. taskkill /PID <PID> /F          → 杀进程
  3. 或使用其他端口启动：--port 3457
```

### 错误 2：MCP API Key 认证失败（HTTP 模式）

```
错误示例：
  HTTP 401 Unauthorized
  Invalid API Key

原因：
  HTTP 模式启动了 MCP_API_KEY 认证，但请求未携带正确的 key

解决：
  1. 确认服务端设置的 MCP_API_KEY 环境变量值
  2. 请求头中加 Authorization: Bearer <key>
  3. 或设置 MCP_API_KEY= 空值禁用认证（仅开发环境）
```

### 错误 3：浏览器会话超时

```
错误示例：
  Timeout 30000ms exceeded
  page.click: target closed

原因：
  浏览器页面长时间无操作，自动关闭

解决：
  1. 重新创建会话：browser_session_create
  2. 操作之间不要间隔太久
  3. 检查浏览器是否被手动关闭
```

### 错误 4：Playwright 未安装

```
错误示例：
  browserType.launch: Executable doesn't exist at ...
  ╔══════════════════════════════════════════════════════════╗
  ║ Looks like Playwright Test or Playwright was just       ║
  ║ installed. Please install browser dependencies...       ║
  ╚══════════════════════════════════════════════════════════╝

原因：
  Playwright 浏览器二进制文件未安装

解决：
  npx playwright install chromium    # 安装 Chromium
  npx playwright install-deps chromium  # 安装系统依赖（Linux）
```

### 错误 5：截图路径不存在

```
错误示例：
  ENOENT: no such file or directory, open 'screenshots/...png'

原因：
  screenshots/ 目录未自动创建（极端情况）

解决：
  1. 手动创建：mkdir screenshots
  2. 或执行一次 browser_open 让系统自动创建
```

### 错误 6：stderr 出现 JSON 解析错误

```
错误示例：
  [STDERR] SyntaxError: Unexpected token ...
  [STDERR]   at JSON.parse (...)

原因：
  MCP 协议通信中出现了非 JSON 格式的输出混入 stdout

解决：
  1. 检查是否有 console.log 语句混入 stdin/stdout 流
  2. 使用 --http 模式代替 stdio 模式
  3. 在 AI 客户端配置中加 "stderr": true 将 stderr 输出到日志
```

---

## 四、调试技巧

### 开启详细日志

```bash
# HTTP 模式（带有请求日志）
node server.js --http --port 3456

# 设置环境变量
set VALIDPILOT_REDACTION=false   # 关闭敏感信息脱敏，看到完整内容
set VALIDPILOT_HEADLESS=false    # 关闭无头模式，看到浏览器界面

# 保存 stderr 到文件
npx -y ai-verify-mcp 2> mcp-error.log
```

### 验证 MCP 协议握手

```bash
# 用 test-mcp-protocol.js 验证完整的 initialize → tools/list 流程
node test-mcp-protocol.js

# 预期输出：
# === initialize 响应 ===
# serverInfo: {"name":"ai-verify-mcp","version":"1.0.0"}
# === tools/list 响应 ===
# 工具数量: 75
```

### 检查 HTTP 接口

```bash
# 启动 HTTP 模式后
curl http://localhost:3456/health

# 预期返回：
# {"ok":true,"name":"ai-verify-mcp","version":"1.0.0","mode":"http"}
```

---

## 五、AI 客户端日志查看

| 客户端 | 查看日志的方式 |
|--------|--------------|
| **Cursor** | `Cmd+Shift+P` → "Developer: Toggle Developer Tools" → Console 面板 |
| **Claude Desktop** | 设置 → 开发者 → 查看 MCP Server 日志 |
| **Windsurf** | 终端面板 → MCP Server 标签页 |
| **Trae** | 设置 → MCP → Server 状态 → 查看日志 |
| **Claude Code** | `claude mcp logs` |
| **Cline** | 扩展程序输出面板 → Cline 日志 |

---

## 六、日志中的关键标记

| 标记 | 含义 | 应对 |
|------|------|------|
| `[AUDIT]` | 审计日志，记录所有工具调用 | 用于安全审计 |
| `[SECURITY]` | 安全相关警告 | 按提示建议处理 |
| `[browserPool]` | 浏览器连接池状态 | 排查会话泄漏 |
| `[STDERR]` | stderr 输出，通常是错误 | 需要重点排查 |
| `console.error` | 页面内 JS 报错 | 修复页面代码 |
| `pageerror` | 页面未捕获异常 | 修复页面代码 |

---

## 七、环境变量速查

| 变量 | 默认值 | 作用 |
|------|--------|------|
| `MCP_API_KEY` | 未设置 | HTTP 模式认证密钥，不设置则无认证 |
| `MCP_HTTP_PORT` | `3456` | HTTP 模式监听端口 |
| `MCP_MODE` | `stdio` | 运行模式，设为 `http` 启用 HTTP |
| `VALIDPILOT_ARTIFACTS_DIR` | `./artifacts/` | 产物目录路径 |
| `VALIDPILOT_REDACTION` | `true` | 是否脱敏敏感信息 |
| `VALIDPILOT_HEADLESS` | `true` | 是否启用无头模式 |
| `VALIDPILOT_ALLOWLIST` | `localhost,127.0.0.1,::1` | 允许访问的域名白名单 |
| `VALIDPILOT_BLOCKED_HOSTS` | 空 | 禁止访问的域名黑名单 |
