import { useState, useEffect } from 'react'
import {
  EnvelopeIcon,
  LockClosedIcon,
  ArrowRightCircleIcon,
  UserPlusIcon,
} from '@heroicons/react/24/solid'
import { useAuth } from '../hooks/useAuth'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'

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

  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white p-4 sm:p-6 md:p-8 shadow-sm mx-2 sm:mx-auto">
      {trialToken && trialData && (
        <div className="mb-6 rounded-xl bg-gradient-to-r from-alego-600 to-alego-700 p-4 text-white">
          <h3 className="text-lg font-bold mb-1">🎁 Teste Gratuito</h3>
          {courseInfo && (
            <p className="text-sm text-alego-100">
              Acesso ao curso: <strong>{courseInfo.name}</strong>
            </p>
          )}
          <p className="text-xs text-alego-100 mt-1">
            {trialData.expiresInDays || 7} dias de acesso completo
          </p>
        </div>
      )}
      
      <h2 className="text-2xl sm:text-3xl font-bold text-alego-700">
        {isRegisterMode ? 'Criar Conta' : 'Bem-vindo de volta!'}
      </h2>
      <p className="mt-2 text-xs sm:text-sm text-slate-500">
        {isRegisterMode 
          ? 'Crie sua conta para começar a estudar'
          : 'Acesse sua mentoria exclusiva para o concurso de Polícia Legislativa.'
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
        </label>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-alego-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-alego-700 disabled:opacity-50 min-h-[44px]"
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
    </div>
  )
}

export default Login
