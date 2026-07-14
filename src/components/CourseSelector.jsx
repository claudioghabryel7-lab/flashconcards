import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, query, where, doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { CheckCircleIcon, MagnifyingGlassIcon } from '@heroicons/react/24/solid'
import { BookOpenIcon } from '@heroicons/react/24/outline'
import { formatCoursePrice, hasPurchasedCourse } from '../utils/courseAccess'

function courseImageSrc(course) {
  return course?.imageUrl || course?.imageBase64 || ''
}

const CourseSelector = () => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (!profile) return

    const loadCourses = async () => {
      try {
        const coursesRef = collection(db, 'courses')
        const q = query(coursesRef, where('active', '==', true))
        const snapshot = await getDocs(q)

        const allCourses = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }))

        const filtered = allCourses.filter((c) => c.active !== false)

        const sorted = filtered.sort((a, b) => {
          if (a.id === 'alego-default') return -1
          if (b.id === 'alego-default') return 1
          return a.name?.localeCompare(b.name) || 0
        })

        setCourses(sorted)
        setLoading(false)
      } catch (error) {
        console.error('Erro ao carregar cursos:', error)
        setCourses([])
        setLoading(false)
      }
    }

    loadCourses()
  }, [profile])

  const handleSelectCourse = async () => {
    if (!user || selectedCourseId === undefined || selectedCourseId === null) return

    const course = courses.find((c) => c.id === selectedCourseId)
    if (course && !hasPurchasedCourse(profile, course.id) && course.id !== 'alego-default') {
      navigate(`/curso/${course.id}`)
      return
    }

    setSaving(true)
    try {
      const userRef = doc(db, 'users', user.uid)
      await setDoc(
        userRef,
        {
          selectedCourseId: selectedCourseId,
        },
        { merge: true },
      )

      navigate('/dashboard')
    } catch (err) {
      console.error('Erro ao salvar curso selecionado:', err)
      navigate('/dashboard')
    } finally {
      setSaving(false)
    }
  }

  const filteredCourses = courses.filter((course) => {
    if (!searchTerm.trim()) return true

    const searchLower = searchTerm.toLowerCase()
    const nameMatch = (course.name || '').toLowerCase().includes(searchLower)
    const competitionMatch = (course.competition || '').toLowerCase().includes(searchLower)
    const descriptionMatch = (course.description || '').toLowerCase().includes(searchLower)

    return nameMatch || competitionMatch || descriptionMatch
  })

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-accent-orange border-r-transparent" />
          <p className="mt-4 text-text-secondary">Carregando cursos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:py-10">
      <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-border-primary bg-background-card p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent-orange/20 blur-3xl"
        />

        <div className="relative text-center mb-7">
          <div className="mb-4 inline-flex flex-col items-center gap-3">
            <img
              src="/course-icons/logo.png"
              alt="FlashConCards"
              width={72}
              height={72}
              className="h-[72px] w-[72px] rounded-2xl object-contain shadow-[0_0_28px_rgba(249,115,22,0.25)] ring-1 ring-accent-orange/30"
              onError={(e) => {
                e.currentTarget.src = '/course-icons/logosite.png'
              }}
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent-orange">
              FlashConCards
            </p>
          </div>
          <h2 className="mb-2 font-display text-2xl font-black tracking-tight text-text-primary sm:text-3xl">
            Escolha seu Curso
          </h2>
          <p className="mx-auto max-w-md text-sm text-text-secondary sm:text-base">
            Selecione o curso que deseja estudar. Sem compra, você acessa 3 tópicos liberados e o Guia
            Mentorado.
          </p>
        </div>

        <div className="relative mb-6">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <MagnifyingGlassIcon className="h-5 w-5 text-text-muted" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome, concurso ou descrição..."
              className="w-full rounded-xl border border-border-primary bg-background-card-hover py-3 pl-10 pr-4 font-mono text-sm text-text-primary placeholder-text-muted transition-all focus:border-transparent focus:ring-2 focus:ring-accent-orange"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-muted hover:text-text-secondary"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
          {searchTerm && (
            <p className="mt-2 font-mono text-xs text-text-muted">
              {filteredCourses.length} resultado{filteredCourses.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div className="relative mb-6 space-y-3">
          {filteredCourses.length > 0 ? (
            filteredCourses.map((course) => {
              const owned = hasPurchasedCourse(profile, course.id)
              const selected = selectedCourseId === course.id
              const img = courseImageSrc(course)
              const title = course.name || 'Curso Padrão'
              const subtitle = course.competition || 'Concurso'

              return (
                <div
                  key={course.id || 'default'}
                  className={`group relative overflow-hidden rounded-xl border transition-all ${
                    selected
                      ? 'border-accent-orange bg-accent-orange/5 shadow-[0_0_24px_rgba(249,115,22,0.12)]'
                      : 'border-border-primary bg-background-card hover:border-accent-orange/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!owned && course.id !== 'alego-default') {
                        navigate(`/curso/${course.id}`)
                        return
                      }
                      setSelectedCourseId(course.id)
                    }}
                    className="w-full p-3 text-left transition-transform active:scale-[0.99] sm:p-3.5"
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-border-primary sm:h-[72px] sm:w-[72px]">
                        {img ? (
                          <img
                            src={img}
                            alt=""
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent-orange/25 to-accent-cyan/20">
                            <BookOpenIcon className="h-7 w-7 text-accent-orange" />
                          </div>
                        )}
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent-cyan">
                            {subtitle}
                          </span>
                          {owned && (
                            <span className="rounded border border-accent-cyan/40 bg-accent-cyan/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-accent-cyan">
                              Adquirido
                            </span>
                          )}
                        </div>
                        <p
                          className={`truncate font-display text-base font-bold tracking-tight sm:text-lg ${
                            selected ? 'text-accent-orange' : 'text-text-primary'
                          }`}
                        >
                          {title}
                        </p>
                        {!owned && course.id !== 'alego-default' && (
                          <p className="mt-1 font-mono text-sm font-bold text-accent-orange">
                            {formatCoursePrice(course.price)}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {owned || course.id === 'alego-default' ? (
                          <div
                            className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                              selected
                                ? 'border-accent-orange bg-accent-orange'
                                : 'border-border-primary'
                            }`}
                          >
                            {selected && (
                              <CheckCircleIcon className="h-4 w-4 text-background-primary" />
                            )}
                          </div>
                        ) : (
                          <a
                            href={`/curso/${course.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded-lg bg-accent-orange px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-background-primary transition-colors hover:bg-accent-orange-dim"
                          >
                            Comprar
                          </a>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              )
            })
          ) : (
            <div className="py-12 text-center">
              <MagnifyingGlassIcon className="mx-auto mb-4 h-12 w-12 text-text-muted" />
              <h3 className="mb-2 font-display text-lg font-semibold text-text-primary">
                Nenhum curso encontrado
              </h3>
              <p className="text-text-secondary">
                Tente buscar com outros termos ou limpe a busca para ver todos os cursos.
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleSelectCourse}
          disabled={selectedCourseId === undefined || selectedCourseId === null || saving}
          className="relative w-full rounded-xl bg-accent-orange px-6 py-4 font-display text-lg font-bold tracking-tight text-background-primary transition-all hover:bg-accent-orange-dim disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Continuar'}
        </button>

        <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">
          Você pode trocar de curso a qualquer momento nas configurações
        </p>
      </div>
    </div>
  )
}

export default CourseSelector
