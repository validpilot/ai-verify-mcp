import { Breadcrumb, Layout, Avatar, Dropdown } from 'antd'
import { MenuFoldOutlined, MenuUnfoldOutlined, HomeOutlined, TableOutlined, WarningOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import styles from './index.module.scss'
import ThemeSwitch from '@/components/themeSwitch'
import { useNavigate, useLocation } from 'react-router-dom'
import React, { FC, useEffect, useMemo, useState } from 'react'
import avatar from '@/assets/images/avatar.jpg'
import { findParentNode } from '@/utils/common'

const { Header } = Layout

interface HeaderProps {
  onCollapse: (collapsed: boolean) => void
  collapsed: boolean
  userInfo: any
}

type MenuItem = Required<MenuProps>['items'][number]

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
  {
    key: '1',
    label: (
      <a target='_blank' rel='noopener noreferrer' href='https://www.antgroup.com'>
        GitHub
      </a>
    )
  },
  {
    key: '2',
    label: (
      <a target='_blank' rel='noopener noreferrer' href='https://www.aliyun.com'>
        Gitee
      </a>
    )
  },
  {
    key: '3',
    label: <LoginOut></LoginOut>
  }
]

const siders: MenuProps['items'] = [
  getItem('首页', '/home', <HomeOutlined />),
  getItem('表格', 'sub1', <TableOutlined />, [getItem('基础表格', '/basictable', null)]),
  getItem('异常页', 'sub2', <WarningOutlined />, [getItem('403', '/403', null), getItem('404', '/404', null)])
]

function LoginOut() {
  const navigate = useNavigate()

  const logOut = () => {
    navigate('/login')
  }

  return (
    <>
      <a target='' onClick={logOut}>
        退出登录
      </a>
    </>
  )
}

// 定义函数来递归遍历对象
function extractLabels(obj: any, key: string) {
  // 初始化结果数组
  var labels: any = []
  // 如果对象有标签信息 label，则将其添加到结果数组中
  if (obj.label) {
    labels.push({ title: obj.label })
  }
  // 如果对象有子数组 children，则递归遍历 children
  if (Array.isArray(obj.children)) {
    obj.children.forEach(function (child: any) {
      if (child.key === key) {
        // 递归调用 extractLabels 函数，并将结果合并到 labels 数组中
        labels = labels.concat(extractLabels(child, key))
      }
    })
  }

  // 返回结果数组
  return labels
}

const AvatarComponent = React.memo(() => {
  return <Avatar size={34} src={avatar} alt='avatar' style={{ margin: '0 10px' }} />
})

const ReHeader: FC<HeaderProps> = ({ onCollapse, collapsed, userInfo }) => {
  const [breadcrumbs, setBreadcrumds] = useState<any[]>([])
  let { pathname } = useLocation()

  useEffect(() => {
    let resultArray = []
    let res = findParentNode(pathname, siders)
    resultArray = extractLabels(res, pathname)
    setBreadcrumds(resultArray)
  }, [pathname])

  return (
    <>
      <Header className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {collapsed ? (
            <MenuUnfoldOutlined
              style={{ marginRight: '10px' }}
              onClick={() => {
                onCollapse(false)
              }}
            />
          ) : (
            <MenuFoldOutlined
              style={{ marginRight: '10px' }}
              onClick={() => {
                onCollapse(true)
              }}
            />
          )}
          <Breadcrumb items={breadcrumbs} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <ThemeSwitch></ThemeSwitch>
          <AvatarComponent />
          <Dropdown menu={{ items }} placement='bottomLeft' arrow>
            <span onClick={e => e.preventDefault()} style={{ fontWeight: 500 }}>
              {userInfo.nickname}
            </span>
          </Dropdown>
        </div>
      </Header>
    </>
  )
}

export default ReHeader
