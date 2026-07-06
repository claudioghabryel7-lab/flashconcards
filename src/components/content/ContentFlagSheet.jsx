import { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import PortalOverlay from './PortalOverlay'
import { useAuth } from '../../hooks/useAuth'
import { submitContentFlag } from '../../services/contentFeedbackService'

export default function ContentFlagSheet({
  open,
  onClose,
  courseId,
  contentType,
  contentId,
  topicKey,
  preview,
  contextLabel = 'este conteúdo',
}) {
  const { user, profile } = useAuth()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    if (!user) {
      setMessage('Faça login para sinalizar.')
      return
    }
    try {
      setSending(true)
      setMessage('')
      await submitContentFlag({
        courseId,
        contentType,
        contentId,
        topicKey,
        text,
        user,
        profile,
        preview,
      })
      setMessage('Sinalização enviada. A equipe irá revisar.')
      setTimeout(() => {
        onClose()
        setText('')
        setMessage('')
      }, 1200)
    } catch (error) {
      setMessage(error.message || 'Não foi possível enviar.')
    } finally {
      setSending(false)
    }
  }

  return (
    <PortalOverlay open={open} onClose={onClose} ariaLabel="Sinalizar conteúdo">
      <div className="flex items-center justify-between border-b border-cp-border px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--cp-accent-4)]">
            Sinalizar atenção
          </p>
          <h3 className="cp-headline text-base text-cp-text">Reportar problema</h3>
          <p className="mt-0.5 text-xs text-cp-muted">Sobre {contextLabel}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1.5 text-cp-muted hover:bg-cp-surface hover:text-cp-text"
          aria-label="Fechar"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {preview && (
        <div className="border-b border-cp-border bg-cp-surface/50 px-4 py-3">
          <p className="line-clamp-4 text-sm text-cp-muted">{preview}</p>
        </div>
      )}

      <div className="p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Descreva o erro ou o que precisa de atenção (opcional)…"
          className="w-full resize-y rounded-xl border border-cp-border bg-cp-surface px-3 py-2.5 text-sm text-cp-text focus:border-[var(--cp-accent)] focus:outline-none"
        />
        {message && (
          <p className={`mt-2 text-xs ${message.includes('enviada') ? 'text-[var(--cp-success)]' : 'text-cp-muted'}`}>
            {message}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="cp-btn-ghost flex-1 !text-sm" disabled={sending}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={sending}
            className="cp-btn-primary flex-1 !text-sm disabled:opacity-60"
          >
            {sending ? 'Enviando…' : 'Sinalizar'}
          </button>
        </div>
      </div>
    </PortalOverlay>
  )
}
