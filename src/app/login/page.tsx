'use client'

import LegacyPage from '@/components/next/LegacyPage'
import LoginPageComponent from '@/routes/Login'

export default function LoginPage() {
  return (
    <LegacyPage
      component={LoginPageComponent}
      guestOnly
    />
  )
}
