import { Layout } from 'antd'
import { useEffect, useState } from 'react'
import ReHeader from './components/Header'
import { Outlet } from 'react-router-dom'
import styles from './layout.module.scss'
import ReSider from './components/ReSider'
import { getUserListApi } from '@/api/index'
const { Content, Footer } = Layout

const layoutStyle = {
  overflow: 'hidden'
}
function LayoutContent() {
  const [collapsed, setCollapsed] = useState(false)
  const onCollapseHandle = (collapsed: boolean) => {
    setCollapsed(collapsed)
  }
  const [userInfo, setUserInfo] = useState({})

  useEffect(() => {
    getUserListApi().then(res => {
      setUserInfo(res.data)
    })
  }, [])

  return (
    <Layout style={layoutStyle}>
      <ReSider collapsed={collapsed} onCollapse={onCollapseHandle}></ReSider>
      <Layout>
        <ReHeader onCollapse={onCollapseHandle} collapsed={collapsed} userInfo={userInfo}></ReHeader>
        <Content className={styles.content}>
          <div className={styles.wrapper}>
            <Outlet></Outlet>
          </div>
          <Footer style={{ textAlign: 'center', marginTop: 20 }} className={styles.footer}>
            Ant Design ©{new Date().getFullYear()} Created by Ant UED
          </Footer>
        </Content>
      </Layout>
    </Layout>
  )
}

export default LayoutContent
