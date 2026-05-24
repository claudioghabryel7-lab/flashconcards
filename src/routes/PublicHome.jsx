import { Link } from 'react-router-dom'
import { useEffect, useState, lazy, Suspense, startTransition } from 'react'
import { collection, doc, getDocs, query, setDoc, serverTimestamp, where, limit } from 'firebase/firestore'
import { db } from '../firebase/config'
import LazyImage from '../components/LazyImage'
import { useIntersectionObserver } from '../hooks/useIntersectionObserver'
// Lazy load de ícones - carregar apenas quando necessário
import { 
  ShieldCheckIcon, 
  SparklesIcon, 
  ClockIcon,
  AcademicCapIcon,
  BookOpenIcon,
  RocketLaunchIcon,
  ShareIcon
} from '@heroicons/react/24/solid'
import { trackButtonClick } from '../utils/googleAds'
import HomeBanner from '../components/HomeBanner'
// Lazy load de componentes pesados que não são críticos para LCP
const Reviews = lazy(() => import('../components/Reviews'))
const NewsSection = lazy(() => import('../components/NewsSection'))

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
  
  // SEO: Adicionar meta tags e Schema.org dinamicamente
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    
    // Atualizar título se necessário
    const currentTitle = document.title
    if (!currentTitle.includes('FlashConCards')) {
      document.title = 'FlashConCards - Flashcards para Concursos Públicos | Polícia Militar, PMGO, PC'
    }
    
    // Adicionar Schema.org para Organization e WebSite
    const organizationSchema = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'FlashConCards',
      url: 'https://www.flashconcards.com.br',
      logo: 'https://www.flashconcards.com.br/logo.svg',
      description: 'Plataforma de flashcards para concursos públicos. Estude para Polícia Militar, PMGO, PC, GCM e muito mais.',
      sameAs: [
        // Adicione redes sociais aqui se tiver
      ],
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'Customer Service',
        availableLanguage: 'Portuguese'
      }
    }
    
    const websiteSchema = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'FlashConCards',
      url: 'https://www.flashconcards.com.br',
      description: 'A melhor plataforma de flashcards para concursos públicos. Estude para Polícia Militar, PMGO, PC, GCM e muito mais.',
      potentialAction: {
        '@type': 'SearchAction',
        target: 'https://www.flashconcards.com.br/?q={search_term_string}',
        'query-input': 'required name=search_term_string'
      }
    }
    
    // Remover schemas antigos
    const oldSchemas = document.querySelectorAll('script[type="application/ld+json"]')
    oldSchemas.forEach(s => s.remove())
    
    // Adicionar novos schemas
    try {
      const orgScript = document.createElement('script')
      orgScript.type = 'application/ld+json'
      orgScript.textContent = JSON.stringify(organizationSchema)
      document.head.appendChild(orgScript)
      
      const webScript = document.createElement('script')
      webScript.type = 'application/ld+json'
      webScript.textContent = JSON.stringify(websiteSchema)
      document.head.appendChild(webScript)
    } catch (err) {
      console.warn('Erro ao adicionar Schema.org:', err)
    }
    
    return () => {
      // Limpar ao desmontar
      const schemas = document.querySelectorAll('script[type="application/ld+json"]')
      schemas.forEach(s => {
        try {
          const content = JSON.parse(s.textContent)
          if (content['@type'] === 'Organization' || content['@type'] === 'WebSite') {
            s.remove()
          }
        } catch (e) {
          // Ignorar
        }
      })
    }
  }, [])
  
  // Intersection observers para animações - com fallback para desktop
  const [heroRef, heroVisible] = useIntersectionObserver({ once: true, threshold: 0.01, rootMargin: '0px' })
  const [coursesRef, coursesVisible] = useIntersectionObserver({ once: true, threshold: 0.01, rootMargin: '0px' })
  const [ctaRef, ctaVisible] = useIntersectionObserver({ once: true, threshold: 0.01, rootMargin: '0px' })
  const [newsRef, newsVisible] = useIntersectionObserver({ once: true, threshold: 0.01, rootMargin: '0px' })
  
  // Fallback: mostrar elementos após um delay se IntersectionObserver não funcionar
  useEffect(() => {
    const timer = setTimeout(() => {
      // Forçar visibilidade de todos os elementos após 500ms se não estiverem visíveis
      // Isso garante que o conteúdo apareça mesmo se IntersectionObserver falhar
      if (!heroVisible || !coursesVisible || !ctaVisible || !newsVisible) {
        // Os elementos já devem estar visíveis pelo CSS, mas garantimos aqui também
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [heroVisible, coursesVisible, ctaVisible, newsVisible])

  useEffect(() => {
    // Tratamento de erro mais robusto para desktop
    try {
      if (!db) {
        setLoadingCourses(false)
        return
      }
    } catch (error) {
      console.error('[PublicHome] Erro ao verificar db:', error)
      setLoadingCourses(false)
      return
    }

    const cacheKey = 'courses_active'
    const CACHE_DURATION = 10 * 60 * 1000 // 10 minutos
    
    // Função para ordenar cursos
    const sortCourses = (data) => {
      return data.sort((a, b) => {
        if (a.featured === true && b.featured !== true) return -1
        if (a.featured !== true && b.featured === true) return 1
        return 0
      })
    }
    
    // Carregar do cache imediatamente (síncrono para renderização instantânea)
    try {
      const cached = localStorage.getItem(`firebase_cache_${cacheKey}`)
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached)
        const now = Date.now()
        if (now - timestamp < CACHE_DURATION && cachedData && cachedData.length > 0) {
          startTransition(() => {
            setCourses(sortCourses([...cachedData]))
            setLoadingCourses(false)
          })
          // Continuar carregando em background para atualizar cache
        } else {
          setLoadingCourses(true)
        }
      }
    } catch (err) {
      console.warn('Erro ao ler cache de cursos:', err)
    }
    
    // Carregar do Firestore (usar getDocs ao invés de onSnapshot para dados estáticos)
    const loadCourses = async () => {
      try {
        const coursesRef = collection(db, 'courses')
        const q = query(
          coursesRef, 
          where('active', '==', true),
          limit(20) // Reduzir limite para melhor performance inicial
        )
        
        const snapshot = await getDocs(q)
        const data = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data(),
        }))
        
        // Ordenar: cursos em destaque primeiro
        const sortedData = sortCourses(data)
        
        // Atualizar estado de forma não bloqueante
        startTransition(() => {
          setCourses(sortedData)
          setLoadingCourses(false)
        })
        
        // Preload apenas das primeiras 3 imagens (prioridade alta)
        // Apenas imageUrl (URL externa), não imageBase64 (muito pesado)
        sortedData.slice(0, 3).forEach((course) => {
          const imageUrl = course.imageUrl // Apenas imageUrl, não imageBase64
          if (imageUrl && typeof imageUrl === 'string' && !imageUrl.startsWith('data:')) {
            try {
              // Preload usando link tag (mais eficiente)
              const link = document.createElement('link')
              link.rel = 'preload'
              link.as = 'image'
              link.href = imageUrl
              link.setAttribute('fetchpriority', 'high')
              document.head.appendChild(link)
            } catch (err) {
              // Ignorar erros de preload (não crítico)
            }
          }
        })
        
        // Salvar no cache (apenas dados essenciais para evitar quota)
        try {
          // Comprimir cursos - manter apenas imageUrl (não imageBase64)
          const compressedCourses = sortedData.map(course => ({
            id: course.id,
            name: course.name,
            competition: course.competition,
            price: course.price,
            originalPrice: course.originalPrice,
            featured: course.featured,
            active: course.active,
            imageUrl: course.imageUrl, // Manter imageUrl (é URL externa, pequena)
            // Não salvar imageBase64 (é muito grande)
          }))
          
          localStorage.setItem(`firebase_cache_${cacheKey}`, JSON.stringify({
            data: compressedCourses,
            timestamp: Date.now(),
          }))
        } catch (err) {
          if (err.name === 'QuotaExceededError') {
            console.warn('Quota excedida ao salvar cursos. Cache não será salvo.')
            // Não salvar cursos se exceder quota
          } else {
            console.warn('Erro ao salvar cache de cursos:', err)
          }
        }
      } catch (error) {
        console.error('Erro ao carregar cursos:', error)
        setLoadingCourses(false)
      }
    }
    
    // Carregar imediatamente se não houver cache válido, senão carregar em background
    const hasValidCache = (() => {
      try {
        const cached = localStorage.getItem(`firebase_cache_${cacheKey}`)
        if (cached) {
          const { data: cachedData, timestamp } = JSON.parse(cached)
          const now = Date.now()
          return now - timestamp < CACHE_DURATION && cachedData && cachedData.length > 0
        }
      } catch {}
      return false
    })()
    
    if (hasValidCache) {
      // Carregar em background para atualizar cache (não bloqueia UI)
      // Usar startTransition para não bloquear renderização
      startTransition(() => {
        setTimeout(() => loadCourses(), 100)
      })
    } else {
      // Carregar imediatamente se não houver cache, mas usar startTransition para não bloquear
      startTransition(() => {
        loadCourses()
      })
    }
  }, [])

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-blue-900/20 dark:to-indigo-900/20">
      <section className="space-y-12 sm:space-y-16 md:space-y-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-8 sm:py-12 md:py-16">
        {/* Hero Section - Modern Design */}
        <div 
          ref={heroRef}
          className={`relative rounded-3xl overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-8 sm:p-12 md:p-16 text-white shadow-2xl ${heroVisible ? 'animate-on-scroll fade-up visible' : 'animate-on-scroll fade-up'}`}
        >
          {/* Animated Background Elements */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
          </div>
          
          {/* Grid Pattern */}
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
          
          <div className="relative z-10 md:grid md:grid-cols-2 md:gap-12 items-center">
            <div className="space-y-6 md:space-y-8">
              <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 border border-white/30">
                <SparklesIcon className="h-4 w-4" />
                <span className="text-sm font-semibold">Plataforma #1 de Flashcards</span>
              </div>
              
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-tight">
                Domine seu
                <span className="block mt-2 bg-gradient-to-r from-yellow-200 via-pink-200 to-cyan-200 bg-clip-text text-transparent">
                  Concurso Público
                </span>
              </h1>
              
              <p className="text-lg sm:text-xl text-white/90 leading-relaxed max-w-xl">
                Flashcards inteligentes com IA, repetição espaçada e simulados personalizados. 
                A forma mais eficiente de estudar para PM, PC, GCM e muito mais.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Link
                  to="/login"
                  className="group relative inline-flex items-center justify-center gap-2 bg-white text-blue-600 px-8 py-4 rounded-xl font-bold text-base sm:text-lg shadow-xl hover:shadow-2xl transition-all hover:scale-105"
                >
                  <RocketLaunchIcon className="h-5 w-5 group-hover:animate-bounce" />
                  Começar Agora
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 bg-white/10 backdrop-blur-sm text-white px-8 py-4 rounded-xl font-bold text-base sm:text-lg border-2 border-white/30 hover:bg-white/20 transition-all"
                >
                  Já tenho conta
                </Link>
              </div>
              
              <div className="flex items-center gap-6 pt-4">
                <div className="flex -space-x-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 border-2 border-white flex items-center justify-center text-xs font-bold">
                      {i}
                    </div>
                  ))}
                </div>
                <div className="text-sm">
                  <span className="font-bold">+500 alunos</span> aprovados
                </div>
              </div>
            </div>
            
            <div className="hidden md:block space-y-4">
              {benefits.slice(0, 5).map((benefit, index) => (
                <div
                  key={benefit}
                  className="group bg-white/10 backdrop-blur-sm rounded-2xl p-5 flex items-center gap-4 hover:bg-white/20 transition-all cursor-pointer border border-white/20"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ShieldCheckIcon className="h-6 w-6 text-white" />
                  </div>
                  <span className="text-base font-semibold">{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Carrossel de Banners */}
        <HomeBanner />
        
        {/* Cursos Disponíveis - Modern Design */}
        <div
          id="cursos"
          data-courses-section
          ref={coursesRef}
          className={`space-y-8 ${coursesVisible ? 'animate-on-scroll fade-up visible' : 'animate-on-scroll fade-up'}`}
        >
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
              <AcademicCapIcon className="h-5 w-5" />
              Cursos Premium
            </div>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 dark:text-white">
              Escolha seu caminho para a
              <span className="block bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Aprovação
              </span>
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Cursos completos para Polícia Militar, Polícia Civil, GCM e muito mais. 
              Conteúdo atualizado e focado na banca do seu concurso.
            </p>
          </div>
          
          {loadingCourses ? (
            <div className="text-center py-16">
              <div className="inline-block animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent"></div>
              <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">Carregando cursos...</p>
            </div>
          ) : courses.length > 0 ? (
            <div className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3">
              {courses.map((course, index) => (
                <div
                  key={course.id}
                  className={`group relative bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 ${coursesVisible ? 'animate-on-scroll fade-up visible' : 'animate-on-scroll fade-up'}`}
                  style={{ animationDelay: `${index * 0.1}s` }}
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
                      <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
                        <BookOpenIcon className="h-16 w-16 text-slate-400" />
                      </div>
                    )}
                    
                    {course.featured && (
                      <div className="absolute top-4 left-4 z-20">
                        <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg">
                          <SparklesIcon className="h-3 w-3" />
                          Mais Vendido
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Content Section */}
                  <div className="p-6 space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-xs font-bold">
                        {course.competition}
                      </span>
                    </div>
                    
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                      {course.name}
                    </h3>
                    
                    {course.description && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                        {course.description}
                      </p>
                    )}
                    
                    <div className="flex items-baseline gap-2 pt-2">
                      {course.originalPrice && course.originalPrice > course.price && (
                        <p className="text-sm text-slate-400 line-through">
                          {formatCurrency(course.originalPrice)}
                        </p>
                      )}
                      <p className="text-3xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                        {formatCurrency(course.price || 99.90)}
                      </p>
                    </div>
                    
                    {course.courseDuration && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <ClockIcon className="h-3 w-3" />
                        {course.courseDuration}
                      </p>
                    )}
                    
                    <div className="flex gap-3 pt-2">
                      <Link
                        to={`/pagamento?course=${course.id}`}
                        onClick={trackButtonClick}
                        className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:shadow-lg transition-all hover:scale-105 text-center"
                      >
                        Comprar Agora
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
                                alert('Link copiado!')
                              }
                            }
                          } else {
                            await navigator.clipboard.writeText(shareUrl)
                            alert('Link copiado!')
                          }
                        }}
                        className="px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                      >
                        <ShareIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 rounded-3xl bg-white dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-700">
              <BookOpenIcon className="h-16 w-16 mx-auto mb-4 text-slate-400" />
              <p className="text-lg text-slate-600 dark:text-slate-400">Nenhum curso disponível no momento.</p>
            </div>
          )}
        </div>

        {/* Avaliações dos Alunos - Modern Design */}
        <div className="space-y-8">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-2 rounded-full text-sm font-bold shadow-lg">
              <SparklesIcon className="h-5 w-5" />
              Avaliações dos Alunos
            </div>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 dark:text-white">
              O que nossos alunos
              <span className="block bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                dizem sobre nós
              </span>
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
              Histórias reais de aprovação e sucesso de quem confiou na FlashConCards
            </p>
          </div>
          <div className="rounded-3xl bg-white dark:bg-slate-800 p-8 sm:p-12 shadow-2xl reviews-container">
            <Suspense fallback={
              <div className="text-center py-16">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-600 border-t-transparent"></div>
                <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">Carregando avaliações...</p>
              </div>
            }>
              <Reviews />
            </Suspense>
          </div>
        </div>

        {/* Seção SEO - Conteúdo Rico - Modern Design */}
        <div className="relative rounded-3xl bg-gradient-to-br from-white to-blue-50 dark:from-slate-800 dark:to-slate-900 p-8 sm:p-12 md:p-16 shadow-xl border border-slate-200 dark:border-slate-700">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center space-y-4">
              <h2 className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white">
                Por que escolher a
                <span className="block bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  FlashConCards?
                </span>
              </h2>
              <p className="text-lg text-slate-600 dark:text-slate-400">
                A plataforma completa para sua aprovação em concursos públicos
              </p>
            </div>
            
            <div className="grid gap-6 md:grid-cols-2">
              {[
                { icon: ShieldCheckIcon, title: 'Contúdo Atualizado', desc: 'Flashcards sempre atualizados com as últimas bancas e editais' },
                { icon: RocketLaunchIcon, title: 'SRS Inteligente', desc: 'Sistema de repetição espaçada que otimiza seu tempo de estudo' },
                { icon: AcademicCapIcon, title: 'IA Avançada', desc: 'Assistente de IA disponível 24/7 para tirar suas dúvidas' },
                { icon: BookOpenIcon, title: 'Simulados Reais', desc: 'Questões no estilo das principais bancas do Brasil' },
              ].map((item, index) => (
                <div key={index} className="group bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <item.icon className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{item.title}</h3>
                      <p className="text-slate-600 dark:text-slate-400 text-sm">{item.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA Final - Modern Design */}
        <div 
          ref={ctaRef}
          className={`relative rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-10 sm:p-12 md:p-16 text-center text-white shadow-2xl ${ctaVisible ? 'animate-on-scroll fade-up visible' : 'animate-on-scroll fade-up'}`}
        >
          {/* Animated Background */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
          </div>
          
          {/* Grid Pattern */}
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
          
          <div className="relative z-10 space-y-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-lg mb-4">
              <AcademicCapIcon className="h-10 w-10 text-white" />
            </div>
            
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-black">
              Pronto para começar sua
              <span className="block mt-2 bg-gradient-to-r from-yellow-200 via-pink-200 to-cyan-200 bg-clip-text text-transparent">
                jornada de aprovação?
              </span>
            </h2>
            
            <p className="text-lg sm:text-xl text-white/90 max-w-2xl mx-auto leading-relaxed">
              Junte-se a centenas de alunos que já estão se preparando para seus concursos com nossa plataforma completa.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center flex-wrap">
              <Link
                to="/login"
                className="group relative inline-flex items-center justify-center gap-2 bg-white text-indigo-600 px-10 py-4 rounded-xl font-bold text-base sm:text-lg shadow-xl hover:shadow-2xl transition-all hover:scale-105"
              >
                <RocketLaunchIcon className="h-5 w-5 group-hover:animate-bounce" />
                Começar Agora
              </Link>
              <Link
                to="/pagamento"
                onClick={trackButtonClick}
                className="inline-flex items-center justify-center gap-2 bg-white/20 backdrop-blur-sm text-white px-10 py-4 rounded-xl font-bold text-base sm:text-lg border-2 border-white/30 hover:bg-white/30 transition-all"
              >
                Garantir Promoção
              </Link>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-green-500 text-white px-10 py-4 rounded-xl font-bold text-base sm:text-lg hover:bg-green-600 transition-all hover:scale-105"
              >
                Falar no WhatsApp
              </a>
            </div>
          </div>
        </div>

        {/* Seção de Notícias - Lazy loaded */}
        <div ref={newsRef} className={`animate-on-scroll fade-up ${newsVisible ? 'visible' : ''}`}>
          <Suspense fallback={
            <div className="text-center py-16">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
              <p className="mt-6 text-lg text-slate-600 dark:text-slate-400">Carregando notícias...</p>
            </div>
          }>
            <NewsSection />
          </Suspense>
        </div>
      </section>
    </div>
  )
}

export default PublicHome

