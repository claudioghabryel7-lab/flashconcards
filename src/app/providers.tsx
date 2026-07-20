'use client'

import '@/lib/import-meta-env.js'
import '@/lib/consoleCleanup.js'
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
import useSiteCacheSync from '@/hooks/useSiteCacheSync'
import { cleanupConsole } from '@/lib/consoleCleanup'
import BackgroundGenerationBanner from '@/components/BackgroundGenerationBanner'
import CourseReviewPrompt from '@/components/CourseReviewPrompt'
import PushPermissionBanner from '@/components/PushPermissionBanner'
import {
  ensureFirestoreTransportRecovery,
  probeFirestoreHost,
} from '@/utils/firestoreTransportRecovery'

function ClientBootstrap() {
  useEffect(() => {
    cleanupConsole()
    let cancelled = false

    ;(async () => {
      const recovery = await ensureFirestoreTransportRecovery()
      if (cancelled) return
      if (recovery.cleaned) {
        // Uma vez: limpa SW legado / IndexedDB e recarrega para abrir canal limpo
        window.location.reload()
        return
      }

      initFirebase()
      const probe = await probeFirestoreHost()
      if (cancelled || probe.ok) return
      console.warn(
        '[Firestore] Handshake SSL falhou. Teste dados móveis, desative VPN/antivírus ou IPv6 no roteador.',
        probe.reason,
      )
    })()

    return () => {
      cancelled = true
    }
  }, [])
  useOnlineStatus()
  useSiteCacheSync()
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
                <CourseReviewPrompt />
                <PushPermissionBanner />
                <Toaster position="top-right" />
              </SystemProvider>
            </AuthProvider>
          </DarkModeProvider>
        </QueryProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
