import { useState } from 'react'
import { ChatBubbleLeftEllipsisIcon, FlagIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../../hooks/useAuth'
import { submitContentFeedback } from '../../services/contentFeedbackService'

export default function ContentFeedbackActions({
  courseId,
  contentType,
  contentId,
  topicKey = null,
  preview = '',
  contextLabel = 'este conteúdo',
  variant = 'compact',
  className = '',
}) {
  const { user, profile } = useAuth()
  const [modal, setModal] = useState(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')

  if (!courseId || !contentId) return null

  const openModal = (kind) => {
    if (!user) {
      setMessage('Faça login para comentar ou sinalizar.')
      return
    }
    setMessage('')
    setText('')
    setModal(kind)
  }

  const closeModal = () => {
    if (sending) return
    setModal(null)
    setText('')
  }

  const handleSubmit = async () => {
    try {
      setSending(true)
      setMessage('')
      await submitContentFeedback({
        courseId,
        contentType,
        contentId,
        topicKey,
        kind: modal,
        text,
        user,
        profile,
        preview,
      })
      setMessage(modal === 'flag' ? 'Sinalização enviada. Obrigado!' : 'Comentário enviado. Obrigado!')
      setTimeout(() => {
        closeModal()
        setMessage('')
      }, 1200)
    } catch (error) {
      const code = error?.code || ''
      if (code === 'permission-denied') {
        setMessage('Sem permissão. Peça ao admin para publicar as regras do Firestore (contentFeedback).')
      } else {
        setMessage(error.message || 'Não foi possível enviar.')
      }
    } finally {
      setSending(false)
    }
  }

  const btnBase =
    variant === 'compact'
      ? 'flex h-9 w-9 items-center justify-center rounded-full transition'
      : 'inline-flex items-center gap-1.5 rounded-full border border-cp-border px-3 py-1.5 text-xs font-medium transition'

  return (
    <>
      <div className={`flex items-center gap-1 ${className}`}>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            openModal('comment')
          }}
          className={`${btnBase} text-cp-muted hover:bg-cp-surface hover:text-[var(--cp-accent-2)]`}
          aria-label="Comentar"
          title="Comentar"
        >
          <ChatBubbleLeftEllipsisIcon className="h-4 w-4" />
          {variant === 'inline' && <span>Comentar</span>}
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            openModal('flag')
          }}
          className={`${btnBase} text-cp-muted hover:bg-[var(--cp-accent-4)]/10 hover:text-[var(--cp-accent-4)]`}
          aria-label="Sinalizar atenção"
          title="Sinalizar atenção"
        >
          <FlagIcon className="h-4 w-4" />
          {variant === 'inline' && <span>Sinalizar</span>}
        </button>
      </div>

      {message && !modal && (
        <p className="mt-1 text-xs text-cp-muted">{message}</p>
      )}

      {modal && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-4 sm:items-center"
          onClick={closeModal}
        >
          <div
            className="cp-card w-full max-w-md !rounded-2xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wide text-cp-muted">
                  {modal === 'flag' ? 'Sinalizar atenção' : 'Comentário'}
                </p>
                <h3 className="cp-headline mt-1 text-lg text-cp-text">
                  {modal === 'flag' ? 'Reportar problema' : 'Deixe seu comentário'}
                </h3>
                <p className="mt-1 text-xs text-cp-muted">Sobre {contextLabel}</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full p-1 text-cp-muted hover:bg-cp-surface hover:text-cp-text"
                aria-label="Fechar"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={
                modal === 'flag'
                  ? 'Descreva o erro ou o que precisa de atenção (opcional)…'
                  : 'Escreva seu comentário sobre este conteúdo…'
              }
              className="w-full resize-y rounded-xl border border-cp-border bg-cp-surface px-3 py-2.5 text-sm text-cp-text focus:border-[var(--cp-accent)] focus:outline-none"
            />

            {message && <p className="mt-2 text-xs text-[var(--cp-success)]">{message}</p>}

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={closeModal} className="cp-btn-ghost flex-1 !text-sm" disabled={sending}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={sending}
                className="cp-btn-primary flex-1 !text-sm disabled:opacity-60"
              >
                {sending ? 'Enviando…' : modal === 'flag' ? 'Sinalizar' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
