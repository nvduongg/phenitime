import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import viVN from 'antd/locale/vi_VN'
import App from './App.jsx'
import { AppProvider } from './contexts/AppContext.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { appTheme } from './config/theme.js'
import './assets/global.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ConfigProvider locale={viVN} theme={appTheme}>
        <AntApp>
          <AuthProvider>
            <AppProvider>
              <App />
            </AppProvider>
          </AuthProvider>
        </AntApp>
      </ConfigProvider>
    </BrowserRouter>
  </StrictMode>,
)
