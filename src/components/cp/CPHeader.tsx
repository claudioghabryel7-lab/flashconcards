'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Menu,
  X,
  BookOpen,
  ShieldCheck,
  LogOut,
  RefreshCw,
  Moon,
  Sun,
  ChevronRight,
} from 'lucide-react'
import CPLogo from './CPLogo'
import UserAvatar from '../UserAvatar'
import TopicNotificationsButton from '../TopicNotificationsButton'
import { useAuth } from '@/hooks/useAuth'
import { useDarkMode } from '@/hooks/useDarkMode.jsx'
import OnlineNowBadge from './OnlineNowBadge'

type NavItem = {
  href: string
  label: string
  auth?: boolean
  admin?: boolean
}

type NavCategory = {
  label: string
  icon: typeof BookOpen
  items: NavItem[]
}

const menuCategories: NavCategory[] = [
  {
    label: 'Estudo',
    icon: BookOpen,
    items: [
      { href: '/dashboard', label: 'Dashboard', auth: true },
      { href: '/guia-mentorado', label: 'Guia Mentorado', auth: true },
      { href: '/vespera-de-prova', label: 'Revisão', auth: true },
      { href: '/flashcards', label: 'Flashcards com IA', auth: true },
      { href: '/edital-verticalizado', label: 'Edital Verticalizado', auth: true },
      { href: '/treino-redacao', label: 'Treino Redação', auth: true },
      { href: '/trilha', label: 'Trilha', auth: true },
      { href: '/comunidade', label: 'Comunidade', auth: true },
      { href: '/calendario', label: 'Progresso', auth: true },
      { href: '/cursos', label: 'Concursos' },
    ],
  },
  {
    label: 'Admin',
    icon: ShieldCheck,
    items: [{ href: '/admin', label: 'Painel Admin', auth: true, admin: true }],
  },
]

export default function CPHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname() || '/'
  const router = useRouter()
  const { user, logout, isAdmin, profile } = useAuth()
  const { darkMode, toggleDarkMode } = useDarkMode()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  const filteredCategories = useMemo(() => {
    return menuCategories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => {
          if (item.admin && !isAdmin) return false
          if (item.auth && !user) return false
          return true
        }),
      }))
      .filter((category) => category.items.length > 0)
  }, [user, isAdmin])

  const hideShell = pathname.startsWith('/flashcards/pip') || pathname.startsWith('/share-flashcards')
  const isComunidade = pathname.startsWith('/comunidade')
  if (hideShell || isComunidade) return null

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <>
      <header
        className={`sticky top-0 z-50 w-full transition-all duration-500 ${
          scrolled
            ? 'border-b border-cp-border bg-cp-bg/75 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)]'
            : 'border-b border-cp-border/50 bg-cp-bg/40 backdrop-blur-xl'
        }`}
      >
        <div className="cp-container-wide flex h-[4.5rem] items-center justify-between gap-4">
          <CPLogo size="lg" />

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={toggleDarkMode}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-cp-border text-cp-muted transition hover:border-cp-border-hover hover:bg-cp-surface hover:text-cp-text"
              aria-label="Alternar tema"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {user && (
              <>
                <button
                  type="button"
                  onClick={() => router.push('/select-course')}
                  className="hidden h-10 items-center gap-2 rounded-full border border-cp-border px-4 text-sm text-cp-muted transition hover:border-cp-border-hover hover:bg-cp-surface hover:text-cp-text md:inline-flex"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">Trocar curso</span>
                </button>

                <TopicNotificationsButton />

                <button
                  type="button"
                  onClick={() => router.push('/perfil')}
                  className="hidden items-center gap-2.5 rounded-full border border-cp-border bg-cp-surface px-3 py-1.5 transition hover:border-cp-accent/30 md:flex"
                >
                  <UserAvatar
                    photoBase64={profile?.photoBase64}
                    name={profile?.displayName || user.displayName || ''}
                    size="xs"
                  />
                  <div className="text-left leading-tight">
                    <p className="max-w-[120px] truncate text-xs font-medium text-cp-text">
                      {profile?.displayName || user.displayName || user.email?.split('@')[0]}
                    </p>
                    <p className="font-mono text-[10px] text-cp-muted">
                      {isAdmin ? 'admin' : 'aluno'}
                    </p>
                  </div>
                </button>

                <div className="hidden lg:flex">
                  <OnlineNowBadge courseId={profile?.selectedCourseId ?? null} compact />
                </div>

                <button
                  type="button"
                  onClick={logout}
                  className="hidden h-10 items-center gap-2 rounded-full px-3 text-sm text-cp-muted transition hover:bg-cp-surface hover:text-cp-text lg:inline-flex"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sair</span>
                </button>
              </>
            )}

            {!user && (
              <>
                <Link href="/login" className="cp-btn-ghost hidden !py-2.5 !text-sm md:inline-flex">
                  Entrar
                </Link>
                <Link href="/cursos" className="cp-btn-primary hidden !py-2.5 !text-sm md:inline-flex">
                  Começar
                </Link>
              </>
            )}

            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-cp-border bg-cp-surface text-cp-text transition hover:border-cp-accent/30 hover:shadow-cp-glow"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside
            ref={drawerRef}
            className="fixed inset-y-0 right-0 z-[70] flex w-[min(100vw,360px)] flex-col border-l border-cp-border bg-cp-bg/95 shadow-2xl backdrop-blur-2xl"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between border-b border-cp-border px-5 py-4">
              <CPLogo size="sm" />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-cp-border text-cp-muted transition hover:bg-cp-surface hover:text-cp-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {user && (
              <div className="border-b border-cp-border px-5 py-4 space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    router.push('/perfil')
                    setDrawerOpen(false)
                  }}
                  className="cp-card flex w-full items-center gap-3 !rounded-2xl p-3 text-left transition hover:border-cp-accent/30"
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
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-cp-muted">Tópicos liberados</span>
                  <TopicNotificationsButton />
                </div>
              </div>
            )}

            {/* Nav */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
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
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setDrawerOpen(false)}
                          className={`group flex items-center justify-between rounded-xl px-4 py-3 text-sm transition ${
                            isActive(item.href)
                              ? 'border border-cp-accent/25 bg-cp-accent/10 font-medium text-cp-accent'
                              : 'text-cp-muted hover:bg-cp-surface hover:text-cp-text'
                          }`}
                        >
                          {item.label}
                          <ChevronRight
                            className={`h-4 w-4 transition ${
                              isActive(item.href)
                                ? 'text-cp-accent'
                                : 'text-cp-muted/50 group-hover:translate-x-0.5 group-hover:text-cp-muted'
                            }`}
                          />
                        </Link>
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
                    <Link
                      href="/login"
                      onClick={() => setDrawerOpen(false)}
                      className="flex items-center justify-between rounded-xl px-4 py-3 text-sm text-cp-muted transition hover:bg-cp-surface hover:text-cp-text"
                    >
                      Entrar
                      <ChevronRight className="h-4 w-4 text-cp-muted/50" />
                    </Link>
                    <Link
                      href="/cursos"
                      onClick={() => setDrawerOpen(false)}
                      className="cp-btn-primary mt-2 w-full !text-sm"
                    >
                      Começar agora
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Drawer footer */}
            {user && (
              <div className="space-y-2 border-t border-cp-border p-4">
                <button
                  type="button"
                  onClick={() => {
                    router.push('/select-course')
                    setDrawerOpen(false)
                  }}
                  className="cp-btn-ghost w-full !text-sm"
                >
                  <RefreshCw className="h-4 w-4" />
                  Trocar curso
                </button>
                <button
                  type="button"
                  onClick={() => {
                    logout()
                    setDrawerOpen(false)
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
      )}
    </>
  )
}
