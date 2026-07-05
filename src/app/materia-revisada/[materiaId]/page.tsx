'use client'

import LegacyPage from '@/components/next/LegacyPage'
import MateriaRevisadaViewPageComponent from '@/routes/MateriaRevisadaView'

export default function MateriaRevisadaViewPage() {
  return (
    <LegacyPage
      component={MateriaRevisadaViewPageComponent}
      requireCourseSelection
    />
  )
}
