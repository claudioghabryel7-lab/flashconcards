'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ProfileRedirectPage() {
  const { userId } = useParams()
  const router = useRouter()

  useEffect(() => {
    if (userId) router.replace(`/comunidade/perfil/${userId}`)
  }, [userId, router])

  return null
}
