# 购物流程 Flow 示例

> 场景：完整购物流程 — 浏览商品 → 添加购物车 → 查看购物车 → 结账

## 运行方式

```bash
node bin/validpilot.js run --flow examples/shopping-cart-flow/shopping-cart-flow.json
```

## Flow 文件

```json
[
  {
    "action": "navigate",
    "url": "https://example.com/products"
  },
  {
    "action": "wait",
    "ms": 2000
  },
  {
    "action": "screenshot",
    "name": "product-list"
  },
  {
    "action": "click",
    "selector": ".product-item:first-child .add-to-cart, .product:first-child .btn-add"
  },
  {
    "action": "wait",
    "ms": 1500
  },
  {
    "action": "screenshot",
    "name": "after-add-to-cart"
  },
  {
    "action": "click",
    "selector": ".cart-icon, .shopping-cart, #cart-btn, [class*=\"cart\"]"
  },
  {
    "action": "wait",
    "ms": 2000
  },
  {
    "action": "screenshot",
    "name": "cart-view"
  },
  {
    "action": "eval",
    "expression": "() => { const items = document.querySelectorAll('.cart-item, .shopping-cart-item'); return items.length > 0; }",
    "expected": true,
    "description": "购物车中有商品"
  },
  {
    "action": "click",
    "selector": ".checkout-btn, #checkout, [class*=\"checkout\"]"
  },
  {
    "action": "wait",
    "ms": 3000
  },
  {
    "action": "screenshot",
    "name": "checkout-page"
  }
]
```

## 验证点

| 步骤 | 验证内容 | 失败处理 |
|------|---------|---------|
| 添加购物车 | 商品出现在购物车中 | 检查添加按钮选择器 |
| 查看购物车 | 购物车页面加载正常 | 检查购物车链接 |
| 购物车非空 | 至少有 1 个商品 | 商品添加失败 |
| 点击结账 | 跳转到结账页面 | 检查结账按钮 |

## 适用于

- 购物流程端到端测试
- 购物车功能冒烟测试
- 添加商品到购物车验证
