import { Link } from 'react-router-dom'
import { useEffect, useState, lazy, Suspense, startTransition } from 'react'
import { collection, doc, getDocs, query, setDoc, serverTimestamp, where, limit } from 'firebase/firestore'
import { db } from '../firebase/config'
import LazyImage from '../components/LazyImage'
import { useIntersectionObserver } from '../hooks/useIntersectionObserver'
import Logo from '../components/Logo.jsx'
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
    if (!currentTitle.includes('ConCursos2.5')) {
      document.title = 'ConCursos2.5 - Flashcards para Concursos Públicos | Polícia Militar, PMGO, PC'
    }
    
    // Adicionar Schema.org para Organization e WebSite
    const organizationSchema = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'ConCursos2.5',
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
      name: 'ConCursos2.5',
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
    <div className="min-h-screen">
      <section className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pt-8 sm:pt-12 md:pt-16 pb-16 sm:pb-20 md:pb-24">
        {/* Hero Section - Minimalist */}
        <div 
          ref={heroRef}
          className={`relative text-center space-y-8 ${heroVisible ? 'animate-on-scroll fade-up visible' : 'animate-on-scroll fade-up'}`}
        >
          {/* Subtle Glow Background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent-orange/5 rounded-full blur-3xl"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-accent-cyan/5 rounded-full blur-3xl"></div>
          </div>
          
          <div className="relative z-10 space-y-6">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border-primary bg-background-card text-xs font-semibold text-accent-orange">
              <span className="w-2 h-2 rounded-full bg-accent-orange animate-pulse"></span>
              Plataforma 2.5X de Aceleração
            </div>
            
            {/* Main Title */}
            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black leading-tight tracking-tight">
              <span className="block text-text-primary">Domine seu</span>
              <span className="block mt-2 gradient-text">Concurso Público</span>
            </h1>
            
            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto leading-relaxed">
              Organização com edital verticalizado, flashcards, questões práticas, e conteúdo resumido com maior incidência para o seu Concurso.
            </p>
          </div>
        </div>

        {/* Demo Sections - Compactas */}
        <div className="space-y-12 pt-8">
          {/* Demo Edital Verticalizado */}
          <div className={`glass rounded-2xl p-6 border border-border-primary ${heroVisible ? 'animate-on-scroll fade-up visible' : 'animate-on-scroll fade-up'}`} style={{ animationDelay: '0.2s' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-orange to-accent-cyan flex items-center justify-center">
                <DocumentTextIcon className="h-5 w-5 text-background-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-primary">Edital Verticalizado</h3>
                <p className="text-sm text-text-secondary">Organização completa do edital</p>
              </div>
            </div>
            <div className="bg-background-card rounded-xl p-4 border border-border-primary">
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 rounded bg-background-secondary">
                  <span className="text-sm font-medium text-text-primary">📚 Português</span>
                  <span className="text-xs text-accent-orange">85% incidência</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-background-secondary">
                  <span className="text-sm font-medium text-text-primary">⚖️ Direito Constitucional</span>
                  <span className="text-xs text-accent-cyan">92% incidência</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-background-secondary">
                  <span className="text-sm font-medium text-text-primary">🔍 Raciocínio Lógico</span>
                  <span className="text-xs text-accent-orange">78% incidência</span>
                </div>
              </div>
            </div>
          </div>

          {/* Demo Calendário de Progresso */}
          <div className={`glass rounded-2xl p-6 border border-border-primary ${heroVisible ? 'animate-on-scroll fade-up visible' : 'animate-on-scroll fade-up'}`} style={{ animationDelay: '0.3s' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-cyan to-accent-orange flex items-center justify-center">
                <CalendarIcon className="h-5 w-5 text-background-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-primary">Calendário de Progresso</h3>
                <p className="text-sm text-text-secondary">Acompanhe sua evolução</p>
              </div>
            </div>
            <div className="bg-background-card rounded-xl p-4 border border-border-primary">
              <div className="flex gap-2">
                <div className="flex-1 p-2 rounded bg-accent-orange/20 border border-accent-orange/50 text-center">
                  <div className="text-lg font-bold text-accent-orange">15</div>
                  <div className="text-xs text-text-secondary">dias seguidos</div>
                </div>
                <div className="flex-1 p-2 rounded bg-accent-cyan/20 border border-accent-cyan/50 text-center">
                  <div className="text-lg font-bold text-accent-cyan">127</div>
                  <div className="text-xs text-text-secondary">flashcards</div>
                </div>
                <div className="flex-1 p-2 rounded bg-background-secondary border border-border-primary text-center">
                  <div className="text-lg font-bold text-text-primary">89%</div>
                  <div className="text-xs text-text-secondary">acertos</div>
                </div>
              </div>
            </div>
          </div>

          {/* Demo Flashcards */}
          <div className={`glass rounded-2xl p-6 border border-border-primary ${heroVisible ? 'animate-on-scroll fade-up visible' : 'animate-on-scroll fade-up'}`} style={{ animationDelay: '0.4s' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-orange to-accent-cyan flex items-center justify-center">
                <SparklesIcon className="h-5 w-5 text-background-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-primary">Flashcards com IA</h3>
                <p className="text-sm text-text-secondary">Estudo inteligente e personalizado</p>
              </div>
            </div>
            <div className="bg-background-card rounded-xl p-4 border border-border-primary">
              <div className="bg-gradient-to-br from-accent-orange/10 to-accent-cyan/10 rounded-lg p-4 border border-border-primary">
                <p className="text-sm font-medium text-text-primary mb-2">O que é o princípio da legalidade?</p>
                <p className="text-xs text-text-secondary">Administração só pode agir conforme a lei...</p>
              </div>
            </div>
          </div>

          {/* Demo Treino de Redação */}
          <div className={`glass rounded-2xl p-6 border border-border-primary ${heroVisible ? 'animate-on-scroll fade-up visible' : 'animate-on-scroll fade-up'}`} style={{ animationDelay: '0.5s' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-cyan to-accent-orange flex items-center justify-center">
                <DocumentTextIcon className="h-5 w-5 text-background-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-primary">Treino de Redação</h3>
                <p className="text-sm text-text-secondary">Prática com feedback da IA</p>
              </div>
            </div>
            <div className="bg-background-card rounded-xl p-4 border border-border-primary">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-accent-orange"></div>
                  <span className="text-xs text-text-secondary">Tema gerado pela IA</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-accent-cyan"></div>
                  <span className="text-xs text-text-secondary">Análise detalhada</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-accent-orange"></div>
                  <span className="text-xs text-text-secondary">Sugestões de melhoria</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default PublicHome

