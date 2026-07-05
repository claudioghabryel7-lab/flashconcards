'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Calendário integrado ao Dashboard — redireciona para #progresso */
export default function CalendarioPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard#progresso')
  }, [router])
  return null
}
