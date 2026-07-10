import { useState } from 'react'
import { XMarkIcon, ClockIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { useBackgroundGeneration } from '../hooks/useBackgroundGeneration'
import { useAuth } from '../hooks/useAuth'
import {
  dismissGenerationJob,
  GENERATION_JOB_STATUS,
  GENERATION_WAITING_STATUSES,
} from '../services/generationJobService'

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
  admin_batch: 'Geração em lote',
}

const WAITING_HINTS = {
  [GENERATION_JOB_STATUS.WAITING_API]:
    'O servidor verifica a cada 5 min e continua sozinho quando a API voltar.',
  [GENERATION_JOB_STATUS.WAITING_TIMEOUT]:
    'Limite do servidor atingido — retoma automaticamente em instantes.',
  [GENERATION_JOB_STATUS.WAITING_RETRY]:
    'Erro temporário — o servidor tenta de novo a cada 5 min até concluir.',
}

function isWaitingStatus(status) {
  return GENERATION_WAITING_STATUSES.includes(status)
}

export default function BackgroundGenerationBanner() {
  const { user } = useAuth()
  const { jobs } = useBackgroundGeneration()
  const [dismissing, setDismissing] = useState({})

  if (!jobs.length) return null

  const handleDismiss = async (jobId) => {
    if (!user?.uid || dismissing[jobId]) return
    setDismissing((prev) => ({ ...prev, [jobId]: true }))
    try {
      await dismissGenerationJob(user.uid, jobId)
    } finally {
      setDismissing((prev) => ({ ...prev, [jobId]: false }))
    }
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-[90] max-w-sm space-y-2"
      role="status"
      aria-live="polite"
    >
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
                className="shrink-0 rounded-lg p-1 text-cp-muted transition hover:bg-cp-surface hover:text-cp-text disabled:opacity-50"
                title="Cancelar geração"
                aria-label="Cancelar geração"
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
