'use client'

/**
 * Workers do admin em qualquer página do app (não só no painel Admin).
 * Professor IA: corrige Moderação automaticamente enquanto o admin estiver online.
 */
import { useAdminOnlineWorkers } from '@/hooks/useAdminOnlineWorkers'
import { useAuth } from '@/hooks/useAuth'

export default function AdminOnlinePresenceWorkers() {
  const { isAdmin } = useAuth()
  useAdminOnlineWorkers({
    enabled: Boolean(isAdmin),
    professor: true,
    mentorado: true,
  })
  return null
}
