'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ComunidadePublicacaoRedirect() {
  const { postId } = useParams()
  const router = useRouter()

  useEffect(() => {
    if (postId) router.replace(`/comunidade?post=${postId}`)
  }, [postId, router])

  return null
}
