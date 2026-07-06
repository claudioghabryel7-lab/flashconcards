import { readEnv, isDevEnv } from '@/lib/env.js'
import React, { StrictMode } from 'react'
import ReactDOM, { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'react-hot-toast'
import { DarkModeProvider } from './hooks/useDarkMode.jsx'
import { AuthProvider } from './hooks/useAuth.js'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import FirebaseConfigError from './components/FirebaseConfigError.jsx'
import { QueryProvider } from './providers/QueryProvider.jsx'
import { SystemProvider } from './hooks/useSystem.jsx'
import { cleanupConsole } from './lib/consoleCleanup.js'
import './index.css'
import './styles/design-system.css'
import './styles/stark-design-system.css'
import './styles/premium-design-system.css'
import '@fontsource/geist-sans'
import '@fontsource/space-grotesk'
import './debug-api-key.js' // Debug para verificar API key
import { firebaseInitialized } from './firebase/config.js'

// Proteção global contra erros do framer-motion
if (typeof window !== 'undefined') {
  cleanupConsole()
  window.addEventListener('error', (event) => {
    if (event.message && event.message.includes('Activity') && event.filename && event.filename.includes('framer-motion')) {
      console.warn('[App] Erro do framer-motion capturado, continuando sem animações...')
      event.preventDefault()
      event.stopPropagation()
      return false
    }
  }, true)
  
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && event.reason.message && event.reason.message.includes('Activity') && event.reason.stack && event.reason.stack.includes('framer-motion')) {
      console.warn('[App] Promise rejection do framer-motion capturado, continuando...')
      event.preventDefault()
      return false
    }
  })
}

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
        <QueryProvider>
          <DarkModeProvider>
            <AuthProvider>
              <SystemProvider>
                <App />
              </SystemProvider>
            </AuthProvider>
          </DarkModeProvider>
        </QueryProvider>
      </BrowserRouter>
    )
  } catch (error) {
    // Garantir que o erro seja convertido para string antes de logar
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (isDevEnv()) {
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

// Aguardar DOM estar pronto antes de renderizar
const initApp = () => {
  try {
    const rootElement = document.getElementById('root')
    if (!rootElement) {
      // Tentar novamente após um pequeno delay se o elemento não existir
      setTimeout(() => {
        const retryElement = document.getElementById('root')
        if (!retryElement) {
          document.body.innerHTML = '<div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8fafc; color: #1e293b; font-family: system-ui;"><div style="text-align: center; padding: 2rem;"><h1 style="font-size: 1.5rem; font-weight: bold; color: #dc2626; margin-bottom: 1rem;">Erro ao carregar aplicação</h1><p style="color: #64748b; margin-bottom: 1.5rem;">Elemento root não encontrado.</p><button onclick="window.location.reload()" style="padding: 0.5rem 1rem; background: #667eea; color: white; border: none; border-radius: 0.5rem; font-weight: 600; cursor: pointer;">Recarregar</button></div></div>'
          return
        }
        createRoot(retryElement).render(
          <StrictMode>
            <ErrorBoundary>
              <RootApp />
            </ErrorBoundary>
          </StrictMode>
        )
      }, 100)
      return
    }

    createRoot(rootElement).render(
      <StrictMode>
        <ErrorBoundary>
          <RootApp />
        </ErrorBoundary>
      </StrictMode>
    )
  } catch (error) {
    // Fallback em caso de erro crítico
    console.error('Erro crítico ao inicializar aplicação:', error)
    document.body.innerHTML = '<div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f8fafc; color: #1e293b; font-family: system-ui;"><div style="text-align: center; padding: 2rem; max-width: 500px;"><h1 style="font-size: 1.5rem; font-weight: bold; color: #dc2626; margin-bottom: 1rem;">Erro ao carregar aplicação</h1><p style="color: #64748b; margin-bottom: 1.5rem;">Ocorreu um erro ao inicializar a aplicação. Por favor, recarregue a página.</p><button onclick="window.location.reload()" style="padding: 0.5rem 1rem; background: #667eea; color: white; border: none; border-radius: 0.5rem; font-weight: 600; cursor: pointer;">Recarregar Página</button></div></div>'
  }
}

// Aguardar DOM estar pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp)
} else {
  // DOM já está pronto
  initApp()
}
