import { redirect } from 'next/navigation'

/** `/curso` sem id → lista de cursos (evita 404). */
export default function CursoIndexPage() {
  redirect('/cursos')
}
