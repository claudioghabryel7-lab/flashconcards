'use client'

import { useParams } from 'next/navigation'
import CourseSharePageComponent from '@/routes/CourseShare'

export default function CourseSharePage() {
  const params = useParams()
  const courseId = String(params?.courseId || params?.id || '')
  return <CourseSharePageComponent courseId={courseId} />
}
