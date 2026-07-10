import { useEffect, useState, useRef } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '../../firebase/config'
import {
  subscribeGenerationJob,
  GENERATION_JOB_STATUS,
} from '../../services/generationJobService'
import {
  reconcileCancelledMentoradoDay,
  getEffectiveTopicDisplay,
} from '../../services/guiaMentoradoStatusService'

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

const ACTIVE_DAY_STATUSES = new Set([
  'running',
  'waiting_api',
  'waiting_retry',
  'waiting_timeout',
])

export default function MentoradoDayAutomationStatus({
  courseId,
  targetDate,
  userId,
  onGenerateToday,
  generating,
}) {
  const [status, setStatus] = useState(null)
  const [linkedJob, setLinkedJob] = useState(null)
  const reconciledKeyRef = useRef('')

  useEffect(() => {
    if (!courseId || !targetDate || !db) return undefined

    const ref = doc(db, 'courses', courseId, 'mentoradoAutomation', targetDate)
    return onSnapshot(ref, (snap) => {
      setStatus(snap.exists() ? snap.data() : null)
    })
  }, [courseId, targetDate])

  const jobUserId = status?.automationUserId || userId
  const jobId = status?.jobId

  useEffect(() => {
    if (!jobUserId || !jobId) {
      setLinkedJob(null)
      return undefined
    }
    return subscribeGenerationJob(jobUserId, jobId, setLinkedJob)
  }, [jobUserId, jobId])

  const jobCancelled = linkedJob?.status === GENERATION_JOB_STATUS.CANCELLED
  const jobStillActive =
    linkedJob &&
    [
      GENERATION_JOB_STATUS.PENDING,
      GENERATION_JOB_STATUS.RUNNING,
      GENERATION_JOB_STATUS.WAITING_API,
      GENERATION_JOB_STATUS.WAITING_RETRY,
      GENERATION_JOB_STATUS.WAITING_TIMEOUT,
    ].includes(linkedJob.status)

  const dayInactive =
    status?.status === 'cancelled' ||
    jobCancelled ||
    (jobId && linkedJob && !jobStillActive && status?.status !== 'done' && status?.status !== 'partial')

  useEffect(() => {
    if (!courseId || !targetDate || !dayInactive) return undefined

    const hasStuck =
      status?.status !== 'cancelled' ||
      (status?.topics || []).some((t) => t.status === 'generating')
    if (!hasStuck) return undefined

    const key = `${courseId}:${targetDate}:${linkedJob?.status || status?.status}`
    if (reconciledKeyRef.current === key) return undefined
    reconciledKeyRef.current = key

    reconcileCancelledMentoradoDay(courseId, targetDate).catch((err) =>
      console.error('Erro ao reconciliar painel mentorado:', err),
    )
  }, [courseId, targetDate, dayInactive, status?.status, status?.topics, linkedJob?.status])

  if (!courseId || !targetDate) return null

  const dayLabel = dayjs(targetDate).format('DD/MM/YYYY')
  const topics = status?.topics || []
  const isRunning = ACTIVE_DAY_STATUSES.has(status?.status) && !dayInactive

  const DAY_STATUS_HINTS = {
    running: ' — em andamento…',
    waiting_api: ' — API expirada, aguardando…',
    waiting_retry: ' — aguardando retomada automática…',
    waiting_timeout: ' — pausado (limite do servidor), retomando…',
    partial: ' — concluído com pendências',
    cancelled: ' — cancelado pelo admin',
    error: ' — erro',
  }

  const headerHint =
    dayInactive && status?.status !== 'cancelled'
      ? ' — cancelado pelo admin'
      : DAY_STATUS_HINTS[status?.status] || ''

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
              {headerHint}
              {status.reason && dayInactive ? ` (${status.reason})` : status.reason && !headerHint ? ` (${status.reason})` : ''}
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
          {topics.map((topic) => {
            const display = getEffectiveTopicDisplay(topic, dayInactive)
            return (
              <div
                key={topic.topicKey}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-cp-border bg-cp-surface/50 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-cp-text">
                  {display.topicoNome || display.topicKey}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[display.status] || STATUS_STYLES.pending}`}
                >
                  {display.status === 'published'
                    ? 'Liberado'
                    : display.status === 'generating'
                      ? 'Gerando'
                      : display.status === 'error'
                        ? 'Erro'
                        : 'Pendente'}
                </span>
                <span className="text-xs text-cp-muted">
                  {STEP_LABELS[display.step] || display.step}
                </span>
                {topic.error && (
                  <span className="w-full text-xs text-red-500">{topic.error}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
