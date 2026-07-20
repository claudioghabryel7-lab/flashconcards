import { useEffect, useRef } from 'react'
import { useAuth } from './useAuth'
import { tickMentoradoDailyOnline } from '../services/adminOnlineMentoradoScheduler'
import { tickProfessorOnline } from '../services/adminOnlineProfessorScheduler'

const MENTORADO_MS = 60 * 1000
const PROFESSOR_MS = 45 * 1000

/**
 * Enquanto QUALQUER aba do admin estiver aberta e visível no site,
 * o Professor IA fiscaliza a Moderação e (opcional) o Mentorado faz catch-up.
 * Não exige abrir o painel Admin / configurações.
 */
export function useAdminOnlineWorkers({
  enabled = true,
  professor = true,
  mentorado = true,
} = {}) {
  const { user, isAdmin } = useAuth()
  const mentoradoBusy = useRef(false)
  const professorBusy = useRef(false)

  useEffect(() => {
    if (!enabled || !isAdmin || !user?.uid) return undefined

    const runMentorado = async () => {
      if (!mentorado || mentoradoBusy.current || document.hidden) return
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
      if (!professor || professorBusy.current || document.hidden) return
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

    // Imediato ao ficar online em qualquer página
    if (professor) runProfessor()
    if (mentorado) runMentorado()

    const timers = []
    if (mentorado) timers.push(window.setInterval(runMentorado, MENTORADO_MS))
    if (professor) timers.push(window.setInterval(runProfessor, PROFESSOR_MS))

    const onVisible = () => {
      if (document.hidden) return
      if (professor) runProfessor()
      if (mentorado) runMentorado()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      timers.forEach((t) => window.clearInterval(t))
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [enabled, isAdmin, user?.uid, professor, mentorado])
}
