'use client'

import LegacyPage from '@/components/next/LegacyPage'
import MentoriaPageComponent from '@/routes/Mentoria'

export default function MentoriaPage() {
  return (
    <LegacyPage
      component={MentoriaPageComponent}
      requireCourseSelection
    />
  )
}
