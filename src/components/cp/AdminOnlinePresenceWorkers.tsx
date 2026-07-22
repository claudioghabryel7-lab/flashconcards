'use client'

/**
 * Workers de presença: enquanto QUALQUER usuário autenticado está online
 * (aba visível), o Professor IA e o Guia Mentorado avançam automaticamente.
 * Alunos não veem controles — só o indicador "Professor online".
 */
import { useAuth } from '@/hooks/useAuth'
import { useAdminOnlineWorkers } from '@/hooks/useAdminOnlineWorkers'

export default function AdminOnlinePresenceWorkers() {
  const { user, isAdmin } = useAuth()
  const loggedIn = Boolean(user?.uid)

  useAdminOnlineWorkers({
    enabled: loggedIn,
    professor: true,
    mentorado: true,
    // Automação global de conteúdo (revisão/níveis) só no admin
    content: Boolean(isAdmin),
    // Redação semanal (tema + notificação) só no admin
    allowRedacaoWeekly: Boolean(isAdmin),
  })

  return null
}
