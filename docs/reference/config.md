# 配置项说明

所有配置可通过环境变量或 `.env` 文件设置。

## 优先级

环境变量 > `.env` 文件 > 默认值

## 基础配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3456` | HTTP 模式监听端口 |
| `NODE_ENV` | `production` | 运行环境（production/development/test） |

## 产物配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VALIDPILOT_ARTIFACTS_DIR` | `./artifacts` | 验证产物存放目录 |
| `VALIDPILOT_RETENTION_DAYS` | `7` | 产物保留天数 |

## 安全配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VALIDPILOT_REDACTION` | `false` | 启用敏感信息脱敏 |
| `VALIDPILOT_ALLOWLIST` | `*` | 域名白名单，逗号分隔 |
| `VALIDPILOT_BLOCKED_HOSTS` | `''` | 域名黑名单，逗号分隔 |
| `MCP_API_KEY` | `''` | HTTP 模式 API Key |

## SSH / 远程隧道

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SSH_PASS` | `''` | SSH 密码 |
| `SSH_KEY_PATH` | `''` | SSH 私钥路径 |
| `SSH_USER` | `''` | SSH 用户名 |
| `SSH_HOST` | `''` | SSH 主机地址 |

## 浏览器配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BROWSER_HEADLESS` | `true` | 无头模式 |
| `BROWSER_VIEWPORT_WIDTH` | `1280` | 视口宽度 |
| `BROWSER_VIEWPORT_HEIGHT` | `720` | 视口高度 |
| `BROWSER_TIMEOUT` | `30000` | 超时时间（毫秒） |

## AI 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AI_PROVIDER` | `''` | AI 提供商（openai/deepseek/qwen），本地 AI 模式 |
| `AI_API_KEY` | `''` | AI API Key，本地 AI 模式 |
| `AI_BASE_URL` | `''` | AI API 基础地址 |
| `AI_MODEL` | `''` | AI 模型名称 |

## 云端 API 配置（付费功能）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VALIDPILOT_API_KEY` | `''` | 云端 API Key，付费用户配置 |
| `VALIDPILOT_API_URL` | `https://api.validpilot.com` | 云端 API 地址 |

> **说明**：`AI_*` 配置用于本地 AI 模式（需自行配置 AI API Key），`VALIDPILOT_API_KEY` 用于云端 API 模式（付费用户专用，云端自动计费）。

## 视觉对比配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VISUAL_THRESHOLD` | `0.1` | 默认差异阈值 |
| `VISUAL_BASELINE_DIR` | `artifacts/visual/baseline` | 基线图目录 |

## .env 文件示例

```env
# 基础
PORT=3456
NODE_ENV=development

# 产物
VALIDPILOT_ARTIFACTS_DIR=./artifacts
VALIDPILOT_RETENTION_DAYS=7

# 安全
VALIDPILOT_REDACTION=true
VALIDPILOT_ALLOWLIST=localhost,example.com
MCP_API_KEY=your-secret-key

# 浏览器
BROWSER_HEADLESS=true
BROWSER_VIEWPORT_WIDTH=1920
BROWSER_VIEWPORT_HEIGHT=1080
```
