'use client'

import '@/lib/import-meta-env.js'
import { useEffect } from 'react'
import { QueryProvider } from '@/providers/QueryProvider'
import { DarkModeProvider } from '@/hooks/useDarkMode.jsx'
import { AuthProvider } from '@/hooks/useAuth'
import { SystemProvider } from '@/hooks/useSystem.jsx'
import ErrorBoundary from '@/components/ErrorBoundary'
import { Toaster } from 'react-hot-toast'
import { BrowserRouter } from '@/lib/react-router-compat'
import { initFirebase } from '@/firebase/config'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { cleanupConsole } from '@/lib/consoleCleanup'
import BackgroundGenerationBanner from '@/components/BackgroundGenerationBanner'
import AdminProfessorDock from '@/components/AdminProfessorDock'

function ClientBootstrap() {
  useEffect(() => {
    cleanupConsole()
    initFirebase()
  }, [])
  useOnlineStatus()
  return null
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <QueryProvider>
          <DarkModeProvider>
            <AuthProvider>
              <SystemProvider>
                <ClientBootstrap />
                {children}
                <BackgroundGenerationBanner />
                <AdminProfessorDock />
                <Toaster
                  position="top-center"
                  containerStyle={{
                    top: 'max(0.75rem, env(safe-area-inset-top, 0px))',
                    left: 'max(0.5rem, env(safe-area-inset-left, 0px))',
                    right: 'max(0.5rem, env(safe-area-inset-right, 0px))',
                  }}
                  toastOptions={{
                    className: 'max-w-[min(100%,22rem)] !break-words',
                    style: { maxWidth: 'min(100vw - 1rem, 22rem)' },
                  }}
                />
              </SystemProvider>
            </AuthProvider>
          </DarkModeProvider>
        </QueryProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
