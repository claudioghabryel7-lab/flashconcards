import { useMemo } from 'react'
import { Link, NavLink } from 'react-router-dom'
import {
  AcademicCapIcon,
  ArrowLeftOnRectangleIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
  MoonIcon,
  SunIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const navClass =
  'rounded-full px-4 py-2 text-sm font-medium transition hover:bg-alego-100 dark:hover:bg-alego-900 hover:text-alego-700 dark:hover:text-alego-300'

const Header = () => {
  const { user, logout, isAdmin } = useAuth()
  const { darkMode, toggleDarkMode } = useDarkMode()

  const links = useMemo(
    () => [
      { to: '/', label: 'Início', guest: true },
      { to: '/dashboard', label: 'Painel', auth: true },
      { to: '/flashcards', label: 'Flashcards', auth: true },
      { to: '/admin', label: 'Admin', auth: true, admin: true },
    ],
    [],
  )

  return (
    <header 
      className="bg-white dark:bg-slate-900 shadow-sm border-b border-slate-200 dark:border-slate-700"
      style={{
        backgroundColor: darkMode ? '#0f172a' : '#ffffff',
        borderColor: darkMode ? '#334155' : '#e2e8f0'
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <AcademicCapIcon className="h-8 w-8 text-alego-600 dark:text-alego-400" />
          <div>
            <p className="text-lg font-bold text-alego-700 dark:text-alego-300">
              Mentoria ALEGO
            </p>
            <p className="text-xs uppercase tracking-wide text-alego-400 dark:text-alego-500">
              Polícia Legislativa
            </p>
          </div>
        </Link>
        <nav className="flex items-center gap-2">
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
                      ? 'bg-alego-600 dark:bg-alego-700 text-white'
                      : 'text-alego-600 dark:text-alego-400'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          
          {/* Dark Mode Toggle */}
          <button
            type="button"
            onClick={toggleDarkMode}
            className="flex items-center justify-center rounded-full p-2 text-alego-600 dark:text-alego-400 hover:bg-alego-100 dark:hover:bg-alego-900 transition-all duration-200"
            aria-label="Alternar modo escuro"
          >
            {darkMode ? (
              <SunIcon className="h-5 w-5" />
            ) : (
              <MoonIcon className="h-5 w-5" />
            )}
          </button>

          {user ? (
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1 rounded-full bg-alego-600 dark:bg-alego-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-alego-700 dark:hover:bg-alego-600"
            >
              <ArrowLeftOnRectangleIcon className="h-4 w-4" />
              Sair
            </button>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1 rounded-full border border-alego-600 dark:border-alego-500 px-4 py-2 text-sm font-semibold text-alego-600 dark:text-alego-400 transition hover:bg-alego-50 dark:hover:bg-alego-900"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4" />
              Entrar
            </Link>
          )}
          {user && (
            <div className="ml-2 flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm bg-white dark:bg-slate-800">
              <UserCircleIcon className="h-5 w-5 text-alego-500 dark:text-alego-400" />
              <div className="text-left text-xs">
                <p className="font-semibold text-alego-700 dark:text-alego-300">
                  {user.displayName || user.email}
                </p>
                <p className="text-slate-500 dark:text-slate-400">{isAdmin ? 'Admin' : 'Aluno'}</p>
              </div>
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}

export default Header
