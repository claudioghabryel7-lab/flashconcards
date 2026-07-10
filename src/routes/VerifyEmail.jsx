import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EnvelopeIcon, ArrowPathIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../hooks/useAuth'
import {
  requestEmailVerificationCode,
  submitEmailVerificationCode,
} from '../utils/emailVerificationApi'

export default function VerifyEmail() {
  const { user, profile, isEmailVerified, logout, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const autoSentRef = useRef(false)

  useEffect(() => {
    if (isEmailVerified) {
      navigate('/select-course', { replace: true })
    }
  }, [isEmailVerified, navigate])

  useEffect(() => {
    if (!user || autoSentRef.current || isEmailVerified) return
    autoSentRef.current = true
    handleSendCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isEmailVerified])

  const handleSendCode = async () => {
    setSending(true)
    setError('')
    setMessage('')
    try {
      const result = await requestEmailVerificationCode()
      if (result.alreadyVerified) {
        await refreshProfile?.()
        navigate('/select-course', { replace: true })
        return
      }
      setMessage('Código enviado! Confira sua caixa de entrada.')
    } catch (err) {
      setError(err.message || 'Erro ao enviar código.')
    } finally {
      setSending(false)
    }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    if (code.length !== 6) {
      setError('Digite o código de 6 dígitos.')
      return
    }
    setVerifying(true)
    setError('')
    try {
      await submitEmailVerificationCode(code)
      await refreshProfile?.()
      setMessage('Email verificado! Redirecionando…')
      navigate('/select-course', { replace: true })
    } catch (err) {
      setError(err.message || 'Código inválido.')
    } finally {
      setVerifying(false)
    }
  }

  const email = profile?.email || user?.email || ''

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-4 py-10">
      <div className="cp-card !rounded-3xl p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-500/10">
            <ShieldCheckIcon className="h-6 w-6 text-violet-600" />
          </div>
          <div>
            <h1 className="cp-headline text-xl text-cp-text">Verifique seu email</h1>
            <p className="text-sm text-cp-muted">Obrigatório para continuar na plataforma</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-cp-text">
          Enviamos um código de <strong>6 dígitos</strong> para{' '}
          <span className="font-semibold text-violet-700">{email}</span>.
        </p>

        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4 text-sm text-amber-900 dark:text-amber-200">
          <p className="font-semibold">Não encontrou o email?</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-cp-muted">
            <li>Verifique a pasta de <strong>spam</strong> ou <strong>lixeira</strong></li>
            <li>Procure remetente <strong>flashconcards@gmail.com</strong></li>
            <li>Aguarde alguns minutos e clique em reenviar</li>
          </ul>
        </div>

        <form onSubmit={handleVerify} className="mt-6 space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-cp-muted">
            Código de verificação
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="mt-2 w-full rounded-2xl border border-cp-border bg-cp-surface px-4 py-3 text-center font-mono text-2xl tracking-[.35em] text-cp-text focus:border-violet-500 focus:outline-none"
            />
          </label>

          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {message && (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={verifying || code.length !== 6}
            className="cp-btn-primary w-full justify-center disabled:opacity-50"
          >
            <EnvelopeIcon className="h-5 w-5" />
            {verifying ? 'Verificando…' : 'Confirmar código'}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSendCode}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-xl border border-cp-border px-4 py-2 text-sm font-semibold text-cp-text hover:bg-cp-surface"
          >
            <ArrowPathIcon className={`h-4 w-4 ${sending ? 'animate-spin' : ''}`} />
            {sending ? 'Enviando…' : 'Reenviar código'}
          </button>
          <button
            type="button"
            onClick={() => logout().then(() => navigate('/login'))}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-cp-muted hover:text-cp-text"
          >
            Sair e usar outro email
          </button>
        </div>
      </div>
    </div>
  )
}
