// 工具函数封装
// 格式化金额
export const formatNum = (num: number | string) => {
  const a = parseFloat(num.toString())
  return a.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' })
}

// 查找路由父节点
export const searchRoute: any = (path: string, routes: any = []) => {
  for (const item of routes) {
    if (item.key === path) return item
    if (item.children) {
      const route = searchRoute(path, item.children)
      if (route) return route
    }
  }

  return null
}

// 查找父节点没有就返回当前节点
export const findParentNode = (key: any, menus: any) => {
  for (const item of menus) {
    if (item.children) {
      // 检查当前节点的子节点中是否有目标键值
      const childMatch = item.children.find((child: any) => child.key === key)
      if (childMatch) {
        return item // 返回当前节点，即父节点
      } else {
        // 递归搜索当前节点的子节点
        const parent = findParentNode(key, item.children)
        if (parent) {
          return item // 返回当前节点，即父节点
        }
      }
    } else if (item.key === key) {
      return item
    }
  }
  return null // 如果没有找到匹配项，返回 null
}
