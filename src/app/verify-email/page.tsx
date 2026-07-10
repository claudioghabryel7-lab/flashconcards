'use client'

import LegacyPage from '@/components/next/LegacyPage'
import VerifyEmail from '@/routes/VerifyEmail'

export default function VerifyEmailPage() {
  return (
    <LegacyPage
      component={VerifyEmail}
      skipAutoHeader
      skipEmailVerification
    />
  )
}
