import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { FlagIcon, CheckIcon } from '@heroicons/react/24/outline'
import { resolveContentFlag, subscribeOpenFlags } from '../../services/contentFeedbackService'

export default function AdminContentModeration() {
  const [flags, setFlags] = useState([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState(null)

  useEffect(() => {
    const unsub = subscribeOpenFlags(
      (rows) => {
        setFlags(rows)
        setLoading(false)
      },
      () => setLoading(false),
    )
    return () => unsub?.()
  }, [])

  const handleResolve = async (flag) => {
    if (!flag.courseId) return
    setResolvingId(flag.id)
    try {
      await resolveContentFlag(flag.courseId, flag.id)
    } catch (error) {
      console.error(error)
      alert('Erro ao marcar como resolvido.')
    } finally {
      setResolvingId(null)
    }
  }

  const typeLabel = (t) => (t === 'questao' ? 'Questão' : t === 'flashcard' ? 'Flashcard' : t)

  return (
    <div className="space-y-6">
      <div className="cp-card !rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--cp-accent-4)]/30 bg-[var(--cp-accent-4)]/10">
            <FlagIcon className="h-5 w-5 text-[var(--cp-accent-4)]" />
          </div>
          <div>
            <h2 className="cp-headline text-lg text-cp-text">Conteúdos sinalizados</h2>
            <p className="text-sm text-cp-muted">
              Flashcards e questões reportados pelos alunos para revisão.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-center text-sm text-cp-muted py-12">Carregando sinalizações…</p>
      ) : flags.length === 0 ? (
        <div className="cp-card py-12 text-center text-sm text-cp-muted">
          Nenhum conteúdo sinalizado pendente.
        </div>
      ) : (
        <div className="space-y-3">
          {flags.map((flag) => {
            const when = flag.createdAt?.toDate?.()
              ? dayjs(flag.createdAt.toDate()).format('DD/MM/YYYY HH:mm')
              : ''
            return (
              <div key={flag.id} className="cp-card !rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <span className="cp-badge cp-badge-accent !text-[10px]">{typeLabel(flag.contentType)}</span>
                    <span className="cp-badge !text-[10px]">Curso: {flag.courseId || '—'}</span>
                    {flag.topicKey && (
                      <span className="cp-badge cp-badge-cyan !text-[10px] truncate max-w-[200px]">
                        {decodeURIComponent(flag.topicKey)}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-cp-muted">{when}</span>
                </div>

                {flag.preview && (
                  <p className="rounded-xl border border-cp-border bg-cp-surface/50 px-3 py-2 text-sm text-cp-text">
                    {flag.preview}
                  </p>
                )}

                <p className="text-sm text-cp-muted">
                  <span className="font-medium text-cp-text">{flag.userName || 'Aluno'}:</span>{' '}
                  {flag.text || 'Sem descrição'}
                </p>

                <p className="font-mono text-[10px] text-cp-muted">
                  ID: {flag.contentId}
                </p>

                <button
                  type="button"
                  onClick={() => handleResolve(flag)}
                  disabled={resolvingId === flag.id || !flag.courseId}
                  className="cp-btn-primary !text-xs"
                >
                  <CheckIcon className="h-4 w-4" />
                  {resolvingId === flag.id ? 'Marcando…' : 'Marcar como corrigido'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
