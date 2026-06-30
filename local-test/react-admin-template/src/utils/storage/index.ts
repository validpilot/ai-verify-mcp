// 封装获取storage的数据

export default {
  // 写入
  set(key: string, value: any) {
    localStorage.setItem(key, value)
  },
  // 读取
  get(key: string) {
    const value = localStorage.getItem(key)
    if (!value) return ''
    try {
      return JSON.parse(value)
    } catch (error) {
      return value
    }
  },
  // 删除
  remove(key: string) {
    localStorage.removeItem(key)
  },
  // 清空
  clear() {
    localStorage.clear()
  }
}
