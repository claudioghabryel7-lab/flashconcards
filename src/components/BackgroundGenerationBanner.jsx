import { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useBackgroundGeneration } from '../hooks/useBackgroundGeneration'
import { useAuth } from '../hooks/useAuth'
import { dismissGenerationJob } from '../services/generationJobService'

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
      {jobs.map((job) => (
        <div
          key={job.id}
          className="rounded-xl border border-cp-accent/30 bg-cp-surface/95 px-4 py-3 shadow-lg backdrop-blur-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
              <p className="text-sm font-medium text-cp-text">
                {JOB_LABELS[job.jobType] || 'Geração com IA'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleDismiss(job.id)}
              disabled={dismissing[job.id]}
              className="shrink-0 rounded-lg p-1 text-cp-muted transition hover:bg-cp-surface hover:text-cp-text disabled:opacity-50"
              title="Dispensar aviso"
              aria-label="Dispensar"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-xs text-cp-muted">
            {job.message || 'Gerando em segundo plano…'}
            {typeof job.progress === 'number' && job.progress > 0 ? ` (${job.progress}%)` : ''}
          </p>
          <p className="mt-1 text-[10px] text-cp-muted/80">
            Você pode sair desta tela — a geração continua enquanto o app estiver aberto.
          </p>
        </div>
      ))}
    </div>
  )
}
