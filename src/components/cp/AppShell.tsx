'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import CPHeader from '@/components/cp/CPHeader'
import CPFooter from '@/components/cp/CPFooter'
import TechBackground from '@/components/cp/TechBackground'

const SupportButton = dynamic(() => import('@/components/SupportButton'), { ssr: false })
const PopupBanner = dynamic(() => import('@/components/PopupBanner'), { ssr: false })
const OfflineIndicator = dynamic(() => import('@/components/OfflineIndicator'), { ssr: false })
const TrilhaTimerBanner = dynamic(() => import('@/components/TrilhaTimerBanner'), { ssr: false })
const AdminOnlinePresenceWorkers = dynamic(
  () => import('@/components/cp/AdminOnlinePresenceWorkers'),
  { ssr: false },
)

const MINIMAL_PATHS = ['/flashcards/pip', '/share-flashcards']
const FULL_BLEED_PATHS = ['/', '/cursos', '/comunidade']

function isCommunityRoute(pathname: string) {
  return pathname.startsWith('/comunidade') || pathname.startsWith('/profile/')
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''
  const minimal = MINIMAL_PATHS.some((p) => pathname.startsWith(p))
  const isComunidade = isCommunityRoute(pathname)
  const fullBleed = FULL_BLEED_PATHS.includes(pathname) || isComunidade

  if (minimal) {
    return (
      <>
        {children}
        <AdminOnlinePresenceWorkers />
      </>
    )
  }

  return (
    <div className="relative min-h-screen min-h-dvh w-full max-w-full min-w-0 overflow-x-hidden overflow-x-clip text-cp-text">
      <TechBackground showLogo={!fullBleed} />
      <CPHeader />
      <main
        className={
          fullBleed
            ? 'cp-shell-pad-bottom relative z-10 w-full max-w-full min-w-0 overflow-x-clip'
            : 'cp-container cp-shell-pad-bottom relative z-10 max-w-full min-w-0 overflow-x-clip py-3 sm:py-5'
        }
      >
        {children}
      </main>
      {!isComunidade && <CPFooter fullBleed={fullBleed} />}
      <SupportButton />
      <PopupBanner />
      <OfflineIndicator />
      <TrilhaTimerBanner />
      <AdminOnlinePresenceWorkers />
    </div>
  )
}
