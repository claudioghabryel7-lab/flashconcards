'use client'

import LegacyPage from '@/components/next/LegacyPage'
import ResolverQuestoesView from '@/routes/ResolverQuestoesView'

export default function ResolverQuestoesPracticePage() {
  return (
    <LegacyPage
      component={ResolverQuestoesView}
      requireCourseSelection
      skipAutoHeader
    />
  )
}
