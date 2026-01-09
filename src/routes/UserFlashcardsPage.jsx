import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import UserFlashcardsManager from '../components/UserFlashcardsManager'
import { ArrowLeftIcon, BookOpenIcon, BrainIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const UserFlashcardsPage = () => {
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('manage')

  if (!user) {
    navigate('/login')
    return null
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 mb-4"
        >
          <ArrowLeftIcon className="h-5 w-5" />
          Voltar para Dashboard
        </button>

        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100 mb-2">
            Meus Flashcards
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Crie e gerencie seus flashcards pessoais para estudar de forma eficiente
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700 mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('manage')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'manage'
                ? 'border-alego-600 text-alego-600 dark:text-alego-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <BookOpenIcon className="h-5 w-5" />
              Gerenciar Flashcards
            </div>
          </button>

          <button
            onClick={() => setActiveTab('study')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'study'
                ? 'border-alego-600 text-alego-600 dark:text-alego-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <BrainIcon className="h-5 w-5" />
              Modo de Estudo
            </div>
          </button>
        </nav>
      </div>

      {/* Conteúdo */}
      <div>
        {activeTab === 'manage' && <UserFlashcardsManager />}
        {activeTab === 'study' && (
          <div className="text-center py-12">
            <p className="text-slate-600 dark:text-slate-400">
              Modo de estudo em desenvolvimento. Em breve você poderá estudar seus flashcards aqui!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default UserFlashcardsPage
