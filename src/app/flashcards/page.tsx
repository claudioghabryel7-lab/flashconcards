'use client'

import LegacyPage from '@/components/next/LegacyPage'
import FlashcardsPageComponent from '@/routes/FlashcardView'

export default function FlashcardsPage() {
  return (
    <LegacyPage
      component={FlashcardsPageComponent}
      requireCourseSelection
      skipAutoHeader
    />
  )
}
