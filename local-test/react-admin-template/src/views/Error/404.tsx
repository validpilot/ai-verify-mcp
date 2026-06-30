import { Button, Result } from 'antd'
import { useNavigate } from 'react-router-dom'
import styles from './index.module.scss'

function NotFound() {
  const navigate = useNavigate()
  const handleClick = () => {
    navigate('/home')
  }
  return (
    <>
      <div className={styles.container}>
        <Result
          status='404'
          title='404'
          subTitle='抱歉，你访问的页面不存在。'
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

export default NotFound
