import { request } from '@/utils/request/index'

export const getUserListApi: () => Promise<ApiResponseData<any>> = () => {
  return request({
    url: '/list',
    method: 'get'
  })
}

// 登录接口
type LoginRequestData = {
  username: number | string
  password: number | string
}

export const loginApi = (data: LoginRequestData): Promise<ApiResponseData<any>> => {
  return request({
    url: '/login',
    method: 'post',
    data
  })
}
