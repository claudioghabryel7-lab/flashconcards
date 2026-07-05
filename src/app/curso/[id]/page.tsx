'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import {
  ArrowLeft,
  BookOpen,
  Brain,
  FileText,
  HelpCircle,
  Loader2,
  PenTool,
  Sparkles,
} from 'lucide-react'
import { db, initFirebase, firebaseInitialized } from '@/firebase/config'

const modules = [
  { href: 'edital-verticalizado', title: 'Edital verticalizado', desc: 'Checklist completo por disciplina e tópico.', icon: FileText, color: 'from-cyan-400 to-blue-500', legacy: '/edital-verticalizado' },
  { href: 'flashcards', title: 'Flashcards IA', desc: 'Cards gerados por tópico e salvos para reutilizar.', icon: BookOpen, color: 'from-emerald-400 to-teal-500', legacy: '/flashcards' },
  { href: 'questoes', title: 'Questões IA', desc: 'Questões no estilo da banca do concurso.', icon: HelpCircle, color: 'from-orange-400 to-amber-500', legacy: '/flashquestoes' },
  { href: 'treino-redacao', title: 'Treino de redação', desc: 'Correção e modelo nota 1000 por tema.', icon: PenTool, color: 'from-violet-400 to-purple-500', legacy: '/treino-redacao' },
  { href: 'mapas-mentais', title: 'Mapas mentais', desc: 'Visualize o edital de forma estratégica.', icon: Brain, color: 'from-pink-400 to-rose-500', legacy: '/dashboard' },
]

export default function CursoHubPage() {
  const params = useParams()
  const router = useRouter()
  const courseId = String(params?.id || '')
  const [course, setCourse] = useState<{ name?: string; competition?: string; description?: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      initFirebase()

      if (!courseId || !firebaseInitialized || !db) {
        if (!cancelled) setLoading(false)
        return
      }

      try {
        const snap = await getDoc(doc(db, 'courses', courseId))
        if (!cancelled && snap.exists()) {
          setCourse(snap.data())
        }
      } catch (err) {
        console.error('Erro ao carregar curso:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [courseId])

  const title =
    course?.name ||
    decodeURIComponent(courseId).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-cp-accent" />
      </div>
    )
  }

  return (
    <section className="relative px-4 pb-20 pt-10 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Link href="/cursos" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Voltar para cursos
        </Link>

        <div className="mt-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-cp-accent/30 bg-cp-accent/10 px-3 py-1 text-xs font-medium text-cp-accent">
            <Sparkles className="h-3.5 w-3.5" /> Trilha preditiva
          </span>
          <h1 className="mt-4 text-4xl font-bold sm:text-5xl">{title}</h1>
          {course?.competition && (
            <p className="mt-2 text-cp-accent">{course.competition}</p>
          )}
          <p className="mt-3 max-w-2xl text-slate-400">
            {course?.description ||
              'Escolha como estudar. Material gerado com foco no edital, na banca e no tópico.'}
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((mod) => {
            const Icon = mod.icon
            return (
              <button
                key={mod.href}
                type="button"
                onClick={() => router.push(mod.legacy)}
                className="cp-card group p-6 text-left transition hover:border-cp-accent/30 hover:shadow-cp-glow"
              >
                <div className={`mb-4 inline-flex rounded-xl bg-gradient-to-br ${mod.color} p-3 text-slate-950`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-semibold text-white group-hover:text-cp-accent">{mod.title}</h2>
                <p className="mt-2 text-sm text-slate-400">{mod.desc}</p>
              </button>
            )
          })}
        </div>

        <div className="mt-10 cp-card p-6">
          <p className="text-sm text-slate-400">
            Para vincular este curso à sua conta, acesse{' '}
            <Link href="/select-course" className="text-cp-accent hover:underline">
              Selecionar curso
            </Link>
            {' '}após o login.
          </p>
        </div>
      </div>
    </section>
  )
}
