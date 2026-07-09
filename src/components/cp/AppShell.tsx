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

const MINIMAL_PATHS = ['/flashcards/pip', '/share-flashcards']
const FULL_BLEED_PATHS = ['/', '/cursos', '/comunidade']
const STUDY_PATH_PREFIXES = [
  '/flashcards',
  '/flashcards/estudar',
  '/questoes-topic',
  '/pratica-incidencia',
  '/resolver-questoes',
  '/conteudo-incidencia',
  '/conteudo-completo/topic',
]

function isCommunityRoute(pathname: string) {
  return pathname.startsWith('/comunidade') || pathname.startsWith('/profile/')
}

function isStudyRoute(pathname: string) {
  return STUDY_PATH_PREFIXES.some((p) => pathname.startsWith(p))
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || ''
  const minimal = MINIMAL_PATHS.some((p) => pathname.startsWith(p))
  const isComunidade = isCommunityRoute(pathname)
  const fullBleed = FULL_BLEED_PATHS.includes(pathname) || isComunidade
  const studyLayout = isStudyRoute(pathname)

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
            : studyLayout
              ? 'cp-container-wide relative z-10 py-4 sm:py-6'
              : 'cp-container relative z-10 py-4 sm:py-6'
        }
      >
        {children}
      </main>
      {!isComunidade && <CPFooter fullBleed={fullBleed} />}
      <SupportButton />
      <PopupBanner />
      <OfflineIndicator />
      <TrilhaTimerBanner />
    </div>
  )
}
