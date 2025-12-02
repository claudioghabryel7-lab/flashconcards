import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
// Meta tags serão adicionadas via document.head diretamente

const CourseShare = () => {
  const { courseId } = useParams()
  const [course, setCourse] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadCourse = async () => {
      try {
        const courseRef = doc(db, 'courses', courseId)
        const courseDoc = await getDoc(courseRef)
        
        if (courseDoc.exists()) {
          setCourse({ id: courseDoc.id, ...courseDoc.data() })
        }
      } catch (err) {
        console.error('Erro ao carregar curso:', err)
      } finally {
        setLoading(false)
      }
    }

    if (courseId) {
      loadCourse()
    }
  }, [courseId])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg font-semibold text-slate-600">Carregando...</p>
      </div>
    )
  }

  if (!course) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-600 mb-4">Curso não encontrado</p>
          <Link to="/" className="text-blue-600 hover:text-blue-700">
            Voltar para a página inicial
          </Link>
        </div>
      </div>
    )
  }

  const shareUrl = `${window.location.origin}/curso/${courseId}`
  const imageUrl = course.imageBase64 || course.imageUrl || ''
  const description = course.description || `Curso preparatório ${course.name} - ${course.competition}`

  // Adicionar meta tags para compartilhamento
  useEffect(() => {
    if (!course) return

    // Remover meta tags antigas
    const removeOldTags = () => {
      const tags = document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')
      tags.forEach(tag => tag.remove())
    }

    removeOldTags()

    // Adicionar novas meta tags
    const addMetaTag = (property, content) => {
      if (!content) return
      const tag = document.createElement('meta')
      if (property.startsWith('og:')) {
        tag.setAttribute('property', property)
      } else {
        tag.setAttribute('name', property)
      }
      tag.setAttribute('content', content)
      document.head.appendChild(tag)
    }

    // Atualizar título
    document.title = `${course.name} - FlashConCards`

    // Open Graph / Facebook
    addMetaTag('og:type', 'website')
    addMetaTag('og:url', shareUrl)
    addMetaTag('og:title', course.name)
    addMetaTag('og:description', description)
    if (imageUrl) {
      addMetaTag('og:image', imageUrl)
      addMetaTag('og:image:width', '1200')
      addMetaTag('og:image:height', '630')
    }

    // Twitter
    addMetaTag('twitter:card', 'summary_large_image')
    addMetaTag('twitter:url', shareUrl)
    addMetaTag('twitter:title', course.name)
    addMetaTag('twitter:description', description)
    if (imageUrl) {
      addMetaTag('twitter:image', imageUrl)
    }

    // Limpar ao desmontar
    return () => {
      removeOldTags()
      document.title = 'FlashConCards'
    }
  }, [course, shareUrl, description, imageUrl])

  return (
    <>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/30">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
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
            
            <div className="p-8">
              <div className="mb-4">
                <span className="inline-block rounded-full bg-blue-100 px-4 py-2 text-sm font-bold text-blue-700">
                  {course.competition}
                </span>
              </div>
              
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                {course.name}
              </h1>
              
              {course.description && (
                <p className="text-lg text-slate-600 mb-6">
                  {course.description}
                </p>
              )}
              
              <div className="mb-6">
                {course.originalPrice && course.originalPrice > course.price && (
                  <p className="text-lg text-slate-400 line-through mb-2">
                    De R$ {course.originalPrice.toFixed(2)}
                  </p>
                )}
                <p className="text-4xl font-black text-blue-600">
                  Por R$ {course.price?.toFixed(2) || '99.90'}
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  to={`/pagamento?course=${courseId}`}
                  className="flex-1 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-4 text-center text-lg font-bold text-white shadow-lg hover:shadow-xl hover:from-blue-500 hover:to-purple-500 transition-all transform hover:scale-105"
                >
                  Comprar Agora
                </Link>
                <Link
                  to="/"
                  className="flex-1 rounded-full border-2 border-slate-300 px-8 py-4 text-center text-lg font-bold text-slate-700 hover:bg-slate-50 transition-all"
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

