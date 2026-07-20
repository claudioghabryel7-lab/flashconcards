import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AcademicCapIcon, XMarkIcon } from '@heroicons/react/24/outline'

/**
 * Banner da explicação do Professor IA ao abrir deep-link de sinalização.
 * Lê ?professorNote=&focusContentId=&flagId=
 */
export default function ProfessorFlagNoteBanner({ className = '' }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const note = searchParams.get('professorNote') || ''
  const focusId = searchParams.get('focusContentId') || ''
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setDismissed(false)
  }, [note, focusId])

  if (!note || dismissed) return null

  const clearParams = () => {
    setDismissed(true)
    const next = new URLSearchParams(searchParams)
    next.delete('professorNote')
    // mantém focusContentId para o scroll; remove só a nota se quiser
    setSearchParams(next, { replace: true })
  }

  return (
    <div
      className={`mb-4 rounded-2xl border border-cp-accent/30 bg-cp-accent/10 p-4 ${className}`}
      role="status"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cp-accent/30 bg-cp-accent/15 text-cp-accent">
          <AcademicCapIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-wider text-cp-accent">
            Professor IA · resposta à sua sinalização
          </p>
          <p className="mt-1 text-sm leading-relaxed text-cp-text whitespace-pre-wrap">{note}</p>
          {focusId ? (
            <p className="mt-2 font-mono text-[10px] text-cp-muted truncate">
              Conteúdo: {focusId}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={clearParams}
          className="rounded-full p-1 text-cp-muted hover:bg-cp-surface hover:text-cp-text"
          aria-label="Fechar"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

/** Utilitário: foca elemento com data-content-id ou id */
export function scrollToFocusedContent(contentId) {
  if (!contentId || typeof document === 'undefined') return
  const raw = String(contentId)
  const short = raw.replace(/^.*_fc_/, '').replace(/^.*\//, '')
  const el =
    document.querySelector(`[data-content-id="${CSS.escape(raw)}"]`) ||
    document.querySelector(`[data-content-id="${CSS.escape(short)}"]`) ||
    document.getElementById(raw) ||
    document.getElementById(short)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('ring-2', 'ring-cp-accent', 'ring-offset-2')
    setTimeout(() => el.classList.remove('ring-2', 'ring-cp-accent', 'ring-offset-2'), 3500)
  }
}
