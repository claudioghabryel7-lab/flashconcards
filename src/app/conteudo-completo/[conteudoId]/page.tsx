'use client'

import LegacyPage from '@/components/next/LegacyPage'
import ConteudoCompletoViewPageComponent from '@/routes/ConteudoCompletoView'

export default function ConteudoCompletoViewPage() {
  return (
    <LegacyPage
      component={ConteudoCompletoViewPageComponent}
      requireCourseSelection
    />
  )
}
