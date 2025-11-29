import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore'
import { sendPasswordResetEmail } from 'firebase/auth'
import { db, auth } from '../firebase/config'
import { LockClosedIcon } from '@heroicons/react/24/solid'

const ResetPassword = () => {
  const { token } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [valid, setValid] = useState(false)
  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [userEmail, setUserEmail] = useState('')

  // Verificar se o token é válido
  useEffect(() => {
    const checkToken = async () => {
      if (!token) {
        setLoading(false)
        setValid(false)
        return
      }

      try {
        const tokenRef = doc(db, 'passwordResetTokens', token)
        const tokenDoc = await getDoc(tokenRef)

        if (!tokenDoc.exists()) {
          setValid(false)
          setLoading(false)
          return
        }

        const tokenData = tokenDoc.data()
        const now = new Date()
        const expiresAt = tokenData.expiresAt?.toDate?.() || new Date(0)

        // Verificar se o token expirou (24 horas)
        if (now > expiresAt) {
          setValid(false)
          setLoading(false)
          // Deletar token expirado
          await deleteDoc(tokenRef)
          return
        }

        // Verificar se já foi usado
        if (tokenData.used === true) {
          setValid(false)
          setLoading(false)
          return
        }

        setValid(true)
        setUserEmail(tokenData.email || '')
        setLoading(false)
      } catch (err) {
        console.error('Erro ao verificar token:', err)
        setValid(false)
        setLoading(false)
      }
    }

    checkToken()
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMessage('')

    if (formData.newPassword.length < 6) {
      setMessage('❌ A senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (formData.newPassword !== formData.confirmPassword) {
      setMessage('❌ As senhas não coincidem.')
      return
    }

    setSubmitting(true)

    try {
      const tokenRef = doc(db, 'passwordResetTokens', token)
      const tokenDoc = await getDoc(tokenRef)

      if (!tokenDoc.exists()) {
        setMessage('❌ Token inválido ou expirado.')
        setSubmitting(false)
        return
      }

      const tokenData = tokenDoc.data()

      // Enviar email de redefinição de senha do Firebase Auth
      await sendPasswordResetEmail(auth, tokenData.email)
      
      // Marcar token como usado
      await updateDoc(tokenRef, {
        used: true,
        usedAt: serverTimestamp(),
      })

      setMessage('✅ Email de redefinição de senha enviado para ' + tokenData.email + '! Verifique sua caixa de entrada (e spam) e siga as instruções no email do Firebase.')
      
      // Redirecionar após 5 segundos
      setTimeout(() => {
        navigate('/login')
      }, 5000)

    } catch (err) {
      console.error('Erro ao redefinir senha:', err)
      setMessage(`❌ Erro ao processar: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-lg font-semibold text-alego-600">Verificando link...</p>
      </div>
    )
  }

  if (!valid) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-2xl bg-white dark:bg-slate-800 p-8 shadow-sm max-w-md w-full mx-4 text-center">
          <LockClosedIcon className="h-16 w-16 text-rose-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-alego-700 dark:text-alego-300 mb-2">
            Link Inválido ou Expirado
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Este link de redefinição de senha não é válido ou já expirou. Links expiram após 24 horas.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white hover:bg-alego-700"
          >
            Voltar para Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="rounded-2xl bg-white dark:bg-slate-800 p-8 shadow-sm max-w-md w-full">
        <div className="text-center mb-6">
          <LockClosedIcon className="h-16 w-16 text-alego-600 dark:text-alego-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-alego-700 dark:text-alego-300 mb-2">
            Redefinir Senha
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Para: {userEmail}
          </p>
        </div>

        {message && (
          <div className={`mb-4 rounded-lg p-3 text-sm ${
            message.startsWith('✅') 
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
          }`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Nova Senha
            </label>
            <input
              type="password"
              value={formData.newPassword}
              onChange={(e) => setFormData(prev => ({ ...prev, newPassword: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 p-3 text-sm focus:border-alego-500 focus:outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              placeholder="Mínimo 6 caracteres"
              required
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Confirmar Nova Senha
            </label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 p-3 text-sm focus:border-alego-500 focus:outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              placeholder="Digite a senha novamente"
              required
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-alego-600 px-6 py-3 text-sm font-semibold text-white hover:bg-alego-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Processando...' : 'Redefinir Senha'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default ResetPassword

