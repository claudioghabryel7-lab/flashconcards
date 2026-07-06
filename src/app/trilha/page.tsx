'use client'

import LegacyPage from '@/components/next/LegacyPage'
import TrilhaPageComponent from '@/routes/Trilha'

export default function TrilhaPage() {
  return <LegacyPage component={TrilhaPageComponent} requireCourseSelection skipAutoHeader />
}
