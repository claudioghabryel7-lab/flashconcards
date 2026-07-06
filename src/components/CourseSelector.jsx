import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, getDocs, query, where, doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { AcademicCapIcon, CheckCircleIcon, MagnifyingGlassIcon } from '@heroicons/react/24/solid'
import { buildWhatsAppCourseUrl, formatCoursePrice, hasPurchasedCourse } from '../utils/courseAccess'

const CourseSelector = () => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // Carregar cursos disponíveis
  useEffect(() => {
    if (!profile) return

    const loadCourses = async () => {
      try {
        const coursesRef = collection(db, 'courses')
        const q = query(coursesRef, where('active', '==', true))
        const snapshot = await getDocs(q)
        
        const allCourses = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))

        // Todos os cursos ativos (preview gratuito para não comprados)
        const purchasedCourses = profile.purchasedCourses || []
        const isAdmin = profile.role === 'admin'
        
        const filtered = isAdmin 
          ? allCourses.filter(c => c.active !== false)
          : allCourses.filter(c => c.active !== false)

        // Ordenar: ALEGO primeiro
        const sorted = filtered.sort((a, b) => {
          if (a.id === 'alego-default') return -1
          if (b.id === 'alego-default') return 1
          return a.name?.localeCompare(b.name) || 0
        })

        setCourses(sorted)
        setLoading(false)
      } catch (error) {
        console.error('Erro ao carregar cursos:', error)
        // Em caso de erro, mostrar array vazio
        setCourses([])
        setLoading(false)
      }
    }

    loadCourses()
  }, [profile])

  const handleSelectCourse = async () => {
    if (!user || selectedCourseId === undefined) return

    setSaving(true)
    try {
      const userRef = doc(db, 'users', user.uid)
      await setDoc(userRef, {
        selectedCourseId: selectedCourseId,
      }, { merge: true })

      navigate('/dashboard')
    } catch (err) {
      console.error('Erro ao salvar curso selecionado:', err)
      // Mesmo com erro, tentar navegar
      navigate('/dashboard')
    } finally {
      setSaving(false)
    }
  }

  // Filtrar cursos com base na busca
  const filteredCourses = courses.filter(course => {
    if (!searchTerm.trim()) return true
    
    const searchLower = searchTerm.toLowerCase()
    const nameMatch = (course.name || '').toLowerCase().includes(searchLower)
    const competitionMatch = (course.competition || '').toLowerCase().includes(searchLower)
    const descriptionMatch = (course.description || '').toLowerCase().includes(searchLower)
    
    return nameMatch || competitionMatch || descriptionMatch
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-accent-orange border-r-transparent"></div>
          <p className="mt-4 text-text-secondary">Carregando cursos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:py-10">
      <div className="max-w-2xl w-full mx-auto bg-background-card rounded-xl border border-border-primary p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-accent-orange to-accent-cyan mb-4">
            <AcademicCapIcon className="h-8 w-8 text-background-primary" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-text-primary mb-2">
            Escolha seu Curso
          </h2>
          <p className="text-text-secondary">
            Selecione o curso que deseja estudar. Sem compra, você acessa 3 tópicos liberados e o Guia Mentorado.
          </p>
        </div>

        {/* Campo de Busca */}
        <div className="mb-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-text-muted" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar curso por nome, concurso ou descrição..."
              className="w-full pl-10 pr-4 py-3 border border-border-primary rounded-lg bg-background-card-hover text-text-primary placeholder-text-muted focus:ring-2 focus:ring-accent-orange focus:border-transparent transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-muted hover:text-text-secondary"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {searchTerm && (
            <p className="mt-2 text-sm text-text-muted">
              {filteredCourses.length} curso{filteredCourses.length !== 1 ? 's' : ''} encontrado{filteredCourses.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div className="space-y-3 mb-6">
          {filteredCourses.length > 0 ? (
            filteredCourses.map((course) => {
              const owned = hasPurchasedCourse(profile, course.id)
              return (
              <div
                key={course.id || 'default'}
                className={`rounded-lg border-2 transition-all ${
                  selectedCourseId === course.id
                    ? 'border-accent-orange bg-background-card-hover'
                    : 'border-border-primary bg-background-card'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedCourseId(course.id)}
                  className="w-full text-left p-4 hover:scale-[1.01] active:scale-[0.99] transition-all"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        selectedCourseId === course.id
                          ? 'border-accent-orange bg-accent-orange'
                          : 'border-border-primary'
                      }`}>
                        {selectedCourseId === course.id && (
                          <CheckCircleIcon className="h-4 w-4 text-background-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className={`font-bold text-lg truncate ${
                          selectedCourseId === course.id
                            ? 'text-accent-orange'
                            : 'text-text-primary'
                        }`}>
                          {course.name || 'Curso Padrão'}
                        </p>
                        <p className="text-sm text-text-muted">
                          {course.competition || 'Curso Padrão'}
                        </p>
                        {!owned && course.id !== 'alego-default' && (
                          <p className="mt-1 text-sm font-bold text-accent-orange">
                            {formatCoursePrice(course.price)}
                          </p>
                        )}
                        {owned && (
                          <p className="mt-1 text-xs font-semibold text-accent-cyan">Curso adquirido</p>
                        )}
                        {!owned && course.id !== 'alego-default' && (
                          <p className="mt-0.5 text-xs text-text-muted">Preview: 3 tópicos + Guia Mentorado</p>
                        )}
                      </div>
                    </div>
                    {!owned && course.id !== 'alego-default' && (
                      <a
                        href={buildWhatsAppCourseUrl(course.name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 rounded-lg bg-accent-orange px-3 py-2 text-xs font-bold text-background-primary hover:bg-accent-orange-dim transition-colors"
                      >
                        Comprar
                      </a>
                    )}
                  </div>
                </button>
              </div>
            )})
          ) : (
            <div className="text-center py-12">
              <MagnifyingGlassIcon className="h-12 w-12 text-text-muted mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                Nenhum curso encontrado
              </h3>
              <p className="text-text-secondary">
                Tente buscar com outros termos ou limpe a busca para ver todos os cursos.
              </p>
            </div>
          )}
        </div>

        <button
          onClick={handleSelectCourse}
          disabled={selectedCourseId === undefined || saving}
          className="w-full rounded-lg bg-accent-orange px-6 py-4 text-background-primary font-bold text-lg hover:bg-accent-orange-dim disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {saving ? 'Salvando...' : 'Continuar'}
        </button>

        <p className="text-center text-xs text-text-muted mt-4">
          Você pode trocar de curso a qualquer momento nas configurações
        </p>
      </div>
    </div>
  )
}

export default CourseSelector

