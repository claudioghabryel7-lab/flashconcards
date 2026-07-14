'use client'

import LegacyPage from '@/components/next/LegacyPage'
import ResolverIncidenciaView from '@/routes/ResolverIncidenciaView'

export default function ResolverIncidenciaPage() {
  return (
    <LegacyPage
      component={ResolverIncidenciaView}
      requireCourseSelection
    />
  )
}
