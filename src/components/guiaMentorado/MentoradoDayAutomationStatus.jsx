import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '../../firebase/config'

const STEP_LABELS = {
  aguardando: 'Aguardando',
  flashcards: 'Flashcards',
  material: 'Material',
  questoes: 'Questões',
  publicando: 'Liberando',
  concluído: 'Concluído',
}

const STATUS_STYLES = {
  pending: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  generating: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  published: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  error: 'bg-red-500/15 text-red-700 dark:text-red-300',
}

export default function MentoradoDayAutomationStatus({ courseId, targetDate, onGenerateToday, generating }) {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    if (!courseId || !targetDate || !db) return undefined

    const ref = doc(db, 'courses', courseId, 'mentoradoAutomation', targetDate)
    return onSnapshot(ref, (snap) => {
      setStatus(snap.exists() ? snap.data() : null)
    })
  }, [courseId, targetDate])

  if (!courseId || !targetDate) return null

  const dayLabel = dayjs(targetDate).format('DD/MM/YYYY')
  const topics = status?.topics || []
  const isRunning = status?.status === 'running'

  return (
    <div className="cp-card space-y-4 !rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-cp-muted">
            Automação do dia
          </p>
          <p className="text-sm font-semibold text-cp-text">{dayLabel}</p>
          {status ? (
            <p className="mt-1 text-xs text-cp-muted">
              {status.publishedCount ?? 0}/{status.totalTopics ?? topics.length} tópico(s) liberado(s)
              {status.status === 'running' && ' — em andamento…'}
              {status.status === 'partial' && ' — concluído com pendências'}
              {status.status === 'error' && ' — erro'}
              {status.reason && ` (${status.reason})`}
            </p>
          ) : (
            <p className="mt-1 text-xs text-cp-muted">Nenhuma geração registrada para hoje ainda.</p>
          )}
        </div>
        {onGenerateToday && (
          <button
            type="button"
            onClick={onGenerateToday}
            disabled={generating || isRunning}
            className="cp-btn-primary !text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating || isRunning ? 'Gerando…' : 'Gerar conteúdos de hoje'}
          </button>
        )}
      </div>

      {topics.length > 0 && (
        <div className="space-y-2">
          {topics.map((topic) => (
            <div
              key={topic.topicKey}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-cp-border bg-cp-surface/50 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate font-medium text-cp-text">
                {topic.topicoNome || topic.topicKey}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[topic.status] || STATUS_STYLES.pending}`}
              >
                {topic.status === 'published'
                  ? 'Liberado'
                  : topic.status === 'generating'
                    ? 'Gerando'
                    : topic.status === 'error'
                      ? 'Erro'
                      : 'Pendente'}
              </span>
              <span className="text-xs text-cp-muted">
                {STEP_LABELS[topic.step] || topic.step}
              </span>
              {topic.error && (
                <span className="w-full text-xs text-red-500">{topic.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
