import { useMemo } from 'react'
import { Link, NavLink } from 'react-router-dom'
import {
  AcademicCapIcon,
  ArrowLeftOnRectangleIcon,
  ArrowRightOnRectangleIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'

const navClass =
  'rounded-full px-4 py-2 text-sm font-medium transition hover:bg-alego-100 hover:text-alego-700'

const Header = () => {
  const { user, logout, isAdmin } = useAuth()

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
    <header className="bg-white shadow-sm">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <AcademicCapIcon className="h-8 w-8 text-alego-600" />
          <div>
            <p className="text-lg font-bold text-alego-700">
              Mentoria ALEGO
            </p>
            <p className="text-xs uppercase tracking-wide text-alego-400">
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
                  `${navClass} ${isActive ? 'bg-alego-600 text-white' : 'text-alego-600'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          {user ? (
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1 rounded-full bg-alego-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-alego-700"
            >
              <ArrowLeftOnRectangleIcon className="h-4 w-4" />
              Sair
            </button>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1 rounded-full border border-alego-600 px-4 py-2 text-sm font-semibold text-alego-600 transition hover:bg-alego-50"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4" />
              Entrar
            </Link>
          )}
          {user && (
            <div className="ml-2 flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm">
              <UserCircleIcon className="h-5 w-5 text-alego-500" />
              <div className="text-left text-xs">
                <p className="font-semibold text-alego-700">
                  {user.displayName || user.email}
                </p>
                <p className="text-slate-500">{isAdmin ? 'Admin' : 'Aluno'}</p>
              </div>
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}

export default Header

