'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Calendário removido do dashboard — redireciona para o dashboard */
export default function CalendarioPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard')
  }, [router])
  return null
}
