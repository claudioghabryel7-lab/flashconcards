'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Clock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  computeElapsedSeconds,
  formatDuration,
  loadTrilhaTimer,
  timerStorageKey,
} from '@/utils/trilhaTimerPersistence'

export default function TrilhaTimerBanner() {
  const { user } = useAuth()
  const pathname = usePathname() || ''
  const [timer, setTimer] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!user?.uid) {
      setTimer(null)
      setElapsed(0)
      return undefined
    }

    const refresh = () => {
      const saved = loadTrilhaTimer(user.uid)
      setTimer(saved)
      setElapsed(saved ? computeElapsedSeconds(saved) : 0)
    }

    refresh()
    const id = setInterval(refresh, 1000)
    const onStorage = (event) => {
      if (event.key === timerStorageKey(user.uid)) refresh()
    }
    const onVisible = () => refresh()

    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(id)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user?.uid])

  if (!timer?.active || pathname.startsWith('/trilha')) return null

  const label = timer.paused ? 'Pausado' : 'Estudo em andamento'
  const materia = timer.timerForm?.materia?.trim()

  return (
    <Link
      href="/trilha"
      className="fixed bottom-20 right-4 z-40 flex max-w-[min(100%-2rem,280px)] items-center gap-2.5 rounded-2xl border border-cp-accent/30 bg-cp-bg/95 px-4 py-3 shadow-xl backdrop-blur-md transition hover:border-cp-accent/50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cp-accent/15 text-cp-accent">
        <Clock className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-cp-muted">{label}</span>
        <span className="block font-mono text-sm font-semibold text-cp-text">
          {formatDuration(elapsed)}
          {materia ? ` · ${materia}` : ''}
        </span>
      </span>
    </Link>
  )
}
