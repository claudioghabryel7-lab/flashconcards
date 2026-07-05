'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CursoFeatureRedirect({ target }: { target: string }) {
  const router = useRouter()

  useEffect(() => {
    router.replace(target)
  }, [router, target])

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
    </div>
  )
}
