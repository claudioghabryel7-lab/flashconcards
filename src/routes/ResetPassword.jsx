import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { LockClosedIcon } from '@heroicons/react/24/solid'
import { FIREBASE_FUNCTIONS } from '../config/firebaseFunctions'

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

        if (now > expiresAt) {
          setValid(false)
          setLoading(false)
          await deleteDoc(tokenRef)
          return
        }

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
      const response = await fetch(
        FIREBASE_FUNCTIONS.updateUserPassword ||
          'https://us-central1-plegi-d84c2.cloudfunctions.net/updateUserPassword',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            newPassword: formData.newPassword,
          }),
        },
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao atualizar senha')
      }

      setMessage('✅ Senha redefinida com sucesso! Você pode fazer login agora com sua nova senha.')
      setTimeout(() => navigate('/login'), 3000)
    } catch (err) {
      console.error('Erro ao redefinir senha:', err)
      setMessage(`❌ Erro ao processar: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-cp-bg px-4">
        <p className="text-lg font-semibold text-cp-text">Verificando link...</p>
      </div>
    )
  }

  if (!valid) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-cp-bg px-4">
        <div className="cp-card w-full max-w-md border border-cp-border bg-cp-surface p-8 text-center shadow-xl">
          <LockClosedIcon className="mx-auto mb-4 h-16 w-16 text-rose-500" />
          <h2 className="mb-2 text-2xl font-bold text-cp-text">Link inválido ou expirado</h2>
          <p className="mb-6 text-sm text-cp-muted">
            Este link de redefinição de senha não é válido ou já expirou. Links expiram após 24 horas.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="rounded-full bg-cp-accent px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Voltar para login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-cp-bg px-4 py-10">
      <div className="cp-card w-full max-w-md border border-cp-border bg-cp-surface p-8 shadow-xl">
        <div className="mb-6 text-center">
          <LockClosedIcon className="mx-auto mb-4 h-16 w-16 text-cp-accent" />
          <h2 className="mb-2 text-2xl font-bold text-cp-text">Redefinir senha</h2>
          <p className="text-sm text-cp-muted">Para: {userEmail}</p>
        </div>

        {message && (
          <div
            className={`mb-4 rounded-lg border p-3 text-sm ${
              message.startsWith('✅')
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}
          >
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-cp-text">Nova senha</label>
            <input
              type="password"
              value={formData.newPassword}
              onChange={(e) => setFormData((prev) => ({ ...prev, newPassword: e.target.value }))}
              className="w-full rounded-xl border border-cp-border bg-cp-bg px-4 py-3 text-sm text-cp-text outline-none focus:border-cp-accent"
              placeholder="Mínimo 6 caracteres"
              required
              disabled={submitting}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-cp-text">
              Confirmar nova senha
            </label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              className="w-full rounded-xl border border-cp-border bg-cp-bg px-4 py-3 text-sm text-cp-text outline-none focus:border-cp-accent"
              placeholder="Digite a senha novamente"
              required
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-cp-accent px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Processando...' : 'Redefinir senha'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default ResetPassword
