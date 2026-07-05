'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import CPHeader from '@/components/cp/CPHeader'
import CPFooter from '@/components/cp/CPFooter'
import TechBackground from '@/components/cp/TechBackground'

const SupportButton = dynamic(() => import('@/components/SupportButton'), { ssr: false })
const PopupBanner = dynamic(() => import('@/components/PopupBanner'), { ssr: false })
const OfflineIndicator = dynamic(() => import('@/components/OfflineIndicator'), { ssr: false })

const MINIMAL_PATHS = ['/flashcards/pip', '/share-flashcards']
const FULL_BLEED_PATHS = ['/', '/cursos']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''
  const minimal = MINIMAL_PATHS.some((p) => pathname.startsWith(p))
  const fullBleed = FULL_BLEED_PATHS.includes(pathname)

  if (minimal) {
    return <>{children}</>
  }

  return (
    <div className="relative min-h-screen w-full text-cp-text">
      <TechBackground showLogo={!fullBleed} />
      <CPHeader />
      <main
        className={
          fullBleed
            ? 'relative z-10 w-full'
            : 'cp-container relative z-10 py-4 sm:py-6'
        }
      >
        {children}
      </main>
      <CPFooter fullBleed={fullBleed} />
      <SupportButton />
      <PopupBanner />
      <OfflineIndicator />
    </div>
  )
}
