'use client'

import LegacyPage from '@/components/next/LegacyPage'
import ConteudoCompletoPageComponent from '@/routes/ConteudoCompleto'

export default function ConteudoCompletoPage() {
  return (
    <LegacyPage
      component={ConteudoCompletoPageComponent}
      requireCourseSelection
    />
  )
}
