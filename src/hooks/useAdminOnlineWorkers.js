import { useEffect, useRef } from 'react'
import { useAuth } from './useAuth'
import { tickMentoradoDailyOnline } from '../services/adminOnlineMentoradoScheduler'
import { tickProfessorOnline } from '../services/adminOnlineProfessorScheduler'

const MENTORADO_MS = 60 * 1000
const PROFESSOR_MS = 90 * 1000

/**
 * Enquanto o admin está com o painel aberto (aba visível),
 * roda os ticks locais do Guia Mentorado e do Professor IA.
 */
export function useAdminOnlineWorkers(enabled = true) {
  const { user, isAdmin } = useAuth()
  const mentoradoBusy = useRef(false)
  const professorBusy = useRef(false)

  useEffect(() => {
    if (!enabled || !isAdmin || !user?.uid) return undefined

    const runMentorado = async () => {
      if (mentoradoBusy.current || document.hidden) return
      mentoradoBusy.current = true
      try {
        const result = await tickMentoradoDailyOnline(user.uid)
        if (result?.results?.some((r) => r.started)) {
          console.info('[adminOnline] Mentorado catch-up:', result)
        }
      } catch (err) {
        console.warn('[adminOnline] Mentorado:', err?.message || err)
      } finally {
        mentoradoBusy.current = false
      }
    }

    const runProfessor = async () => {
      if (professorBusy.current || document.hidden) return
      professorBusy.current = true
      try {
        const result = await tickProfessorOnline(user.uid)
        if (result?.started) {
          console.info('[adminOnline] Professor tick:', result)
        }
      } catch (err) {
        console.warn('[adminOnline] Professor:', err?.message || err)
      } finally {
        professorBusy.current = false
      }
    }

    // Catch-up imediato ao abrir o admin
    runMentorado()
    runProfessor()

    const t1 = window.setInterval(runMentorado, MENTORADO_MS)
    const t2 = window.setInterval(runProfessor, PROFESSOR_MS)

    const onVisible = () => {
      if (!document.hidden) {
        runMentorado()
        runProfessor()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(t1)
      window.clearInterval(t2)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, isAdmin, user?.uid])
}
