import { useEffect, useState } from 'react'
import {
  XMarkIcon,
  ClockIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline'
import { useBackgroundGeneration } from '../hooks/useBackgroundGeneration'
import { useAuth } from '../hooks/useAuth'
import {
  dismissGenerationJob,
  cancelAllGenerationJobs,
  forceStopAllGenerationJobsGlobally,
  GENERATION_JOB_STATUS,
  GENERATION_WAITING_STATUSES,
} from '../services/generationJobService'

const MINIMIZED_KEY = 'genBannerMinimized'

const JOB_LABELS = {
  conteudo_completo: 'Conteúdo do tópico',
  questoes_topico: 'Questões preditivas',
  flashcards_topico: 'Flashcards',
  conteudo_incidencia: 'Conteúdo de incidência',
  questoes_incidencia: 'Questões de incidência',
  vespera_prova: 'Véspera de prova',
  admin_edital_verticalizado: 'Edital verticalizado',
  admin_materia_revisada: 'Matéria revisada',
  materia_revisada: 'Matéria revisada', // legado
  guia_mentorado_cronograma: 'Cronograma Guia Mentorado',
  guia_mentorado_automation: 'Conteúdos do dia (Guia Mentorado)',
  guia_mentorado_backfill: 'Guia Mentorado (dia 1 → hoje)',
  guia_mentorado: 'Guia Mentorado', // legado
  professor_supervisor: 'Professor fiscalizador',
  flashcards_edital: 'Flashcards do edital', // legado
  admin_batch: 'Geração em lote', // legado
}

const WAITING_HINTS = {
  [GENERATION_JOB_STATUS.WAITING_API]:
    'O servidor atualiza a cada 15s e continua sozinho quando a API voltar.',
  [GENERATION_JOB_STATUS.WAITING_TIMEOUT]:
    'Limite do servidor atingido — retoma automaticamente em instantes.',
  [GENERATION_JOB_STATUS.WAITING_RETRY]:
    'Erro temporário — o servidor tenta de novo a cada 15 segundos até concluir.',
}

function isWaitingStatus(status) {
  return GENERATION_WAITING_STATUSES.includes(status)
}

function isPendingStatus(status) {
  return status === GENERATION_JOB_STATUS.PENDING
}

function jobAgeSeconds(job, now = Date.now()) {
  const created = job.createdAt?.toDate?.()
  if (!created) return null
  return Math.max(0, Math.floor((now - created.getTime()) / 1000))
}

function formatJobMessage(job) {
  if (isPendingStatus(job.status)) {
    return job.message || 'Iniciando geração…'
  }
  if (isWaitingStatus(job.status)) {
    return (
      job.message ||
      (job.status === GENERATION_JOB_STATUS.WAITING_API
        ? 'API expirada — aguardando…'
        : 'Aguardando para retomar…')
    )
  }
  return job.message || 'Gerando…'
}

function formatJobHint(job, now = Date.now()) {
  if (isPendingStatus(job.status)) {
    const age = jobAgeSeconds(job, now)
    if (age != null && age >= 90) {
      return 'Demorando — mantenha esta aba aberta. Se persistir, use Parar (X) e gere outra vez.'
    }
    return 'Mantenha esta aba aberta enquanto gera.'
  }
  if (isWaitingStatus(job.status)) {
    return WAITING_HINTS[job.status] || 'Aguardando API — mantenha a aba aberta.'
  }
  return 'Mantenha esta aba aberta até concluir.'
}

function loadMinimized() {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(MINIMIZED_KEY) === '1'
  } catch {
    return false
  }
}

function saveMinimized(value) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(MINIMIZED_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export default function BackgroundGenerationBanner() {
  const { user, isAdmin } = useAuth()
  const { jobs, subscribeError } = useBackgroundGeneration()
  const [dismissing, setDismissing] = useState({})
  const [dismissErrors, setDismissErrors] = useState({})
  const [stoppingAll, setStoppingAll] = useState(false)
  const [stopFeedback, setStopFeedback] = useState(null)
  const [minimized, setMinimized] = useState(loadMinimized)
  const [nowTick, setNowTick] = useState(Date.now())

  useEffect(() => {
    if (!jobs.length) return undefined
    const timer = setInterval(() => setNowTick(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [jobs.length])

  useEffect(() => {
    if (!jobs.length) setMinimized(false)
  }, [jobs.length])

  useEffect(() => {
    if (!stopFeedback) return undefined
    const timer = setTimeout(() => setStopFeedback(null), 5000)
    return () => clearTimeout(timer)
  }, [stopFeedback])

  if (!jobs.length) return null

  const handleStopAll = async () => {
    if (!user?.uid || stoppingAll) return
    const msg = isAdmin
      ? 'Parar TODOS os jobs do sistema (todos os usuários)?'
      : 'Parar TODOS os seus jobs em andamento? A geração será cancelada.'
    if (!window.confirm(msg)) return
    setStoppingAll(true)
    setStopFeedback(null)
    try {
      const result = isAdmin
        ? await forceStopAllGenerationJobsGlobally()
        : await cancelAllGenerationJobs(user.uid)
      setStopFeedback({
        type: 'success',
        text: `Parados ${result.cancelled ?? jobs.length} job(s).`,
      })
    } catch (err) {
      setStopFeedback({
        type: 'error',
        text: err?.message || 'Não foi possível parar os jobs. Tente de novo.',
      })
    } finally {
      setStoppingAll(false)
    }
  }

  const handleDismiss = async (jobId) => {
    if (!user?.uid || dismissing[jobId]) return
    setDismissing((prev) => ({ ...prev, [jobId]: true }))
    setDismissErrors((prev) => ({ ...prev, [jobId]: null }))
    try {
      const result = await dismissGenerationJob(user.uid, jobId)
      if (result?.warning) {
        setDismissErrors((prev) => ({
          ...prev,
          [jobId]: result.warning,
        }))
      }
    } catch (err) {
      setDismissErrors((prev) => ({
        ...prev,
        [jobId]: err?.message || 'Não foi possível parar esta tarefa.',
      }))
    } finally {
      setDismissing((prev) => ({ ...prev, [jobId]: false }))
    }
  }

  const toggleMinimized = (value) => {
    setMinimized(value)
    saveMinimized(value)
  }

  if (minimized) {
    const running = jobs.filter((j) => j.status === GENERATION_JOB_STATUS.RUNNING).length
    const waiting = jobs.length - running

    return (
      <div className="cp-fixed-br fixed z-[90] flex max-w-[min(20rem,calc(100%-2rem))] flex-col items-end gap-2">
        {stopFeedback ? (
          <p
            className={`max-w-xs rounded-lg px-3 py-2 text-xs shadow-lg ${
              stopFeedback.type === 'error'
                ? 'bg-red-500/15 text-red-700 dark:text-red-200'
                : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
            }`}
          >
            {stopFeedback.text}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleStopAll}
            disabled={stoppingAll}
            className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] font-semibold text-red-600 shadow-lg backdrop-blur-sm transition hover:bg-red-500/20 disabled:opacity-50 dark:text-red-300"
            title={isAdmin ? 'Parar todos os jobs do sistema' : 'Parar todos os seus jobs'}
          >
            {stoppingAll ? 'Parando…' : isAdmin ? 'Parar tudo' : 'Parar todas'}
          </button>
          <button
            type="button"
            onClick={() => toggleMinimized(false)}
            className="inline-flex items-center gap-2 rounded-full border border-cp-accent/30 bg-cp-surface/95 px-4 py-2 text-xs font-semibold text-cp-text shadow-lg backdrop-blur-sm transition hover:border-cp-accent/50"
            title="Expandir tarefas em andamento"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cp-accent opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cp-accent" />
            </span>
            {jobs.length} tarefa{jobs.length !== 1 ? 's' : ''} IA
            {waiting > 0 ? ` · ${waiting} aguardando` : ''}
            <ChevronUpIcon className="h-4 w-4 text-cp-muted" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="cp-fixed-br fixed z-[90] w-[min(22rem,calc(100%-2rem))] max-w-full space-y-2"
      role="status"
      aria-live="polite"
    >
      {subscribeError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
          {subscribeError}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        {stopFeedback ? (
          <p
            className={`mr-auto max-w-[14rem] rounded-lg px-2 py-1 text-[11px] ${
              stopFeedback.type === 'error'
                ? 'bg-red-500/10 text-red-600 dark:text-red-300'
                : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {stopFeedback.text}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => toggleMinimized(true)}
          className="inline-flex items-center gap-1 rounded-lg border border-cp-border bg-cp-surface/90 px-2 py-1 text-[11px] font-medium text-cp-muted shadow-sm transition hover:bg-cp-surface hover:text-cp-text"
          title="Minimizar painel"
        >
          <ChevronDownIcon className="h-3.5 w-3.5" />
          Minimizar
        </button>
        <button
          type="button"
          onClick={handleStopAll}
          disabled={stoppingAll}
          className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-600 shadow-sm transition hover:bg-red-500/20 disabled:opacity-50 dark:text-red-300"
          title={isAdmin ? 'Parar todos os jobs do sistema' : 'Parar todos os seus jobs'}
        >
          {stoppingAll ? 'Parando…' : isAdmin ? 'Parar tudo' : 'Parar todas'}
        </button>
      </div>
      {jobs.map((job) => {
        const waiting = isWaitingStatus(job.status)
        const pending = isPendingStatus(job.status)
        const waitingTimeout = job.status === GENERATION_JOB_STATUS.WAITING_TIMEOUT
        const stuckPending = pending && (jobAgeSeconds(job, nowTick) ?? 0) >= 90

        return (
          <div
            key={job.id}
            className={`rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm ${
              waiting || stuckPending
                ? 'border-amber-500/40 bg-amber-500/10'
                : pending
                  ? 'border-sky-500/30 bg-sky-500/5'
                  : 'border-cp-accent/30 bg-cp-surface/95'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {waiting ? (
                  waitingTimeout ? (
                    <ArrowPathIcon className="h-4 w-4 animate-spin text-amber-600" />
                  ) : (
                    <ClockIcon className="h-4 w-4 animate-pulse text-amber-600" />
                  )
                ) : pending ? (
                  <ClockIcon className="h-4 w-4 animate-pulse text-sky-600" />
                ) : (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
                )}
                <p className="text-sm font-medium text-cp-text">
                  {JOB_LABELS[job.jobType] || 'Geração com IA'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDismiss(job.id)}
                disabled={dismissing[job.id]}
                className="shrink-0 rounded-lg p-1 text-cp-muted transition hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                title="Parar esta tarefa"
                aria-label="Parar esta tarefa"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
            <p
              className={`mt-1 text-xs ${
                waiting || stuckPending
                  ? 'text-amber-800 dark:text-amber-200'
                  : pending
                    ? 'text-sky-800 dark:text-sky-200'
                    : 'text-cp-muted'
              }`}
            >
              {formatJobMessage(job)}
              {!waiting && !pending && typeof job.progress === 'number' && job.progress > 0
                ? ` (${job.progress}%)`
                : ''}
            </p>
            <p className="mt-1 text-[10px] text-cp-muted/80">{formatJobHint(job, nowTick)}</p>
            {dismissErrors[job.id] ? (
              <p className="mt-1 text-[10px] text-red-600 dark:text-red-300">{dismissErrors[job.id]}</p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
