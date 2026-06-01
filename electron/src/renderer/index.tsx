import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import { hermesTheme } from './theme/antdTheme'
import App from './App'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider theme={hermesTheme}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
)
