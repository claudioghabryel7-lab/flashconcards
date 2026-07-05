'use client'

import LegacyPage from '@/components/next/LegacyPage'
import DashboardPageComponent from '@/routes/Dashboard'

export default function DashboardPage() {
  return (
    <LegacyPage
      component={DashboardPageComponent}
      requireCourseSelection
    />
  )
}
