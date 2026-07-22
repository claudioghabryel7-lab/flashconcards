import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, getDocs, query, where, doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { AcademicCapIcon, CheckCircleIcon, MagnifyingGlassIcon } from '@heroicons/react/24/solid'
import { formatCoursePrice, hasPurchasedCourse } from '../utils/courseAccess'

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

        const sorted = allCourses
          .filter((c) => c.active !== false)
          .sort((a, b) => {
            if (a.id === 'alego-default') return -1
            if (b.id === 'alego-default') return 1
            return a.name?.localeCompare(b.name) || 0
          })

        setCourses(sorted)
        const owned = sorted.find((c) => hasPurchasedCourse(profile, c.id))
        if (owned) setSelectedCourseId(owned.id)
        else if (profile.selectedCourseId) setSelectedCourseId(profile.selectedCourseId)
      } catch (error) {
        console.error('Erro ao carregar cursos:', error)
        setCourses([])
      } finally {
        setLoading(false)
      }
    }

    loadCourses()
  }, [profile])

  const handleSelectCourse = async () => {
    if (!user || !selectedCourseId) return

    const course = courses.find((c) => c.id === selectedCourseId)
    const owned = course ? hasPurchasedCourse(profile, course.id) : false

    // Sem compra: manda para checkout claro (exceto preview gratuito alego-default se desejado)
    if (!owned && course && course.id !== 'alego-default') {
      navigate(`/pagamento?course=${encodeURIComponent(course.id)}`)
      return
    }

    setSaving(true)
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        { selectedCourseId },
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
    return (
      (course.name || '').toLowerCase().includes(searchLower) ||
      (course.competition || '').toLowerCase().includes(searchLower) ||
      (course.description || '').toLowerCase().includes(searchLower)
    )
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

  const selected = courses.find((c) => c.id === selectedCourseId)
  const selectedOwned = selected ? hasPurchasedCourse(profile, selected.id) : false

  return (
    <div className="min-h-screen px-4 py-4 sm:py-10">
      <div className="mx-auto w-full max-w-2xl rounded-xl border border-border-primary bg-background-card p-4 sm:p-8">
        <div className="mb-4 text-center sm:mb-6">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-accent-orange to-accent-cyan sm:mb-4 sm:h-16 sm:w-16">
            <AcademicCapIcon className="h-6 w-6 text-background-primary sm:h-8 sm:w-8" />
          </div>
          <h2 className="mb-2 text-xl font-black text-text-primary sm:text-3xl">Escolha seu Curso</h2>
          <p className="text-text-secondary">
            Veja a descrição e a imagem do curso. Se ainda não comprou, você vai para o checkout seguro
            (PIX, cartão ou plano mensal).
          </p>
        </div>

        <div className="mb-4 sm:mb-6">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <MagnifyingGlassIcon className="h-5 w-5 text-text-muted" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar curso por nome, concurso ou descrição..."
              className="w-full rounded-lg border border-border-primary bg-background-card-hover py-3 pl-10 pr-4 text-text-primary placeholder-text-muted transition-all focus:border-transparent focus:ring-2 focus:ring-accent-orange"
            />
          </div>
        </div>

        <div className="mb-4 space-y-3 sm:mb-6">
          {filteredCourses.length > 0 ? (
            filteredCourses.map((course) => {
              const owned = hasPurchasedCourse(profile, course.id)
              const img = course.imageUrl || course.imageBase64
              return (
                <div
                  key={course.id || 'default'}
                  className={`overflow-hidden rounded-xl border-2 transition-all ${
                    selectedCourseId === course.id
                      ? 'border-accent-orange bg-background-card-hover'
                      : 'border-border-primary bg-background-card'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedCourseId(course.id)}
                    className="w-full p-0 text-left transition-all hover:opacity-95"
                  >
                    <div className="flex gap-0 sm:gap-0">
                      <div className="h-28 w-28 shrink-0 bg-background-card-hover sm:h-32 sm:w-36">
                        {img ? (
                          <img src={img} alt={course.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <AcademicCapIcon className="h-8 w-8 text-text-muted" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 p-3 sm:p-4">
                        <div className="flex items-start gap-2">
                          <div
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                              selectedCourseId === course.id
                                ? 'border-accent-orange bg-accent-orange'
                                : 'border-border-primary'
                            }`}
                          >
                            {selectedCourseId === course.id && (
                              <CheckCircleIcon className="h-3.5 w-3.5 text-background-primary" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-base font-bold text-text-primary sm:text-lg">
                              {course.name || 'Curso'}
                            </p>
                            <p className="text-sm text-text-muted">{course.competition || ''}</p>
                            {course.description && (
                              <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                                {course.description}
                              </p>
                            )}
                            {owned ? (
                              <p className="mt-1 text-xs font-semibold text-accent-cyan">Curso adquirido</p>
                            ) : (
                              <p className="mt-1 text-sm font-bold text-accent-orange">
                                {formatCoursePrice(course.price)}
                                {course.monthlyPrice ? (
                                  <span className="ml-2 text-xs font-medium text-text-muted">
                                    ou {formatCoursePrice(course.monthlyPrice)}/mês
                                  </span>
                                ) : null}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              )
            })
          ) : (
            <p className="py-8 text-center text-text-muted">Nenhum curso encontrado.</p>
          )}
        </div>

        <button
          type="button"
          onClick={handleSelectCourse}
          disabled={!selectedCourseId || saving}
          className="w-full rounded-lg bg-gradient-to-r from-accent-orange to-accent-cyan py-3 font-bold text-background-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? 'Salvando…'
            : !selectedCourseId
              ? 'Selecione um curso'
              : selectedOwned || selected?.id === 'alego-default'
                ? 'Continuar estudando'
                : 'Comprar / ver planos'}
        </button>

        <p className="mt-3 text-center text-xs text-text-muted">
          Já comprou?{' '}
          <Link to="/dashboard" className="text-accent-cyan underline">
            Ir ao dashboard
          </Link>
        </p>
      </div>
    </div>
  )
}

export default CourseSelector
