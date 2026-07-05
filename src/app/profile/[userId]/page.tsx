'use client'

import LegacyPage from '@/components/next/LegacyPage'
import UserProfilePageComponent from '@/routes/UserProfile'

export default function UserProfilePage() {
  return (
    <LegacyPage
      component={UserProfilePageComponent}
      
    />
  )
}
