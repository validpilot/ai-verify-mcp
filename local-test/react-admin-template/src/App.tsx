import { RouterProvider } from 'react-router-dom'
import router from './router'
import { ConfigProvider, theme, App as AntdApp } from 'antd'
import { useStore } from './store'
import AntdGlobe from './utils/AntdGlobe'

function App() {
  const isDark = useStore(state => state.isDark)
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1677ff'
        },
        algorithm: isDark === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        components: {
          Menu: { itemSelectedBg: '#1677ff', itemSelectedColor: '#fff' }
        }
      }}
    >
      <AntdApp>
        <AntdGlobe></AntdGlobe>
        <RouterProvider router={router}></RouterProvider>
      </AntdApp>
    </ConfigProvider>
  )
}

export default App
