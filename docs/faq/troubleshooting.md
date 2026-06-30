# 日志排查手册

常见错误代码与解决方案速查�?
## 启动类错�?
### EADDRINUSE - 端口已占�?
```
Error: listen EADDRINUSE: address already in use :::3456
```

**原因**�?456 端口被其他进程占用�?
**解决**�?```bash
# 查找占用进程
netstat -ano | findstr 3456

# 更换端口启动
@validpilot/@validpilot/@validpilot/ai-verify-mcp start --http --port 3457
```

### Playwright 浏览器不可用

```
Error: Playwright browser is not available
```

**原因**：Chromium 浏览器未安装�?
**解决**�?```bash
npx playwright install chromium
```

## 网络类错�?
### 页面加载超时

```
Timeout 30000ms exceeded.
```

**原因**：页面加载太慢或网络不通�?
**排查**�?1. 确认目标 URL 从当前网络可�?2. 检查是否需要代�?3. 增加超时时间
4. 检查目标服务是否正常启�?
### CORS 跨域错误

```
Access to fetch at '...' has been blocked by CORS policy
```

**原因**：后端接口未配置跨域�?
**解决**�?- 后端添加 CORS �?- 或使用浏览器的禁用安全模式（仅本地测试用�?
### SSL 证书错误

```
net::ERR_CERT_AUTHORITY_INVALID
```

**原因**：自签名证书或证书过期�?
**解决**：配置忽略证书错误（仅测试环境）�?
## 工具调用类错�?
### 选择器找不到元素

```
Error: No node found for selector: ...
```

**排查步骤**�?1. 确认选择器拼写正�?2. 页面是否加载完成
3. 元素是否�?iframe �?4. 元素是否被动态渲�?5. �?`browser_find_element` 智能查找

### 工具列表为空

**原因**：MCP Server 未正确连接�?
**排查**�?1. 重启 AI 客户端会�?2. 检查配置文�?JSON 格式
3. 检查命令路径是否正�?4. 手动运行命令测试：`npx @validpilot/@validpilot/@validpilot/@validpilot/ai-verify-mcp health`

### Trae 40 工具上限

```
list tools failed
```

**原因**：Trae 单个 Server 工具上限 40 个，本项目有 83 个�?
**解决**：减少其�?MCP Server，只保留需要的�?
## 产物类错�?
### 截图不生�?
**排查**�?1. 检�?`VALIDPILOT_ARTIFACTS_DIR` 目录权限
2. 确认磁盘空间充足
3. 查看 Console 错误

### 产物目录找不�?
默认产物目录�?`./artifacts/`（相对于当前工作目录）�?
设置自定义路径：
```bash
set VALIDPILOT_ARTIFACTS_DIR=E:/my-reports
```

## 配置类错�?
### 环境变量不生�?
**排查**�?1. 确认 `.env` 文件在项目根目录
2. 变量名拼写正�?3. 布尔值用 `true`/`false`
4. 重启 Server 使配置生�?
## 调试技�?
### 开启调试日�?
```bash
set NODE_ENV=development
@validpilot/@validpilot/@validpilot/ai-verify-mcp start
```

### 可视化调�?
```bash
set BROWSER_HEADLESS=false
@validpilot/@validpilot/@validpilot/ai-verify-mcp validate --url http://localhost:5173
```

可以看到浏览器实际操作过程�?
### 查看 HAR 记录

�?`browser_har_export` 导出 HAR 文件，在 Chrome DevTools 中分析网络请求�?
### Playwright Trace

```
browser_trace_start
... 操作 ...
browser_trace_stop
```

生成 trace.zip，在 https://trace.playwright.dev/ 中回放�?
---

## 获取帮助

- GitHub Issues: https://github.com/validpilot/ai-verify-mcp/issues
- 邮箱: validpilot@outlook.com
- 钉钉交流群：�?README
