import { useEffect, useState, startTransition } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { collection, getDocs, query, where, doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { AcademicCapIcon, CheckCircleIcon } from '@heroicons/react/24/solid'

const CourseSelector = () => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [saving, setSaving] = useState(false)

  // Carregar cursos disponíveis - Otimizado com cache e getDocs
  useEffect(() => {
    if (!profile) return

    const purchasedCourses = profile.purchasedCourses || []
    const isAdmin = profile.role === 'admin'
    const cacheKey = `courses_user_${user?.uid || 'guest'}`
    const CACHE_DURATION = 5 * 60 * 1000 // 5 minutos

    // Carregar do cache imediatamente
    try {
      const cached = localStorage.getItem(`firebase_cache_${cacheKey}`)
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached)
        const now = Date.now()
        if (now - timestamp < CACHE_DURATION && cachedData && cachedData.length > 0) {
          startTransition(() => {
            setCourses(cachedData)
            setLoading(false)
          })
          // Continuar carregando em background para atualizar
        }
      }
    } catch (err) {
      console.warn('Erro ao ler cache de cursos:', err)
    }

    // Carregar do Firestore (getDocs é mais rápido que onSnapshot para dados estáticos)
    const loadCourses = async () => {
      try {
        const coursesRef = collection(db, 'courses')
        const q = query(
          coursesRef,
          where('active', '==', true)
        )
        
        const snapshot = await getDocs(q)
        const allCourses = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))

        // Verificar se o curso ALEGO padrão existe
        const alegoCourse = allCourses.find(c => c.id === 'alego-default')
        
        // Filtrar cursos: se não tem cursos comprados, mostrar TODOS os cursos disponíveis para compra
        // Se tem cursos comprados, mostrar apenas os comprados (ou todos se admin)
        const hasPurchasedCourses = purchasedCourses && purchasedCourses.length > 0
        
        const filtered = isAdmin
          ? allCourses.filter(c => c.active !== false)
          : hasPurchasedCourses
            ? allCourses.filter(c => {
                if (c.id === 'alego-default') return true
                return purchasedCourses.includes(c.id) && c.active !== false
              })
            : allCourses.filter(c => c.active !== false && c.id !== 'alego-default') // Mostrar todos os cursos disponíveis para compra (exceto ALEGO padrão)

        // Ordenar: ALEGO padrão primeiro, depois os outros por nome
        const sorted = filtered.sort((a, b) => {
          if (a.id === 'alego-default') return -1
          if (b.id === 'alego-default') return 1
          return a.name.localeCompare(b.name)
        })

        startTransition(() => {
          setCourses(sorted)
          setLoading(false)
        })

        // Salvar no cache
        try {
          localStorage.setItem(`firebase_cache_${cacheKey}`, JSON.stringify({
            data: sorted,
            timestamp: Date.now(),
          }))
        } catch (err) {
          if (err.name !== 'QuotaExceededError') {
            console.warn('Erro ao salvar cache:', err)
          }
        }

        // Se já tem curso selecionado no perfil, usar ele
        if (profile.selectedCourseId !== undefined) {
          const courseId = profile.selectedCourseId === null ? 'alego-default' : profile.selectedCourseId
          setSelectedCourseId(courseId)
        } else if (alegoCourse) {
          setSelectedCourseId('alego-default')
        }
      } catch (error) {
        console.error('Erro ao carregar cursos:', error)
        setLoading(false)
      }
    }

    loadCourses()
  }, [profile, user])

  const handleSelectCourse = async () => {
    if (!user || selectedCourseId === undefined) return

    setSaving(true)
    try {
      // Salvar curso selecionado no perfil do usuário
      // 'alego-default' é o ID do curso ALEGO padrão
      const userRef = doc(db, 'users', user.uid)
      await setDoc(userRef, {
        selectedCourseId: selectedCourseId, // 'alego-default' para ALEGO padrão, ou ID do curso
      }, { merge: true })

      // Redirecionar para dashboard
      navigate('/dashboard')
    } catch (err) {
      console.error('Erro ao salvar curso selecionado:', err)
      alert('Erro ao salvar seleção. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Carregando cursos...</p>
        </div>
      </div>
    )
  }

  // Se não tem cursos disponíveis
  if (courses.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
          <AcademicCapIcon className="h-16 w-16 text-slate-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Nenhum Curso Disponível
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Você ainda não possui acesso a nenhum curso. Entre em contato com o administrador ou compre um curso.
          </p>
          <button
            onClick={() => navigate('/')}
            className="rounded-full bg-blue-600 px-6 py-3 text-white font-semibold hover:bg-blue-700 transition"
          >
            Ver Cursos Disponíveis
          </button>
        </div>
      </div>
    )
  }

  // Verificar se o usuário tem cursos comprados
  const purchasedCourses = profile?.purchasedCourses || []
  const hasPurchasedCourses = purchasedCourses.length > 0
  const isAdmin = profile?.role === 'admin'
  
  // Se não tem cursos comprados e não é admin, mostrar cursos para compra
  const showingAvailableCourses = !hasPurchasedCourses && !isAdmin

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 px-4 py-6 sm:py-10">
      <div
        className="max-w-2xl w-full mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 animate-fade-in-up"
        style={{
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 mb-4">
            <AcademicCapIcon className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mb-2">
            {showingAvailableCourses ? 'Cursos Disponíveis' : 'Escolha seu Curso'}
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            {showingAvailableCourses 
              ? 'Escolha um curso para começar seus estudos' 
              : 'Selecione o curso que deseja estudar agora'}
          </p>
        </div>

        <div
          className="space-y-3 mb-6"
          style={{ touchAction: 'pan-y' }} // Permite rolagem vertical mesmo tocando nos cards
        >
          {courses.map((course) => (
            <div
              key={course.id || 'default'}
              className={`w-full p-4 rounded-xl border-2 transition-all ${
                showingAvailableCourses
                  ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700'
                  : selectedCourseId === course.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg'
                    : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 bg-white dark:bg-slate-700'
              }`}
            >
              {showingAvailableCourses ? (
                // Layout para cursos disponíveis para compra
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-bold text-lg text-slate-900 dark:text-white mb-1">
                      {course.name}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                      {course.competition || 'Curso'}
                    </p>
                    <div className="flex items-baseline gap-2">
                      {course.originalPrice && course.originalPrice > course.price && (
                        <span className="text-sm text-slate-400 line-through">
                          R$ {course.originalPrice.toFixed(2).replace('.', ',')}
                        </span>
                      )}
                      <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                        R$ {(course.price || 99.90).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>
                  <Link
                    to={`/pagamento?course=${course.id}`}
                    className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition whitespace-nowrap"
                  >
                    Comprar
                  </Link>
                </div>
              ) : (
                // Layout para seleção de curso (quando já tem cursos comprados)
                <button
                  type="button"
                  onClick={() => setSelectedCourseId(course.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                        selectedCourseId === course.id
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}>
                        {selectedCourseId === course.id && (
                          <CheckCircleIcon className="h-4 w-4 text-white" />
                        )}
                      </div>
                      <div>
                        <p className={`font-bold text-lg ${
                          selectedCourseId === course.id
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-slate-900 dark:text-white'
                        }`}>
                          {course.name}
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {course.competition || 'Curso Padrão'}
                        </p>
                      </div>
                    </div>
                    {course.isDefault && (
                      <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-600 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Padrão
                      </span>
                    )}
                  </div>
                </button>
              )}
            </div>
          ))}
        </div>

        {!showingAvailableCourses && (
          <>
            <button
              onClick={handleSelectCourse}
              disabled={selectedCourseId === undefined || saving}
              className="w-full rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 text-white font-bold text-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
            >
              {saving ? 'Salvando...' : 'Continuar'}
            </button>

            <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-4">
              Você pode trocar de curso a qualquer momento nas configurações
            </p>
          </>
        )}

        {showingAvailableCourses && (
          <div className="text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Escolha um curso acima para começar seus estudos
            </p>
            <button
              onClick={() => navigate('/')}
              className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
            >
              Ver mais cursos na página inicial →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default CourseSelector

