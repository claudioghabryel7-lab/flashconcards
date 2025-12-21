import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot, query, setDoc, serverTimestamp, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import LazyImage from '../components/LazyImage'
import { useIntersectionObserver } from '../hooks/useIntersectionObserver'
import { 
  ShieldCheckIcon, 
  SparklesIcon, 
  ClockIcon,
  AcademicCapIcon,
  ChartBarIcon,
  TrophyIcon,
  LightBulbIcon,
  QuestionMarkCircleIcon,
  CalendarIcon,
  ChatBubbleLeftRightIcon,
  BookOpenIcon,
  RocketLaunchIcon,
  ShareIcon
} from '@heroicons/react/24/solid'
import { trackButtonClick } from '../utils/googleAds'
import HomeBanner from '../components/HomeBanner'
import Reviews from '../components/Reviews'
import NewsSection from '../components/NewsSection'

const features = [
  {
    icon: BookOpenIcon,
    title: 'Flashcards Inteligentes',
    description: 'Sistema de repetição espaçada (SRS) que adapta o ritmo de estudos ao seu desempenho. Mais de 8 matérias completas com módulos organizados.',
    color: 'from-blue-500 to-blue-600'
  },
  {
    icon: QuestionMarkCircleIcon,
    title: 'FlashQuestões',
    description: 'Questões fictícias no estilo das principais bancas geradas por IA. Questões personalizadas por módulo com explicações detalhadas (BIZUs) e índice de acerto.',
    color: 'from-purple-500 to-purple-600'
  },
  {
    icon: ChatBubbleLeftRightIcon,
    title: 'Flash Mentor - IA Personalizada',
    description: 'Assistente de IA que responde dúvidas sobre o edital, explica conceitos e orienta seus estudos 24/7. Baseado no edital do concurso.',
    color: 'from-green-500 to-green-600'
  },
  {
    icon: RocketLaunchIcon,
    title: 'Como Estudar? - Bot Guia',
    description: 'Bot inteligente que analisa seu progresso e sugere qual módulo estudar. Acompanha fases de estudo e calcula dias restantes para completar tudo.',
    color: 'from-orange-500 to-orange-600'
  },
  {
    icon: ChartBarIcon,
    title: 'Progresso Completo',
    description: 'Acompanhe seu progresso com calendário visual, streak de estudos, estatísticas por matéria e visualização clara do que já foi estudado.',
    color: 'from-indigo-500 to-indigo-600'
  },
  {
    icon: CalendarIcon,
    title: 'Calendário de Progresso',
    description: 'Visualize todos os dias que você estudou em um calendário interativo. Mantenha sua sequência de estudos e aumente seu streak.',
    color: 'from-pink-500 to-pink-600'
  },
  {
    icon: LightBulbIcon,
    title: 'Explicações com IA',
    description: 'Receba explicações detalhadas de cada flashcard geradas por IA, contextualizadas com o edital do concurso para melhor compreensão.',
    color: 'from-teal-500 to-teal-600'
  }
]

const benefits = [
  'Flashcards com sistema de repetição espaçada (SRS)',
  'FlashQuestões geradas por IA no estilo das principais bancas',
  'Flash Mentor - IA que responde dúvidas sobre o edital',
  'Bot "Como Estudar?" - guia personalizado de estudos',
  'Progresso completo com estatísticas e métricas',
  'Calendário visual e streak de estudos',
  'Explicações detalhadas geradas por IA',
]

const PublicHome = () => {
  // Número do WhatsApp (formato: código do país + DDD + número, sem espaços ou caracteres especiais)
  const whatsappNumber = '5562981841878'
  const whatsappMessage = encodeURIComponent('Olá! Gostaria de saber mais sobre os cursos preparatórios disponíveis.')
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`
  
  // Carregar cursos
  const [courses, setCourses] = useState([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  
  // Intersection observers para animações
  const [heroRef, heroVisible] = useIntersectionObserver({ once: true })
  const [coursesRef, coursesVisible] = useIntersectionObserver({ once: true })
  const [featuresRef, featuresVisible] = useIntersectionObserver({ once: true })
  const [ctaRef, ctaVisible] = useIntersectionObserver({ once: true })
  const [newsRef, newsVisible] = useIntersectionObserver({ once: true })

  useEffect(() => {
    // Tentar carregar do cache primeiro
    const cacheKey = 'courses_active'
    try {
      const cached = localStorage.getItem(`firebase_cache_${cacheKey}`)
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached)
        const now = Date.now()
        if (now - timestamp < 5 * 60 * 1000 && cachedData) {
          // Ordenar: cursos em destaque primeiro, depois os outros
          const sortedCached = cachedData.sort((a, b) => {
            if (a.featured === true && b.featured !== true) return -1
            if (a.featured !== true && b.featured === true) return 1
            return 0
          })
          setCourses(sortedCached)
          setLoadingCourses(false)
        }
      }
    } catch (err) {
      console.warn('Erro ao ler cache de cursos:', err)
    }
    
    const coursesRef = collection(db, 'courses')
    const q = query(coursesRef, where('active', '==', true))
    let retryCount = 0
    const maxRetries = 3
    
    const loadData = () => {
    const unsub = onSnapshot(q, async (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      
      // Ordenar: cursos em destaque primeiro, depois os outros
      const sortedData = data.sort((a, b) => {
        // Cursos destacados primeiro
        if (a.featured === true && b.featured !== true) return -1
        if (a.featured !== true && b.featured === true) return 1
        // Se ambos destacados ou ambos não destacados, manter ordem original
        return 0
      })
      
      setCourses(sortedData)
      setLoadingCourses(false)
        retryCount = 0
        
        // Preload das primeiras 3 imagens de cursos (acima da dobra)
        sortedData.slice(0, 3).forEach((course) => {
          const imageUrl = course.imageBase64 || course.imageUrl
          if (imageUrl) {
            const link = document.createElement('link')
            link.rel = 'preload'
            link.as = 'image'
            link.href = imageUrl
            document.head.appendChild(link)
          }
        })
        
        // Salvar no cache (com ordenação)
        try {
          localStorage.setItem(`firebase_cache_${cacheKey}`, JSON.stringify({
            data: sortedData,
            timestamp: Date.now(),
          }))
        } catch (err) {
          console.warn('Erro ao salvar cache de cursos:', err)
        }
    }, (error) => {
      console.error('Erro ao carregar cursos:', error)
        
        // Retry logic
        if (retryCount < maxRetries) {
          retryCount++
          setTimeout(() => {
            loadData()
          }, 1000 * retryCount)
        } else {
      setCourses([])
      setLoadingCourses(false)
        }
    })
      return unsub
    }

    const unsub = loadData()
    return () => unsub()
  }, [])

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  return (
    <section className="space-y-8 sm:space-y-12 md:space-y-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Carrossel de Banners */}
      <HomeBanner />
      
      {/* Cursos Disponíveis - Movido para o início */}
      {courses.length > 0 && (
        <div
          ref={coursesRef}
          className={`space-y-8 animate-on-scroll fade-up ${coursesVisible ? 'visible' : ''}`}
        >
          <div className="text-center space-y-3">
            <div className="inline-block">
              <span className="tech-badge px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Cursos Premium
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black gradient-text-tech mb-2">
              Cursos Preparatórios Disponíveis
            </h2>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Escolha o curso ideal para sua aprovação. Plataforma completa com IA e recursos avançados.
            </p>
          </div>
          <div className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((course, index) => {
              return (
                <div
                  key={course.id}
                  className={`group relative tech-card tech-shine rounded-3xl overflow-hidden hover-scale hover-lift animate-on-scroll fade-up ${coursesVisible ? 'visible' : ''}`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  {/* Gradient Background Effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-cyan-500/5 to-green-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  
                  {/* Tech Glow Border */}
                  <div className="tech-glow absolute inset-0 rounded-3xl pointer-events-none"></div>
                  
                  <div className="relative z-10">
                    {/* Imagem do curso */}
                    {(course.imageBase64 || course.imageUrl) && (
                      <div className="w-full h-52 overflow-hidden relative">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent z-10"></div>
                        <LazyImage
                          src={course.imageBase64 || course.imageUrl}
                          alt={course.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                          priority={index < 3}
                        />
                      </div>
                    )}
                    
                    <div className="p-6 sm:p-7">
                      <div className="mb-4 flex items-center gap-2 flex-wrap">
                        {course.featured && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-yellow-400 via-orange-500 to-pink-500 px-4 py-1.5 text-xs font-black text-white shadow-lg relative overflow-hidden">
                            <span className="relative z-10 flex items-center gap-1">
                              <SparklesIcon className="h-3 w-3" />
                              Mais Vendido
                            </span>
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]"></div>
                          </span>
                        )}
                        <span className="inline-block rounded-full glass-tech px-4 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 border border-blue-500/30">
                          {course.competition}
                        </span>
                      </div>
                      
                      <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mb-3 leading-tight">
                        {course.name}
                      </h3>
                      
                      {course.description && (
                        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-5 line-clamp-2 leading-relaxed">
                          {course.description}
                        </p>
                      )}
                      
                      <div className="mb-5 pb-5 border-b border-slate-200/50 dark:border-slate-700/50">
                        {course.originalPrice && course.originalPrice > course.price && (
                          <p className="text-sm text-slate-400 dark:text-slate-500 line-through mb-1">
                            {formatCurrency(course.originalPrice)}
                          </p>
                        )}
                        <div className="flex items-baseline gap-2">
                          <p className="text-3xl font-black gradient-text-tech">
                            {formatCurrency(course.price || 99.90)}
                          </p>
                        </div>
                        {course.courseDuration && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1">
                            <ClockIcon className="h-3 w-3" />
                            Duração: {course.courseDuration}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex gap-3">
                        <Link
                          to={`/pagamento?course=${course.id}`}
                          onClick={trackButtonClick}
                        className="flex-1 tech-button rounded-xl px-6 py-3.5 text-center text-sm font-bold text-white shadow-lg relative overflow-hidden"
                        aria-label={`Comprar curso ${course.name}`}
                      >
                        <span className="relative z-10">Comprar Agora</span>
                      </Link>
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.preventDefault()
                            const shareUrl = `${window.location.origin}/curso/${course.id}`
                            
                            if (navigator.share) {
                              try {
                                await navigator.share({
                                  title: course.name,
                                  text: course.description || `Confira o curso ${course.name}`,
                                  url: shareUrl,
                                })
                              } catch (err) {
                                if (err.name !== 'AbortError') {
                                  await navigator.clipboard.writeText(shareUrl)
                                  alert('Link copiado para a área de transferência!')
                                }
                              }
                            } else {
                              await navigator.clipboard.writeText(shareUrl)
                              alert('Link copiado para a área de transferência!')
                            }
                          }}
                          className="rounded-xl glass-tech px-4 py-3.5 text-slate-700 dark:text-slate-300 transition-all flex items-center justify-center hover-scale border border-slate-200/50 dark:border-slate-700/50"
                          title="Compartilhar curso"
                        >
                          <ShareIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )})}
          </div>
        </div>
      )}

      {/* Hero Section - Tech Senior */}
      <div 
        ref={heroRef}
        className={`tech-section relative rounded-3xl overflow-hidden tech-gradient-bg p-8 sm:p-12 md:p-16 text-white md:grid md:grid-cols-2 md:gap-12 items-center shadow-2xl animate-on-scroll scale ${heroVisible ? 'visible' : ''}`}
      >
        {/* Grid Pattern Overlay */}
        <div className="tech-grid absolute inset-0 opacity-20"></div>
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/40 via-cyan-900/40 to-green-900/40"></div>
        
        <div className="relative z-10 space-y-6">
          <div className="inline-block">
            <span className="tech-badge px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white/90 border border-white/30">
              Plataforma Completa
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-tight">
            Plataforma de Estudos
            <span className="block mt-2 bg-gradient-to-r from-white via-blue-100 to-cyan-100 bg-clip-text text-transparent">
              Completa com IA
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-white/90 leading-relaxed max-w-xl">
            Plataforma completa com IA, flashcards inteligentes, questões personalizadas,
            suporte 24/7 para acelerar sua aprovação.
          </p>
          <div className="flex flex-col sm:flex-row flex-wrap gap-4 pt-4">
            <Link
              to="/login"
              className="tech-button rounded-xl bg-white px-8 py-4 text-base font-bold text-blue-600 shadow-xl text-center whitespace-nowrap"
            >
              Começar agora
            </Link>
            <Link
              to="/login"
              className="rounded-xl glass-tech border-2 border-white/30 px-8 py-4 text-base font-bold text-white text-center hover:bg-white/10 transition-all whitespace-nowrap hover-scale"
            >
              Já tenho conta
            </Link>
          </div>
        </div>
        
        <div className="relative z-10 space-y-4 mt-8 md:mt-0">
          {benefits.map((benefit, index) => (
            <div
              key={benefit}
              className="glass-tech rounded-2xl p-4 sm:p-5 flex items-center gap-4 hover-scale transition-all group"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                <ShieldCheckIcon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <span className="text-sm sm:text-base font-semibold text-white/95">{benefit}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Features Grid - Tech Senior */}
      <div ref={featuresRef} className="tech-section relative">
        <div className="text-center mb-12 space-y-4">
          <div className="inline-block">
            <span className="tech-badge px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Recursos Avançados
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black gradient-text-tech mb-2">
            Tudo que você precisa para sua aprovação
          </h2>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Plataforma completa com inteligência artificial e recursos avançados de última geração
          </p>
        </div>
        <div className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <div
                key={index}
                className={`group relative tech-card tech-shine rounded-3xl p-6 sm:p-7 hover-scale hover-lift animate-on-scroll fade-up ${featuresVisible ? 'visible' : ''}`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {/* Tech Glow Border */}
                <div className="tech-glow absolute inset-0 rounded-3xl pointer-events-none"></div>
                
                {/* Gradient Background Effect */}
                <div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-20 rounded-full blur-3xl transition-opacity duration-500`}></div>
                
                <div className="relative z-10">
                  <div 
                    className={`inline-flex p-4 rounded-2xl bg-gradient-to-br ${feature.color} mb-5 shadow-xl hover-scale transition-transform`}
                  >
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white mb-3 leading-tight">
                    {feature.title}
                  </h3>
                  <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Avaliações dos Alunos */}
      <div className="rounded-2xl bg-white dark:bg-slate-800 p-6 sm:p-8 shadow-sm">
        <Reviews />
      </div>

      {/* CTA Final - Tech Senior */}
      <div 
        ref={ctaRef}
        className={`tech-section relative rounded-3xl overflow-hidden tech-gradient-bg p-10 sm:p-12 md:p-16 text-center text-white animate-on-scroll scale ${ctaVisible ? 'visible' : ''}`}
      >
        {/* Grid Pattern Overlay */}
        <div className="tech-grid absolute inset-0 opacity-20"></div>
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/50 via-cyan-900/50 to-green-900/50"></div>
        
        <div className="relative z-10 space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-lg mb-4">
            <AcademicCapIcon className="h-10 w-10 sm:h-12 sm:w-12 text-white" />
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-4">
            Pronto para começar sua jornada?
          </h2>
          <p className="text-lg sm:text-xl text-white/90 mb-8 max-w-2xl mx-auto leading-relaxed">
            Junte-se a centenas de alunos que já estão se preparando para seus concursos com nossa plataforma completa.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center flex-wrap">
            <Link
              to="/login"
              className="tech-button rounded-xl bg-white px-10 py-4 text-base sm:text-lg font-black text-blue-600 shadow-2xl whitespace-nowrap"
            >
              Começar Agora
            </Link>
            <Link
              to="/pagamento"
              onClick={trackButtonClick}
              className="tech-button rounded-xl bg-white px-10 py-4 text-base sm:text-lg font-black text-blue-600 shadow-2xl whitespace-nowrap"
            >
              Garantir Promoção
            </Link>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl glass-tech border-2 border-white/30 px-10 py-4 text-base sm:text-lg font-black text-white hover:bg-white/10 transition-all whitespace-nowrap hover-scale"
            >
              Falar no WhatsApp
            </a>
          </div>
        </div>
      </div>

      {/* Seção de Notícias - No final da página */}
      <div ref={newsRef} className={`animate-on-scroll fade-up ${newsVisible ? 'visible' : ''}`}>
        <NewsSection />
      </div>
    </section>
  )
}

export default PublicHome

