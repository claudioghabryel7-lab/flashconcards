'use client'

import LegacyPage from '@/components/next/LegacyPage'
import AdminPageComponent from '@/routes/AdminPanel'

export default function AdminPage() {
  return (
    <LegacyPage
      component={AdminPageComponent}
      adminOnly
      skipAutoHeader
    />
  )
}
