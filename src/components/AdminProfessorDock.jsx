'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AcademicCapIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FlagIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '@/hooks/useAuth'
import { subscribeActiveFlags } from '@/services/contentFeedbackService'
import { subscribeProfessorSupervisorConfig } from '@/services/professorSupervisorService'
import { forceProcessModerationNow } from '@/services/adminOnlineProfessorScheduler'
import { useBackgroundGeneration } from '@/hooks/useBackgroundGeneration'

const DOCK_KEY = 'fcc:adminProfessorDock'
/** open = painel expandido | mini = chip | closed = só FAB discreto */
const MODES = { open: 'open', mini: 'mini', closed: 'closed' }

function loadMode() {
  if (typeof window === 'undefined') return MODES.mini
  try {
    const v = localStorage.getItem(DOCK_KEY)
    if (v === MODES.open || v === MODES.mini || v === MODES.closed) return v
  } catch {
    /* ignore */
  }
  return MODES.mini
}

function saveMode(mode) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DOCK_KEY, mode)
  } catch {
    /* ignore */
  }
}

/**
 * Painel flutuante do Professor IA — só admin, em qualquer página do site.
 * Fica aberto/minimizado até o admin fechar (persistido no localStorage).
 */
export default function AdminProfessorDock() {
  const { user, isAdmin } = useAuth()
  const { jobs } = useBackgroundGeneration()
  const [mode, setMode] = useState(loadMode)
  const [flags, setFlags] = useState([])
  const [config, setConfig] = useState(null)
  const [forcing, setForcing] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const professorJobs = (jobs || []).filter((j) => j.jobType === 'professor_supervisor')
  const openCount = flags.filter((f) => f.status === 'open').length
  const reviewCount = flags.filter((f) => f.status === 'in_review').length
  const needsAdminCount = flags.filter((f) => f.status === 'needs_admin').length
  const totalActive = flags.length

  useEffect(() => {
    if (!isAdmin) return undefined
    return subscribeActiveFlags(
      (rows) => setFlags(Array.isArray(rows) ? rows : []),
      () => setFlags([]),
    )
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return undefined
    return subscribeProfessorSupervisorConfig(
      (data) => setConfig(data || {}),
      () => setConfig({}),
    )
  }, [isAdmin])

  useEffect(() => {
    if (!feedback) return undefined
    const t = setTimeout(() => setFeedback(null), 4500)
    return () => clearTimeout(t)
  }, [feedback])

  if (!isAdmin || !user?.uid) return null

  const setDockMode = (next) => {
    setMode(next)
    saveMode(next)
  }

  const handleForce = async () => {
    if (forcing || !user?.uid) return
    setForcing(true)
    setFeedback(null)
    try {
      const result = await forceProcessModerationNow(user.uid)
      if (result?.skipped && result.reason === 'empty') {
        setFeedback({ type: 'ok', text: 'Nenhuma sinalização aberta.' })
      } else if (result?.started) {
        setFeedback({ type: 'ok', text: 'Correção iniciada — acompanhe aqui ou no banner de jobs.' })
        setDockMode(MODES.open)
      } else {
        setFeedback({ type: 'ok', text: result?.reason || 'Tick concluído.' })
      }
    } catch (err) {
      setFeedback({ type: 'err', text: err?.message || 'Falha ao acionar Professor IA.' })
    } finally {
      setForcing(false)
    }
  }

  const activityMsg =
    config?.currentActivity?.message ||
    config?.lastMessage ||
    (totalActive > 0
      ? `${totalActive} sinalização(ões) na fila`
      : 'Admin online — Moderação em espera')

  const runningLabel = professorJobs[0]?.message || null

  // Fechado: FAB discreto para reabrir
  if (mode === MODES.closed) {
    return (
      <div className="fixed bottom-4 left-4 z-[91]">
        <button
          type="button"
          onClick={() => setDockMode(MODES.open)}
          className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-violet-500/40 bg-cp-surface/95 text-violet-600 shadow-lg backdrop-blur-sm transition hover:border-violet-500/70 hover:bg-violet-500/10 dark:text-violet-300"
          title="Abrir Professor IA"
          aria-label="Abrir Professor IA"
        >
          <AcademicCapIcon className="h-6 w-6" />
          {totalActive > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white">
              {totalActive > 9 ? '9+' : totalActive}
            </span>
          )}
        </button>
      </div>
    )
  }

  // Minimizado: chip estilo jobs
  if (mode === MODES.mini) {
    return (
      <div className="fixed bottom-4 left-4 z-[91] flex flex-col items-start gap-2">
        {feedback && (
          <p
            className={`max-w-xs rounded-lg px-3 py-2 text-xs shadow-lg ${
              feedback.type === 'err'
                ? 'bg-red-500/15 text-red-700 dark:text-red-200'
                : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
            }`}
          >
            {feedback.text}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDockMode(MODES.open)}
            className="inline-flex items-center gap-2 rounded-full border border-violet-500/35 bg-cp-surface/95 px-4 py-2 text-xs font-semibold text-cp-text shadow-lg backdrop-blur-sm transition hover:border-violet-500/55"
            title="Expandir Professor IA"
          >
            <span className="relative flex h-2 w-2">
              {(professorJobs.length > 0 || reviewCount > 0) && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-75" />
              )}
              <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
            </span>
            Professor IA
            {totalActive > 0 ? ` · ${totalActive}` : ''}
            <ChevronUpIcon className="h-4 w-4 text-cp-muted" />
          </button>
          <button
            type="button"
            onClick={() => setDockMode(MODES.closed)}
            className="rounded-full border border-cp-border bg-cp-surface/90 p-2 text-cp-muted shadow-lg hover:text-cp-text"
            title="Fechar painel"
            aria-label="Fechar"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  // Expandido
  return (
    <div className="fixed bottom-4 left-4 z-[91] w-[min(100vw-2rem,22rem)] space-y-2">
      {feedback && (
        <p
          className={`rounded-lg px-3 py-2 text-xs shadow-lg ${
            feedback.type === 'err'
              ? 'bg-red-500/15 text-red-700 dark:text-red-200'
              : 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
          }`}
        >
          {feedback.text}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-violet-500/30 bg-cp-surface/95 shadow-2xl backdrop-blur-md">
        <div className="flex items-start justify-between gap-2 border-b border-cp-border/80 bg-violet-500/10 px-3 py-2.5">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-wide text-violet-600 dark:text-violet-300">
              Admin · site-wide
            </p>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-cp-text">
              <AcademicCapIcon className="h-4 w-4 shrink-0 text-violet-500" />
              Professor IA
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setDockMode(MODES.mini)}
              className="rounded-lg p-1.5 text-cp-muted hover:bg-cp-bg hover:text-cp-text"
              title="Minimizar"
              aria-label="Minimizar"
            >
              <ChevronDownIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDockMode(MODES.closed)}
              className="rounded-lg p-1.5 text-cp-muted hover:bg-cp-bg hover:text-cp-text"
              title="Fechar (fica só o botão)"
              aria-label="Fechar"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-3 px-3 py-3">
          <p className="text-xs leading-relaxed text-cp-muted">
            {runningLabel || activityMsg}
          </p>

          <div className="flex flex-wrap gap-1.5 text-[10px] font-medium">
            <span className="inline-flex items-center gap-1 rounded-full border border-cp-border bg-cp-bg/60 px-2 py-0.5 text-cp-text">
              <FlagIcon className="h-3 w-3 text-amber-500" />
              {openCount} aberta{openCount !== 1 ? 's' : ''}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-violet-700 dark:text-violet-300">
              {reviewCount} em revisão
            </span>
            {needsAdminCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-600 dark:text-red-300">
                {needsAdminCount} precisa admin
              </span>
            )}
          </div>

          {flags.slice(0, 3).map((f) => (
            <div
              key={`${f.courseId}_${f.id}`}
              className="rounded-lg border border-cp-border/70 bg-cp-bg/40 px-2.5 py-2"
            >
              <p className="font-mono text-[9px] uppercase tracking-wide text-cp-muted">
                {f.contentType || 'conteúdo'} · {f.status}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-cp-text">
                {f.preview || f.text || f.contentId || 'Sem preview'}
              </p>
            </div>
          ))}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleForce}
              disabled={forcing}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
            >
              <ArrowPathIcon className={`h-3.5 w-3.5 ${forcing ? 'animate-spin' : ''}`} />
              {forcing ? 'Iniciando…' : 'Corrigir próxima agora'}
            </button>
            <Link
              href="/admin"
              className="text-center text-[11px] font-medium text-violet-600 hover:underline dark:text-violet-300"
            >
              Abrir painel Admin / Moderação
            </Link>
            <p className="text-[10px] leading-snug text-cp-muted">
              Mantém esta aba aberta. O Professor corrige sozinho a cada ~45s enquanto você estiver
              online — não precisa ficar no /admin.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
