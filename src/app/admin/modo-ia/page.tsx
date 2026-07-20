'use client'

import LegacyPage from '@/components/next/LegacyPage'
import AdminModoIaApp from '@/routes/AdminModoIaApp'

export default function AdminModoIaPage() {
  return (
    <LegacyPage
      component={AdminModoIaApp}
      adminOnly
      skipAutoHeader
    />
  )
}
