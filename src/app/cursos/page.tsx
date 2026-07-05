'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, getDocs, query, where } from 'firebase/firestore'
import {
  Search,
  Loader2,
  ArrowRight,
  BookOpen,
  Sparkles,
  Clock,
} from 'lucide-react'
import { db, initFirebase, firebaseInitialized } from '@/firebase/config'
import LazyImage from '@/components/LazyImage'

type Course = {
  id: string
  name?: string
  description?: string
  competition?: string
  courseDuration?: string
  price?: number
  originalPrice?: number
  imageUrl?: string
  imageBase64?: string
  featured?: boolean
  banca?: string
  slug?: string
}

function formatCurrency(value?: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0)
}

export default function CursosPage() {
  const router = useRouter()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadCourses = async () => {
      setLoading(true)
      setError('')

      try {
        initFirebase()
        if (!firebaseInitialized || !db) {
          throw new Error('Firebase indisponível. Recarregue a página.')
        }

        const coursesRef = collection(db, 'courses')
        const q = query(coursesRef, where('active', '==', true))
        const snapshot = await getDocs(q)

        const data = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<Course, 'id'>),
        }))

        const sorted = data.sort((a, b) => {
          if (a.featured && !b.featured) return -1
          if (!a.featured && b.featured) return 1
          return (a.name || '').localeCompare(b.name || '', 'pt-BR')
        })

        if (!cancelled) setCourses(sorted)
      } catch (err) {
        console.error('Erro ao carregar cursos:', err)
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar cursos.')
          setCourses([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadCourses()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredCourses = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return courses

    return courses.filter((course) => {
      const haystack = [
        course.name,
        course.competition,
        course.description,
        course.banca,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(term)
    })
  }, [courses, searchTerm])

  const openCourse = (courseId: string) => {
    router.push(`/curso/${courseId}`)
  }

  return (
    <section className="relative w-full overflow-hidden px-4 pb-20 pt-10 sm:px-6">
      <div className="cp-container-wide relative">
        <div className="text-center">
          <span className="cp-badge cp-badge-accent">Cursos</span>
          <h1 className="cp-headline mt-6 text-4xl sm:text-5xl">
            Escolha seu <span className="cp-gradient-text">curso</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-cp-muted">
            Concursos cadastrados pelo admin — edital, flashcards IA e questões por banca.
          </p>
        </div>

        <div className="mt-10">
          <div className="cp-card flex items-center gap-3 p-2 pl-4">
            <Search className="h-5 w-5 text-cp-muted" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, concurso ou banca..."
              className="flex-1 bg-transparent py-3 font-serif text-cp-text outline-none placeholder:text-cp-muted/60"
            />
          </div>
          {searchTerm && (
            <p className="mt-2 font-mono text-xs text-cp-muted">
              {filteredCourses.length} curso{filteredCourses.length !== 1 ? 's' : ''} encontrado
              {filteredCourses.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {loading && (
          <div className="mt-16 flex flex-col items-center gap-3 text-cp-muted">
            <Loader2 className="h-10 w-10 animate-spin text-cp-accent" />
            <p className="font-mono text-xs text-cp-muted">Consultando cursos...</p>
          </div>
        )}

        {!loading && error && (
          <div className="mt-12 cp-card p-8 text-center">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && filteredCourses.length === 0 && (
          <div className="mt-12 cp-card p-12 text-center">
            <BookOpen className="mx-auto h-12 w-12 text-cp-muted" />
            <p className="mt-4 text-lg text-cp-text">Nenhum curso disponível no momento.</p>
            <p className="mt-2 text-sm text-cp-muted">
              {searchTerm ? 'Tente outro termo de busca.' : 'O admin ainda não cadastrou cursos ativos.'}
            </p>
          </div>
        )}

        {!loading && !error && filteredCourses.length > 0 && (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCourses.map((course, index) => (
              <button
                key={course.id}
                type="button"
                onClick={() => openCourse(course.id)}
                className="cp-card group overflow-hidden p-0 text-left transition hover:border-cp-accent/30 hover:shadow-cp-glow"
              >
                <div className="relative h-48 overflow-hidden">
                  {course.imageUrl || course.imageBase64 ? (
                    <>
                      <div className="absolute inset-0 z-10 bg-gradient-to-t from-cp-bg via-transparent to-transparent" />
                      <LazyImage
                        src={course.imageUrl || course.imageBase64 || ''}
                        alt={course.name || 'Curso'}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        priority={index < 3}
                      />
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-cp-accent/20 to-indigo-500/20">
                      <BookOpen className="h-14 w-14 text-cp-accent" />
                    </div>
                  )}

                  {course.featured && (
                    <span className="absolute left-3 top-3 z-20 inline-flex items-center gap-1 rounded-full bg-cp-accent px-2.5 py-1 text-[10px] font-bold uppercase text-slate-950">
                      <Sparkles className="h-3 w-3" />
                      Destaque
                    </span>
                  )}
                </div>

                <div className="space-y-3 p-5">
                  {course.competition && (
                    <span className="inline-block rounded-full border border-cp-accent/30 bg-cp-accent/10 px-2.5 py-1 text-xs font-medium text-cp-accent">
                      {course.competition}
                    </span>
                  )}

                  <h2 className="text-base font-medium tracking-tight text-zinc-100 group-hover:text-white">
                    {course.name || 'Curso'}
                  </h2>

                  {course.description && (
                    <p className="line-clamp-2 text-sm text-cp-muted">{course.description}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-cp-muted">
                    {course.banca && <span>Banca: {course.banca}</span>}
                    {course.courseDuration && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {course.courseDuration}
                      </span>
                    )}
                  </div>

                  {(course.price || course.originalPrice) && (
                    <div className="flex items-baseline gap-2 pt-1">
                      {course.originalPrice && course.originalPrice > (course.price || 0) && (
                        <span className="text-sm text-cp-muted line-through">
                          {formatCurrency(course.originalPrice)}
                        </span>
                      )}
                      <span className="text-xl font-bold text-cp-accent">
                        {formatCurrency(course.price || 99.9)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2 text-sm text-cp-accent">
                    Acessar curso
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
