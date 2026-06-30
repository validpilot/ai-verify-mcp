import { Button, Form, Input, type FormProps, App } from 'antd'
import { HappyProvider } from '@ant-design/happy-work-theme'
import styles from './index.module.scss'
import ThemeSwitch from '@/components/themeSwitch'
import { useNavigate } from 'react-router-dom'
import { loginApi } from '@/api/index'

type FieldType = {
  username: string
  password: string
  remember?: string
}

function Login() {
  const { message } = App.useApp()
  const navigate = useNavigate()

  const onFinish: FormProps<FieldType>['onFinish'] = values => {
    console.log('Success:', values)
    loginApi({ username: values.username, password: values.password }).then((res: ApiResponseData<any>) => {
      message.success(res.message)
      navigate('/home', { replace: true })
    })
  }

  const onFinishFailed: FormProps<FieldType>['onFinishFailed'] = errorInfo => {
    console.log('Failed:', errorInfo)
  }

  return (
    <>
      <div className={styles.login}>
        <div className={styles.left}></div>
        <div className={styles.right}>
          <div className={styles.switch}>
            <ThemeSwitch></ThemeSwitch>
          </div>
          <h2>打开门户，尽情探索</h2>
          <div className={styles.container}>
            <Form
              name='basic'
              labelCol={{ span: 8 }}
              wrapperCol={{ span: 16 }}
              style={{ maxWidth: 600 }}
              initialValues={{ username: 'admin', password: '123456', remember: true }}
              onFinish={onFinish}
              onFinishFailed={onFinishFailed}
              autoComplete='off'
            >
              <Form.Item<FieldType>
                label='用户名'
                name='username'
                rules={[{ required: true, message: '请输入用户名!' }]}
              >
                <Input />
              </Form.Item>

              <Form.Item<FieldType> label='密码' name='password' rules={[{ required: true, message: '请输入密码！' }]}>
                <Input.Password />
              </Form.Item>

              <Form.Item wrapperCol={{ offset: 8, span: 16 }}>
                <HappyProvider>
                  <Button type='primary' htmlType='submit'>
                    登录
                  </Button>
                </HappyProvider>
              </Form.Item>
            </Form>
          </div>
        </div>
      </div>
    </>
  )
}

export default Login
