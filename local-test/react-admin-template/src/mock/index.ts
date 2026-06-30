import Mock from 'mockjs'

// 拦截请求，模拟接口url和数据
Mock.setup({
  timeout: '200-1000'
})

Mock.mock('/api/list', 'get', {
  message: 'success',
  code: 200,
  data: {
    nickname: 'GGBOND',
    id: 1
  }
})

// 登录接口
Mock.mock('/api/login', 'post', options => {
  const { body } = options // 获取请求的body参数
  const { username, password } = JSON.parse(body) // 解析body参数
  // 根据用户名和密码进行验证，并返回模拟的登录结果
  if (username === 'admin' && password === '123456') {
    return {
      code: 200,
      message: '登录成功',
      token: '123456789'
    }
  } else {
    return {
      code: 400,
      message: '用户名或密码错误'
    }
  }
})
