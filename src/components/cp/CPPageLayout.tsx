'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

export type CPPageHeaderProps = {
  badge?: string
  title: ReactNode
  subtitle?: string
  backHref?: string | null
  backLabel?: string
  actions?: ReactNode
}

export function CPPageHeader({
  badge,
  title,
  subtitle,
  backHref = '/dashboard',
  backLabel = 'Voltar ao Dashboard',
  actions,
}: CPPageHeaderProps) {
  const showBack = backHref != null && backHref !== ''
  return (
    <div className="cp-page-header mb-5 animate-fade-in sm:mb-8">
      {showBack && (
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-2 text-sm text-cp-muted transition hover:text-cp-text sm:mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          {badge && <span className="cp-badge cp-badge-accent">{badge}</span>}
          <h1 className="cp-headline mt-2 break-words text-xl sm:mt-4 sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-cp-muted sm:mt-2 sm:text-base">{subtitle}</p>}
        </div>
        {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">{actions}</div>}
      </div>
    </div>
  )
}

export function CPLoading({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
        <p className="mt-4 font-mono text-sm text-cp-muted">{label}</p>
      </div>
    </div>
  )
}
