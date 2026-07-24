import { useEffect, useRef } from 'react'
import { useAuth } from './useAuth'
import { tickMentoradoDailyOnline } from '../services/adminOnlineMentoradoScheduler'
import { tickProfessorOnline } from '../services/adminOnlineProfessorScheduler'
import { tickContentAutomationOnline } from '../services/contentAutomationScheduler'

const MENTORADO_MS = 60 * 1000
const PROFESSOR_MS = 45 * 1000
const CONTENT_MS = 60 * 1000

/**
 * Enquanto QUALQUER usuário autenticado estiver com a aba aberta e visível,
 * o Professor IA fiscaliza a Moderação e o Mentorado faz catch-up.
 * A automação de conteúdo (revisão / incidência / níveis) fica só no admin.
 */
export function useAdminOnlineWorkers({
  enabled = true,
  professor = true,
  mentorado = true,
  content = true,
  /** Só admin: rotação semanal de redação + notificar alunos */
  allowRedacaoWeekly = false,
} = {}) {
  const { user } = useAuth()
  const mentoradoBusy = useRef(false)
  const professorBusy = useRef(false)
  const contentBusy = useRef(false)

  useEffect(() => {
    if (!enabled || !user?.uid) return undefined

    const runMentorado = async () => {
      if (!mentorado || mentoradoBusy.current || document.hidden) return
      mentoradoBusy.current = true
      try {
        const result = await tickMentoradoDailyOnline(user.uid, { allowRedacaoWeekly })
        if (result?.results?.some((r) => r.started)) {
          console.info('[onlineWorkers] Mentorado catch-up:', result)
        }
      } catch (err) {
        console.warn('[onlineWorkers] Mentorado:', err?.message || err)
      } finally {
        mentoradoBusy.current = false
      }
    }

    const runProfessor = async () => {
      if (!professor || professorBusy.current || document.hidden) return
      professorBusy.current = true
      try {
        const result = await tickProfessorOnline(user.uid, { allowRedacaoWeekly })
        if (result?.started) {
          console.info('[onlineWorkers] Professor tick:', result)
        }
      } catch (err) {
        console.warn('[onlineWorkers] Professor:', err?.message || err)
      } finally {
        professorBusy.current = false
      }
    }

    const runContent = async () => {
      if (!content || contentBusy.current || document.hidden) return
      contentBusy.current = true
      try {
        const result = await tickContentAutomationOnline(user.uid)
        if (result?.started) {
          console.info('[onlineWorkers] Content automation:', result)
        }
      } catch (err) {
        console.warn('[onlineWorkers] Content automation:', err?.message || err)
      } finally {
        contentBusy.current = false
      }
    }

    if (professor) runProfessor()
    if (mentorado) runMentorado()
    if (content) runContent()

    const timers = []
    if (mentorado) timers.push(window.setInterval(runMentorado, MENTORADO_MS))
    if (professor) timers.push(window.setInterval(runProfessor, PROFESSOR_MS))
    if (content) timers.push(window.setInterval(runContent, CONTENT_MS))

    const onVisible = () => {
      if (document.hidden) return
      if (professor) runProfessor()
      if (mentorado) runMentorado()
      if (content) runContent()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      timers.forEach((t) => window.clearInterval(t))
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [enabled, user?.uid, professor, mentorado, content, allowRedacaoWeekly])
}
