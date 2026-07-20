'use client'

import { useParams } from 'next/navigation'
import CourseSharePageComponent from '@/routes/CourseShare'

/** Rota pública de compra do curso (`/curso/:id`). */
export default function CursoPage() {
  const params = useParams()
  const courseId = String(params?.id || params?.courseId || '')
  return <CourseSharePageComponent courseId={courseId} />
}
