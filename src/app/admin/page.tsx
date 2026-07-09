'use client'

import dynamic from 'next/dynamic'
import LegacyPage from '@/components/next/LegacyPage'

const AdminPageComponent = dynamic(() => import('@/routes/AdminPanel'), { ssr: false })

export default function AdminPage() {
  return (
    <LegacyPage
      component={AdminPageComponent}
      adminOnly
      skipAutoHeader
    />
  )
}
