import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import '@/styles/theme.scss'
import { Watermark } from 'antd'
import '@/mock/index.ts'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <Watermark content=''>
    <App />
  </Watermark>
)
