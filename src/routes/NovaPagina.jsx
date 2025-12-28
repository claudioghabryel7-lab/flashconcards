import { useState } from 'react'
import { useDarkMode } from '../hooks/useDarkMode'
import { useAuth } from '../hooks/useAuth'

const NovaPagina = () => {
  const { darkMode } = useDarkMode()
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(false)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Cabeçalho */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black text-alego-700 dark:text-alego-300 mb-4">
            Nova Página
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Esta é uma nova página criada como exemplo. Personalize conforme necessário.
          </p>
        </div>

        {/* Conteúdo Principal */}
        <div className="rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-lg">
          <div className="space-y-6">
            {/* Seção de Informações do Usuário */}
            {user && (
              <div className="rounded-xl bg-gradient-to-r from-alego-500 to-alego-600 p-6 text-white">
                <h2 className="text-2xl font-bold mb-2">Bem-vindo, {profile?.displayName || user.email}!</h2>
                <p className="text-alego-100">
                  Você está autenticado e pode acessar esta página.
                </p>
              </div>
            )}

            {/* Cards de Exemplo */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-6 border border-blue-200 dark:border-blue-800">
                <h3 className="text-xl font-bold text-blue-700 dark:text-blue-300 mb-2">
                  Card 1
                </h3>
                <p className="text-blue-600 dark:text-blue-400">
                  Exemplo de card com informações.
                </p>
              </div>

              <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-6 border border-green-200 dark:border-green-800">
                <h3 className="text-xl font-bold text-green-700 dark:text-green-300 mb-2">
                  Card 2
                </h3>
                <p className="text-green-600 dark:text-green-400">
                  Outro exemplo de card.
                </p>
              </div>

              <div className="rounded-xl bg-purple-50 dark:bg-purple-900/20 p-6 border border-purple-200 dark:border-purple-800">
                <h3 className="text-xl font-bold text-purple-700 dark:text-purple-300 mb-2">
                  Card 3
                </h3>
                <p className="text-purple-600 dark:text-purple-400">
                  Mais um exemplo de card.
                </p>
              </div>
            </div>

            {/* Botão de Exemplo */}
            <div className="flex justify-center">
              <button
                onClick={() => {
                  setLoading(true)
                  setTimeout(() => setLoading(false), 2000)
                }}
                disabled={loading}
                className="px-6 py-3 bg-alego-600 text-white font-semibold rounded-lg hover:bg-alego-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Carregando...' : 'Botão de Exemplo'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default NovaPagina

