import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle2,
  HelpCircle,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react'
import { db } from '../firebase/config'
import { formatCoursePrice, getCourseAccessLabel } from '../utils/courseAccess'
import CoursePageReviews from '../components/CoursePageReviews'

const benefits = [
  {
    icon: Layers,
    title: 'Edital verticalizado',
    text: 'Checklist completo por disciplina e tópico — zero ruído.',
  },
  {
    icon: BookOpen,
    title: 'Flashcards com IA',
    text: 'Repetição espaçada calibrada no padrão da sua banca.',
  },
  {
    icon: HelpCircle,
    title: 'Questões preditivas',
    text: 'Treino no estilo real da prova, com comentários inteligentes.',
  },
  {
    icon: Brain,
    title: 'Guia Mentorado',
    text: 'Cronograma e revisão guiada para acelerar sua aprovação.',
  },
]

const CourseShare = () => {
  const params = useParams()
  const courseId = params.courseId || params.id
  const [course, setCourse] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadCourse = async () => {
      if (!courseId) {
        setLoading(false)
        setError('ID do curso não fornecido')
        return
      }

      try {
        setLoading(true)
        setError(null)
        const courseDoc = await getDoc(doc(db, 'courses', courseId))
        if (courseDoc.exists()) {
          setCourse({ id: courseDoc.id, ...courseDoc.data() })
        } else {
          setError('Curso não encontrado')
        }
      } catch (err) {
        console.error('Erro ao carregar curso:', err)
        setError(`Erro ao carregar curso: ${err.message || 'Erro desconhecido'}`)
      } finally {
        setLoading(false)
      }
    }

    loadCourse()
  }, [courseId])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    if (!course || !courseId) return

    try {
      const shareUrl = `${window.location.origin}/curso/${courseId}`
      const imageUrl = course.imageBase64 || course.imageUrl || ''
      const seoDescription = course.description
        ? `${course.description} Curso completo ${course.name} para ${course.competition || 'concursos públicos'}.`
        : `Curso completo ${course.name} para ${course.competition || 'concursos públicos'}.`
      const seoTitle = `${course.name}${course.competition ? ` | ${course.competition}` : ''} | Concurseiro Preditivo`

      document.title = seoTitle

      const setMeta = (attr, key, content) => {
        if (!content) return
        let el = document.querySelector(`meta[${attr}="${key}"]`)
        if (!el) {
          el = document.createElement('meta')
          el.setAttribute(attr, key)
          document.head.appendChild(el)
        }
        el.setAttribute('content', content)
      }

      setMeta('name', 'description', seoDescription)
      setMeta('property', 'og:title', seoTitle)
      setMeta('property', 'og:description', seoDescription)
      setMeta('property', 'og:url', shareUrl)
      if (imageUrl) setMeta('property', 'og:image', imageUrl)
    } catch (err) {
      console.warn('Erro ao atualizar meta tags:', err)
    }
  }, [course, courseId])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-cp-text">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cp-accent border-t-transparent" />
          <p className="text-sm text-cp-muted">Carregando oferta do curso…</p>
        </div>
      </div>
    )
  }

  if (error || !course) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 text-cp-text">
        <div className="cp-card max-w-md w-full p-8 text-center space-y-4">
          <h1 className="cp-headline text-2xl">{error || 'Curso não encontrado'}</h1>
          <p className="text-sm text-cp-muted">
            O curso que você procura não existe ou foi removido.
          </p>
          <Link to="/cursos" className="cp-btn-primary inline-flex">
            Ver cursos
          </Link>
        </div>
      </div>
    )
  }

  const imageSrc = course.imageBase64 || course.imageUrl || ''
  const priceLabel = formatCoursePrice(course.price) || `R$ ${(course.price ?? 99.9).toFixed(2).replace('.', ',')}`
  const accessInfo = getCourseAccessLabel(course)
  const hasDiscount =
    typeof course.originalPrice === 'number' &&
    typeof course.price === 'number' &&
    course.originalPrice > course.price

  return (
    <div className="relative w-full overflow-hidden text-cp-text">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,0.18), transparent), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(251,146,60,0.12), transparent)',
        }}
      />

      <div className="relative z-10 w-full py-6 sm:py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-5xl"
        >
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="cp-badge cp-badge-accent inline-flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" /> {accessInfo.badge}
            </span>
            <span className="cp-badge cp-badge-cyan inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Engine preditiva
            </span>
          </div>

          <div className="overflow-hidden rounded-3xl border border-cp-border bg-cp-surface/70 shadow-[0_0_60px_-20px_rgba(34,211,238,0.35)] backdrop-blur-sm">
            {imageSrc ? (
              <div className="relative h-52 w-full overflow-hidden sm:h-72 md:h-80">
                <img
                  src={imageSrc}
                  alt={course.name}
                  className="h-full w-full object-cover"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--cp-bg)] via-[var(--cp-bg)]/40 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6">
                  {course.competition ? (
                    <p className="mb-1 text-sm font-semibold text-cp-accent">{course.competition}</p>
                  ) : null}
                  <h1 className="cp-headline text-3xl sm:text-4xl md:text-5xl">{course.name}</h1>
                </div>
              </div>
            ) : (
              <div className="space-y-2 border-b border-cp-border px-5 py-8 sm:px-8">
                {course.competition ? (
                  <p className="text-sm font-semibold text-cp-accent">{course.competition}</p>
                ) : null}
                <h1 className="cp-headline text-3xl sm:text-4xl">{course.name}</h1>
              </div>
            )}

            <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-6">
                {course.banca ? (
                  <p className="text-sm text-cp-muted">
                    Banca: <span className="font-semibold text-cp-text">{course.banca}</span>
                  </p>
                ) : null}

                <p className="text-base leading-relaxed text-cp-muted whitespace-pre-wrap sm:text-lg">
                  {course.description ||
                    `Domine ${course.competition || 'seu concurso'} com edital estruturado, flashcards, questões e IA calibrada na banca. Estude com precisão — sem perder tempo com material genérico.`}
                </p>

                <div>
                  <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-cp-text">
                    O que você desbloqueia
                  </h2>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {benefits.map((item) => {
                      const Icon = item.icon
                      return (
                        <li
                          key={item.title}
                          className="rounded-2xl border border-cp-border/80 bg-[var(--cp-bg)]/40 p-4"
                        >
                          <div className="mb-2 flex items-center gap-2 text-cp-accent">
                            <Icon className="h-4 w-4" />
                            <span className="text-sm font-semibold text-cp-text">{item.title}</span>
                          </div>
                          <p className="text-xs leading-relaxed text-cp-muted">{item.text}</p>
                        </li>
                      )
                    })}
                  </ul>
                </div>

                <ul className="space-y-2 text-sm text-cp-muted">
                  {[
                    'Estudo focado no edital do seu concurso',
                    'Conteúdo gerado e atualizado com IA',
                    'Acesso imediato após a confirmação do pagamento',
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cp-accent" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <aside className="h-fit rounded-2xl border border-cp-accent/25 bg-gradient-to-b from-cp-accent/10 to-transparent p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-cp-accent">
                  Oferta do curso
                </p>
                <div className="mt-4">
                  {hasDiscount ? (
                    <p className="text-sm text-cp-muted line-through">
                      De {formatCoursePrice(course.originalPrice)}
                    </p>
                  ) : null}
                  <p className="text-4xl font-black tracking-tight text-cp-accent sm:text-5xl">
                    {priceLabel}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-cp-text">
                    Tempo de acesso: {accessInfo.short}
                  </p>
                  <p className="mt-1 text-xs text-cp-muted">{accessInfo.summary}</p>
                </div>

                <p className="mt-5 text-sm leading-relaxed text-cp-muted">
                  Pare de estudar no escuro. Ative o modo preditivo e treine exatamente o que a banca
                  cobra.
                </p>

                <Link
                  to={`/pagamento?course=${courseId}`}
                  className="cp-btn-primary mt-6 flex w-full items-center justify-center gap-2 !py-3.5 !text-base"
                >
                  Adquirir curso agora
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  to="/cursos"
                  className="mt-3 flex w-full items-center justify-center rounded-xl border border-cp-border px-4 py-3 text-sm font-semibold text-cp-text transition hover:bg-cp-surface"
                >
                  Ver outros cursos
                </Link>
              </aside>
            </div>

            <div className="border-t border-cp-border px-5 pb-6 pt-2 sm:px-8 sm:pb-8">
              <CoursePageReviews title="Alunos que estudam com a gente" />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default CourseShare
