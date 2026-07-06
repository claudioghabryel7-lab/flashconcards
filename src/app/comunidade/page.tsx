'use client'

import LegacyPage from '@/components/next/LegacyPage'
import ComunidadeTrilha from '@/routes/ComunidadeTrilha'

export default function ComunidadePage() {
  return <LegacyPage component={ComunidadeTrilha} requireCourseSelection skipAutoHeader />
}
