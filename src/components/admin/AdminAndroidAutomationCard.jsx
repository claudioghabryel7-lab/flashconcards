import { Link } from 'react-router-dom'
import { RocketLaunchIcon, SparklesIcon } from '@heroicons/react/24/outline'

/**
 * Card 1-clique + link para o app interno /admin/modo-ia
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
            <h3 className="text-base font-bold text-cp-text">App Modo IA (interno)</h3>
            <p className="mt-1 max-w-2xl text-sm text-cp-muted">
              Rota só de admin, sem baixar nada: consulta o Google pelo seu navegador, monta o
              dossiê e gera material/questões/flashcards
              {courseName ? ` de “${courseName}”` : ''}.
            </p>
          </div>
        </div>
        <span className="inline-flex rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
          /admin/modo-ia
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !courseId}
          onClick={() => onAutomateToday?.()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RocketLaunchIcon className={`h-5 w-5 ${busy ? 'animate-pulse' : ''}`} />
          {busy ? 'Gerando…' : 'Gerar hoje automaticamente'}
        </button>
        <Link
          to="/admin/modo-ia"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-cp-border bg-cp-surface px-4 py-3 text-sm font-semibold text-cp-text transition hover:border-emerald-500/40"
        >
          Abrir app Modo IA
        </Link>
      </div>
    </div>
  )
}
