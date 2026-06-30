import { Layout, Menu, MenuProps, theme } from 'antd'
import styles from './index.module.scss'
import { HomeOutlined, TableOutlined, WarningOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { FC, useEffect, useState } from 'react'
import { useStore } from '@/store'
import { findParentNode } from '@/utils/common/index'

const { Sider } = Layout
type MenuItem = Required<MenuProps>['items'][number]
interface SiderProps {
  collapsed: boolean
  onCollapse: (broken: boolean) => void
}

function getItem(
  label: React.ReactNode,
  key: React.Key,
  icon?: React.ReactNode,
  children?: MenuItem[],
  type?: 'group'
): MenuItem {
  return {
    key,
    icon,
    children,
    label,
    type
  } as MenuItem
}
const items: MenuProps['items'] = [
  getItem('首页', '/home', <HomeOutlined />),
  getItem('表格', 'sub1', <TableOutlined />, [getItem('基础表格', '/basictable', null)]),
  getItem('异常页', 'sub2', <WarningOutlined />, [getItem('403', '/403', null), getItem('404', '/404', null)])
]

const ReSider: FC<SiderProps> = ({ collapsed, onCollapse }) => {
  const {
    token: { colorBgContainer }
  } = theme.useToken()

  const { isDark } = useStore()
  const [defaultMenuKey, setDefaultMenuKey] = useState('/home')
  const [defaultMenu, setDefaultMenu] = useState<string[]>([])
  let { pathname } = useLocation()

  useEffect(() => {
    let res = findParentNode(pathname, items)
    setDefaultMenuKey(pathname)
    res ? setDefaultMenu([res.key]) : setDefaultMenu([])
  }, [pathname])

  const navigate = useNavigate()

  const changeRoutes = (e: any) => {
    setDefaultMenuKey(e.key)
    navigate(e.key)
  }

  const openChange = (keys: string[]) => {
    if (keys.length) {
      setDefaultMenu(keys.slice(keys.length - 1))
    } else {
      setDefaultMenu([])
    }
  }

  const breakpoint = (broken: boolean) => {
    onCollapse(broken)
  }

  return (
    <>
      <Sider
        breakpoint='xl'
        width='200'
        style={{ background: colorBgContainer }}
        collapsible={true}
        collapsed={collapsed}
        trigger={null}
        onBreakpoint={breakpoint}
      >
        <div className={styles.logo}></div>
        <Menu
          theme={isDark === 'dark' ? 'light' : 'dark'}
          mode='inline'
          selectedKeys={[defaultMenuKey]}
          openKeys={defaultMenu}
          style={{ height: '100%', borderRight: 0 }}
          items={items}
          onOpenChange={openChange}
          onSelect={changeRoutes}
        />
      </Sider>
    </>
  )
}

export default ReSider
