import { Button, Result } from 'antd'
import { useNavigate } from 'react-router-dom'
import styles from './index.module.scss'

const NotPermissions = () => {
  const navigate = useNavigate()
  const handleClick = () => {
    navigate('/home')
  }
  return (
    <>
      <div className={styles.container}>
        <Result
          status='403'
          title='403'
          subTitle='抱歉，你当前没有权限访问此页面'
          extra={
            <Button type='primary' onClick={handleClick}>
              Back Home
            </Button>
          }
        />
      </div>
    </>
  )
}

export default NotPermissions
