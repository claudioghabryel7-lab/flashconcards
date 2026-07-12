'use client'

import LegacyPage from '@/components/next/LegacyPage'
import ResolverMaterialView from '@/routes/ResolverMaterialView'

export default function ResolverMaterialPage() {
  return (
    <LegacyPage
      component={ResolverMaterialView}
      requireCourseSelection
    />
  )
}
