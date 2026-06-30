# 浏览器操作工具

25 个浏览器操作工具，覆盖页面导航、元素交互、截图快照等。

## 页面导航

| 工具 | 说明 |
|------|------|
| `browser_open` | 打开页面 |
| `browser_navigate` | 导航到指定 URL |
| `browser_wait` | 等待指定条件 |
| `browser_flow` | 浏览器操作流程编排 |
| `browser_batch` | 批量执行浏览器操作序列 |

## 元素操作

| 工具 | 说明 |
|------|------|
| `browser_click` | 点击页面元素 |
| `browser_type` | 输入文本 |
| `browser_hover` | 悬停元素 |
| `browser_scroll` | 滚动页面 |
| `browser_press_key` | 按键操作 |
| `browser_select` | 选择下拉框选项 |
| `browser_highlight` | 高亮页面元素 |

## 元素定位

| 工具 | 说明 |
|------|------|
| `browser_find_element` | 按文本智能查找元素 |
| `browser_locator_suggest` | 选择器建议 |
| `browser_locator_validate` | 选择器验证 |
| `browser_dom` | DOM 查询与操作 |
| `browser_traverse_menu` | 遍历菜单结构 |

## 截图与快照

| 工具 | 说明 |
|------|------|
| `browser_screenshot` | 全屏截图 |
| `browser_screenshot_element` | 元素截图 |
| `browser_snapshot` | 页面快照 |
| `browser_links` | 获取页面所有链接 |

## 高级操作

| 工具 | 说明 |
|------|------|
| `browser_eval` | 在页面中执行 JavaScript |
| `browser_instrument` | 注入工具脚本到页面 |
| `browser_find_page` | 页面类型识别 |
| `browser_step` | 单步执行操作 |
| `browser_form_fill` | 批量表单填充 + 提交检测 |

## browser_form_fill

批量填写表单字段并可选提交检测。自动识别 input / select / textarea，根据类型生成 mock 数据，支持手动覆盖字段值。

**参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `url` | ✅ | 目标页面 URL |
| `selector` | ❌ | 表单选择器，默认 `form` |
| `fields` | ❌ | 手动指定的字段覆盖值（key=字段名，value=字段值） |
| `submit` | ❌ | 填充后是否自动提交，默认 true |
| `submitSelector` | ❌ | 提交按钮选择器，默认自动查找 submit 按钮 |

**返回示例**：
```json
{
  "filled": {
    "filled": true,
    "totalFields": 4,
    "filledCount": 4,
    "fields": [
      { "name": "email", "type": "email", "tag": "input", "filled": true, "value": "test@example.com" },
      { "name": "password", "type": "password", "tag": "input", "filled": true, "value": "Test123456!" },
      { "name": "country", "type": "select", "tag": "select", "filled": true, "value": "US" }
    ]
  },
  "submit": {
    "clicked": "button[type=\"submit\"]",
    "urlAfterSubmit": "https://example.com/dashboard",
    "titleAfterSubmit": "Dashboard"
  }
}
```

**适用场景**：自动化测试表单填写、批量数据录入测试、注册/登录流程自动化

## 使用示例

### 打开页面并截图

```
工具: browser_open
参数: { url: "https://example.com" }

工具: browser_screenshot
参数: { name: "homepage" }
```

### 表单填写

```
工具: browser_type
参数: { selector: "#username", text: "admin@test.com" }

工具: browser_type
参数: { selector: "#password", text: "123456" }

工具: browser_click
参数: { selector: "#login-btn" }
```

### 智能查找元素

```
工具: browser_find_element
参数: { text: "登录", role: "button" }
```
