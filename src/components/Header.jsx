import { useMemo } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  AcademicCapIcon,
  ArrowLeftOnRectangleIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  MoonIcon,
  SunIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const navClass =
  'rounded-full px-3 sm:px-4 md:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold transition-all duration-200'

const Header = () => {
  const { user, logout, isAdmin, profile } = useAuth()
  const { darkMode, toggleDarkMode } = useDarkMode()
  const navigate = useNavigate()

  const links = useMemo(
    () => [
      { to: '/', label: 'Início', guest: true },
      { to: '/dashboard', label: 'Painel', auth: true },
      { to: '/flashcards', label: 'Flashcards', auth: true },
      { to: '/flashquestoes', label: 'FlashQuestões', auth: true },
      { to: '/mapas-mentais', label: 'Mapas Mentais', auth: true },
      { to: '/ranking', label: 'Ranking', auth: true },
      { to: '/feed', label: 'FlashSocial', auth: true },
      { to: '/admin', label: 'Admin', auth: true, admin: true },
    ],
    [],
  )

  return (
    <header
      className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-sm dark:border-slate-700/80 dark:bg-slate-900/95"
      style={{
        backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        borderColor: darkMode ? 'rgba(51, 65, 85, 0.8)' : 'rgba(226, 232, 240, 0.8)',
      }}
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Link to="/" className="flex items-center gap-2 sm:gap-3 group">
              <div className="relative">
                <AcademicCapIcon className="h-7 w-7 sm:h-9 sm:w-9 text-alego-600 dark:text-alego-400 transition-transform group-hover:scale-110" />
                <div className="absolute inset-0 bg-alego-600/20 dark:bg-alego-400/20 rounded-full blur-md opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>
              <div className="hidden sm:block">
                <p className="text-lg sm:text-xl font-black text-alego-700 dark:text-alego-300 leading-tight">FlashConCards</p>
                <p className="text-xs uppercase tracking-wider text-alego-500 dark:text-alego-400 font-semibold">Flashcards e Flashquestões</p>
              </div>
              <div className="sm:hidden">
                <p className="text-base font-black text-alego-700 dark:text-alego-300">FlashConCards</p>
              </div>
            </Link>
            {user ? (
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-alego-600 to-alego-700 px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:from-alego-700 hover:to-alego-800 sm:hidden"
              >
                <ArrowLeftOnRectangleIcon className="h-4 w-4" />
                Sair
              </button>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-1.5 rounded-full border-2 border-alego-600 px-4 py-2 text-xs font-bold text-alego-600 transition-all hover:bg-alego-50 dark:border-alego-500 dark:text-alego-400 sm:hidden"
              >
                <ArrowRightOnRectangleIcon className="h-4 w-4" />
                Entrar
              </Link>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <nav className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {links
                .filter((item) => {
                  if (item.admin && !isAdmin) return false
                  if (item.auth && !user) return false
                  if (item.guest && user) return false
                  return true
                })
                .map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `${navClass} ${
                        isActive 
                          ? 'bg-gradient-to-r from-alego-600 to-alego-700 text-white shadow-md dark:from-alego-700 dark:to-alego-800' 
                          : 'text-alego-600 dark:text-alego-400 hover:bg-alego-50 dark:hover:bg-alego-900/50'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
            </nav>

            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={toggleDarkMode}
                className="flex items-center justify-center rounded-full p-2.5 text-alego-600 transition-all hover:bg-alego-100 hover:scale-110 dark:text-alego-400 dark:hover:bg-alego-900"
                aria-label="Alternar modo escuro"
              >
                {darkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
              </button>

              {user ? (
                <>
                  <button
                    type="button"
                    onClick={() => navigate('/select-course')}
                    className="hidden items-center gap-1.5 rounded-full border border-blue-500 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition-all hover:bg-blue-100 dark:border-blue-400 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30 sm:flex"
                    title="Trocar curso"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                    Trocar Curso
                  </button>
                  <button
                    type="button"
                    onClick={logout}
                    className="hidden items-center gap-1.5 rounded-full bg-gradient-to-r from-alego-600 to-alego-700 px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:from-alego-700 hover:to-alego-800 hover:shadow-lg dark:from-alego-700 dark:to-alego-800 sm:flex"
                  >
                    <ArrowLeftOnRectangleIcon className="h-4 w-4" />
                    Sair
                  </button>
                  <div className="flex items-center gap-2.5 rounded-full border border-slate-200/80 bg-white/80 backdrop-blur-sm px-3 py-2 text-xs shadow-sm dark:border-slate-700/80 dark:bg-slate-800/80">
                    <UserCircleIcon className="h-5 w-5 text-alego-500 dark:text-alego-400 flex-shrink-0" />
                    <div className="text-left min-w-0">
                      <p className="max-w-[120px] truncate font-bold text-alego-700 dark:text-alego-300">
                        {user.displayName || user.email?.split('@')[0]}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {isAdmin ? 'Admin' : 'Aluno'}
                        {profile?.selectedCourseId !== undefined && (
                          <span className="ml-1">• {profile.selectedCourseId ? 'Curso' : 'ALEGO'}</span>
                        )}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <Link
                  to="/login"
                  className="hidden items-center gap-1.5 rounded-full border-2 border-alego-600 px-4 py-2 text-xs font-bold text-alego-600 transition-all hover:bg-alego-50 hover:border-alego-700 dark:border-alego-500 dark:text-alego-400 dark:hover:bg-alego-900/50 sm:flex"
                >
                  <ArrowRightOnRectangleIcon className="h-4 w-4" />
                  Entrar
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
