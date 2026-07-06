'use client'

import LegacyPage from '@/components/next/LegacyPage'
import ComunidadePerfil from '@/routes/ComunidadePerfil'

export default function ComunidadePerfilPage() {
  return <LegacyPage component={ComunidadePerfil} requireCourseSelection skipAutoHeader />
}
