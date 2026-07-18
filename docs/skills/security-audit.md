# Skill: 安全审计

> 场景：上线前安全漏洞扫描、OWASP Top 10 风险检测、HTTP 安全头审计、CSP 配置分析、SQL 注入/XSS 漏洞检测。

## 1. 场景描述与痛点

Web 应用安全漏洞是上线前必须排查的风险。AI 生成的代码经常出现：

- HTTP 安全响应头缺失（无 HSTS、无 X-Frame-Options、无 X-Content-Type-Options）
- CSP 配置不安全（`unsafe-inline`、`unsafe-eval`、通配符 `*`）
- OWASP Top 10 风险（A01 访问控制、A02 加密失败、A05 安全配置错误）
- SQL 注入漏洞（查询参数未做参数化）
- XSS 漏洞（用户输入未转义）
- 接口未鉴权（任意用户可访问管理接口）

**本 Skill 通过 5 步工具链**，从 HTTP 头到注入漏洞全方位扫描，输出分级风险报告。

⚠️ **重要声明**：本 Skill 仅用于**授权范围内的安全测试**（自有应用、CTF 靶场、Bug Bounty 项目）。禁止用于未授权扫描。

## 2. 推荐工具链

```
┌──────────────────────────────────────────────────────────────┐
│  安全审计工具链                                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: security_headers_check    检查 HTTP 安全响应头       │
│     ↓                                                        │
│  Step 2: security_csp_analyze      深度分析 CSP 配置           │
│     ↓                                                        │
│  Step 3: security_owasp_top10      OWASP Top 10 快速扫描       │
│     ↓                                                        │
│  Step 4: security_sql_injection_scan  SQL 注入扫描            │
│     ↓                                                        │
│  Step 5: security_xss_scan         XSS 漏洞扫描               │
│     ↓                                                        │
│  Step 6: evidence_pack             收集证据                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 每步说明

| 步骤 | 工具 | 作用 | 关键参数 |
|---|---|---|---|
| 1 | `security_headers_check` | 检查 CSP / X-Content-Type-Options / X-Frame-Options / HSTS / Referrer-Policy | `url` |
| 2 | `security_csp_analyze` | 深度解析 CSP 指令，检测 unsafe-inline / unsafe-eval / wildcard | `url` |
| 3 | `security_owasp_top10` | OWASP Top 10 快速风险扫描 | `url` |
| 4 | `security_sql_injection_scan` | 向查询参数注入 20 种 SQLi payload | `url`（含 query 参数） |
| 5 | `security_xss_scan` | 注入 26 种 XSS payload（script/event/SVG/template） | `url`（含 query 参数） |
| 6 | `evidence_pack` | 收集证据 | `name: "security-audit"` |

## 3. 关键参数说明

所有安全工具都只需一个 `url` 参数（必填）。

### security_headers_check
- `url`（必填）：目标 URL，如 `https://example.com`

**检测的响应头**：
- `Content-Security-Policy` — 防止 XSS/数据注入
- `X-Content-Type-Options` — 防 MIME 嗅探（应为 `nosniff`）
- `X-Frame-Options` — 防点击劫持（应为 `DENY` 或 `SAMEORIGIN`）
- `Strict-Transport-Security` — 强制 HTTPS（HSTS）
- `Referrer-Policy` — 控制 Referer 泄露

### security_csp_analyze
- `url`（必填）：目标 URL

**检测的不安全配置**：
- `unsafe-inline` — 允许内联脚本/样式（XSS 风险）
- `unsafe-eval` — 允许 eval()（代码注入风险）
- `*` 通配符 — 允许任意源加载
- `data:` / `blob:` — 允许数据 URL（可能被滥用）

### security_owasp_top10
- `url`（必填）：目标 URL

**覆盖的 OWASP 风险**（2021 版）：
- A01：访问控制失效
- A02：加密失败
- A03：注入（SQL/XSS）
- A05：安全配置错误
- A07：身份认证失败
- A09：安全日志监控失败

### security_sql_injection_scan
- `url`（必填）：**必须包含查询参数**，如 `https://example.com/product?id=1`

**注入的 payload**（20 种）：
- 基于错误：`'`、`"`、`' OR '1'='1`、`' OR '1'='1' --`
- 基于联合：`' UNION SELECT NULL --`、`' UNION SELECT NULL,NULL --`
- 基于盲注：`' AND SLEEP(5) --`、`' AND BENCHMARK(50000000,MD5('a')) --`
- 数据库特定：MySQL / Oracle / PostgreSQL / SQL Server / SQLite 错误特征

**检测机制**：响应中是否泄露 SQL 错误信息（如 `You have an error in your SQL syntax`）。

### security_xss_scan
- `url`（必填）：**必须包含查询参数**，如 `https://example.com/search?q=test`

**注入的 payload**（26 种）：
- `<script>alert(1)</script>` — 基础脚本注入
- `<img src=x onerror=alert(1)>` — 事件处理器
- `<svg onload=alert(1)>` — SVG onload
- `javascript:alert(1)` — JavaScript 协议
- `<template>...</template>` — 模板注入
- 编码变体：HTML 实体、Base64、Unicode

**检测机制**：响应中是否原样返回 payload（未转义）。

## 4. 预期产出

### security_headers_check 输出

```json
{
  "ok": true,
  "url": "https://example.com",
  "headers": {
    "content-security-policy": { "present": true, "value": "default-src 'self'" },
    "x-content-type-options": { "present": true, "value": "nosniff" },
    "x-frame-options": { "present": false, "issue": "missing" },
    "strict-transport-security": { "present": true, "value": "max-age=31536000; includeSubDomains" },
    "referrer-policy": { "present": false, "issue": "missing" }
  },
  "score": 60,
  "issues": [
    { "header": "X-Frame-Options", "severity": "major", "issue": "missing", "recommendation": "Add 'X-Frame-Options: DENY'" },
    { "header": "Referrer-Policy", "severity": "minor", "issue": "missing", "recommendation": "Add 'Referrer-Policy: strict-origin-when-cross-origin'" }
  ]
}
```

### security_csp_analyze 输出

```json
{
  "ok": true,
  "url": "https://example.com",
  "csp": "default-src 'self'; script-src 'self' 'unsafe-inline'",
  "directives": {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'"]
  },
  "issues": [
    {
      "directive": "script-src",
      "value": "'unsafe-inline'",
      "severity": "critical",
      "description": "unsafe-inline allows inline scripts, defeating CSP XSS protection",
      "recommendation": "Replace with nonce-based or hash-based CSP"
    }
  ],
  "score": 70
}
```

### security_owasp_top10 输出

```json
{
  "ok": true,
  "url": "https://example.com",
  "categories": [
    { "id": "A01", "name": "Broken Access Control", "status": "pass", "findings": 0 },
    { "id": "A02", "name": "Cryptographic Failures", "status": "warn", "findings": 1, "detail": "HSTS max-age < 1 year" },
    { "id": "A03", "name": "Injection", "status": "pass", "findings": 0 },
    { "id": "A05", "name": "Security Misconfiguration", "status": "fail", "findings": 2, "detail": "Missing X-Frame-Options; CSP allows unsafe-inline" }
  ],
  "overallRisk": "high"
}
```

### security_sql_injection_scan 输出

```json
{
  "ok": true,
  "url": "https://example.com/product?id=1",
  "totalPayloads": 20,
  "vulnerable": false,
  "findings": [],
  "dbms": "unknown"
}
```

**若检测到漏洞**：
```json
{
  "vulnerable": true,
  "findings": [
    {
      "payload": "' OR '1'='1",
      "response": "Error: You have an error in your SQL syntax near...",
      "evidence": "MySQL syntax error leaked",
      "dbms": "MySQL"
    }
  ]
}
```

### security_xss_scan 输出

```json
{
  "ok": true,
  "url": "https://example.com/search?q=test",
  "totalPayloads": 26,
  "vulnerable": false,
  "findings": []
}
```

**若检测到漏洞**：
```json
{
  "vulnerable": true,
  "findings": [
    {
      "payload": "<script>alert(1)</script>",
      "response": "...<script>alert(1)</script>...",
      "evidence": "Payload reflected unescaped in response body",
      "reflected": true
    }
  ]
}
```

### 综合风险分级

| 级别 | 含义 | 示例 |
|---|---|---|
| `blocking` | 必须修复才能上线 | SQL 注入漏洞、XSS 漏洞、CSP `unsafe-eval` |
| `critical` | 上线前强烈建议修复 | CSP `unsafe-inline`、HSTS 缺失、X-Frame-Options 缺失 |
| `major` | 上线后短期内修复 | Referrer-Policy 缺失、HSTS max-age 过短 |
| `optimization` | 长期优化项 | 部分响应头值非最优 |

## 5. 完整端到端示例

以 https://example.com 为例（公开域名，仅作演示）：

### 调用序列

```
# Step 1: 检查 HTTP 安全响应头
security_headers_check({ url: "https://example.com" })

# Step 2: 深度分析 CSP 配置
security_csp_analyze({ url: "https://example.com" })

# Step 3: OWASP Top 10 快速扫描
security_owasp_top10({ url: "https://example.com" })

# Step 4: SQL 注入扫描（URL 需含查询参数）
security_sql_injection_scan({ url: "https://example.com/?id=1" })

# Step 5: XSS 漏洞扫描
security_xss_scan({ url: "https://example.com/?q=test" })

# Step 6: 收集证据
evidence_pack({ name: "security-audit-example" })
```

### 预期返回

- `security_headers_check`：返回 5 个响应头的存在性和正确性
- `security_csp_analyze`：返回 CSP 指令解析和不安全配置列表
- `security_owasp_top10`：返回 OWASP 风险分类和综合风险等级
- `security_sql_injection_scan`：返回 `vulnerable: false`（example.com 无注入漏洞）
- `security_xss_scan`：返回 `vulnerable: false`
- `evidence_pack`：返回综合安全审计报告路径

## 6. 常见坑与最佳实践

### 常见坑

| 坑 | 现象 | 解决方案 |
|---|---|---|
| URL 无查询参数 | SQL/XSS 扫描返回 `No injectable parameters found` | URL 必须含 `?key=value`，如 `?id=1`、`?q=test` |
| 测试环境漏报 | 生产环境有 WAF 拦截，测试环境没有 | 在测试环境扫描 + 生产环境补充 `security_headers_check` |
| CSP 报告不完整 | 只看到 `unsafe-inline` 但不知具体指令 | 用 `security_csp_analyze` 深度解析，会列出每个 directive |
| HSTS 误报 | HTTPS 站点未启用 HSTS 被报为 critical | 确认是否真的需要 HSTS（HTTP 站点不应启用） |
| 跨域接口漏扫 | 只扫了首页，漏掉 API 接口 | 用 `asset_endpoint_enum` 枚举所有接口，逐个扫描 |
| 漏洞修复后未复扫 | 修复了 SQL 注入但未验证 | 修复后必须再跑一遍 `security_sql_injection_scan` 确认 `vulnerable: false` |

### 最佳实践

1. **先 headers 再注入**：先修复 HTTP 安全头（成本低、收益高），再做注入扫描
2. **CSP 优先级最高**：CSP 是 XSS 的最后一道防线，`unsafe-inline` 必须修复
3. **接口枚举先行**：用 `asset_endpoint_enum` 找到所有接口，再针对性扫描
4. **测试两条路径**：①登录态扫描（鉴权后接口）；②未登录态扫描（鉴权前接口）
5. **修复后必复扫**：每个漏洞修复后立即复扫确认
6. **必收证据**：`evidence_pack` 收集完整审计报告，用于合规存档
7. **分级处理**：blocking 必须修复，critical 强烈建议，major 短期内修复
8. **授权范围**：只扫描授权范围内的目标，避免法律风险

## 相关 Skill

- [性能审计](./performance-audit) — 性能与安全综合评估
- [端到端流程](./e2e-flow) — 安全审计作为上线门禁
- [调试排查](./debug-investigation) — 安全漏洞根因分析

## MCP Prompt

使用 `/audit-security` prompt 可快速启动安全审计工作流（需 ValidPilot v1.9.3+）。在支持 MCP Prompts 的客户端中输入 `/` 即可看到该命令，传入 `url` 参数后返回多步指令文本，由