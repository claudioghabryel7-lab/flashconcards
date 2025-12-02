import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
// Meta tags serão adicionadas via document.head diretamente

const CourseShare = () => {
  const { courseId } = useParams()
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
        const courseRef = doc(db, 'courses', courseId)
        const courseDoc = await getDoc(courseRef)
        
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

  // Adicionar meta tags para compartilhamento - TUDO dentro de useEffect para evitar erro #310
  useEffect(() => {
    // Verificar se está no cliente (não SSR)
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    if (!course || !courseId) return

    try {
      // Obter URL de forma segura
      let shareUrl = ''
      try {
        if (window.location && window.location.origin) {
          shareUrl = `${window.location.origin}/curso/${courseId}`
        } else {
          shareUrl = `/curso/${courseId}`
        }
      } catch (err) {
        console.warn('Erro ao obter URL:', err)
        shareUrl = `/curso/${courseId}`
      }

      const imageUrl = course.imageBase64 || course.imageUrl || ''
      const description = course.description || `Curso preparatório ${course.name} - ${course.competition}`

      // Remover meta tags antigas
      const removeOldTags = () => {
        try {
          const tags = document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')
          tags.forEach(tag => tag.remove())
        } catch (err) {
          console.warn('Erro ao remover meta tags:', err)
        }
      }

      removeOldTags()

      // Adicionar novas meta tags
      const addMetaTag = (property, content) => {
        if (!content) return
        try {
          const tag = document.createElement('meta')
          if (property.startsWith('og:')) {
            tag.setAttribute('property', property)
          } else {
            tag.setAttribute('name', property)
          }
          tag.setAttribute('content', content)
          document.head.appendChild(tag)
        } catch (err) {
          console.warn(`Erro ao adicionar meta tag ${property}:`, err)
        }
      }

      // Atualizar título
      if (course.name) {
        try {
          document.title = `${course.name} - FlashConCards`
        } catch (err) {
          console.warn('Erro ao atualizar título:', err)
        }
      }

      // Open Graph / Facebook
      addMetaTag('og:type', 'website')
      if (shareUrl) addMetaTag('og:url', shareUrl)
      if (course.name) addMetaTag('og:title', course.name)
      if (description) addMetaTag('og:description', description)
      if (imageUrl) {
        addMetaTag('og:image', imageUrl)
        addMetaTag('og:image:width', '1200')
        addMetaTag('og:image:height', '630')
      }

      // Twitter
      addMetaTag('twitter:card', 'summary_large_image')
      if (shareUrl) addMetaTag('twitter:url', shareUrl)
      if (course.name) addMetaTag('twitter:title', course.name)
      if (description) addMetaTag('twitter:description', description)
      if (imageUrl) {
        addMetaTag('twitter:image', imageUrl)
      }

      // Limpar ao desmontar
      return () => {
        try {
          removeOldTags()
          if (typeof document !== 'undefined') {
            document.title = 'FlashConCards'
          }
        } catch (err) {
          console.warn('Erro ao limpar meta tags:', err)
        }
      }
    } catch (err) {
      console.error('Erro ao configurar meta tags:', err)
    }
  }, [course, courseId])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 p-4">
        <div className="text-center">
          <div className="inline-block animate-spin text-blue-500 text-4xl mb-4">⚙️</div>
          <p className="text-lg font-semibold text-slate-600 dark:text-slate-300">Carregando curso...</p>
        </div>
      </div>
    )
  }

  if (error || !course) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 sm:p-8 text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 mb-4">
            <svg
              className="h-6 w-6 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {error || 'Curso não encontrado'}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            O curso que você está procurando não existe ou foi removido.
          </p>
          <Link
            to="/"
            className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition"
          >
            Voltar para a página inicial
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:py-12">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden">
            {/* Imagem do curso */}
            {imageUrl && (
              <div className="w-full h-64 md:h-96 overflow-hidden">
                <img
                  src={imageUrl}
                  alt={course.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            
            <div className="p-4 sm:p-8">
              <div className="mb-4">
                {course.competition && (
                  <span className="inline-block rounded-full bg-blue-100 dark:bg-blue-900/30 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-blue-700 dark:text-blue-300">
                    {course.competition}
                  </span>
                )}
              </div>
              
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-4">
                {course.name}
              </h1>
              
              {course.description && (
                <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 mb-6">
                  {course.description}
                </p>
              )}
              
              <div className="mb-6">
                {course.originalPrice && course.originalPrice > course.price && (
                  <p className="text-base sm:text-lg text-slate-400 dark:text-slate-500 line-through mb-2">
                    De R$ {course.originalPrice.toFixed(2)}
                  </p>
                )}
                <p className="text-3xl sm:text-4xl font-black text-blue-600 dark:text-blue-400">
                  Por R$ {course.price?.toFixed(2) || '99.90'}
                </p>
                {course.courseDuration && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                    ⏱️ Duração: {course.courseDuration}
                  </p>
                )}
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Link
                  to={`/pagamento?course=${courseId}`}
                  onClick={() => {
                    console.log('Navegando para pagamento com courseId:', courseId)
                  }}
                  className="flex-1 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-6 sm:px-8 py-3 sm:py-4 text-center text-base sm:text-lg font-bold text-white shadow-lg hover:shadow-xl hover:from-blue-500 hover:to-purple-500 transition-all transform hover:scale-105 active:scale-95"
                >
                  Comprar Agora
                </Link>
                <Link
                  to="/"
                  className="flex-1 rounded-full border-2 border-slate-300 dark:border-slate-600 px-6 sm:px-8 py-3 sm:py-4 text-center text-base sm:text-lg font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
                >
                  Ver Todos os Cursos
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default CourseShare

