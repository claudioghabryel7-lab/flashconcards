'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { SITE_NAME } from '@/lib/site'

export type CPPageHeaderProps = {
  badge?: string
  title: ReactNode
  subtitle?: string
  backHref?: string | null
  backLabel?: string
  actions?: ReactNode
  /** Hero tech compacto (padrão). Use false só em telas especiais. */
  tech?: boolean
}

export function CPPageHeader({
  badge,
  title,
  subtitle,
  backHref = '/dashboard',
  backLabel = 'Voltar',
  actions,
  tech = true,
}: CPPageHeaderProps) {
  const showBack = backHref != null && backHref !== ''

  if (!tech) {
    return (
      <div className="cp-page-header mb-3 animate-fade-in sm:mb-8">
        {showBack && (
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-2 text-sm text-cp-muted transition hover:text-cp-text sm:mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            {badge && <span className="cp-badge cp-badge-accent">{badge}</span>}
            <h1 className="cp-headline mt-1.5 break-words text-lg leading-tight sm:mt-4 sm:text-4xl sm:leading-none">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 max-w-2xl text-xs text-cp-muted sm:mt-2 sm:text-base">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">{actions}</div>}
        </div>
      </div>
    )
  }

  return (
    <header className="dash-hero mb-5 max-w-full overflow-hidden p-4 sm:mb-6 sm:p-6">
      <div className="dash-hero-grid" aria-hidden />
      <div className="dash-hero-glow dash-hero-glow--a" aria-hidden />
      <div className="dash-hero-glow dash-hero-glow--b" aria-hidden />
      <div className="dash-scanline" aria-hidden />

      <div className="relative z-[1] min-w-0 max-w-full">
        {showBack && (
          <Link
            href={backHref}
            className="mb-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-cp-muted transition hover:text-cp-text"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {backLabel}
          </Link>
        )}

        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cp-accent">
                {SITE_NAME}
              </p>
              {badge ? (
                <span className="rounded-md border border-cp-border bg-cp-surface/70 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-cp-muted">
                  {badge}
                </span>
              ) : null}
            </div>
            <h1 className="cp-headline mt-2 break-words text-2xl sm:text-3xl md:text-[2.35rem]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1.5 max-w-lg text-sm text-cp-muted">{subtitle}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </header>
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
