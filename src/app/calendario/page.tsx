'use client'

import LegacyPage from '@/components/next/LegacyPage'
import CalendarioPageComponent from '@/routes/CalendarioProgresso'

export default function CalendarioPage() {
  return (
    <LegacyPage
      component={CalendarioPageComponent}
      requireCourseSelection
    />
  )
}
