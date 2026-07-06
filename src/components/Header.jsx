import { useMemo, useState, useRef, useEffect, memo, startTransition } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowLeftOnRectangleIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  MoonIcon,
  SunIcon,
  ArrowPathIcon,
  Bars3Icon,
  XMarkIcon,
  BookOpenIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import Logo from './Logo.jsx'
import TopicNotificationsButton from './TopicNotificationsButton'

const Header = () => {
  const { user, logout, isAdmin, profile } = useAuth()
  const { darkMode, toggleDarkMode } = useDarkMode()
  const navigate = useNavigate()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const drawerRef = useRef(null)

  // Fechar menu ao mudar de rota
  useEffect(() => {
    setIsMenuOpen(false)
  }, [location.pathname])

  // Bloquear scroll quando drawer está aberto (agora também no desktop)
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMenuOpen])

  // Fechar drawer ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        drawerRef.current &&
        !drawerRef.current.contains(event.target) &&
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setIsMenuOpen(false)
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  const menuCategories = useMemo(() => {
    const categories = {
      estudo: {
        label: 'Estudo',
        icon: BookOpenIcon,
        items: [
          { to: '/dashboard', label: 'Dashboard', auth: true },
          { to: '/guia-mentorado', label: 'Guia Mentorado', auth: true },
          { to: '/vespera-de-prova', label: 'Revisão', auth: true },
          { to: '/flashcards', label: 'Flashcards com IA', auth: true },
          { to: '/edital-verticalizado', label: 'Edital Verticalizado', auth: true },
          { to: '/calendario', label: 'Calendário de Progresso', auth: true },
          { to: '/treino-redacao', label: 'Treino Redação', auth: true },
        ],
      },
      admin: {
        label: 'Admin',
        icon: ShieldCheckIcon,
        items: [
          { to: '/admin', label: 'Admin', auth: true, admin: true },
        ],
      },
    }

    // Filtrar categorias e itens baseado no usuário
    const filteredCategories = {}
    Object.keys(categories).forEach((key) => {
      const category = categories[key]
      const filteredItems = category.items.filter((item) => {
        if (item.admin && !isAdmin) return false
        if (item.auth && !user) return false
        return true
      })
      if (filteredItems.length > 0) {
        filteredCategories[key] = { ...category, items: filteredItems }
      }
    })

    return filteredCategories
  }, [user, isAdmin])

  return (
    <>
      <header className="sticky top-0 z-50 w-full bg-background-primary/80 backdrop-blur-md border-b border-border-primary">
        <div className="mx-auto max-w-7xl px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 group">
              <Logo size="sm" className="relative" />
            </Link>

            {/* Navigation principal (agora apenas via menu lateral/hambúrguer) */}
            <nav className="hidden items-center gap-1">
              {user ? (
                Object.entries(menuCategories).map(([key, category]) => {
                  return category.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? 'text-accent-orange'
                            : 'text-text-secondary hover:text-text-primary'
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))
                })
              ) : (
                <NavLink
                  to="/"
                  className={({ isActive }) =>
                    `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-accent-orange'
                        : 'text-text-secondary hover:text-text-primary'
                    }`
                  }
                >
                  Início
                </NavLink>
              )}
            </nav>

            {/* Right Side Actions */}
            <div className="flex items-center gap-2">
              {/* Dark Mode Toggle */}
              <button
                type="button"
                onClick={toggleDarkMode}
                className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-background-card transition-all duration-200"
                aria-label="Alternar modo escuro"
              >
                {darkMode ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
              </button>

              {user ? (
                <>
                  <TopicNotificationsButton />

                  {/* Trocar Curso - Desktop */}
                  <button
                    type="button"
                    onClick={() => navigate('/select-course')}
                    className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-accent-cyan hover:bg-background-card transition-colors"
                    title="Trocar curso"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                    <span className="hidden lg:inline">Trocar Curso</span>
                  </button>

                  {/* User Info - Desktop */}
                  <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-background-card border border-border-primary">
                    <UserCircleIcon className="h-4 w-4 text-accent-orange" />
                    <div className="text-left">
                      <p className="text-xs font-semibold text-text-primary truncate max-w-[100px]">
                        {user.displayName || user.email?.split('@')[0]}
                      </p>
                      <p className="text-[10px] text-text-muted">
                        {isAdmin ? 'Admin' : 'Aluno'}
                        {profile?.selectedCourseId !== undefined && (
                          <span> • {profile.selectedCourseId ? 'Curso' : 'ALEGO'}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Logout - Desktop */}
                  <button
                    type="button"
                    onClick={logout}
                    className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-background-card transition-all duration-200"
                  >
                    <ArrowLeftOnRectangleIcon className="h-4 w-4" />
                    <span className="hidden lg:inline">Sair</span>
                  </button>

              {/* Menu Button - Mobile/Desktop */}
                  <button
                    ref={menuRef}
                    type="button"
                    onClick={() => startTransition(() => setIsMenuOpen((v) => !v))}
                className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-background-card transition-colors"
                aria-label="Abrir menu lateral"
                  >
                    {isMenuOpen ? (
                      <XMarkIcon className="h-5 w-5" />
                    ) : (
                      <Bars3Icon className="h-5 w-5" />
                    )}
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent-orange text-background-primary hover:bg-accent-orange-dim transition-all duration-200"
                >
                  Entrar
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Drawer (Mobile e Desktop) */}
      {isMenuOpen && user && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsMenuOpen(false)}
          />

          {/* Drawer */}
          <div
            ref={drawerRef}
            className="fixed inset-y-0 left-0 w-72 sm:w-80 max-w-[85vw] bg-background-card shadow-2xl z-50 flex flex-col border-r border-border-primary will-change-transform"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-4 border-b border-border-primary">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent-orange">
                  <UserCircleIcon className="h-5 w-5 text-background-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {user.displayName || user.email?.split('@')[0]}
                  </p>
                  <p className="text-xs text-text-muted">
                    {isAdmin ? 'Admin' : 'Aluno'}
                    {profile?.selectedCourseId !== undefined && (
                      <span> • {profile.selectedCourseId ? 'Curso' : 'ALEGO'}</span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-background-card-hover transition-colors"
                aria-label="Fechar menu"
              >
                <XMarkIcon className="h-5 w-5 text-text-secondary" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {Object.entries(menuCategories).map(([key, category]) => {
                const Icon = category.icon
                return (
                  <div key={key} className="mb-6">
                    <div className="flex items-center gap-2 mb-3 px-2">
                      <Icon className="h-4 w-4 text-accent-orange" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-accent-orange">
                        {category.label}
                      </h3>
                    </div>
                    <div className="space-y-1">
                      {category.items.map((item) => (
                        <div key={item.to}>
                          <NavLink
                            to={item.to}
                            onClick={() => setIsMenuOpen(false)}
                            className={({ isActive }) =>
                              `flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                                isActive
                                  ? 'bg-accent-orange/10 text-accent-orange border border-accent-orange/20'
                                  : 'text-text-secondary hover:text-text-primary hover:bg-background-card-hover'
                              }`
                            }
                          >
                            {item.label}
                          </NavLink>
                          
                          {/* Botão Sair embaixo de ConCurseiroSocial */}
                          {item.label === 'ConCurseiroSocial' && (
                            <button
                              type="button"
                              onClick={() => {
                                logout()
                                setIsMenuOpen(false)
                              }}
                              className="w-full mt-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-background-card-hover transition-all duration-200"
                            >
                              <ArrowLeftOnRectangleIcon className="h-4 w-4" />
                              Sair
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Drawer Footer */}
            <div className="border-t border-border-primary p-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  navigate('/select-course')
                  setIsMenuOpen(false)
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-accent-cyan hover:bg-background-card-hover transition-all duration-200"
              >
                <ArrowPathIcon className="h-4 w-4" />
                Trocar Curso
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

export default memo(Header)
