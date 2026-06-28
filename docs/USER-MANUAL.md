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
