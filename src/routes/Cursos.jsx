import { Link } from 'react-router-dom'
import { useState, useEffect, startTransition } from 'react'
import { collection, doc, getDocs, query, where, limit } from 'firebase/firestore'
import { db } from '../firebase/config'
import LazyImage from '../components/LazyImage'
import { AcademicCapIcon, BookOpenIcon, SparklesIcon, ClockIcon } from '@heroicons/react/24/solid'
import { buildWhatsAppCourseUrl } from '../utils/courseAccess'
import { trackButtonClick } from '../utils/googleAds'

const Cursos = () => {
  const [courses, setCourses] = useState([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const whatsappNumber = '5562981841878'
  const whatsappMessage = encodeURIComponent('Olá! Gostaria de saber mais sobre os cursos preparatórios disponíveis. Quero começar!')
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const coursesRef = collection(db, 'courses')
        const q = query(
          coursesRef,
          where('active', '==', true),
          limit(20)
        )

        const snapshot = await getDocs(q)
        const data = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        }))

        const sortedData = data.sort((a, b) => {
          if (a.featured === true && b.featured !== true) return -1
          if (a.featured !== true && b.featured === true) return 1
          return 0
        })

        startTransition(() => {
          setCourses(sortedData)
          setLoadingCourses(false)
        })
      } catch (error) {
        console.error('Erro ao carregar cursos:', error)
        setLoadingCourses(false)
      }
    }

    loadCourses()
  }, [])

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  return (
    <div className="min-h-screen py-16 sm:py-20 md:py-24">
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center space-y-4 mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border-primary bg-background-card text-xs font-semibold text-accent-orange">
            <AcademicCapIcon className="h-4 w-4" />
            Cursos Premium
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-text-primary">
            Escolha seu caminho para a
            <span className="block gradient-text">
              Aprovação
            </span>
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            Cursos completos para Polícia Militar, Polícia Civil, GCM e muito mais. 
            Conteúdo atualizado e focado na banca do seu concurso.
          </p>
        </div>

        {/* Cursos Grid */}
        {loadingCourses ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-accent-orange border-t-transparent"></div>
            <p className="mt-6 text-lg text-text-secondary">Carregando cursos...</p>
          </div>
        ) : courses.length > 0 ? (
          <div className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((course, index) => (
              <div
                key={course.id}
                className="group relative bg-background-card border border-border-primary rounded-xl overflow-hidden hover:border-accent-orange/50 transition-all duration-300 hover:-translate-y-1"
              >
                {/* Image Section */}
                <div className="relative h-56 overflow-hidden">
                  {(course.imageUrl || course.imageBase64) ? (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent z-10"></div>
                      <LazyImage
                        src={course.imageUrl || course.imageBase64}
                        alt={course.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                        priority={index < 6}
                      />
                    </>
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-accent-orange/20 to-accent-cyan/20 flex items-center justify-center">
                      <BookOpenIcon className="h-16 w-16 text-accent-orange" />
                    </div>
                  )}

                  {course.featured && (
                    <div className="absolute top-4 left-4 z-20">
                      <span className="inline-flex items-center gap-1.5 bg-accent-orange text-background-primary px-3 py-1.5 rounded-full text-xs font-bold">
                        <SparklesIcon className="h-3 w-3" />
                        Mais Vendido
                      </span>
                    </div>
                  )}
                </div>

                {/* Content Section */}
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 bg-accent-orange/10 text-accent-orange px-3 py-1 rounded-full text-xs font-bold">
                      {course.competition}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-text-primary leading-tight">
                    {course.name}
                  </h3>

                  {course.description && (
                    <p className="text-sm text-text-secondary line-clamp-2">
                      {course.description}
                    </p>
                  )}

                  <div className="flex items-baseline gap-2 pt-2">
                    {course.originalPrice && course.originalPrice > course.price && (
                      <p className="text-sm text-text-secondary line-through">
                        {formatCurrency(course.originalPrice)}
                      </p>
                    )}
                    <p className="text-3xl font-black gradient-text">
                      {formatCurrency(course.price || 99.90)}
                    </p>
                  </div>

                  {course.courseDuration && (
                    <p className="text-xs text-text-secondary flex items-center gap-1">
                      <ClockIcon className="h-3 w-3" />
                      {course.courseDuration}
                    </p>
                  )}

                  <div className="flex gap-3 pt-2">
                    <a
                      href={buildWhatsAppCourseUrl(course.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={trackButtonClick}
                      className="flex-1 bg-gradient-to-r from-accent-orange to-accent-cyan text-background-primary px-6 py-3 rounded-xl font-bold text-sm hover:shadow-glow transition-all hover:scale-105 text-center"
                    >
                      Comprar via WhatsApp
                    </a>
                  </div>
                  <p className="text-xs text-text-muted pt-1">
                    Sem compra: acesse 3 tópicos liberados + Guia Mentorado
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 rounded-3xl bg-background-card border-2 border-dashed border-border-primary">
            <BookOpenIcon className="h-16 w-16 mx-auto mb-4 text-text-secondary" />
            <p className="text-lg text-text-secondary">Nenhum curso disponível no momento.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Cursos
