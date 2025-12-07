import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useNavigate } from 'react-router-dom'
import { XMarkIcon } from '@heroicons/react/24/outline'

const CourseAdScreen = ({ onSkip, duration = 10 }) => {
  const [courses, setCourses] = useState([])
  const [countdown, setCountdown] = useState(duration)
  const [currentCourseIndex, setCurrentCourseIndex] = useState(0)
  const navigate = useNavigate()

  // Carregar cursos ativos
  useEffect(() => {
    const coursesRef = collection(db, 'courses')
    const q = query(coursesRef, where('active', '==', true))
    
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      
      // Ordenar: cursos em destaque primeiro
      const sorted = data.sort((a, b) => {
        if (a.featured === true && b.featured !== true) return -1
        if (a.featured !== true && b.featured === true) return 1
        return 0
      })
      
      setCourses(sorted.slice(0, 3)) // Mostrar apenas 3 cursos
    }, (error) => {
      console.error('Erro ao carregar cursos:', error)
      setCourses([])
    })

    return () => unsub()
  }, [])

  // Contador regressivo
  useEffect(() => {
    if (countdown <= 0) {
      onSkip()
      return
    }

    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [countdown, onSkip])

  // Trocar curso a cada 3 segundos
  useEffect(() => {
    if (courses.length <= 1) return

    const interval = setInterval(() => {
      setCurrentCourseIndex((prev) => (prev + 1) % courses.length)
    }, 3000)

    return () => clearInterval(interval)
  }, [courses.length])

  const currentCourse = courses[currentCourseIndex]

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value)
  }

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full relative">
        {/* Botão fechar/pular */}
        <button
          onClick={onSkip}
          className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-all"
        >
          <XMarkIcon className="h-6 w-6 text-white" />
        </button>

        {/* Contador regressivo */}
        <div className="absolute top-4 left-4 z-20">
          <div className="bg-white/20 backdrop-blur-sm rounded-full px-6 py-3 border-2 border-white/30">
            <p className="text-white font-black text-2xl">
              {countdown}
            </p>
          </div>
        </div>

        {/* Conteúdo principal */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-8 text-center">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-2">
              🎓 Conheça Nossos Cursos!
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Enquanto preparamos seu simulado, confira nossos cursos preparatórios
            </p>

            {courses.length > 0 && currentCourse ? (
              <div className="relative">
                <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-800">
                  {currentCourse.imageBase64 && (
                    <div className="mb-4">
                      <img
                        src={currentCourse.imageBase64}
                        alt={currentCourse.name}
                        className="w-full h-48 object-cover rounded-lg"
                      />
                    </div>
                  )}
                  
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
                    {currentCourse.name}
                  </h3>
                  
                  {currentCourse.competition && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                      {currentCourse.competition}
                    </p>
                  )}
                  
                  {currentCourse.description && (
                    <p className="text-sm text-slate-700 dark:text-slate-300 mb-4 line-clamp-2">
                      {currentCourse.description}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-center gap-4">
                    {currentCourse.originalPrice && currentCourse.originalPrice > currentCourse.price && (
                      <span className="text-sm text-slate-500 line-through">
                        {formatCurrency(currentCourse.originalPrice)}
                      </span>
                    )}
                    <span className="text-2xl font-black text-alego-600">
                      {formatCurrency(currentCourse.price || 0)}
                    </span>
                  </div>
                  
                  <button
                    onClick={() => {
                      navigate(`/curso/${currentCourse.id}`)
                    }}
                    className="mt-4 w-full bg-gradient-to-r from-alego-600 to-alego-700 text-white px-6 py-3 rounded-xl font-bold hover:from-alego-700 hover:to-alego-800 transition-all"
                  >
                    Ver Detalhes
                  </button>
                </div>

                {/* Indicadores de cursos */}
                {courses.length > 1 && (
                  <div className="flex justify-center gap-2 mt-4">
                    {courses.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentCourseIndex(index)}
                        className={`h-2 rounded-full transition-all ${
                          index === currentCourseIndex
                            ? 'w-8 bg-alego-600'
                            : 'w-2 bg-slate-300 dark:bg-slate-600'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12">
                <p className="text-slate-500 dark:text-slate-400">
                  Carregando cursos...
                </p>
              </div>
            )}

            <button
              onClick={onSkip}
              className="mt-6 text-alego-600 dark:text-alego-400 font-bold hover:underline"
            >
              Pular e iniciar simulado
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CourseAdScreen

