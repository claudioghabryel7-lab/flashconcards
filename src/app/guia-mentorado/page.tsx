'use client'

import LegacyPage from '@/components/next/LegacyPage'
import GuiaMentoradoPageComponent from '@/routes/GuiaMentorado'

export default function GuiaMentoradoPage() {
  return (
    <LegacyPage
      component={GuiaMentoradoPageComponent}
      requireCourseSelection
      skipAutoHeader
    />
  )
}
