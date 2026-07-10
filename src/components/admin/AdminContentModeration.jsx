import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { FlagIcon, CheckIcon, AcademicCapIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { resolveContentFlag, subscribeOpenFlags } from '../../services/contentFeedbackService'
import {
  subscribePendingSupervisorReviews,
  resolveSupervisorReview,
} from '../../services/professorSupervisorService'

export default function AdminContentModeration() {
  const [flags, setFlags] = useState([])
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [resolvingId, setResolvingId] = useState(null)
  const [reviewActionId, setReviewActionId] = useState(null)

  useEffect(() => {
    const unsubFlags = subscribeOpenFlags(
      (rows) => {
        setFlags(rows)
        setLoading(false)
      },
      () => setLoading(false),
    )
    const unsubReviews = subscribePendingSupervisorReviews(setReviews)
    return () => {
      unsubFlags?.()
      unsubReviews?.()
    }
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

  const handleReview = async (reviewId, action) => {
    setReviewActionId(reviewId)
    try {
      await resolveSupervisorReview(reviewId, action)
    } catch (error) {
      console.error(error)
      alert('Erro ao atualizar veredito.')
    } finally {
      setReviewActionId(null)
    }
  }

  const typeLabel = (t) => (t === 'questao' ? 'Questão' : t === 'flashcard' ? 'Flashcard' : t)

  const reviewTypeLabel = {
    topico: 'Tópico do dia',
    flag: 'Sinalização',
    vespera: 'Véspera de prova',
    redacao: 'Redação',
  }

  return (
    <div className="space-y-6">
      <div className="cp-card !rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10">
            <AcademicCapIcon className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="cp-headline text-lg text-cp-text">Vereditos do Professor 3</h2>
            <p className="text-sm text-cp-muted">
              Correções com dúvida — conteúdo segue publicado; aprove ou recuse aqui.
            </p>
          </div>
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="cp-card py-8 text-center text-sm text-cp-muted">
          Nenhum veredito pendente do fiscalizador.
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => {
            const when = review.createdAt?.toDate?.()
              ? dayjs(review.createdAt.toDate()).format('DD/MM/YYYY HH:mm')
              : ''
            const summary = review.verdict?.summary || 'Sem resumo'
            const issues = review.verdict?.issues || []
            return (
              <div key={review.id} className="cp-card !rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <span className="cp-badge cp-badge-accent !text-[10px]">
                      {reviewTypeLabel[review.itemType] || review.itemType}
                    </span>
                    <span className="cp-badge !text-[10px]">Curso: {review.courseId}</span>
                    {review.payload?.topicoNome && (
                      <span className="cp-badge cp-badge-cyan !text-[10px] truncate max-w-[220px]">
                        {review.payload.topicoNome}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-cp-muted">{when}</span>
                </div>
                <p className="text-sm text-cp-text">{summary}</p>
                {issues.length > 0 && (
                  <ul className="list-disc pl-5 text-xs text-cp-muted space-y-1">
                    {issues.slice(0, 5).map((issue, idx) => (
                      <li key={idx}>{issue.detail}</li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleReview(review.id, 'approved')}
                    disabled={reviewActionId === review.id}
                    className="cp-btn-primary !text-xs"
                  >
                    <CheckIcon className="h-4 w-4" />
                    Aprovar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReview(review.id, 'rejected')}
                    disabled={reviewActionId === review.id}
                    className="rounded-xl border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/10"
                  >
                    <XMarkIcon className="h-4 w-4" />
                    Recusar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

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
