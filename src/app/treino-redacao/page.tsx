'use client'

import LegacyPage from '@/components/next/LegacyPage'
import TreinoRedacaoPageComponent from '@/routes/TreinoRedacao'

export default function TreinoRedacaoPage() {
  return (
    <LegacyPage
      component={TreinoRedacaoPageComponent}
      requireCourseSelection
    />
  )
}
