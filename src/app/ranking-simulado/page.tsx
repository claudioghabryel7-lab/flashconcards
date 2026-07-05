'use client'

import LegacyPage from '@/components/next/LegacyPage'
import RankingPageComponent from '@/routes/RankingSimulado'

export default function RankingPage() {
  return (
    <LegacyPage
      component={RankingPageComponent}
      requireCourseSelection
    />
  )
}
