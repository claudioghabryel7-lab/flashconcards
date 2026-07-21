'use client'

import { useEffect, type ComponentType } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { CPPageHeader } from '@/components/cp/CPPageLayout'
import { getLegacyPageMeta } from '@/components/cp/legacyPageMeta'

type LegacyPageProps = {
  component: ComponentType
  adminOnly?: boolean
  requireCourseSelection?: boolean
  guestOnly?: boolean
  publicPage?: boolean
  skipAutoHeader?: boolean
}

function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
    </div>
  )
}

export default function LegacyPage({
  component: Component,
  adminOnly = false,
  requireCourseSelection = false,
  guestOnly = false,
  publicPage = false,
  skipAutoHeader = false,
}: LegacyPageProps) {
  const { user, profile, loading, isAdmin } = useAuth()
  const router = useRouter()
  const pathname = usePathname() || ''
  const meta = !skipAutoHeader ? getLegacyPageMeta(pathname) : null

  useEffect(() => {
    if (loading) return

    if (guestOnly && user) {
      router.replace('/dashboard')
      return
    }

    if (!publicPage && !guestOnly && !user) {
      router.replace('/login')
      return
    }

    if (adminOnly && !isAdmin) {
      router.replace('/dashboard')
      return
    }

    if (requireCourseSelection && profile && profile.selectedCourseId === undefined) {
      router.replace('/select-course')
    }
  }, [loading, user, isAdmin, profile, adminOnly, requireCourseSelection, guestOnly, publicPage, router])

  if (loading) return <Loading />

  if (guestOnly && user) return null
  if (!publicPage && !guestOnly && !user) return null
  if (adminOnly && !isAdmin) return null
  if (requireCourseSelection && profile && profile.selectedCourseId === undefined) return null

  return (
    <div className="cp-legacy-root max-w-full min-w-0 overflow-x-clip pb-8">
      {meta && (
        <CPPageHeader
          badge={meta.badge}
          title={meta.title}
          subtitle={meta.subtitle}
          backHref={meta.backHref === null ? null : (meta.backHref ?? '/dashboard')}
          backLabel={meta.backLabel ?? 'Voltar ao Dashboard'}
        />
      )}
      <Component />
    </div>
  )
}
