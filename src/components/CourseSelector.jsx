import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

        // Filtrar cursos (admin vê todos, outros só comprados e ALEGO)
        const purchasedCourses = profile.purchasedCourses || []
        const isAdmin = profile.role === 'admin'
        
        const filtered = isAdmin 
          ? allCourses.filter(c => c.active !== false)
          : allCourses.filter(c => {
              if (c.id === 'alego-default') return true
              return purchasedCourses.includes(c.id) && c.active !== false
            })

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 px-4 py-6 sm:py-10">
      <div className="max-w-2xl w-full mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 mb-4">
            <AcademicCapIcon className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mb-2">
            Escolha seu Curso
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            Selecione o curso que deseja estudar agora
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {courses.map((course) => (
            <button
              key={course.id || 'default'}
              type="button"
              onClick={() => setSelectedCourseId(course.id)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all hover:scale-[1.02] active:scale-[0.98] ${
                selectedCourseId === course.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg'
                  : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 bg-white dark:bg-slate-700'
              }`}
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
                      {course.name || 'Curso Padrão'}
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
          ))}
        </div>

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
      </div>
    </div>
  )
}

export default CourseSelector

