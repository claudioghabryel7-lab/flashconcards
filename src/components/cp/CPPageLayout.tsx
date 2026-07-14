'use client'

import Link from 'next/link'
import { ArrowLeft, Cpu } from 'lucide-react'
import type { ReactNode } from 'react'

export type CPPageHeaderProps = {
  badge?: string
  title: ReactNode
  subtitle?: string
  backHref?: string | null
  backLabel?: string
  actions?: ReactNode
  code?: string
}

export function CPPageHeader({
  badge,
  title,
  subtitle,
  backHref = '/dashboard',
  backLabel = 'Voltar ao Dashboard',
  actions,
  code,
}: CPPageHeaderProps) {
  const showBack = backHref != null && backHref !== ''
  return (
    <div className="cp-tech-card relative mb-8 overflow-hidden p-5 animate-fade-in sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(var(--cp-grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--cp-grid-line) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 0% 0%, black 10%, transparent 70%)',
        }}
      />
      <div className="relative">
        {showBack && (
          <Link
            href={backHref}
            className="mb-4 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-cp-muted transition hover:text-cp-text"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        )}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--cp-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--cp-accent)_10%,transparent)] text-[var(--cp-accent)]">
              <Cpu className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {badge && <span className="cp-badge cp-badge-accent">{badge}</span>}
                {code ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-cp-muted">
                    MOD //{code}
                  </span>
                ) : null}
              </div>
              <h1 className="cp-headline mt-3 text-3xl sm:text-4xl">{title}</h1>
              {subtitle && (
                <p className="mt-2 max-w-2xl text-sm text-cp-muted sm:text-base">{subtitle}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </div>
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
