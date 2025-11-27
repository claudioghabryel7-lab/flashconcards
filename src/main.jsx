import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './hooks/useAuth'
import { DarkModeProvider } from './hooks/useDarkMode.jsx'
import { SystemProvider } from './hooks/useSystem.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <DarkModeProvider>
        <AuthProvider>
          <SystemProvider>
            <App />
          </SystemProvider>
        </AuthProvider>
      </DarkModeProvider>
    </BrowserRouter>
  </StrictMode>,
)
