import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './hooks/useAuth'
import { DarkModeProvider } from './hooks/useDarkMode.jsx'
import { SystemProvider } from './hooks/useSystem.jsx'
import ErrorBoundary from './components/ErrorBoundary'
import FirebaseConfigError from './components/FirebaseConfigError'
import { firebaseInitialized } from './firebase/config'
import './index.css'

// Componente principal que verifica a configuração do Firebase
const RootApp = () => {
  // Se Firebase não está inicializado, mostrar tela de erro de configuração
  if (!firebaseInitialized) {
    return <FirebaseConfigError />
  }

  // Se está tudo OK, renderizar a aplicação normalmente
  return (
    <BrowserRouter>
      <DarkModeProvider>
        <AuthProvider>
          <SystemProvider>
            <App />
          </SystemProvider>
        </AuthProvider>
      </DarkModeProvider>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <RootApp />
    </ErrorBoundary>
  </StrictMode>,
)
