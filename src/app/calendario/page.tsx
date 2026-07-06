'use client'

import LegacyPage from '@/components/next/LegacyPage'
import CalendarioProgressoPageComponent from '@/routes/CalendarioProgresso'

export default function CalendarioPage() {
  return (
    <LegacyPage
      component={CalendarioProgressoPageComponent}
      requireCourseSelection
    />
  )
}
