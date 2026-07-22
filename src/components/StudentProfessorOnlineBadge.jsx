'use client'

import { useEffect, useState } from 'react'
import { AcademicCapIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/hooks/useAuth'

/**
 * Indicador flutuante só para alunos: "Professor online".
 * Sem controles — a automação (Professor + Guia Mentorado implícito)
 * roda em segundo plano via OnlinePresenceWorkers enquanto o aluno está no site.
 * Admin continua usando o AdminProfessorDock completo.
 */
export default function StudentProfessorOnlineBadge() {
  const { user, isAdmin } = useAuth()
  const [tabVisible, setTabVisible] = useState(true)

  useEffect(() => {
    if (!user?.uid || isAdmin) return undefined
    const sync = () => setTabVisible(typeof document === 'undefined' ? true : !document.hidden)
    sync()
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    window.addEventListener('blur', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
      window.removeEventListener('blur', sync)
    }
  }, [user?.uid, isAdmin])

  if (!user?.uid || isAdmin) return null

  const isLive = tabVisible

  return (
    <div className="cp-fixed-bl fixed z-[90] flex flex-col items-start gap-2 pointer-events-none">
      <div
        className={`pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold shadow-lg backdrop-blur-sm ${
          isLive
            ? 'border-emerald-500/40 bg-cp-surface/95 text-emerald-700 dark:text-emerald-300'
            : 'border-cp-border bg-cp-surface/95 text-cp-muted'
        }`}
        title={
          isLive
            ? 'Professor IA online — correções automáticas ativas'
            : 'Professor IA pausado (aba em segundo plano)'
        }
        aria-live="polite"
      >
        <span className="relative flex h-2 w-2 shrink-0">
          {isLive ? (
            <>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </>
          ) : (
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cp-muted/50" />
          )}
        </span>
        <AcademicCapIcon className="h-4 w-4 shrink-0" />
        <span className="whitespace-nowrap">
          {isLive ? 'Professor online' : 'Professor offline'}
        </span>
      </div>
    </div>
  )
}
