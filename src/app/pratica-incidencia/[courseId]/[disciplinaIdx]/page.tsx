'use client'

import LegacyPage from '@/components/next/LegacyPage'
import PraticaIncidenciaPageComponent from '@/routes/PraticaIncidenciaView'

export default function PraticaIncidenciaPage() {
  return (
    <LegacyPage
      component={PraticaIncidenciaPageComponent}
      requireCourseSelection
    />
  )
}
