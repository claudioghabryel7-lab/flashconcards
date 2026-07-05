'use client'

import LegacyPage from '@/components/next/LegacyPage'
import FlashcardPIPPageComponent from '@/routes/FlashcardPIP'

export default function FlashcardPIPPage() {
  return (
    <LegacyPage
      component={FlashcardPIPPageComponent}
      requireCourseSelection
    />
  )
}
