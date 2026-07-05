'use client'

import LegacyPage from '@/components/next/LegacyPage'
import MateriaRevisadaPageComponent from '@/routes/MateriaRevisada'

export default function MateriaRevisadaPage() {
  return (
    <LegacyPage
      component={MateriaRevisadaPageComponent}
      requireCourseSelection
    />
  )
}
