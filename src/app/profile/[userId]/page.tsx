'use client'

import LegacyPage from '@/components/next/LegacyPage'
import ComunidadePerfil from '@/routes/ComunidadePerfil'

export default function UserProfilePage() {
  return <LegacyPage component={ComunidadePerfil} requireCourseSelection skipAutoHeader />
}
