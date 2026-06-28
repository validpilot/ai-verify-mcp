# ai-verify-mcp 用户操作手册

> 从安装到精通，完整的使用指南。

---

## 目录

- [一、快速导航](#一快速导航)
- [二、安装与卸载](#二安装与卸载)
- [三、CLI 命令详解](#三cli-命令详解)
- [四、MCP Server 配置（AI 客户端）](#四mcp-server-配置ai-客户端)
- [五、Skill + MCP 组合使用（推荐）](#五skill--mcp-组合使用推荐)
- [六、75 个工具速查](#六75-个工具速查)
- [七、典型使用场景](#七典型使用场景)
- [八、产物与证据链](#八产物与证据链)
- [九、环境变量参考](#九环境变量参考)
- [十、常见故障排除](#十常见故障排除)

---

## 一、快速导航

| 你的目的 | 去这里 |
|---------|--------|
| 快速体验验证功能 | [3.2 validate 命令](#32-validate-快速验证) |
| 配置到 Cursor 使用 | [4.2 Cursor](#42-cursor) |
| 配置到 Trae 使用 | [4.1 Trae](#41-trae) |
| 配合 Skill 最佳体验 | [第五章](#五skill--mcp-组合使用推荐) |
| 了解有哪些工具 | [第六章](#六75-个工具速查) |
| 遇到错误 | [第十章](#十常见故障排除) |

---

## 二、安装与卸载

### 2.1 环境要求

| 项 | 要求 |
|----|------|
| Node.js | >= 18（推荐 20 LTS） |
| 操作系统 | Windows / macOS / Linux |
| 浏览器 | Playwright 自动管理 Chromium（首次运行自动下载） |

### 2.2 安装方式

**方式 A：全局安装（推荐）**

```bash
npm install -g ai-verify-mcp
```

安装后可直接使用 `ai-verify-mcp` 命令。

**方式 B：npx 临时使用（无需安装）**

```bash
npx ai-verify-mcp --version
npx ai-verify-mcp validate --url https://example.com
```

每次使用自动下载最新版，用完即删。

**方式 C：项目本地安装**

```bash
cd your-project
npm install --save-dev ai-verify-mcp
```

适合在项目 CI 流程中使用，或在 `package.json` 中添加脚本：

```json
{
  "scripts": {
    "verify": "ai-verify-mcp validate --url http://localhost:5173",
    "verify:start": "ai-verify-mcp"
  }
}
```

### 2.3 验证安装

```bash
ai-verify-mcp --version
# 输出: 1.0.0

ai-verify-mcp health
# 输出: {"ok":true,"name":"ai-verify-mcp","version":"1.0.0","message":"Playwright browser is available"}
```

### 2.4 卸载

```bash
npm uninstall -g ai-verify-mcp
```

---

## 三、CLI 命令详解

### 3.1 `health` — 健康检查

检查 Playwright 浏览器是否可用。

```bash
ai-verify-mcp health

# 成功时 exit 0:
# {"ok":true,"name":"ai-verify-mcp","version":"1.0.0","message":"Playwright browser is available"}

# 失败时 exit 1:
# {"ok":false,"error":"Playwright browser is not available"}
```

**用途**：CI 流水线前置检查、Docker 容器健康检查。

---

### 3.2 `validate` — 快速验证

一键验证一个 URL 的 7 项核心检查。

```bash
ai-verify-mcp validate --url <URL>
```

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `--url <URL>` | ✅ | 要验证的页面地址（http/https/file 协议） |
| `--ai-provider` | ❌ | AI 提供商（openai/deepseek/qwen） |
| `--ai-api-key` | ❌ | AI API Key |

**示例**：

```bash
# 验证本地开发页面
ai-verify-mcp validate --url http://localhost:5173

# 验证远程页面
ai-verify-mcp validate --url https://example.com

# 验证本地 HTML 文件
ai-verify-mcp validate --url file:///path/to/index.html
```

**输出说明**：

```json
{
  "pass": true,                    // true=全部通过, false=存在失败项
  "mode": "quick",
  "summary": "所有 7 项检查通过，加载耗时 684ms",
  "topErrors": [],                 // 如失败，列出 Top 错误
  "artifacts": [                   // 产物路径列表
    "E:\\project\\artifacts\\quick-run-xxx.png"
  ]
}
```

**7 项检查内容**：

| # | 检查项 | 说明 |
|---|--------|------|
| 1 | 页面加载 | 页面能在 30s 内正常打开 |
| 2 | 白屏检测 | 页面有可见的文本/元素内容 |
| 3 | Console 错误 | 无 JavaScript 异常输出 |
| 4 | CSS 加载 | 所有样式表正常加载 |
| 5 | JS 加载 | 所有脚本正常加载 |
| 6 | 图片资源 | 图片资源不返回 4xx/5xx |
| 7 | 可用性 | 页面有可交互元素 |

---

### 3.3 `run` — 执行验证流程

按 flow JSON 文件执行多步骤验证。

```bash
ai-verify-mcp run --flow <flow-file.json>
```

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `--flow <file>` | ✅ | flow JSON 文件路径 |
| `--ai-provider` | ❌ | AI 提供商 |
| `--ai-api-key` | ❌ | AI API Key |

**Flow JSON 格式**：

```json
{
  "name": "登录页面验证",
  "goal": "打开登录页 → 截图 → 校验",
  "steps": [
    { "type": "open", "url": "http://localhost:5173/login" },
    { "type": "screenshot", "name": "登录页" },
    { "type": "check", "checks": ["no_top_errors"] }
  ]
}
```

**支持的类型**：

| type | 参数 | 说明 |
|------|------|------|
| `open` | `url` (必填) | 打开页面 |
| `click` | `selector` (必填) | 点击元素 |
| `type` | `selector` + `text` | 输入文本 |
| `wait` | `ms` 或 `urlContains` | 等待 |
| `screenshot` | `name` | 截图 |
| `hover` | `selector` | 悬停 |
| `scroll` | `distance` | 滚动 |
| `press_key` | `key` + `selector` | 按键 |
| `eval` | `expression` | 执行 JS |
| `errors` | — | 查看 Console 错误 |
| `errors_clear` | — | 清空错误基线 |
| `check` | `checks`/`selector` | 校验 |
| `collect` | — | 收集证据 |
| `report` | — | 生成报告 |

**示例**：

```json
{
  "name": "购物车流程验证",
  "goal": "打开商品页 → 加入购物车 → 截图 → 检查错误",
  "steps": [
    { "type": "open", "url": "http://localhost:5173/shop" },
    { "type": "screenshot", "name": "商品页" },
    { "type": "click", "selector": ".add-to-cart" },
    { "type": "wait", "ms": 2000 },
    { "type": "screenshot", "name": "加入购物车后" },
    { "type": "errors" }
  ]
}
```

---

### 3.4 `start` — 启动 MCP Server

启动 stdio 模式的 MCP Server，供 AI 客户端连接。

```bash
# stdio 模式（默认）
ai-verify-mcp start

# HTTP 模式
ai-verify-mcp start --http --port 3456
```

**参数**：

| 参数 | 说明 |
|------|------|
| `--http` | 以 HTTP 模式启动（默认 stdio） |
| `--port <port>` | HTTP 模式端口（默认 3456） |

启动后 Server 持续运行，等待 AI 客户端发起工具调用。

---

## 四、MCP Server 配置（AI 客户端）

### 4.1 Trae

**方式 A：项目级配置（推荐）**

在项目根目录创建 `.trae/mcp.json`：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

**方式 B：用户级全局配置**

路径：`%APPDATA%\Trae CN\User\mcp.json`（Windows）

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

**注意**：
- 配置后需重启 Trae 会话
- Trae 单个 Server 工具上限 40 个，超过会触发 `list tools failed`。如启用多个 Server，建议只保留需要的。

### 4.2 Cursor

**项目级配置**：`.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

Cursor → Settings → MCP → 查看 Server 状态。

### 4.3 Claude Desktop

`claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### 4.4 Windsurf

Windsurf → Settings → MCP Servers → Add：

```json
{
  "ai-verify-mcp": {
    "command": "npx",
    "args": ["-y", "ai-verify-mcp"]
  }
}
```

### 4.5 Claude Code

```bash
claude mcp add ai-verify-mcp npx -y ai-verify-mcp
```

### 4.6 Cline / Roo Code / OpenClaw

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

配置文件位置见各客户端文档。

### 4.7 Codex CLI

```bash
codex mcp add ai-verify-mcp -- npx -y ai-verify-mcp
```

或写入 `~/.codex/config.toml`：

```toml
[mcpServers.ai-verify-mcp]
command = "npx"
args = ["-y", "ai-verify-mcp"]
```

### 4.8 Hermes

```bash
hermes mcp add ai-verify-mcp npx -y ai-verify-mcp
```

或写入 `~/.hermes/config.yaml`：

```yaml
mcp_servers:
  ai-verify-mcp:
    command: npx
    args: ["-y", "ai-verify-mcp"]
```

### 4.9 CodeArts

IDE → 设置 → MCP Settings：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

**注**：CodeArts 建议启用 Server 不超过 3 个，否则可能影响性能。

### 4.10 CodeBuddy

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

支持 stdio / SSE / HTTP 三种 transport。

---

## 五、Skill + MCP 组合使用（推荐）

### 5.1 为什么要组合

ai-verify-mcp 提供 75 个**原子验证工具**（浏览器操作、截图、a11y 扫描等），但这些工具需要被**编排调用**才能完成完整的验证任务。Skill 系统就是编排层。

| 单独用 MCP | 单独用 Skill | Skill + MCP 组合 |
|-----------|------------|-----------------|
| 有 77 个工具但需手动编排调用 | 有流程但缺执行能力 | ✅ 自动编排 + 自动执行 |
| 验证结果零散 | 流程模板固定 | ✅ 完整证据链 + 灵活配置 |

### 5.2 配置步骤

**第 1 步：在 Trae 中配置 ai-verify-mcp MCP Server**

`.trae/mcp.json`：

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

**第 2 步：确保 Skill 文件存在**

Skill 配置文件在 `.trae/skills/browser-dev-full-validation-skill/SKILL.md`，检查确认文件存在且内容完整。

**第 3 步：重启 Trae 会话**

使配置生效。

### 5.3 工作流程

```
你 → 告诉 AI Assistant "帮我验证这个页面"
     ↓
Skill 自动编排 7 阶段流程:
  1. 打开页面 → 截图
  2. 检查 Console 错误
  3. 检查网络请求
  4. 扫描无障碍 (a11y)
  5. 检查 CSS 变量
  6. 生成报告
  7. 汇总证据链
     ↓
ai-verify-mcp 执行每个阶段的具体操作
     ↓
产出：截图 + 错误诊断 + 证据链报告
```

### 5.4 对比：有 Skill vs 无 Skill

```text
❌ 只有 MCP（手动模式）：
   你: "用 browser_open 打开页面"
   AI: 好的，打开了
   你: "再用 browser_screenshot 截图"
   AI: 好的，截好了
   ...重复每一步...

✅ 有 Skill（自动模式）：
   你: "帮我验证这个页面"
   AI: 开始执行 7 阶段验证流程...
       ✅ 页面加载正常
       ✅ 无 Console 错误
       ⚠️ 发现两个无障碍问题
       ✅ 报告已生成
```

---

## 六、77 个工具速查

> 以下为 ai-verify-mcp 提供的全部 77 个工具，按功能分类列出。其中 `error_fix_suggestion` 已内置 23 种错误匹配模式（含 4 种 Python 后端修复模式），支持自动诊断并推荐修复方案。

### 6.1 浏览器操作（25 个）

| 工具名 | 说明 |
|--------|------|
| `browser_batch` | 批量执行浏览器操作序列 |
| `browser_click` | 点击页面元素 |
| `browser_dom` | DOM 查询与操作 |
| `browser_eval` | 在页面中执行 JavaScript |
| `browser_find_element` | 按文本智能查找元素 |
| `browser_find_page` | 页面类型识别 |
| `browser_flow` | 浏览器操作流程编排 |
| `browser_highlight` | 高亮页面元素 |
| `browser_hover` | 悬停元素 |
| `browser_instrument` | 注入工具脚本到页面 |
| `browser_links` | 获取页面所有链接 |
| `browser_locator_suggest` | 选择器建议 |
| `browser_locator_validate` | 选择器验证 |
| `browser_navigate` | 导航到指定 URL |
| `browser_open` | 打开页面 |
| `browser_press_key` | 按键操作 |
| `browser_screenshot` | 全屏截图 |
| `browser_screenshot_element` | 元素截图 |
| `browser_scroll` | 滚动页面 |
| `browser_select` | 选择下拉框选项 |
| `browser_snapshot` | 页面快照 |
| `browser_step` | 单步执行操作 |
| `browser_traverse_menu` | 遍历菜单结构 |
| `browser_type` | 输入文本 |
| `browser_wait` | 等待指定条件 |

### 6.2 诊断与调试（17 个）

| 工具名 | 说明 |
|--------|------|
| `browser_console` | 查看控制台日志 |
| `browser_debug_report` | 生成调试报告 |
| `browser_diagnose` | 自动错误诊断（根因分析 + 置信度） |
| `browser_element_status` | 元素状态检查（可见性、可交互性） |
| `browser_errors` | 查看页面 Console 错误 |
| `browser_errors_aggregate` | 错误聚合统计 |
| `browser_errors_clear` | 清除已捕获的错误 |
| `browser_events` | 查看页面事件 |
| `browser_events_clear` | 清除已捕获的事件 |
| `browser_network` | 查看网络请求列表 |
| `browser_network_detail` | 查看网络请求详情 |
| `browser_performance_check` | 页面性能检查 |
| `browser_quick_fix` | 快速修复（多种策略） |
| `browser_verify_fix` | 修复验证闭环 |
| `debug_investigate` | 深度调查分析 |
| `error_fix_suggestion` | 错误修复建议 |
| `error_summary_md` | 错误摘要（Markdown） |

### 6.3 验证框架（14 个）

| 工具名 | 说明 |
|--------|------|
| `browser_assert` | 断言验证（URL、标题、元素等） |
| `fix_verify` | 修复结果验证 |
| `screenshot_diff` | 截图差异对比 |
| `validation_check` | 检查点验证（负载、JS 错误等） |
| `validation_decision` | 验证决策 |
| `validation_element` | 元素验证（存在、可见、文本） |
| `validation_flow` | 多步骤流程验证 |
| `validation_matrix` | 验证矩阵 |
| `validation_quick_run` | 一键 7 项快速验证 |
| `validation_report` | 生成验证报告 |
| `validation_report_export` | 导出验证报告 |
| `validation_run` | 运行验证 |
| `validation_start` | 启动验证会话 |
| `validation_suite_run` | 运行验证套件 |

### 6.4 会话管理（7 个）

| 工具名 | 说明 |
|--------|------|
| `browser_session_create` | 创建浏览器会话 |
| `browser_session_close` | 关闭浏览器会话 |
| `browser_session_switch` | 切换浏览器会话 |
| `browser_sessions` | 列出所有活跃会话 |
| `browser_cookies` | Cookie 管理 |
| `browser_storage` | 浏览器存储管理 |
| `browser_har_export` | 导出 HAR 网络请求归档 |

### 6.5 证据与产物（4 个）

| 工具名 | 说明 |
|--------|------|
| `browser_artifacts` | 管理验证产物 |
| `browser_artifacts_clear` | 清除验证产物 |
| `browser_trace_start` | 开始 Playwright 追踪 |
| `browser_trace_stop` | 停止 Playwright 追踪 |

### 6.6 视觉回归（3 个）

| 工具名 | 说明 |
|--------|------|
| `browser_visual_baseline` | 设置视觉基准 |
| `browser_visual_compare` | 视觉对比 |
| `browser_visual_report` | 生成视觉回归报告 |

### 6.7 无障碍检查（1 个）

| 工具名 | 说明 |
|--------|------|
| `browser_a11y_check` | axe-core 无障碍扫描 |

### 6.8 辅助工具（4 个）

| 工具名 | 说明 |
|--------|------|
| `ai_debug_investigate` | AI 辅助深度排查 |
| `benchmark_run` | 基准性能测试 |
| `mcp_health_check` | MCP Server 健康检查 |
| `mcp_self_test` | MCP 自检（协议 + 工具数） |

---

## 七、典型使用场景

### 场景 1：验证 AI 生成的登录页面

**背景**：你让 AI 生成了一个登录页面，现在想确认它能不能正常使用。

**在 AI 客户端中告诉 AI**：

```
帮我验证这个登录页面：
1. 打开 http://localhost:5173/login
2. 截图
3. 输入用户名 admin@test.com，密码 123456
4. 点击登录按钮
5. 截图登录后页面
6. 检查有没有 Console 错误
7. 告诉我结果
```

**AI 会顺序调用**：
1. `browser_open` → 打开页面
2. `browser_screenshot` → 截图
3. `browser_type` → 输入用户名
4. `browser_type` → 输入密码
5. `browser_click` → 点击登录
6. `browser_screenshot` → 截图登录后
7. `validation_check` → 检查结果

### 场景 2：验证页面样式合规

```
验证这个页面的样式：
1. 打开 http://localhost:5173/settings
2. 截图
3. 检查无障碍问题（a11y）
4. 检查是否有缺失的 CSS 变量
5. 报告结果
```

**AI 会调用**：
1. `browser_open` → 打开
2. `browser_screenshot` → 截图
3. `browser_a11y_check` → axe 扫描
4. `browser_css_trace` → CSS 变量追溯

### 场景 3：诊断页面错误

```
这个页面报错了，帮我诊断：
1. 打开 http://localhost:5173/dashboard
2. 查看 Console 错误
3. 查看网络请求状态
4. 自动诊断根因
5. 告诉我怎么修
```

**AI 会调用**：
1. `browser_open` → 打开
2. `browser_errors` → Console 错误
3. `browser_network` → 网络请求
4. `browser_diagnose` → 自动诊断
5. `browser_quick_fix` → 修复建议

### 场景 4：完整验证 + 证据留存

```
验证首页，生成完整的证据链报告：
1. 打开 http://localhost:5173
2. 截图首页
3. 点击"产品"导航
4. 截图产品页
5. 点击"联系我们"
6. 截图的联系页
7. 生成验证报告
```

---

## 八、产物与证据链

### 8.1 产物目录结构

每次验证操作都会在 `artifacts/` 目录下留存证据：

```
artifacts/
├── screenshots/           # 截图文件
│   ├── login-page.png
│   ├── dashboard.png
│   └── ...
├── traces/               # Playwright trace 文件（含完整操作录像）
├── har/                  # HAR 网络请求日志
├── reports/              # 验证报告
│   ├── validation-report.md
│   └── validation-report.json
└── ...                   # 其他产物
```

### 8.2 证据链说明

| 产物类型 | 格式 | 说明 |
|---------|------|------|
| 截图 | PNG | 每个操作步骤的浏览器截图 |
| Trace | ZIP | Playwright trace，可回放完整操作过程 |
| HAR | JSON | 所有网络请求的完整记录 |
| 报告 | MD+JSON | 验证结果的 Markdown 和结构化数据 |

### 8.3 配置产物路径

通过环境变量自定义产物目录位置：

```bash
set VALIDPILOT_ARTIFACTS_DIR=E:/my-reports
ai-verify-mcp validate --url http://localhost:5173
```

---

## 九、环境变量参考

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3456 | HTTP 模式端口 |
| `VALIDPILOT_ARTIFACTS_DIR` | `./artifacts` | 产物目录路径 |
| `VALIDPILOT_REDACTION` | `false` | 启用敏感信息脱敏 |
| `VALIDPILOT_ALLOWLIST` | `*` | 域名白名单（逗号分隔） |
| `VALIDPILOT_BLOCKED_HOSTS` | — | 域名黑名单（逗号分隔） |
| `MCP_API_KEY` | — | HTTP 模式 API Key 认证 |
| `SSH_PASS` | — | SSH 密码（远程隧道时用） |
| `SSH_KEY_PATH` | — | SSH 私钥路径 |
| `NODE_ENV` | `production` | 环境模式（test/dev 开启调试日志） |

---

## 十、常见故障排除

### Server 启动失败

```text
错误：端口 3456 已被占用
解决：ai-verify-mcp start --http --port 3457
```

```text
错误：Playwright 浏览器不可用
解决：npx playwright install chromium
```

### 刷新浏览器输入法冲突

- 使用 Dropdown 选择器或 Ctrl+Shift 快捷键切换输入法
- 或使用英文输入法操作

### MCP 工具列表为空

- 重启 AI 客户端会话使配置生效
- 检查配置文件 JSON 格式（逗号、引号常见错误）
- Trae 用户注意 40 工具上限，减少其他 Server

### 验证结果不符合预期

- 检查 Network 请求是否被 CORS 或防火墙拦截
- 确认页面 URL 从 AI 客户端所在网络可达
- 检查 `VALIDPILOT_ALLOWLIST` 是否包含目标域名

### 产物文件不生成

- 确认 `VALIDPILOT_ARTIFACTS_DIR` 目录有写入权限
- 默认产物在 `./artifacts/`（当前工作目录）

---

> **更多帮助**：
> - [日志排查手册](LOG-TROUBLESHOOTING.md) — 详细的错误代码与解决方案
> - [MCP 协议速查](MCP-CHEATSHEET.md) — MCP 基础概念
> - GitHub Issues：https://github.com/validpilot/ai-verify-mcp/issues
> - 邮箱：validpilot@outlook.com

---

## English Version

# ai-verify-mcp User Manual

> Complete usage guide from installation to mastery.

---

## Table of Contents

- [1. Quick Navigation](#1-quick-navigation)
- [2. Installation and Uninstallation](#2-installation-and-uninstallation)
- [3. CLI Command Reference](#3-cli-command-reference)
- [4. MCP Server Configuration (AI Clients)](#4-mcp-server-configuration-ai-clients)
- [5. Skill + MCP Combined Usage (Recommended)](#5-skill--mcp-combined-usage-recommended)
- [6. 77 Tools Quick Reference](#6-77-tools-quick-reference)
- [7. Typical Use Cases](#7-typical-use-cases)
- [8. Artifacts and Evidence Chain](#8-artifacts-and-evidence-chain)
- [9. Environment Variables Reference](#9-environment-variables-reference)
- [10. Troubleshooting](#10-troubleshooting)

---

## 1. Quick Navigation

| Your Goal | Go Here |
|-----------|---------|
| Quick experience with validation | [3.2 validate Command](#32-validate---quick-validation) |
| Configure for Cursor | [4.2 Cursor](#42-cursor) |
| Configure for Trae | [4.1 Trae](#41-trae) |
| Best experience with Skill | [Chapter 5](#5-skill--mcp-combined-usage-recommended) |
| Learn about available tools | [Chapter 6](#6-77-tools-quick-reference) |
| Encountering errors | [Chapter 10](#10-troubleshooting) |

---

## 2. Installation and Uninstallation

### 2.1 Requirements

| Item | Requirement |
|------|-------------|
| Node.js | >= 18 (20 LTS recommended) |
| Operating System | Windows / macOS / Linux |
| Browser | Playwright auto-manages Chromium (auto-downloads on first run) |

### 2.2 Installation Methods

**Method A: Global Installation (Recommended)**

```bash
npm install -g ai-verify-mcp
```

After installation, you can use the `ai-verify-mcp` command directly.

**Method B: Temporary Use with npx (No Installation Required)**

```bash
npx ai-verify-mcp --version
npx ai-verify-mcp validate --url https://example.com
```

Automatically downloads the latest version each time and removes it after use.

**Method C: Project Local Installation**

```bash
cd your-project
npm install --save-dev ai-verify-mcp
```

Suitable for use in project CI pipelines, or add scripts to `package.json`:

```json
{
  "scripts": {
    "verify": "ai-verify-mcp validate --url http://localhost:5173",
    "verify:start": "ai-verify-mcp"
  }
}
```

### 2.3 Verify Installation

```bash
ai-verify-mcp --version
# Output: 1.0.0

ai-verify-mcp health
# Output: {"ok":true,"name":"ai-verify-mcp","version":"1.0.0","message":"Playwright browser is available"}
```

### 2.4 Uninstallation

```bash
npm uninstall -g ai-verify-mcp
```

---

## 3. CLI Command Reference

### 3.1 `health` — Health Check

Check if the Playwright browser is available.

```bash
ai-verify-mcp health

# On success exit 0:
# {"ok":true,"name":"ai-verify-mcp","version":"1.0.0","message":"Playwright browser is available"}

# On failure exit 1:
# {"ok":false,"error":"Playwright browser is not available"}
```

**Use cases**: CI pipeline pre-checks, Docker container health checks.

---

### 3.2 `validate` — Quick Validation

One-click validation of 7 core checks for a URL.

```bash
ai-verify-mcp validate --url <URL>
```

**Parameters**:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--url <URL>` | ✅ | Page address to validate (http/https/file protocols) |
| `--ai-provider` | ❌ | AI provider (openai/deepseek/qwen) |
| `--ai-api-key` | ❌ | AI API Key |

**Examples**:

```bash
# Validate local development page
ai-verify-mcp validate --url http://localhost:5173

# Validate remote page
ai-verify-mcp validate --url https://example.com

# Validate local HTML file
ai-verify-mcp validate --url file:///path/to/index.html
```

**Output Description**:

```json
{
  "pass": true,                    // true=all passed, false=failures exist
  "mode": "quick",
  "summary": "All 7 checks passed, load time 684ms",
  "topErrors": [],                 // If failed, lists top errors
  "artifacts": [                   // List of artifact paths
    "E:\\project\\artifacts\\quick-run-xxx.png"
  ]
}
```

**7 Check Items**:

| # | Check Item | Description |
|---|------------|-------------|
| 1 | Page Load | Page loads normally within 30s |
| 2 | Blank Screen Detection | Page has visible text/element content |
| 3 | Console Errors | No JavaScript exception output |
| 4 | CSS Loading | All stylesheets load normally |
| 5 | JS Loading | All scripts load normally |
| 6 | Image Resources | Image resources do not return 4xx/5xx |
| 7 | Usability | Page has interactive elements |

---

### 3.3 `run` — Execute Validation Flow

Execute multi-step validation from a flow JSON file.

```bash
ai-verify-mcp run --flow <flow-file.json>
```

**Parameters**:

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--flow <file>` | ✅ | Path to flow JSON file |
| `--ai-provider` | ❌ | AI provider |
| `--ai-api-key` | ❌ | AI API Key |

**Flow JSON Format**:

```json
{
  "name": "Login Page Validation",
  "goal": "Open login page → Screenshot → Verify",
  "steps": [
    { "type": "open", "url": "http://localhost:5173/login" },
    { "type": "screenshot", "name": "Login page" },
    { "type": "check", "checks": ["no_top_errors"] }
  ]
}
```

**Supported Types**:

| type | Parameters | Description |
|------|------------|-------------|
| `open` | `url` (required) | Open page |
| `click` | `selector` (required) | Click element |
| `type` | `selector` + `text` | Input text |
| `wait` | `ms` or `urlContains` | Wait |
| `screenshot` | `name` | Screenshot |
| `hover` | `selector` | Hover |
| `scroll` | `distance` | Scroll |
| `press_key` | `key` + `selector` | Press key |
| `eval` | `expression` | Execute JS |
| `errors` | — | View Console errors |
| `errors_clear` | — | Clear error baseline |
| `check` | `checks`/`selector` | Verify |
| `collect` | — | Collect evidence |
| `report` | — | Generate report |

**Example**:

```json
{
  "name": "Shopping Cart Flow Validation",
  "goal": "Open product page → Add to cart → Screenshot → Check errors",
  "steps": [
    { "type": "open", "url": "http://localhost:5173/shop" },
    { "type": "screenshot", "name": "Product page" },
    { "type": "click", "selector": ".add-to-cart" },
    { "type": "wait", "ms": 2000 },
    { "type": "screenshot", "name": "After adding to cart" },
    { "type": "errors" }
  ]
}
```

---

### 3.4 `start` — Start MCP Server

Start MCP Server in stdio mode for AI client connections.

```bash
# stdio mode (default)
ai-verify-mcp start

# HTTP mode
ai-verify-mcp start --http --port 3456
```

**Parameters**:

| Parameter | Description |
|-----------|-------------|
| `--http` | Start in HTTP mode (default stdio) |
| `--port <port>` | HTTP mode port (default 3456) |

After startup, the Server runs continuously, waiting for AI clients to initiate tool calls.

---

## 4. MCP Server Configuration (AI Clients)

### 4.1 Trae

**Method A: Project-Level Configuration (Recommended)**

Create `.trae/mcp.json` in the project root:

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

**Method B: User-Level Global Configuration**

Path: `%APPDATA%\Trae CN\User\mcp.json` (Windows)

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

**Note**:
- Restart Trae session after configuration
- Trae has a limit of 40 tools per Server; exceeding this triggers `list tools failed`. If enabling multiple Servers, keep only those you need.

### 4.2 Cursor

**Project-Level Configuration**: `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

Cursor → Settings → MCP → View Server status.

### 4.3 Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### 4.4 Windsurf

Windsurf → Settings → MCP Servers → Add:

```json
{
  "ai-verify-mcp": {
    "command": "npx",
    "args": ["-y", "ai-verify-mcp"]
  }
}
```

### 4.5 Claude Code

```bash
claude mcp add ai-verify-mcp npx -y ai-verify-mcp
```

### 4.6 Cline / Roo Code / OpenClaw

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

See each client's documentation for configuration file locations.

### 4.7 Codex CLI

```bash
codex mcp add ai-verify-mcp -- npx -y ai-verify-mcp
```

Or write to `~/.codex/config.toml`:

```toml
[mcpServers.ai-verify-mcp]
command = "npx"
args = ["-y", "ai-verify-mcp"]
```

### 4.8 Hermes

```bash
hermes mcp add ai-verify-mcp npx -y ai-verify-mcp
```

Or write to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  ai-verify-mcp:
    command: npx
    args: ["-y", "ai-verify-mcp"]
```

### 4.9 CodeArts

IDE → Settings → MCP Settings:

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

**Note**: CodeArts recommends enabling no more than 3 Servers, otherwise performance may be affected.

### 4.10 CodeBuddy

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

Supports three transports: stdio / SSE / HTTP.

---

## 5. Skill + MCP Combined Usage (Recommended)

### 5.1 Why Combine Them

ai-verify-mcp provides 77 **atomic validation tools** (browser operations, screenshots, a11y scanning, etc.), but these tools need to be **orchestrated and called** to complete a full validation task. The Skill system is the orchestration layer.

| MCP Alone | Skill Alone | Skill + MCP Combined |
|-----------|-------------|---------------------|
| 77 tools but requires manual orchestration | Has workflows but lacks execution capability | ✅ Auto-orchestration + auto-execution |
| Scattered validation results | Fixed workflow templates | ✅ Complete evidence chain + flexible configuration |

### 5.2 Configuration Steps

**Step 1: Configure ai-verify-mcp MCP Server in Trae**

`.trae/mcp.json`:

```json
{
  "mcpServers": {
    "ai-verify-mcp": {
      "command": "npx",
      "args": ["-y", "ai-verify-mcp"]
    }
  }
}
```

**Step 2: Ensure Skill File Exists**

Skill configuration file is at `.trae/skills/browser-dev-full-validation-skill/SKILL.md`. Verify the file exists and has complete content.

**Step 3: Restart Trae Session**

To make the configuration take effect.

### 5.3 Workflow

```
You → Tell AI Assistant "Help me validate this page"
     ↓
Skill auto-orchestrates 7-phase flow:
  1. Open page → Screenshot
  2. Check Console errors
  3. Check network requests
  4. Scan accessibility (a11y)
  5. Check CSS variables
  6. Generate report
  7. Compile evidence chain
     ↓
ai-verify-mcp executes specific operations for each phase
     ↓
Output: Screenshots + error diagnosis + evidence chain report
```

### 5.4 Comparison: With Skill vs Without Skill

```text
❌ MCP Only (Manual Mode):
   You: "Open the page with browser_open"
   AI: Okay, opened
   You: "Take a screenshot with browser_screenshot"
   AI: Okay, screenshot taken
   ...repeat each step...

✅ With Skill (Auto Mode):
   You: "Help me validate this page"
   AI: Starting 7-phase validation flow...
       ✅ Page loaded successfully
       ✅ No Console errors
       ⚠️ Found two accessibility issues
       ✅ Report generated
```

---

## 6. 77 Tools Quick Reference

> Below are all 77 tools provided by ai-verify-mcp, listed by functional category. Among them, `error_fix_suggestion` has 23 built-in error matching patterns (including 4 Python backend fix patterns), supporting automatic diagnosis and recommended fix solutions.

### 6.1 Browser Operations (25 tools)

| Tool Name | Description |
|-----------|-------------|
| `browser_batch` | Batch execute browser operation sequences |
| `browser_click` | Click page elements |
| `browser_dom` | DOM query and manipulation |
| `browser_eval` | Execute JavaScript in the page |
| `browser_find_element` | Intelligently find elements by text |
| `browser_find_page` | Page type recognition |
| `browser_flow` | Browser operation flow orchestration |
| `browser_highlight` | Highlight page elements |
| `browser_hover` | Hover over elements |
| `browser_instrument` | Inject tool scripts into the page |
| `browser_links` | Get all page links |
| `browser_locator_suggest` | Selector suggestions |
| `browser_locator_validate` | Selector validation |
| `browser_navigate` | Navigate to specified URL |
| `browser_open` | Open page |
| `browser_press_key` | Key press operations |
| `browser_screenshot` | Full-page screenshot |
| `browser_screenshot_element` | Element screenshot |
| `browser_scroll` | Scroll page |
| `browser_select` | Select dropdown options |
| `browser_snapshot` | Page snapshot |
| `browser_step` | Single-step operation execution |
| `browser_traverse_menu` | Traverse menu structure |
| `browser_type` | Input text |
| `browser_wait` | Wait for specified conditions |

### 6.2 Diagnosis and Debugging (17 tools)

| Tool Name | Description |
|-----------|-------------|
| `browser_console` | View console logs |
| `browser_debug_report` | Generate debug report |
| `browser_diagnose` | Automatic error diagnosis (root cause analysis + confidence) |
| `browser_element_status` | Element status check (visibility, interactivity) |
| `browser_errors` | View page Console errors |
| `browser_errors_aggregate` | Error aggregation statistics |
| `browser_errors_clear` | Clear captured errors |
| `browser_events` | View page events |
| `browser_events_clear` | Clear captured events |
| `browser_network` | View network request list |
| `browser_network_detail` | View network request details |
| `browser_performance_check` | Page performance check |
| `browser_quick_fix` | Quick fix (multiple strategies) |
| `browser_verify_fix` | Fix verification closed-loop |
| `debug_investigate` | Deep investigation and analysis |
| `error_fix_suggestion` | Error fix suggestions |
| `error_summary_md` | Error summary (Markdown) |

### 6.3 Validation Framework (14 tools)

| Tool Name | Description |
|-----------|-------------|
| `browser_assert` | Assertion validation (URL, title, elements, etc.) |
| `fix_verify` | Fix result verification |
| `screenshot_diff` | Screenshot diff comparison |
| `validation_check` | Checkpoint validation (load, JS errors, etc.) |
| `validation_decision` | Validation decision |
| `validation_element` | Element validation (existence, visibility, text) |
| `validation_flow` | Multi-step flow validation |
| `validation_matrix` | Validation matrix |
| `validation_quick_run` | One-click 7-item quick validation |
| `validation_report` | Generate validation report |
| `validation_report_export` | Export validation report |
| `validation_run` | Run validation |
| `validation_start` | Start validation session |
| `validation_suite_run` | Run validation suite |

### 6.4 Session Management (7 tools)

| Tool Name | Description |
|-----------|-------------|
| `browser_session_create` | Create browser session |
| `browser_session_close` | Close browser session |
| `browser_session_switch` | Switch browser session |
| `browser_sessions` | List all active sessions |
| `browser_cookies` | Cookie management |
| `browser_storage` | Browser storage management |
| `browser_har_export` | Export HAR network request archive |

### 6.5 Evidence and Artifacts (4 tools)

| Tool Name | Description |
|-----------|-------------|
| `browser_artifacts` | Manage validation artifacts |
| `browser_artifacts_clear` | Clear validation artifacts |
| `browser_trace_start` | Start Playwright tracing |
| `browser_trace_stop` | Stop Playwright tracing |

### 6.6 Visual Regression (3 tools)

| Tool Name | Description |
|-----------|-------------|
| `browser_visual_baseline` | Set visual baseline |
| `browser_visual_compare` | Visual comparison |
| `browser_visual_report` | Generate visual regression report |

### 6.7 Accessibility Check (1 tool)

| Tool Name | Description |
|-----------|-------------|
| `browser_a11y_check` | axe-core accessibility scan |

### 6.8 Auxiliary Tools (4 tools)

| Tool Name | Description |
|-----------|-------------|
| `ai_debug_investigate` | AI-assisted deep troubleshooting |
| `benchmark_run` | Benchmark performance testing |
| `mcp_health_check` | MCP Server health check |
| `mcp_self_test` | MCP self-test (protocol + tool count) |

---

## 7. Typical Use Cases

### Scenario 1: Validate an AI-Generated Login Page

**Background**: You asked AI to generate a login page, and now you want to confirm it works properly.

**Tell the AI in your AI client**:

```
Help me validate this login page:
1. Open http://localhost:5173/login
2. Take a screenshot
3. Enter username admin@test.com, password 123456
4. Click the login button
5. Take a screenshot of the post-login page
6. Check for Console errors
7. Tell me the results
```

**AI will sequentially call**:
1. `browser_open` → Open page
2. `browser_screenshot` → Screenshot
3. `browser_type` → Enter username
4. `browser_type` → Enter password
5. `browser_click` → Click login
6. `browser_screenshot` → Screenshot after login
7. `validation_check` → Check results

### Scenario 2: Validate Page Style Compliance

```
Validate this page's styles:
1. Open http://localhost:5173/settings
2. Take a screenshot
3. Check for accessibility issues (a11y)
4. Check for missing CSS variables
5. Report results
```

**AI will call**:
1. `browser_open` → Open
2. `browser_screenshot` → Screenshot
3. `browser_a11y_check` → axe scan
4. `browser_css_trace` → CSS variable tracing

### Scenario 3: Diagnose Page Errors

```
This page is throwing errors, help me diagnose:
1. Open http://localhost:5173/dashboard
2. View Console errors
3. View network request status
4. Auto-diagnose root cause
5. Tell me how to fix it
```

**AI will call**:
1. `browser_open` → Open
2. `browser_errors` → Console errors
3. `browser_network` → Network requests
4. `browser_diagnose` → Auto-diagnosis
5. `browser_quick_fix` → Fix suggestions

### Scenario 4: Complete Validation + Evidence Retention

```
Validate the homepage and generate a complete evidence chain report:
1. Open http://localhost:5173
2. Screenshot the homepage
3. Click "Products" navigation
4. Screenshot the products page
5. Click "Contact Us"
6. Screenshot the contact page
7. Generate validation report
```

---

## 8. Artifacts and Evidence Chain

### 8.1 Artifact Directory Structure

Each validation operation retains evidence in the `artifacts/` directory:

```
artifacts/
├── screenshots/           # Screenshot files
│   ├── login-page.png
│   ├── dashboard.png
│   └── ...
├── traces/               # Playwright trace files (with full operation recording)
├── har/                  # HAR network request logs
├── reports/              # Validation reports
│   ├── validation-report.md
│   └── validation-report.json
└── ...                   # Other artifacts
```

### 8.2 Evidence Chain Description

| Artifact Type | Format | Description |
|--------------|--------|-------------|
| Screenshots | PNG | Browser screenshots for each operation step |
| Trace | ZIP | Playwright trace, can replay complete operation process |
| HAR | JSON | Complete record of all network requests |
| Reports | MD+JSON | Markdown and structured data of validation results |

### 8.3 Configure Artifact Paths

Customize artifact directory location via environment variables:

```bash
set VALIDPILOT_ARTIFACTS_DIR=E:/my-reports
ai-verify-mcp validate --url http://localhost:5173
```

---

## 9. Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3456 | HTTP mode port |
| `VALIDPILOT_ARTIFACTS_DIR` | `./artifacts` | Artifact directory path |
| `VALIDPILOT_REDACTION` | `false` | Enable sensitive information redaction |
| `VALIDPILOT_ALLOWLIST` | `*` | Domain allowlist (comma-separated) |
| `VALIDPILOT_BLOCKED_HOSTS` | — | Domain blocklist (comma-separated) |
| `MCP_API_KEY` | — | HTTP mode API Key authentication |
| `SSH_PASS` | — | SSH password (used for remote tunneling) |
| `SSH_KEY_PATH` | — | SSH private key path |
| `NODE_ENV` | `production` | Environment mode (test/dev enables debug logs) |

---

## 10. Troubleshooting

### Server Startup Failed

```text
Error: Port 3456 is already in use
Solution: ai-verify-mcp start --http --port 3457
```

```text
Error: Playwright browser is not available
Solution: npx playwright install chromium
```

### Browser Refresh Input Method Conflict

- Use Dropdown selector or Ctrl+Shift shortcut to switch input methods
- Or use English input method for operations

### MCP Tool List is Empty

- Restart AI client session for configuration to take effect
- Check configuration file JSON format (common errors: commas, quotes)
- Trae users note the 40 tool limit, reduce other Servers

### Validation Results Not as Expected

- Check if Network requests are blocked by CORS or firewall
- Confirm the page URL is reachable from the AI client's network
- Check if `VALIDPILOT_ALLOWLIST` includes the target domain

### Artifact Files Not Generated

- Confirm `VALIDPILOT_ARTIFACTS_DIR` directory has write permissions
- Default artifacts are in `./artifacts/` (current working directory)

---

> **More Help**:
> - [Log Troubleshooting Manual](LOG-TROUBLESHOOTING.md) — Detailed error codes and solutions
> - [MCP Protocol Cheatsheet](MCP-CHEATSHEET.md) — MCP basic concepts
> - GitHub Issues: https://github.com/validpilot/ai-verify-mcp/issues
> - Email: validpilot@outlook.com
