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
                <Toaster position="top-right" />
              </SystemProvider>
            </AuthProvider>
          </DarkModeProvider>
        </QueryProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
