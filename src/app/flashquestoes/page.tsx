'use client'

import LegacyPage from '@/components/next/LegacyPage'
import FlashQuestoesPageComponent from '@/routes/FlashQuestoes'

export default function FlashQuestoesPage() {
  return (
    <LegacyPage
      component={FlashQuestoesPageComponent}
      requireCourseSelection
    />
  )
}
