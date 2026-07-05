'use client'

import LegacyPage from '@/components/next/LegacyPage'
import GuiaMentoradoDiaPageComponent from '@/routes/GuiaMentoradoDiaView'

export default function GuiaMentoradoDiaPage() {
  return (
    <LegacyPage
      component={GuiaMentoradoDiaPageComponent}
      requireCourseSelection
    />
  )
}
