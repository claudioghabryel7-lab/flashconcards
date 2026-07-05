'use client'

import LegacyPage from '@/components/next/LegacyPage'
import EditalPageComponent from '@/routes/EditalVerticalizado'

export default function EditalPage() {
  return (
    <LegacyPage
      component={EditalPageComponent}
      requireCourseSelection
    />
  )
}
