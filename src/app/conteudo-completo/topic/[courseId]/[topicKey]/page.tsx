'use client'

import LegacyPage from '@/components/next/LegacyPage'
import ConteudoTopicoPageComponent from '@/routes/ConteudoCompletoTopicoView'

export default function ConteudoTopicoPage() {
  return (
    <LegacyPage
      component={ConteudoTopicoPageComponent}
      requireCourseSelection
    />
  )
}
