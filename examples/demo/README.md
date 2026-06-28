# ValidPilot 低 Token Demo

> **声明：本 Demo 仅用于快速验证演示，不是 E2E 测试体系。**

这是一个纯静态页面的低 Token 验证 Demo，不依赖 E2E 框架、不绑定任何外部业务项目，仅用于 3 分钟快速体验 ValidPilot 的核心摘要能力。

## 样例用途

| 样例 | 文件 | 用途 |
|------|------|------|
| Clean demo | `index.html` + `flow.json` | 默认 business_pass 快速验证样例，初始加载不主动产生 console error、pageerror 或失败网络请求 |
| Diagnostic error demo | `diagnostic-error.html` + `diagnostic-error-flow.json` | 故意产生 console error/warn，仅用于错误聚合、根因分析和修复建议验证 |

## 3 分钟体验

### 前置条件
- Node.js >= 18
- 已安装依赖（`npm install`）

### 步骤 1 — 健康检查
```bash
node bin/validpilot.js health
```
预期：输出 MCP 可用性和引擎状态摘要。

### 步骤 2 — 打开 Clean Demo 页面并获取摘要
```bash
node bin/validpilot.js validate --url examples/demo/index.html
```
预期：输出 pass=true、Top errors 为空、DOM 摘要和短 artifact 路径。

### 步骤 3 — 执行 Clean 轻量验证流
```bash
node bin/validpilot.js run --flow examples/demo/flow.json
```
预期：依次执行 open → check → click → check → report，点击主按钮后状态变为成功文案，并返回 business_pass 用短报告。

### 显式运行 Diagnostic Error 样例
```bash
node bin/validpilot.js validate --url examples/demo/diagnostic-error.html
node bin/validpilot.js run --flow examples/demo/diagnostic-error-flow.json
```
预期：用于观察 intentional error/warn 的聚合摘要和修复建议输入，不应作为默认 business_pass 样例。

## 文件说明
| 文件 | 用途 |
|------|------|
| `index.html` | clean 静态页面，包含标题、说明、主按钮和状态元素 |
| `flow.json` | clean 轻量验证流定义（JSON 数组格式） |
| `diagnostic-error.html` | 含故意 console error ×2 和 warn ×1 的诊断页面 |
| `diagnostic-error-flow.json` | diagnostic error 轻量验证流定义 |
| `README.md` | 本文档 |

## 注意事项
- 此 Demo 不引用任何外部业务项目页面、接口或功能
- 不创建 E2E 目录、E2E spec 或重型浏览器回归脚本
- 输出仅包含短摘要，不输出完整 DOM、完整日志或长截图描述
- 默认 CLI 示例优先使用 clean demo；error demo 必须显式指定文件运行
