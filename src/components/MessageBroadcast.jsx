import { useState, useEffect } from 'react'
import { collection, getDocs, doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { 
  MegaphoneIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  PaperAirplaneIcon,
  UsersIcon,
  ClockIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { MegaphoneIcon as MegaphoneSolid } from '@heroicons/react/24/solid'

const MessageBroadcast = () => {
  const { profile } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState([])
  const [showResults, setShowResults] = useState(false)
  const [messageHistory, setMessageHistory] = useState([])

  const isAdmin = profile?.role === 'admin'

  // Carregar usuários com telefone
  useEffect(() => {
    if (!isAdmin) return

    const loadUsers = async () => {
      try {
        const usersRef = collection(db, 'users')
        const snapshot = await getDocs(usersRef)
        
        const usersData = snapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          }))
          .filter(user => user.phone && user.phoneShared) // Apenas usuários com telefone compartilhado

        setUsers(usersData)
      } catch (error) {
        console.error('Erro ao carregar usuários:', error)
      } finally {
        setLoading(false)
      }
    }

    loadUsers()
  }, [isAdmin])

  // Carregar histórico de mensagens
  useEffect(() => {
    if (!isAdmin) return

    const loadHistory = async () => {
      try {
        const historyRef = collection(db, 'broadcastHistory')
        const snapshot = await getDocs(historyRef)
        
        const historyData = snapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          }))
          .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
          .slice(0, 10) // Últimas 10 mensagens

        setMessageHistory(historyData)
      } catch (error) {
        console.error('Erro ao carregar histórico:', error)
      }
    }

    loadHistory()
  }, [isAdmin])

  // Gerar link WhatsApp
  const generateWhatsAppLink = (phone, message) => {
    const cleanPhone = phone.replace(/\D/g, '')
    const encodedMessage = encodeURIComponent(message)
    return `https://wa.me/${cleanPhone}?text=${encodedMessage}`
  }

  // Disparar mensagens
  const handleBroadcast = async () => {
    if (!message.trim()) {
      alert('Por favor, escreva uma mensagem')
      return
    }

    if (users.length === 0) {
      alert('Nenhum usuário com telefone cadastrado encontrado')
      return
    }

    setSending(true)
    const results = []

    try {
      // Salvar mensagem no histórico
      const historyRef = doc(db, 'broadcastHistory', Date.now().toString())
      await setDoc(historyRef, {
        message: message.trim(),
        recipientCount: users.length,
        sentAt: new Date().toISOString(),
        sentBy: profile.name || profile.email,
        status: 'sent'
      })

      // Processar cada usuário
      for (const user of users) {
        try {
          const whatsappLink = generateWhatsAppLink(user.phone, message)
          
          // Abrir WhatsApp em nova janela
          window.open(whatsappLink, '_blank', 'width=400,height=600')
          
          // Pequeno delay para não sobrecarregar
          await new Promise(resolve => setTimeout(resolve, 500))
          
          results.push({
            userId: user.id,
            name: user.name || 'Não informado',
            phone: user.phone,
            status: 'success',
            link: whatsappLink
          })
        } catch (error) {
          console.error(`Erro ao enviar para ${user.name}:`, error)
          results.push({
            userId: user.id,
            name: user.name || 'Não informado',
            phone: user.phone,
            status: 'error',
            error: error.message
          })
        }
      }

      setResults(results)
      setShowResults(true)
      setMessage('')

      // Atualizar histórico
      const newHistory = {
        id: Date.now().toString(),
        message: message.trim(),
        recipientCount: users.length,
        sentAt: new Date().toISOString(),
        sentBy: profile.name || profile.email,
        status: 'sent'
      }
      setMessageHistory(prev => [newHistory, ...prev.slice(0, 9)])

    } catch (error) {
      console.error('Erro ao disparar mensagens:', error)
      alert('Erro ao disparar mensagens. Tente novamente.')
    } finally {
      setSending(false)
    }
  }

  // Formatar telefone
  const formatPhone = (phone) => {
    const clean = phone.replace(/\D/g, '')
    if (clean.length === 11) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`
    } else if (clean.length === 10) {
      return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`
    }
    return phone
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
            {[1, 2, 3, 4].map(i => (
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
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <MegaphoneSolid className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Disparo de Mensagens
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Envie comunicados para todos os usuários com WhatsApp
            </p>
          </div>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{users.length}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Usuários com WhatsApp</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{messageHistory.length}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Mensagens enviadas</div>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">100%</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Taxa de entrega</div>
        </div>
      </div>

      {/* Formulário de Mensagem */}
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Mensagem para Disparar
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Digite sua mensagem aqui... Ex: 'Olá! Temos uma nova aula disponível. Acesse o sistema para conferir!'"
            rows={4}
            className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            A mensagem será enviada para {users.length} usuários via WhatsApp
          </p>
        </div>

        <button
          onClick={handleBroadcast}
          disabled={sending || !message.trim() || users.length === 0}
          className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-purple-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
        >
          {sending ? (
            <>
              <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-white border-r-transparent"></div>
              Disparando...
            </>
          ) : (
            <>
              <PaperAirplaneIcon className="h-5 w-5" />
              Disparar para {users.length} usuários
            </>
          )}
        </button>
      </div>

      {/* Resultados do Envio */}
      {showResults && (
        <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-slate-900 dark:text-white">Resultados do Envio</h4>
            <button
              onClick={() => setShowResults(false)}
              className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              ×
            </button>
          </div>
          
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {results.map((result, index) => (
              <div key={index} className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded">
                <div className="flex items-center gap-2">
                  {result.status === 'success' ? (
                    <CheckCircleIcon className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircleIcon className="h-4 w-4 text-red-500" />
                  )}
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {result.name} - {formatPhone(result.phone)}
                  </span>
                </div>
                {result.status === 'success' && (
                  <a
                    href={result.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-purple-600 hover:text-purple-700"
                  >
                    Ver WhatsApp
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Histórico de Mensagens */}
      {messageHistory.length > 0 && (
        <div>
          <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Histórico de Envios</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {messageHistory.map((msg) => (
              <div key={msg.id} className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ClockIcon className="h-4 w-4 text-slate-500" />
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {new Date(msg.sentAt).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-1 rounded">
                    {msg.recipientCount} destinatários
                  </span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                  {msg.message}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Enviado por: {msg.sentBy}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aviso LGPD */}
      <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <strong>LGPD:</strong> Use esta ferramenta apenas para comunicados importantes sobre o curso. 
            Respeite o horário comercial (8h-18h) e não envie spam. 
            Os usuários consentiram em receber comunicados ao cadastrar o telefone.
          </div>
        </div>
      </div>
    </div>
  )
}

export default MessageBroadcast
