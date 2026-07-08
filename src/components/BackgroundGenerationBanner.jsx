import { useBackgroundGeneration } from '../hooks/useBackgroundGeneration'

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
  admin_batch: 'Geração em lote',
}

export default function BackgroundGenerationBanner() {
  const { jobs } = useBackgroundGeneration()
  if (!jobs.length) return null

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
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
            <p className="text-sm font-medium text-cp-text">
              {JOB_LABELS[job.jobType] || 'Geração com IA'}
            </p>
          </div>
          <p className="mt-1 text-xs text-cp-muted">
            {job.message || 'Gerando em segundo plano…'}
            {typeof job.progress === 'number' && job.progress > 0 ? ` (${job.progress}%)` : ''}
          </p>
          <p className="mt-1 text-[10px] text-cp-muted/80">
            Você pode sair desta tela — a geração continua.
          </p>
        </div>
      ))}
    </div>
  )
}
