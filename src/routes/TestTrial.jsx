import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode'
import {
  BookOpenIcon,
  QuestionMarkCircleIcon,
  ClipboardDocumentCheckIcon,
  XCircleIcon,
  CheckCircleIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline'

const TestTrial = () => {
  const { token } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { darkMode } = useDarkMode()
  const [loading, setLoading] = useState(true)
  const [trialData, setTrialData] = useState(null)
  const [error, setError] = useState(null)
  const [trialActive, setTrialActive] = useState(false)

  useEffect(() => {
    const loadTrial = async () => {
      console.log('TestTrial: Carregando trial com token:', token)
      
      if (!token) {
        console.log('TestTrial: Token inválido')
        setError('Token inválido')
        setLoading(false)
        return
      }

      try {
        console.log('TestTrial: Buscando trial no Firestore...')
        const trialRef = doc(db, 'testTrials', token)
        const trialDoc = await getDoc(trialRef)

        if (!trialDoc.exists()) {
          console.log('TestTrial: Trial não encontrado')
          setError('Link de teste não encontrado ou expirado')
          setLoading(false)
          return
        }

        const data = trialDoc.data()
        console.log('TestTrial: Dados do trial:', data)
        
        // Verificar se está ativo
        if (data.active === false) {
          console.log('TestTrial: Trial desativado')
          setError('Este link de teste foi desativado')
          setLoading(false)
          return
        }

        // Verificar se expirou
        if (data.expiresAt) {
          const expiresAt = data.expiresAt.toDate()
          if (expiresAt < new Date()) {
            console.log('TestTrial: Trial expirado')
            setError('Este link de teste expirou')
            setLoading(false)
            return
          }
        }

        // Verificar se o limite de usuários foi atingido
        const registeredUsers = data.registeredUsers || []
        const maxUsers = data.maxUsers || 10
        if (registeredUsers.length >= maxUsers) {
          console.log('TestTrial: Limite de usuários atingido')
          setError('Este link de teste atingiu o limite máximo de usuários')
          setLoading(false)
          return
        }

        setTrialData(data)

        // Se o usuário não está autenticado, redirecionar para login/cadastro
        if (!user) {
          console.log('TestTrial: Usuário não autenticado, redirecionando para login...')
          // Salvar token no localStorage temporariamente
          localStorage.setItem('trialToken', token)
          // Redirecionar para login com o token na URL
          navigate(`/login?trial=${token}`, { replace: true })
          setLoading(false)
          return
        }

        console.log('TestTrial: Usuário autenticado:', user.uid)

        // Se o usuário está autenticado, verificar se já se cadastrou com este token
        const userRegistered = registeredUsers.includes(user.uid)
        if (!userRegistered) {
          console.log('TestTrial: Usuário não registrado neste trial, redirecionando...')
          // Usuário autenticado mas não cadastrado com este token - redirecionar para cadastro
          navigate(`/login?trial=${token}`, { replace: true })
          setLoading(false)
          return
        }

        console.log('TestTrial: Usuário registrado, mostrando página de teste')
        // Usuário autenticado e cadastrado - mostrar página de teste
        setTrialActive(true)

        // Salvar no localStorage para verificar limitações
        localStorage.setItem('trialToken', token)
        localStorage.setItem('trialData', JSON.stringify({
          token,
          courseId: data.courseId || null,
          expiresAt: data.expiresAt?.toDate().toISOString() || null,
        }))

        // Incrementar contador de acessos
        await setDoc(trialRef, {
          accessCount: (data.accessCount || 0) + 1,
          lastAccessedAt: serverTimestamp(),
        }, { merge: true })

      } catch (err) {
        console.error('Erro ao carregar teste:', err)
        setError('Erro ao carregar teste. Tente novamente.')
      } finally {
        setLoading(false)
      }
    }

    loadTrial()
  }, [token, user, navigate])

  // Carregar informações do curso
  const [courseInfo, setCourseInfo] = useState(null)
  
  useEffect(() => {
    if (!trialData?.courseId) return
    
    const loadCourse = async () => {
      try {
        const courseRef = doc(db, 'courses', trialData.courseId)
        const courseDoc = await getDoc(courseRef)
        if (courseDoc.exists()) {
          setCourseInfo({ id: courseDoc.id, ...courseDoc.data() })
        }
      } catch (err) {
        console.error('Erro ao carregar curso:', err)
      }
    }
    
    loadCourse()
  }, [trialData?.courseId])

  const limitations = [
    {
      icon: BookOpenIcon,
      title: 'Acesso Completo ao Curso',
      description: courseInfo ? `Acesso completo ao curso ${courseInfo.name}` : 'Acesso completo ao curso selecionado',
      available: true,
    },
    {
      icon: BookOpenIcon,
      title: 'Todos os Flashcards',
      description: 'Estude todos os flashcards do curso',
      available: true,
    },
    {
      icon: QuestionMarkCircleIcon,
      title: 'Questões Ilimitadas',
      description: 'Pratique com questões ilimitadas',
      available: true,
    },
    {
      icon: ClipboardDocumentCheckIcon,
      title: 'Simulados Ilimitados',
      description: 'Faça simulados completos',
      available: true,
    },
    {
      icon: XCircleIcon,
      title: 'Sem Redação',
      description: 'Treino de redação não disponível no teste',
      available: false,
    },
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-alego-600 border-t-transparent mb-4"></div>
          <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">Carregando teste...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 p-4">
        <div className={`max-w-md w-full ${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-2xl shadow-xl p-8 text-center`}>
          <XCircleIcon className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Erro</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">{error}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-alego-600 text-white font-semibold hover:bg-alego-700 transition-colors"
          >
            Voltar ao Início
          </Link>
        </div>
      </div>
    )
  }

  if (!trialActive) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Banner de Conversão */}
        <div className={`rounded-2xl p-6 ${darkMode ? 'bg-gradient-to-r from-alego-700 to-alego-800' : 'bg-gradient-to-r from-alego-600 to-alego-700'} text-white shadow-xl`}>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-black mb-2">
                🎯 Teste Gratuito da Plataforma
              </h2>
              <p className="text-alego-100 text-sm sm:text-base">
                Aproveite o acesso limitado e desbloqueie tudo com um plano completo!
              </p>
            </div>
            <Link
              to="/pagamento"
              className="flex items-center gap-2 px-6 py-3 bg-white text-alego-600 rounded-xl font-bold hover:bg-alego-50 transition-colors whitespace-nowrap"
            >
              Ver Planos
              <ArrowRightIcon className="h-5 w-5" />
            </Link>
          </div>
        </div>

        {/* Informações do Teste */}
        <div className={`rounded-2xl p-6 sm:p-8 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-xl`}>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-2">
            Bem-vindo ao Teste!
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-6">
            Você tem acesso limitado à plataforma. Explore as funcionalidades disponíveis abaixo.
          </p>

          {/* Limitações */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {limitations.map((limitation, index) => {
              const Icon = limitation.icon
              return (
                <div
                  key={index}
                  className={`p-4 rounded-xl border-2 ${
                    limitation.available
                      ? 'border-green-500/30 bg-green-50 dark:bg-green-900/20'
                      : 'border-red-500/30 bg-red-50 dark:bg-red-900/20 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {limitation.available ? (
                      <CheckCircleIcon className="h-6 w-6 text-green-500 flex-shrink-0" />
                    ) : (
                      <XCircleIcon className="h-6 w-6 text-red-500 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                        <h3 className="font-bold text-slate-900 dark:text-white">
                          {limitation.title}
                        </h3>
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {limitation.description}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Ações Rápidas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link
              to="/flashcards"
              className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white hover:shadow-lg transition-all hover:scale-105"
            >
              <BookOpenIcon className="h-6 w-6" />
              <div>
                <p className="font-bold">Flashcards</p>
                <p className="text-xs text-blue-100">1 módulo disponível</p>
              </div>
            </Link>

            <Link
              to="/flashquestoes"
              className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-green-500 to-green-600 text-white hover:shadow-lg transition-all hover:scale-105"
            >
              <QuestionMarkCircleIcon className="h-6 w-6" />
              <div>
                <p className="font-bold">Questões</p>
                <p className="text-xs text-green-100">10 questões por matéria</p>
              </div>
            </Link>

            <Link
              to="/simulado"
              className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 text-white hover:shadow-lg transition-all hover:scale-105"
            >
              <ClipboardDocumentCheckIcon className="h-6 w-6" />
              <div>
                <p className="font-bold">Simulado</p>
                <p className="text-xs text-purple-100">1 simulado disponível</p>
              </div>
            </Link>
          </div>
        </div>

        {/* CTA Final */}
        <div className={`rounded-2xl p-6 sm:p-8 ${darkMode ? 'bg-slate-800' : 'bg-white'} shadow-xl border-2 border-alego-300 dark:border-alego-700`}>
          <div className="text-center space-y-4">
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
              Gostou do teste?
            </h3>
            <p className="text-slate-600 dark:text-slate-400">
              Desbloqueie acesso completo a todas as matérias, simulados ilimitados, treino de redação e muito mais!
            </p>
            <Link
              to="/pagamento"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-alego-600 to-alego-700 text-white font-bold text-lg hover:shadow-xl transition-all hover:scale-105"
            >
              Ver Planos e Preços
              <ArrowRightIcon className="h-6 w-6" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TestTrial




