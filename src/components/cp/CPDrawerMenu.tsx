'use client'

import { memo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { X, RefreshCw, LogOut, ChevronRight, type LucideIcon } from 'lucide-react'
import CPLogo from './CPLogo'
import UserAvatar from '../UserAvatar'
import type { User } from 'firebase/auth'

type NavItem = {
  href: string
  label: string
  auth?: boolean
  admin?: boolean
}

type NavCategory = {
  label: string
  icon: LucideIcon
  items: NavItem[]
}

type Profile = {
  photoBase64?: string | null
  displayName?: string | null
  selectedCourseId?: string | null
} | null

type CPDrawerMenuProps = {
  open: boolean
  onClose: () => void
  pathname: string
  filteredCategories: NavCategory[]
  user: User | null
  profile: Profile
  isAdmin: boolean
  onLogout: () => void
}

const DrawerNavLink = memo(function DrawerNavLink({
  href,
  label,
  active,
  onClose,
}: {
  href: string
  label: string
  active: boolean
  onClose: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className={`group flex items-center justify-between rounded-xl px-4 py-3 text-sm transition ${
        active
          ? 'border border-cp-accent/25 bg-cp-accent/10 font-medium text-cp-accent'
          : 'text-cp-text/85 hover:bg-cp-surface hover:text-cp-text'
      }`}
    >
      {label}
      <ChevronRight
        className={`h-4 w-4 transition ${
          active
            ? 'text-cp-accent'
            : 'text-cp-muted/50 group-hover:translate-x-0.5 group-hover:text-cp-muted'
        }`}
      />
    </Link>
  )
})

function CPDrawerMenu({
  open,
  onClose,
  pathname,
  filteredCategories,
  user,
  profile,
  isAdmin,
  onLogout,
}: CPDrawerMenuProps) {
  const router = useRouter()

  const isActive = useCallback(
    (href: string) => pathname === href || pathname.startsWith(`${href}/`),
    [pathname]
  )

  const goTo = useCallback(
    (path: string) => {
      router.push(path)
      onClose()
    },
    [router, onClose]
  )

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/65"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-[min(360px,100%)] translate-x-0 flex-col border-l border-cp-border bg-[var(--cp-bg)] shadow-2xl will-change-transform"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
        style={{ contain: 'layout style paint' }}
      >
        <div className="flex items-center justify-between border-b border-cp-border px-5 py-4">
          <CPLogo size="sm" />
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-cp-border text-cp-muted transition hover:bg-cp-surface hover:text-cp-text"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {user && (
          <div className="border-b border-cp-border px-5 py-4">
            <button
              type="button"
              onClick={() => goTo('/perfil')}
              className="flex w-full items-center gap-3 rounded-2xl border border-cp-border bg-cp-surface p-3 text-left transition hover:border-cp-accent/30"
            >
              <UserAvatar
                photoBase64={profile?.photoBase64}
                name={profile?.displayName || user.displayName || ''}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-cp-text">
                  {profile?.displayName || user.displayName || user.email?.split('@')[0]}
                </p>
                <p className="font-mono text-[10px] text-cp-muted">
                  {isAdmin ? 'administrador' : 'investigador'} · editar perfil
                </p>
              </div>
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {filteredCategories.map((category) => {
            const Icon = category.icon
            return (
              <div key={category.label} className="mb-6">
                <div className="mb-3 flex items-center gap-2 px-1">
                  <span className="cp-badge cp-badge-accent !text-[10px]">
                    <Icon className="h-3 w-3" />
                    {category.label}
                  </span>
                </div>
                <div className="space-y-1">
                  {category.items.map((item) => (
                    <DrawerNavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      active={isActive(item.href)}
                      onClose={onClose}
                    />
                  ))}
                </div>
              </div>
            )
          })}

          {!user && (
            <div className="mb-6">
              <div className="mb-3 px-1">
                <span className="cp-badge cp-badge-cyan !text-[10px]">Conta</span>
              </div>
              <div className="space-y-1">
                <DrawerNavLink href="/login" label="Entrar" active={isActive('/login')} onClose={onClose} />
                <Link href="/cursos" onClick={onClose} className="cp-btn-primary mt-2 w-full !text-sm">
                  Começar agora
                </Link>
              </div>
            </div>
          )}
        </div>

        {user && (
          <div className="space-y-2 border-t border-cp-border p-4">
            <button
              type="button"
              onClick={() => goTo('/select-course')}
              className="cp-btn-ghost w-full !text-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Trocar curso
            </button>
            <button
              type="button"
              onClick={() => {
                onLogout()
                onClose()
              }}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-cp-border px-4 py-2.5 text-sm text-cp-muted transition hover:bg-cp-surface hover:text-cp-text"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

export default memo(CPDrawerMenu)
