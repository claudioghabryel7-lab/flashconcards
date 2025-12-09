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

const navClass =
  'rounded-xl px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-all duration-200'

const Header = () => {
  const { user, logout, isAdmin, profile } = useAuth()
  const { darkMode, toggleDarkMode } = useDarkMode()
  const navigate = useNavigate()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Fechar menu ao clicar fora ou mudar de rota
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false)
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  useEffect(() => {
    setIsMenuOpen(false)
  }, [location.pathname])

  const menuCategories = useMemo(() => {
    const categories = {
      estudo: {
        label: 'Estudo',
        icon: BookOpenIcon,
        items: [
          { to: '/dashboard', label: 'Painel', auth: true },
          { to: '/flashcards', label: 'Flashcards', auth: true },
          { to: '/flashquestoes', label: 'FlashQuestões', auth: true },
          { to: '/simulado', label: 'Simulado', auth: true },
          { to: '/treino-redacao', label: 'Treino Redação', auth: true },
          { to: '/mapas-mentais', label: 'Mapas Mentais', auth: true },
        ],
      },
      social: {
        label: 'Social',
        icon: UsersIcon,
        items: [
          { to: '/ranking', label: 'Ranking', auth: true },
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

  const guestLinks = useMemo(
    () => [{ to: '/', label: 'Início', guest: true }],
    [],
  )

  return (
    <header
      className="sticky top-0 z-50 border-b-2 border-slate-300/60 bg-white/98 backdrop-blur-xl shadow-lg dark:border-slate-600/60 dark:bg-slate-900/98"
      style={{
        backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.98)' : 'rgba(255, 255, 255, 0.98)',
        borderColor: darkMode ? 'rgba(71, 85, 105, 0.6)' : 'rgba(203, 213, 225, 0.6)',
      }}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-4">
          {/* Logo Centralizada */}
          <div className="flex items-center justify-center">
            <Link to="/" className="flex flex-col items-center gap-2 group">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-alego-600/30 to-alego-700/30 dark:from-alego-400/30 dark:to-alego-500/30 rounded-xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="relative bg-gradient-to-br from-alego-600 to-alego-700 dark:from-alego-500 dark:to-alego-600 rounded-xl p-2.5 sm:p-3 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
                  <AcademicCapIcon className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-xl sm:text-2xl font-black text-alego-700 dark:text-alego-300 leading-tight tracking-tight">
                  FlashConCards
                </p>
                <p className="text-xs sm:text-sm uppercase tracking-widest text-alego-500 dark:text-alego-400 font-bold mt-0.5">
                  Flashcards & FlashQuestões
                </p>
              </div>
            </Link>
          </div>

          {/* Navegação e Ações Centralizadas */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
            {/* Menu Dropdown ou Links para Guest */}
            {!user ? (
              <nav className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
                {guestLinks.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `${navClass} ${
                        isActive 
                          ? 'bg-gradient-to-br from-alego-600 to-alego-700 text-white shadow-lg shadow-alego-600/30 dark:from-alego-700 dark:to-alego-800 dark:shadow-alego-700/30 scale-105' 
                          : 'text-alego-600 dark:text-alego-400 hover:bg-gradient-to-br hover:from-alego-50 hover:to-alego-100/50 dark:hover:from-alego-900/50 dark:hover:to-alego-800/30 border border-slate-200/60 dark:border-slate-700/60 hover:border-alego-300 dark:hover:border-alego-600 hover:shadow-md'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            ) : (
              <>
                {/* Overlay quando menu está aberto */}
                {isMenuOpen && (
                  <div
                    className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-40"
                    onClick={() => setIsMenuOpen(false)}
                  />
                )}
                
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="flex items-center gap-2 rounded-xl px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-all duration-200 bg-gradient-to-br from-alego-600 to-alego-700 text-white shadow-lg shadow-alego-600/30 dark:from-alego-700 dark:to-alego-800 dark:shadow-alego-700/30 hover:from-alego-700 hover:to-alego-800 hover:shadow-xl hover:scale-105"
                  >
                    {isMenuOpen ? (
                      <XMarkIcon className="h-5 w-5" />
                    ) : (
                      <Bars3Icon className="h-5 w-5" />
                    )}
                    <span>Menu</span>
                  </button>

                  {/* Dropdown Menu */}
                  {isMenuOpen && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 sm:w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border-2 border-slate-200/60 dark:border-slate-700/60 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-3 max-h-[70vh] overflow-y-auto">
                        {Object.entries(menuCategories).map(([key, category]) => {
                          const Icon = category.icon
                          return (
                            <div key={key} className="mb-4 last:mb-0">
                              <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-alego-50/50 dark:bg-alego-900/20 rounded-lg">
                                <Icon className="h-4 w-4 text-alego-600 dark:text-alego-400" />
                                <h3 className="text-xs font-bold uppercase tracking-wider text-alego-600 dark:text-alego-400">
                                  {category.label}
                                </h3>
                              </div>
                              <div className="space-y-1.5">
                                {category.items.map((item) => (
                                  <NavLink
                                    key={item.to}
                                    to={item.to}
                                    onClick={() => setIsMenuOpen(false)}
                                    className={({ isActive }) =>
                                      `flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                                        isActive
                                          ? 'bg-gradient-to-br from-alego-600 to-alego-700 text-white shadow-md scale-[1.02]'
                                          : 'text-slate-700 dark:text-slate-300 hover:bg-alego-50 dark:hover:bg-alego-900/30 hover:scale-[1.01]'
                                      }`
                                    }
                                  >
                                    {item.label}
                                  </NavLink>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Botões de Ação - Centralizados */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={toggleDarkMode}
                className="flex items-center justify-center rounded-xl p-2.5 sm:p-3 text-alego-600 dark:text-alego-400 border border-slate-200/60 dark:border-slate-700/60 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm transition-all hover:bg-alego-50 dark:hover:bg-alego-900/50 hover:scale-105 hover:shadow-md"
                aria-label="Alternar modo escuro"
              >
                {darkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
              </button>

              {user ? (
                <>
                  <button
                    type="button"
                    onClick={() => navigate('/select-course')}
                    className="hidden items-center gap-1.5 rounded-xl border-2 border-blue-500 bg-blue-50 px-4 py-2.5 text-xs font-semibold text-blue-700 transition-all hover:bg-blue-100 hover:shadow-md hover:scale-105 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30 sm:flex"
                    title="Trocar curso"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                    Trocar Curso
                  </button>
                  <button
                    type="button"
                    onClick={logout}
                    className="flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-alego-600 to-alego-700 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-alego-600/30 transition-all hover:from-alego-700 hover:to-alego-800 hover:shadow-xl hover:scale-105 dark:from-alego-700 dark:to-alego-800 dark:shadow-alego-700/30 sm:hidden"
                  >
                    <ArrowLeftOnRectangleIcon className="h-4 w-4" />
                    Sair
                  </button>
                  <button
                    type="button"
                    onClick={logout}
                    className="hidden items-center gap-1.5 rounded-xl bg-gradient-to-br from-alego-600 to-alego-700 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-alego-600/30 transition-all hover:from-alego-700 hover:to-alego-800 hover:shadow-xl hover:scale-105 dark:from-alego-700 dark:to-alego-800 dark:shadow-alego-700/30 sm:flex"
                  >
                    <ArrowLeftOnRectangleIcon className="h-4 w-4" />
                    Sair
                  </button>
                  <div className="flex items-center gap-2.5 rounded-xl border-2 border-slate-200/80 dark:border-slate-700/80 bg-gradient-to-br from-white/90 to-slate-50/90 dark:from-slate-800/90 dark:to-slate-900/90 backdrop-blur-sm px-3.5 py-2.5 text-xs shadow-md hover:shadow-lg transition-all hover:scale-105">
                    <div className="relative">
                      <UserCircleIcon className="h-5 w-5 text-alego-500 dark:text-alego-400 flex-shrink-0" />
                      <div className="absolute top-0 right-0 h-2 w-2 bg-green-500 rounded-full border-2 border-white dark:border-slate-800"></div>
                    </div>
                    <div className="text-left min-w-0">
                      <p className="max-w-[120px] truncate font-bold text-alego-700 dark:text-alego-300">
                        {user.displayName || user.email?.split('@')[0]}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                        {isAdmin ? 'Admin' : 'Aluno'}
                        {profile?.selectedCourseId !== undefined && (
                          <span className="ml-1.5">• {profile.selectedCourseId ? 'Curso' : 'ALEGO'}</span>
                        )}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="flex items-center gap-1.5 rounded-xl border-2 border-alego-600 px-4 py-2.5 text-xs font-bold text-alego-600 transition-all hover:bg-gradient-to-br hover:from-alego-50 hover:to-alego-100/50 hover:border-alego-700 hover:shadow-md hover:scale-105 dark:border-alego-500 dark:text-alego-400 dark:hover:bg-alego-900/50 sm:hidden"
                  >
                    <ArrowRightOnRectangleIcon className="h-4 w-4" />
                    Entrar
                  </Link>
                  <Link
                    to="/login"
                    className="hidden items-center gap-1.5 rounded-xl border-2 border-alego-600 px-4 py-2.5 text-xs font-bold text-alego-600 transition-all hover:bg-gradient-to-br hover:from-alego-50 hover:to-alego-100/50 hover:border-alego-700 hover:shadow-md hover:scale-105 dark:border-alego-500 dark:text-alego-400 dark:hover:bg-alego-900/50 sm:flex"
                  >
                    <ArrowRightOnRectangleIcon className="h-4 w-4" />
                    Entrar
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

// Memoizar Header para evitar re-renders desnecessários
export default memo(Header)
