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
// Lazy load de componentes pesados que não são críticos para LCP
const Reviews = lazy(() => import('../components/Reviews'))
const NewsSection = lazy(() => import('../components/NewsSection'))

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
  
  // Intersection observers para animações
  const [heroRef, heroVisible] = useIntersectionObserver({ once: true })
  const [coursesRef, coursesVisible] = useIntersectionObserver({ once: true })
  const [featuresRef, featuresVisible] = useIntersectionObserver({ once: true })
  const [ctaRef, ctaVisible] = useIntersectionObserver({ once: true })
  const [newsRef, newsVisible] = useIntersectionObserver({ once: true })

  useEffect(() => {
    if (!db) {
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
      setTimeout(() => loadCourses(), 100)
    } else {
      // Carregar imediatamente se não houver cache
      loadCourses()
    }
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
      <div
        id="cursos"
        data-courses-section
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
            FlashCards Para Concurso Público - Polícia Militar, Polícia Civil, GCM e muito mais. Escolha o curso ideal para sua aprovação.
          </p>
        </div>
        {loadingCourses ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
            <p className="mt-4 text-slate-600 dark:text-slate-400">Carregando cursos...</p>
          </div>
        ) : courses.length > 0 ? (
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
                    {/* Imagem do curso - com dimensões fixas para evitar CLS */}
                    {(course.imageUrl || course.imageBase64) ? (
                      <div className="w-full h-52 overflow-hidden relative bg-slate-200 dark:bg-slate-700" style={{ aspectRatio: '16/9', minHeight: '208px' }}>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent z-10 pointer-events-none"></div>
                        <LazyImage
                          src={course.imageUrl || course.imageBase64}
                          alt={course.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                          priority={index < 6}
                        />
                      </div>
                    ) : (
                      <div className="w-full h-52 overflow-hidden relative bg-slate-200 dark:bg-slate-700 flex items-center justify-center" style={{ aspectRatio: '16/9', minHeight: '208px' }}>
                        <div className="text-center p-4">
                          <svg className="w-12 h-12 mx-auto mb-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-slate-400 text-xs block">Sem imagem</span>
                        </div>
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
        ) : (
          <div className="text-center py-12 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
            <p className="text-slate-600 dark:text-slate-400">Nenhum curso disponível no momento.</p>
          </div>
        )}
      </div>

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
            FlashConCards - Flashcards para
            <span className="block mt-2 bg-gradient-to-r from-white via-blue-100 to-cyan-100 bg-clip-text text-transparent">
              Concursos Públicos
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-white/90 leading-relaxed max-w-xl">
            Estude para <strong>concurso público</strong>, <strong>concurso polícia militar</strong>, <strong>concurso policial</strong>, PMGO, PC, GCM e muito mais. 
            <strong>Flashcards interativos</strong> com sistema de repetição espaçada (SRS), questões comentadas e simulados. 
            A melhor plataforma de <strong>flashcards para concursos</strong> do Brasil.
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

      {/* Seção SEO - Conteúdo Rico em Palavras-chave */}
      <div className="tech-section relative rounded-3xl bg-gradient-to-br from-slate-50 to-blue-50/30 dark:from-slate-800 dark:to-slate-900 p-8 sm:p-12 md:p-16">
        <div className="max-w-4xl mx-auto space-y-6">
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">
            Estude para Concursos Públicos com FlashConCards
          </h2>
          <div className="prose prose-lg dark:prose-invert max-w-none space-y-4 text-slate-700 dark:text-slate-300">
            <p className="text-lg leading-relaxed">
              O <strong>FlashConCards</strong> é a melhor plataforma de <strong>flashcards para concursos públicos</strong> do Brasil. 
              Se você está se preparando para <strong>concurso polícia militar</strong>, <strong>concurso policial</strong>, 
              <strong>concurso PMGO</strong>, <strong>concurso PC</strong>, <strong>concurso GCM</strong> ou qualquer outro 
              <strong>concurso público</strong>, você está no lugar certo.
            </p>
            <p className="text-lg leading-relaxed">
              Nossa plataforma oferece <strong>flashcards interativos</strong> com sistema de repetição espaçada (SRS), 
              que adapta o ritmo de estudos ao seu desempenho. Estude com <strong>flashcards online</strong> de forma 
              inteligente e eficiente, otimizando seu tempo de preparação para <strong>concursos públicos</strong>.
            </p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-8 mb-4">
              Por que escolher FlashConCards para estudar para concursos?
            </h3>
            <ul className="list-disc list-inside space-y-2 text-lg">
              <li><strong>Flashcards para concursos</strong> com conteúdo completo e atualizado</li>
              <li><strong>Estude para concursos</strong> de Polícia Militar, PC, GCM e muito mais</li>
              <li><strong>Concurso polícia militar</strong> - Prepare-se com flashcards específicos</li>
              <li><strong>Concurso policial</strong> - Questões e flashcards personalizados</li>
              <li><strong>Flashcards PMGO</strong> - Conteúdo completo para Polícia Militar de Goiás</li>
              <li><strong>Flashcards PC</strong> - Prepare-se para Polícia Civil</li>
              <li><strong>Sistema de repetição espaçada</strong> (SRS) para memorização eficiente</li>
              <li><strong>Questões comentadas</strong> geradas por IA no estilo das principais bancas</li>
              <li><strong>Simulados completos</strong> para testar seus conhecimentos</li>
              <li><strong>Assistente de IA</strong> disponível 24/7 para tirar dúvidas</li>
            </ul>
            <p className="text-lg leading-relaxed mt-6">
              Se você está procurando por <strong>flashcards</strong>, <strong>flashconcards</strong>, 
              <strong>estude para concursos</strong>, <strong>concurso público</strong>, 
              <strong>concurso polícia militar</strong>, <strong>concurso policial</strong>, 
              <strong>flashcards para concursos</strong>, <strong>flashcards online</strong>, 
              <strong>preparatório concursos</strong>, <strong>curso concurso público</strong>, 
              <strong>estudo para concursos</strong> ou <strong>flashcards interativos</strong>, 
              você encontrou a plataforma ideal. Comece agora e acelere sua aprovação!
            </p>
          </div>
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
            FlashCards Para Concurso Público - Polícia Militar, Polícia Civil, GCM e muito mais. 
            <strong> Estude para concursos públicos</strong> de forma eficiente com flashcards interativos e inteligência artificial.
          </p>
        </div>
        <div className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <div
                key={index}
                className={`group relative tech-card tech-shine rounded-3xl p-6 sm:p-7 hover-scale hover-lift animate-on-scroll fade-up visible`}
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

      {/* Avaliações dos Alunos - Lazy loaded */}
      <div className="rounded-2xl bg-white dark:bg-slate-800 p-6 sm:p-8 shadow-sm reviews-container">
        <Suspense fallback={
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
            <p className="mt-4 text-slate-600 dark:text-slate-400">Carregando avaliações...</p>
          </div>
        }>
          <Reviews />
        </Suspense>
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

      {/* Seção de Notícias - No final da página - Lazy loaded */}
      <div ref={newsRef} className={`animate-on-scroll fade-up ${newsVisible ? 'visible' : ''}`}>
        <Suspense fallback={
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
            <p className="mt-4 text-slate-600 dark:text-slate-400">Carregando notícias...</p>
          </div>
        }>
          <NewsSection />
        </Suspense>
      </div>
    </section>
  )
}

export default PublicHome

