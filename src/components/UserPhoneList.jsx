import { useState, useEffect } from 'react'
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { 
  UserIcon, 
  PhoneIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  MagnifyingGlassIcon,
  DocumentArrowDownIcon,
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline'
import { PhoneIcon as PhoneSolid } from '@heroicons/react/24/solid'

const UserPhoneList = () => {
  const { profile } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showPhones, setShowPhones] = useState(false)
  const [filter, setFilter] = useState('all') // 'all', 'withPhone', 'withoutPhone'

  const isAdmin = profile?.role === 'admin'

  // Carregar usuários
  useEffect(() => {
    if (!isAdmin) return

    const loadUsers = async () => {
      try {
        const usersRef = collection(db, 'users')
        const snapshot = await getDocs(usersRef)
        
        const usersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))

        setUsers(usersData.sort((a, b) => {
          // Usuários com telefone primeiro
          if (a.phone && !b.phone) return -1
          if (!a.phone && b.phone) return 1
          // Depois por nome
          return (a.name || '').localeCompare(b.name || '')
        }))
      } catch (error) {
        console.error('Erro ao carregar usuários:', error)
      } finally {
        setLoading(false)
      }
    }

    loadUsers()
  }, [isAdmin])

  // Filtrar usuários
  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      (user.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.phone || '').includes(searchTerm)

    const matchesFilter = 
      filter === 'all' ||
      (filter === 'withPhone' && user.phone) ||
      (filter === 'withoutPhone' && !user.phone)

    return matchesSearch && matchesFilter
  })

  // Exportar para CSV
  const exportToCSV = () => {
    if (!showPhones) {
      alert('Clique em "Mostrar Telefones" primeiro para exportar os dados')
      return
    }

    const headers = ['Nome', 'Email', 'Telefone', 'Data Consentimento', 'Telefone Compartilhado']
    const csvData = filteredUsers.map(user => [
      user.name || 'Não informado',
      user.email || '',
      user.phone || 'Não informado',
      user.lgpdConsentDate || 'Não',
      user.phoneShared ? 'Sim' : 'Não'
    ])

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `usuarios_telefones_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Formatar telefone
  const formatPhone = (phone) => {
    if (!phone) return 'Não informado'
    const clean = phone.replace(/\D/g, '')
    if (clean.length === 11) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`
    } else if (clean.length === 10) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`
    }
    return phone
  }

  // Estatísticas
  const stats = {
    total: users.length,
    withPhone: users.filter(u => u.phone).length,
    withoutPhone: users.filter(u => !u.phone).length,
    withConsent: users.filter(u => u.lgpdConsent).length
  }

  if (!isAdmin) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
        <div className="text-center py-8">
          <XCircleIcon className="h-12 w-12 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Acesso Restrito
          </h3>
          <p className="text-slate-600 dark:text-slate-400">
            Apenas administradores podem acessar esta página.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <PhoneSolid className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Telefones dos Usuários
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Gerencie contatos dos alunos (LGPD)
            </p>
          </div>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Total</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.withPhone}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Com Telefone</div>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.withoutPhone}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Sem Telefone</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.withConsent}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Consentiram</div>
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        {/* Busca */}
        <div className="flex-1 relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, email ou telefone..."
            className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Filtro */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">Todos os usuários</option>
          <option value="withPhone">Com telefone</option>
          <option value="withoutPhone">Sem telefone</option>
        </select>

        {/* Botões de ação */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowPhones(!showPhones)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              showPhones 
                ? 'bg-red-600 text-white hover:bg-red-700' 
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {showPhones ? (
              <>
                <EyeSlashIcon className="h-4 w-4" />
                Ocultar Telefones
              </>
            ) : (
              <>
                <EyeIcon className="h-4 w-4" />
                Mostrar Telefones
              </>
            )}
          </button>

          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <DocumentArrowDownIcon className="h-4 w-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Lista de usuários */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredUsers.length === 0 ? (
          <div className="text-center py-8">
            <UserIcon className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400">
              Nenhum usuário encontrado para os filtros selecionados.
            </p>
          </div>
        ) : (
          filteredUsers.map(user => (
            <div
              key={user.id}
              className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex-shrink-0">
                  {user.phone ? (
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircleIcon className="h-5 w-5 text-amber-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 dark:text-white truncate">
                    {user.name || 'Nome não informado'}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
                    {user.email}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                {user.lgpdConsent && (
                  <div className="text-xs text-green-600 dark:text-green-400">
                    LGPD OK
                  </div>
                )}
                
                <div className="text-right">
                  {showPhones && user.phone ? (
                    <div className="font-medium text-slate-900 dark:text-white">
                      {formatPhone(user.phone)}
                    </div>
                  ) : (
                    <div className="text-slate-500 dark:text-slate-400 text-sm">
                      {user.phone ? 'Telefone oculto' : 'Não informado'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Aviso LGPD */}
      <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
        <div className="flex items-start gap-3">
          <ShieldCheckIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <strong>LGPD:</strong> Os telefones foram compartilhados voluntariamente pelos usuários. 
            Use estas informações apenas para comunicados importantes sobre o curso. 
            Respeite a privacidade e não compartilhe com terceiros.
          </div>
        </div>
      </div>
    </div>
  )
}

export default UserPhoneList
