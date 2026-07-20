'use client'

import LegacyPage from '@/components/next/LegacyPage'
import MateriasDeHojePageComponent from '@/routes/MateriasDeHoje'

export default function MateriasDeHojePage() {
  return (
    <LegacyPage
      component={MateriasDeHojePageComponent}
      requireCourseSelection
      skipAutoHeader
    />
  )
}
