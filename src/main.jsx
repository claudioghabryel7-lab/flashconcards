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
  try {
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
  } catch (error) {
    // Garantir que o erro seja convertido para string antes de logar
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (import.meta.env.DEV) {
      console.error('Erro ao renderizar RootApp:', errorMessage)
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Erro ao carregar aplicação</h1>
          <p className="text-slate-600 dark:text-slate-400 mb-4">{errorMessage || 'Erro desconhecido'}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-alego-600 text-white rounded-lg hover:bg-alego-700"
          >
            Recarregar
          </button>
        </div>
      </div>
    )
  }
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Elemento root não encontrado')
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <RootApp />
    </ErrorBoundary>
  </StrictMode>,
)
