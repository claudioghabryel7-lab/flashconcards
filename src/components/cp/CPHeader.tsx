'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Menu,
  BookOpen,
  ShieldCheck,
  LogOut,
  RefreshCw,
  Moon,
  Sun,
} from 'lucide-react'
import CPLogo from './CPLogo'
import UserAvatar from '../UserAvatar'
import TopicNotificationsButton from '../TopicNotificationsButton'
import CPDrawerMenu from './CPDrawerMenu'
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
      { href: '/resolver-questoes', label: 'Resolver Questões', auth: true },
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
  const pathname = usePathname() || '/'
  const router = useRouter()
  const { user, logout, isAdmin, profile } = useAuth()
  const { darkMode, toggleDarkMode } = useDarkMode()

  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const openDrawer = useCallback(() => setDrawerOpen(true), [])

  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 8)
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    closeDrawer()
  }, [pathname, closeDrawer])

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

  const hideShell =
    pathname.startsWith('/flashcards/pip') ||
    pathname.startsWith('/share-flashcards') ||
    pathname.startsWith('/comunidade') ||
    pathname.startsWith('/profile/')
  if (hideShell) return null

  return (
    <>
      <header
        className={`sticky top-0 z-50 w-full transition-[border-color,background-color,box-shadow] duration-300 ${
          scrolled
            ? 'border-b border-cp-border bg-cp-bg/90 shadow-[0_4px_24px_rgba(0,0,0,0.08)] md:backdrop-blur-md'
            : 'border-b border-cp-border/50 bg-cp-bg/80'
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
              onClick={openDrawer}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-cp-border bg-cp-surface text-cp-text transition hover:border-cp-accent/30 hover:shadow-cp-glow"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <CPDrawerMenu
        open={drawerOpen}
        onClose={closeDrawer}
        pathname={pathname}
        filteredCategories={filteredCategories}
        user={user}
        profile={profile}
        isAdmin={isAdmin}
        onLogout={logout}
      />
    </>
  )
}
