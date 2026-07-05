'use client'

import LegacyPage from '@/components/next/LegacyPage'
import FlashcardsTopicoPageComponent from '@/routes/FlashcardsTopicoView'

export default function FlashcardsTopicoPage() {
  return (
    <LegacyPage
      component={FlashcardsTopicoPageComponent}
      requireCourseSelection
    />
  )
}
