'use client'

import LegacyPage from '@/components/next/LegacyPage'
import QuestoesTopicoPageComponent from '@/routes/QuestoesTopicoView'

export default function QuestoesTopicoPage() {
  return (
    <LegacyPage
      component={QuestoesTopicoPageComponent}
      requireCourseSelection
    />
  )
}
