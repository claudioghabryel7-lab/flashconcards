import { useMemo, useState, useRef, useEffect, memo } from 'react'
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  AcademicCapIcon,
  ArrowLeftOnRectangleIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  MoonIcon,
  SunIcon,
  ArrowPathIcon,
  Bars3Icon,
  XMarkIcon,
  BookOpenIcon,
  UsersIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

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

  // Bloquear scroll quando drawer está aberto no mobile
  useEffect(() => {
    if (isMenuOpen && window.innerWidth < 640) {
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
          { to: '/guia-estudos', label: 'Guia de Estudos', auth: false },
          { to: '/flashcards', label: 'Flashcards', auth: true },
          { to: '/flashquestoes', label: 'FlashQuestões', auth: true },
          { to: '/simulado', label: 'Simulado', auth: true },
          { to: '/treino-redacao', label: 'Treino Redação', auth: true },
          { to: '/mapas-mentais', label: 'Mapas Mentais', auth: true },
          { to: '/materia-revisada', label: 'Matéria Revisada', auth: true },
          { to: '/conteudo-completo', label: 'Conteúdo Completo', auth: true },
        ],
      },
      social: {
        label: 'Social',
        icon: UsersIcon,
        items: [
          { to: '/ranking-simulado', label: 'Ranking de Simulados', auth: true },
          { to: '/feed', label: 'FlashSocial', auth: true },
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
      <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 group">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-alego-600/20 to-alego-700/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="relative bg-gradient-to-br from-alego-600 to-alego-700 dark:from-alego-500 dark:to-alego-600 rounded-lg p-1.5 shadow-md group-hover:shadow-lg transition-all">
                  <AcademicCapIcon className="h-6 w-6 text-white" />
                </div>
              </div>
              <div className="hidden sm:block">
                <p className="text-lg font-black text-alego-700 dark:text-alego-300">FlashConCards</p>
                <p className="text-[10px] uppercase tracking-wider text-alego-500 dark:text-alego-400 font-semibold">
                  Flashcards & FlashQuestões
                </p>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {user ? (
                Object.entries(menuCategories).map(([key, category]) => {
                  return category.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-alego-100 dark:bg-alego-900/30 text-alego-700 dark:text-alego-300'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
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
                        ? 'bg-alego-100 dark:bg-alego-900/30 text-alego-700 dark:text-alego-300'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
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
                className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Alternar modo escuro"
              >
                {darkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
              </button>

              {user ? (
                <>
                  {/* Trocar Curso - Desktop */}
                  <button
                    type="button"
                    onClick={() => navigate('/select-course')}
                    className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    title="Trocar curso"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                    <span className="hidden lg:inline">Trocar Curso</span>
                  </button>

                  {/* User Info - Desktop */}
                  <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                    <UserCircleIcon className="h-5 w-5 text-alego-600 dark:text-alego-400" />
                    <div className="text-left">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[120px]">
                        {user.displayName || user.email?.split('@')[0]}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
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
                    className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <ArrowLeftOnRectangleIcon className="h-4 w-4" />
                    <span className="hidden lg:inline">Sair</span>
                  </button>

                  {/* Menu Button - Mobile */}
                  <button
                    ref={menuRef}
                    type="button"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="md:hidden p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    aria-label="Abrir menu"
                  >
                    {isMenuOpen ? (
                      <XMarkIcon className="h-6 w-6" />
                    ) : (
                      <Bars3Icon className="h-6 w-6" />
                    )}
                  </button>
                </>
              ) : (
                <Link
                  to="/login"
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-alego-600 text-white hover:bg-alego-700 dark:bg-alego-500 dark:hover:bg-alego-600 transition-colors"
                >
                  Entrar
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      {isMenuOpen && user && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setIsMenuOpen(false)}
          />

          {/* Drawer */}
          <div
            ref={drawerRef}
            className="fixed inset-y-0 left-0 w-80 max-w-[85vw] bg-white dark:bg-slate-900 shadow-xl z-50 md:hidden flex flex-col animate-slide-in-left"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <UserCircleIcon className="h-8 w-8 text-alego-600 dark:text-alego-400" />
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {user.displayName || user.email?.split('@')[0]}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
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
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Fechar menu"
              >
                <XMarkIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {Object.entries(menuCategories).map(([key, category]) => {
                const Icon = category.icon
                return (
                  <div key={key} className="mb-6">
                    <div className="flex items-center gap-2 mb-3 px-2">
                      <Icon className="h-5 w-5 text-alego-600 dark:text-alego-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-alego-600 dark:text-alego-400">
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
                              `flex items-center px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                                isActive
                                  ? 'bg-alego-100 dark:bg-alego-900/30 text-alego-700 dark:text-alego-300'
                                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                              }`
                            }
                          >
                            {item.label}
                          </NavLink>
                          {/* Botão Sair embaixo de FlashSocial */}
                          {item.label === 'FlashSocial' && (
                            <button
                              type="button"
                              onClick={() => {
                                logout()
                                setIsMenuOpen(false)
                              }}
                              className="w-full mt-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-base font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <ArrowLeftOnRectangleIcon className="h-5 w-5" />
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
            <div className="border-t border-slate-200 dark:border-slate-700 p-4 space-y-2">
              <button
                type="button"
                onClick={() => {
                  navigate('/select-course')
                  setIsMenuOpen(false)
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
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
