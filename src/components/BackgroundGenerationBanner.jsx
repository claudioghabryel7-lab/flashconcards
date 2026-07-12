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
  flashcards_edital: 'Flashcards do edital',
  materia_revisada: 'Matéria revisada',
  vespera_prova: 'Véspera de prova',
  guia_mentorado: 'Guia mentorado',
  guia_mentorado_cronograma: 'Cronograma Guia Mentorado',
  guia_mentorado_automation: 'Conteúdos do dia (Guia Mentorado)',
  guia_mentorado_backfill: 'Guia Mentorado (dia 1 → hoje)',
  professor_supervisor: 'Professor fiscalizador',
  admin_batch: 'Geração em lote',
}

const WAITING_HINTS = {
  [GENERATION_JOB_STATUS.WAITING_API]:
    'O servidor verifica a cada 5 segundos e continua sozinho quando a API voltar.',
  [GENERATION_JOB_STATUS.WAITING_TIMEOUT]:
    'Limite do servidor atingido — retoma automaticamente em instantes.',
  [GENERATION_JOB_STATUS.WAITING_RETRY]:
    'Erro temporário — o servidor tenta de novo a cada 5 segundos até concluir.',
}

function isWaitingStatus(status) {
  return GENERATION_WAITING_STATUSES.includes(status)
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
  const { user } = useAuth()
  const { jobs } = useBackgroundGeneration()
  const [dismissing, setDismissing] = useState({})
  const [stoppingAll, setStoppingAll] = useState(false)
  const [minimized, setMinimized] = useState(loadMinimized)

  useEffect(() => {
    if (!jobs.length) setMinimized(false)
  }, [jobs.length])

  if (!jobs.length) return null

  const handleStopAll = async () => {
    if (!user?.uid || stoppingAll) return
    if (!window.confirm('Parar TODOS os jobs em andamento? A geração será cancelada.')) return
    setStoppingAll(true)
    try {
      await cancelAllGenerationJobs(user.uid)
    } finally {
      setStoppingAll(false)
    }
  }

  const handleDismiss = async (jobId) => {
    if (!user?.uid || dismissing[jobId]) return
    setDismissing((prev) => ({ ...prev, [jobId]: true }))
    try {
      await dismissGenerationJob(user.uid, jobId)
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
      <div className="fixed bottom-4 right-4 z-[90]">
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
    )
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-[90] max-w-sm space-y-2"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-end gap-2">
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
          title="Parar todos os jobs"
        >
          {stoppingAll ? 'Parando…' : 'Parar todas'}
        </button>
      </div>
      {jobs.map((job) => {
        const waiting = isWaitingStatus(job.status)
        const waitingApi = job.status === GENERATION_JOB_STATUS.WAITING_API
        const waitingTimeout = job.status === GENERATION_JOB_STATUS.WAITING_TIMEOUT

        return (
          <div
            key={job.id}
            className={`rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm ${
              waiting
                ? 'border-amber-500/40 bg-amber-500/10'
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
              className={`mt-1 text-xs ${waiting ? 'text-amber-800 dark:text-amber-200' : 'text-cp-muted'}`}
            >
              {job.message ||
                (waitingApi
                  ? 'API expirada — aguardando…'
                  : waiting
                    ? 'Aguardando para retomar…'
                    : 'Gerando em segundo plano…')}
              {!waiting && typeof job.progress === 'number' && job.progress > 0
                ? ` (${job.progress}%)`
                : ''}
            </p>
            <p className="mt-1 text-[10px] text-cp-muted/80">
              {waiting
                ? WAITING_HINTS[job.status] ||
                  'O servidor retoma sozinho — só para se você cancelar (X).'
                : 'Você pode sair desta tela — a geração continua no servidor.'}
            </p>
          </div>
        )
      })}
    </div>
  )
}
