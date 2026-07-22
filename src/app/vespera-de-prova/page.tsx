'use client'

import LegacyPage from '@/components/next/LegacyPage'
import VesperaPageComponent from '@/routes/VesperaDeProva'

export default function VesperaPage() {
  return <LegacyPage component={VesperaPageComponent} requireCourseSelection />
}
