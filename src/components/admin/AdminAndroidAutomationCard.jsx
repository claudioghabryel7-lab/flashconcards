import { RocketLaunchIcon, SparklesIcon } from '@heroicons/react/24/outline'

/**
 * Card 1-clique: geração automática no próprio navegador (Gemini + Google Search).
 * Não depende de app Android, extensão nem colar texto.
 */
export default function AdminAndroidAutomationCard({
  courseId,
  courseName = '',
  busy = false,
  onAutomateToday,
}) {
  return (
    <div className="cp-card space-y-4 !rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
            <SparklesIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-cp-text">Geração automática</h3>
            <p className="mt-1 max-w-2xl text-sm text-cp-muted">
              Um clique no Chrome (PC ou Android): Gemini pesquisa na web e gera material,
              questões e flashcards de hoje
              {courseName ? ` em “${courseName}”` : ''}. Sem app, sem extensão e sem colar texto.
            </p>
          </div>
        </div>
        <span className="inline-flex rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
          Automático
        </span>
      </div>

      <button
        type="button"
        disabled={busy || !courseId}
        onClick={() => onAutomateToday?.()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        <RocketLaunchIcon className={`h-5 w-5 ${busy ? 'animate-pulse' : ''}`} />
        {busy ? 'Gerando automaticamente…' : 'Gerar hoje automaticamente'}
      </button>
    </div>
  )
}
