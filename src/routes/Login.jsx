import { useState, useEffect } from 'react'
import {
  EnvelopeIcon,
  LockClosedIcon,
  ArrowRightCircleIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid'
import { useAuth } from '../hooks/useAuth'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { requestPasswordResetEmail } from '../utils/adminApi'

const Login = () => {
  const { login, register, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const trialToken = searchParams.get('trial')
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', name: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [trialData, setTrialData] = useState(null)
  const [courseInfo, setCourseInfo] = useState(null)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('')
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false)
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState('')

  // Carregar dados do trial se houver token
  useEffect(() => {
    const loadTrial = async () => {
      if (!trialToken) return

      try {
        const trialRef = doc(db, 'testTrials', trialToken)
        const trialDoc = await getDoc(trialRef)

        if (!trialDoc.exists()) {
          setError('Link de teste inválido ou expirado')
          return
        }

        const data = trialDoc.data()

        // Verificar se está ativo e não expirou
        if (data.active === false) {
          setError('Este link de teste foi desativado')
          return
        }

        if (data.expiresAt) {
          const expiresAt = data.expiresAt.toDate()
          if (expiresAt < new Date()) {
            setError('Este link de teste expirou')
            return
          }
        }

        // Verificar limite de usuários
        const registeredUsers = data.registeredUsers || []
        const maxUsers = data.maxUsers || 10
        if (registeredUsers.length >= maxUsers) {
          setError('Este link de teste atingiu o limite máximo de usuários')
          return
        }

        setTrialData(data)

        // Carregar informações do curso
        if (data.courseId) {
          const courseRef = doc(db, 'courses', data.courseId)
          const courseDoc = await getDoc(courseRef)
          if (courseDoc.exists()) {
            setCourseInfo({ id: courseDoc.id, ...courseDoc.data() })
          }
        }
      } catch (err) {
        console.error('Erro ao carregar trial:', err)
        setError('Erro ao carregar informações do teste')
      }
    }

    loadTrial()
  }, [trialToken])

  const handleChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isRegisterMode) {
        // Cadastro
        if (!form.name) {
          setError('Por favor, preencha seu nome')
          setLoading(false)
          return
        }

        const user = await register(form.email, form.password, form.name)

        // Se há token de trial, associar ao usuário
        if (trialToken && trialData) {
          try {
            // Adicionar curso aos purchasedCourses
            const userRef = doc(db, 'users', user.uid)
            const expiresAt = trialData.expiresAt?.toDate() || null
            
            await updateDoc(userRef, {
              purchasedCourses: arrayUnion(trialData.courseId),
              selectedCourseId: trialData.courseId,
              trialToken: trialToken,
              trialExpiresAt: expiresAt ? expiresAt.toISOString() : null,
              trialStartedAt: serverTimestamp(),
            })

            // Adicionar usuário à lista de registeredUsers do trial
            const trialRef = doc(db, 'testTrials', trialToken)
            await updateDoc(trialRef, {
              registeredUsers: arrayUnion(user.uid),
            })

            // Salvar no localStorage
            localStorage.setItem('trialToken', trialToken)
            localStorage.setItem('trialData', JSON.stringify({
              token: trialToken,
              courseId: trialData.courseId,
              expiresAt: expiresAt?.toISOString() || null,
            }))
          } catch (err) {
            console.error('Erro ao associar trial:', err)
            // Não bloquear o cadastro se houver erro ao associar trial
          }
        }

        // Redirecionar para dashboard
        navigate('/dashboard')
      } else {
        // Login
        const loggedInUser = await login(form.email, form.password)

        // Se há token de trial, verificar se precisa associar
        if (trialToken && trialData && loggedInUser) {
          try {
            const userRef = doc(db, 'users', loggedInUser.uid)
            const userDoc = await getDoc(userRef)
            
            if (userDoc.exists()) {
              const userData = userDoc.data()
              const registeredUsers = trialData.registeredUsers || []
              
              // Se o usuário ainda não está registrado neste trial
              if (!registeredUsers.includes(loggedInUser.uid)) {
                // Adicionar curso aos purchasedCourses se não tiver
                const purchasedCourses = userData.purchasedCourses || []
                if (!purchasedCourses.includes(trialData.courseId)) {
                  await updateDoc(userRef, {
                    purchasedCourses: arrayUnion(trialData.courseId),
                    selectedCourseId: trialData.courseId,
                    trialToken: trialToken,
                    trialExpiresAt: trialData.expiresAt?.toDate().toISOString() || null,
                    trialStartedAt: serverTimestamp(),
                  })
                }

                // Adicionar usuário à lista de registeredUsers do trial
                const trialRef = doc(db, 'testTrials', trialToken)
                await updateDoc(trialRef, {
                  registeredUsers: arrayUnion(loggedInUser.uid),
                })
              }

              // Salvar no localStorage
              localStorage.setItem('trialToken', trialToken)
              localStorage.setItem('trialData', JSON.stringify({
                token: trialToken,
                courseId: trialData.courseId,
                expiresAt: trialData.expiresAt?.toDate().toISOString() || null,
              }))
            }
          } catch (err) {
            console.error('Erro ao associar trial no login:', err)
            // Não bloquear o login se houver erro
          }
        }

        // Redirecionar para seleção de curso ou flashcards
      navigate('/select-course')
      }
    } catch (err) {
      console.error('Erro no login/cadastro:', err)
      setError(err.message || (isRegisterMode ? 'Erro ao criar conta. Tente novamente.' : 'Credenciais inválidas. Confira e tente novamente.'))
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setForgotPasswordMessage('')
    
    if (!forgotPasswordEmail.trim()) {
      setForgotPasswordMessage('❌ Por favor, digite seu email.')
      return
    }

    setForgotPasswordLoading(true)

    try {
      await requestPasswordResetEmail(forgotPasswordEmail)

      setForgotPasswordMessage('✅ Email de redefinição enviado! Verifique sua caixa de entrada (e spam) para redefinir sua senha.')
      setForgotPasswordEmail('')
      
      // Fechar modal após 3 segundos
      setTimeout(() => {
        setShowForgotPassword(false)
        setForgotPasswordMessage('')
      }, 3000)
    } catch (err) {
      console.error('Erro ao enviar email de redefinição:', err)
      setForgotPasswordMessage(`❌ ${err.message || 'Erro ao enviar email. Tente novamente.'}`)
    } finally {
      setForgotPasswordLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-xl bg-background-card p-4 sm:p-6 md:p-8 shadow-sm mx-2 sm:mx-auto border border-border-primary">
      {trialToken && trialData && (
        <div className="mb-6 rounded-xl bg-gradient-to-r from-accent-orange to-accent-cyan p-4 text-background-primary">
          <h3 className="text-lg font-bold mb-1">🎁 Teste Gratuito</h3>
          {courseInfo && (
            <p className="text-sm text-background-primary/90">
              Acesso ao curso: <strong>{courseInfo.name}</strong>
            </p>
          )}
          <p className="text-xs text-background-primary/80 mt-1">
            {trialData.expiresInDays || 7} dias de acesso completo
          </p>
        </div>
      )}
      
      <h2 className="text-2xl sm:text-3xl font-bold text-text-primary">
        {isRegisterMode ? 'Criar Conta' : 'Bem-vindo de volta!'}
      </h2>
      <p className="mt-2 text-xs sm:text-sm text-text-secondary">
        {isRegisterMode 
          ? 'Crie sua conta para começar a estudar'
          : 'Acesse sua conta para começar a estudar para concursos públicos.'
        }
      </p>
      {error && (
        <p className="mt-4 rounded-xl bg-rose-100 px-3 sm:px-4 py-2 text-xs sm:text-sm text-rose-700">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="mt-4 sm:mt-6 space-y-3 sm:space-y-4">
        {isRegisterMode && (
          <label className="block text-xs sm:text-sm font-semibold text-slate-600">
            Nome Completo
            <div className="mt-1 flex items-center rounded-full border border-slate-200 px-3 sm:px-4">
              <UserPlusIcon className="h-4 w-4 text-alego-500 flex-shrink-0" />
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                className="w-full border-none bg-transparent px-2 sm:px-3 py-2.5 sm:py-3 text-sm focus:outline-none"
                placeholder="Seu nome completo"
              />
            </div>
          </label>
        )}

        <label className="block text-xs sm:text-sm font-semibold text-slate-600">
          Email
          <div className="mt-1 flex items-center rounded-full border border-slate-200 px-3 sm:px-4">
            <EnvelopeIcon className="h-4 w-4 text-alego-500 flex-shrink-0" />
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className="w-full border-none bg-transparent px-2 sm:px-3 py-2.5 sm:py-3 text-sm focus:outline-none"
              placeholder="seuemail@email.com"
            />
          </div>
        </label>

        <label className="block text-xs sm:text-sm font-semibold text-slate-600">
          Senha
          <div className="mt-1 flex items-center rounded-full border border-slate-200 px-3 sm:px-4">
            <LockClosedIcon className="h-4 w-4 text-alego-500 flex-shrink-0" />
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength={6}
              className="w-full border-none bg-transparent px-2 sm:px-3 py-2.5 sm:py-3 text-sm focus:outline-none"
              placeholder="••••••••"
            />
          </div>
          {isRegisterMode && (
            <p className="text-xs text-slate-400 mt-1">Mínimo de 6 caracteres</p>
          )}
          {!isRegisterMode && (
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-xs text-alego-600 hover:text-alego-700 font-medium mt-1 text-right w-full"
            >
              Esqueci minha senha
            </button>
          )}
        </label>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-orange px-4 py-3 text-sm font-semibold text-background-primary transition hover:bg-accent-orange-dim disabled:opacity-50 min-h-[44px]"
        >
          {isRegisterMode ? (
            <>
              <UserPlusIcon className="h-5 w-5" />
              Criar Conta
            </>
          ) : (
            <>
          <ArrowRightCircleIcon className="h-5 w-5" />
          Entrar
            </>
          )}
        </button>

        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => setIsRegisterMode(!isRegisterMode)}
            className="text-sm text-alego-600 hover:text-alego-700 font-semibold"
          >
            {isRegisterMode 
              ? 'Já tem conta? Faça login'
              : 'Não tem conta? Criar conta grátis'
            }
          </button>
        </div>
      </form>

      {/* Modal de Esqueci a Senha */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForgotPassword(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 sm:p-8 relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => {
                setShowForgotPassword(false)
                setForgotPasswordEmail('')
                setForgotPasswordMessage('')
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>

            <div className="text-center mb-6">
              <LockClosedIcon className="h-12 w-12 text-alego-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-alego-700 mb-2">
                Esqueci minha senha
              </h2>
              <p className="text-sm text-slate-600">
                Digite seu email e enviaremos um link para redefinir sua senha
              </p>
            </div>

            {forgotPasswordMessage && (
              <div className={`mb-4 rounded-lg p-3 text-sm ${
                forgotPasswordMessage.startsWith('✅') 
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-rose-50 text-rose-700'
              }`}>
                {forgotPasswordMessage}
              </div>
            )}

            <form onSubmit={handleForgotPassword} className="space-y-4">
              <label className="block text-sm font-semibold text-slate-600">
                Email
                <div className="mt-1 flex items-center rounded-full border border-slate-200 px-4">
                  <EnvelopeIcon className="h-4 w-4 text-alego-500 flex-shrink-0" />
                  <input
                    type="email"
                    value={forgotPasswordEmail}
                    onChange={(e) => setForgotPasswordEmail(e.target.value)}
                    required
                    className="w-full border-none bg-transparent px-3 py-3 text-sm focus:outline-none"
                    placeholder="seuemail@email.com"
                    disabled={forgotPasswordLoading}
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={forgotPasswordLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-orange px-4 py-3 text-sm font-semibold text-background-primary transition hover:bg-accent-orange-dim disabled:opacity-50 min-h-[44px]"
              >
                {forgotPasswordLoading ? (
                  <>
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Enviando...
                  </>
                ) : (
                  <>
                    <EnvelopeIcon className="h-5 w-5" />
                    Enviar link de redefinição
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(false)
                  setForgotPasswordEmail('')
                  setForgotPasswordMessage('')
                }}
                className="w-full text-sm text-slate-600 hover:text-slate-700 font-medium"
              >
                Cancelar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Login
