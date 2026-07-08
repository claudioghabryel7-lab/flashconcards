'use client'

import LegacyPage from '@/components/next/LegacyPage'
import ResolverQuestoesView from '@/routes/ResolverQuestoesView'

export default function ResolverQuestoesPage() {
  return (
    <LegacyPage
      component={ResolverQuestoesView}
      requireCourseSelection
    />
  )
}
