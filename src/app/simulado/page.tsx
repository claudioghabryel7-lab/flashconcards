'use client'

import LegacyPage from '@/components/next/LegacyPage'
import SimuladoPageComponent from '@/routes/Simulado'

export default function SimuladoPage() {
  return (
    <LegacyPage
      component={SimuladoPageComponent}
      requireCourseSelection
    />
  )
}
