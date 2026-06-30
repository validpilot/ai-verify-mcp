import { createBrowserRouter, Navigate, createHashRouter } from 'react-router-dom'
import React from 'react'
import { lazyLoader } from './lazyLoader'
import LayoutContent from '@/layout/layout'
import Login from '@/views/Login'

const router = [
  {
    path: '/',
    element: <Navigate to='/login'></Navigate>
  },
  {
    path: '/login',
    element: <Login></Login>
  },
  {
    element: <LayoutContent />,
    children: [
      {
        path: '/home',
        element: lazyLoader(React.lazy(() => import('@/views/Home')))
      },
      {
        path: '/basictable',
        element: lazyLoader(React.lazy(() => import('@/views/Tables/BasicTable')))
      },
      {
        path: '/404',
        element: lazyLoader(React.lazy(() => import('@/views/Error/404')))
      },
      {
        path: '/403',
        element: lazyLoader(React.lazy(() => import('@/views/Error/403')))
      }
    ]
  },
  {
    path: '*',
    element: <Navigate to='/404'></Navigate>
  }
]

export default createHashRouter(router)
