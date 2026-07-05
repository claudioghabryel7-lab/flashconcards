'use client'

import LegacyPage from '@/components/next/LegacyPage'
import ConteudoIncidenciaPageComponent from '@/routes/ConteudoIncidenciaView'

export default function ConteudoIncidenciaPage() {
  return (
    <LegacyPage
      component={ConteudoIncidenciaPageComponent}
      requireCourseSelection
    />
  )
}
