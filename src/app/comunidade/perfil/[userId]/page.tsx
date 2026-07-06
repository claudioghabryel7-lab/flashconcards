'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ComunidadePerfilRedirect() {
  const { userId } = useParams()
  const router = useRouter()

  useEffect(() => {
    if (userId) router.replace(`/profile/${userId}`)
  }, [userId, router])

  return null
}
