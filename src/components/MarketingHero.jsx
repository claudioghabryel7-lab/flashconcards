import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore'
import { db } from '../firebase/config'
import LazyImage from './LazyImage'
import { SparklesIcon, FireIcon, ClockIcon, UserGroupIcon } from '@heroicons/react/24/solid'
import { useIntersectionObserver } from '../hooks/useIntersectionObserver'

const MarketingHero = () => {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [animationType, setAnimationType] = useState('sparks')
  const navigate = useNavigate()
  
  // Observer para animação de entrada
  const [heroRef, heroVisible] = useIntersectionObserver({ once: true })

  useEffect(() => {
    const configRef = collection(db, 'marketingHero')
    
    // Função para tentar carregar com orderBy primeiro, depois sem orderBy se falhar
    const tryLoadConfig = (useOrderBy = true) => {
      try {
        const q = useOrderBy
          ? query(configRef, where('active', '==', true), orderBy('order', 'asc'), limit(1))
          : query(configRef, where('active', '==', true), limit(1))
        
        const unsub = onSnapshot(
          q,
          (snapshot) => {
            if (!snapshot.empty) {
              // Se não usar orderBy, ordenar manualmente
              let docs = snapshot.docs
              if (!useOrderBy) {
                docs = docs.sort((a, b) => {
                  const orderA = a.data().order || 0
                  const orderB = b.data().order || 0
                  return orderA - orderB
                })
              }
              
              const data = docs[0].data()
              const configData = {
                id: docs[0].id,
                backgroundImage: data.backgroundImage || null,
                title: data.title || 'Não perca sua chance!',
                subtitle: data.subtitle || 'Turma fechando em breve',
                urgencyText: data.urgencyText || 'Últimas vagas disponíveis',
                motivationalTexts: data.motivationalTexts || [
                  'Seu futuro começa aqui',
                  'Transforme sua carreira hoje',
                  'Aprovação está mais perto do que você imagina'
                ],
                ctaText: data.ctaText || 'Garantir minha vaga agora',
                ctaLink: data.ctaLink || '/pagamento',
                showTimer: data.showTimer || false,
                timerEndDate: data.timerEndDate || null,
                showSpotsLeft: data.showSpotsLeft !== undefined ? data.showSpotsLeft : true,
                spotsLeft: data.spotsLeft || 12,
                active: data.active !== undefined ? data.active : true,
                backgroundAnimationType: data.backgroundAnimationType || 'sparks',
                backgroundAnimationActive: data.backgroundAnimationActive !== undefined ? data.backgroundAnimationActive : true
              }
              setConfig(configData)
              setAnimationType(configData.backgroundAnimationType)
            } else {
              // Se não houver configuração salva no banco, não mostrar nada
              setConfig(null)
              setAnimationType('sparks')
            }
            setLoading(false)
          },
          (error) => {
            console.error('Erro ao carregar configuração de marketing:', error)
            
            // Se falhar por falta de índice e ainda não tentou sem orderBy, tentar novamente
            if ((error.code === 'failed-precondition' || error.code === 'permission-denied') && useOrderBy) {
              console.warn('Índice não encontrado, tentando sem orderBy...')
              tryLoadConfig(false)
              return
            }
            
            // Em caso de outro erro, não mostrar nada
            setConfig(null)
            setLoading(false)
          }
        )

        return unsub
      } catch (err) {
        console.error('Erro ao criar query:', err)
        setConfig(null)
        setLoading(false)
        return () => {}
      }
    }

    const unsub = tryLoadConfig(true)
    return () => {
      if (unsub) unsub()
    }
  }, [])

  // Calcular tempo restante se houver timer
  const [timeLeft, setTimeLeft] = useState(null)
  
  useEffect(() => {
    if (!config?.showTimer || !config?.timerEndDate) return

    const calculateTimeLeft = () => {
      const end = new Date(config.timerEndDate)
      const now = new Date()
      const diff = end - now

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      setTimeLeft({ days, hours, minutes, seconds })
    }

    calculateTimeLeft()
    const interval = setInterval(calculateTimeLeft, 1000)

    return () => clearInterval(interval)
  }, [config?.showTimer, config?.timerEndDate])

  // Função para scrollar até a seção de cursos
  const scrollToCourses = (e) => {
    e.preventDefault()
    const coursesSection = document.querySelector('[data-courses-section]')
    if (coursesSection) {
      coursesSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      // Se não encontrar, tentar scrollar até o elemento com id cursos
      const element = document.getElementById('cursos')
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }

  // Não mostrar se estiver carregando ou se não houver configuração ativa
  if (loading) {
    return null
  }

  // Se não houver config ou se não estiver ativo, não mostrar
  if (!config || !config.active) {
    return null
  }

  // Determinar o link do CTA
  const ctaLink = config.ctaLink || '/pagamento'
  const isInternalLink = ctaLink.startsWith('/') && !ctaLink.startsWith('http')
  const shouldScrollToCourses = ctaLink === '/cursos' || ctaLink === '#cursos' || ctaLink === ''

  return (
    <section 
      ref={heroRef}
      className={`relative w-full min-h-[600px] sm:min-h-[700px] md:min-h-[800px] overflow-hidden rounded-3xl mb-8 transition-all duration-1000 ${
        heroVisible 
          ? 'opacity-100 translate-y-0 scale-100' 
          : 'opacity-0 translate-y-20 scale-95'
      }`}
    >
      {/* Imagem de fundo */}
      {config.backgroundImage && (
        <div className="absolute inset-0 z-0">
          <LazyImage
            src={config.backgroundImage}
            alt="Background"
            className="w-full h-full object-cover"
            priority={true}
          />
          {/* Overlay escuro para contraste */}
          <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/60 to-black/70"></div>
        </div>
      )}
      
      {/* Efeito de animação de fundo */}
      {config.backgroundAnimationActive !== false && (
        <div className="absolute inset-0 z-10 pointer-events-none" style={{ willChange: 'contents', contain: 'layout style paint' }}>
          {(() => {
            const particleClass = animationType === 'fire' ? 'fire-particle' : animationType === 'stars' ? 'stars-particle' : 'sparks-particle'
            const dotClass = animationType === 'fire' ? 'fire-dot' : animationType === 'stars' ? 'stars-dot' : 'sparks-dot'
            // Reduzir número de partículas para melhor performance
            const count = animationType === 'fire' ? 15 : animationType === 'stars' ? 25 : 12
            
            return [...Array(count)].map((_, i) => (
              <div
                key={i}
                className={`absolute ${particleClass}`}
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 3}s`,
                  animationDuration: `${2 + Math.random() * 2}s`,
                }}
              >
                <div className={dotClass}></div>
              </div>
            ))
          })()}
        </div>
      )}

      {/* Conteúdo */}
      <div className="relative z-20 flex flex-col items-center justify-center min-h-[600px] sm:min-h-[700px] md:min-h-[800px] px-4 sm:px-6 md:px-8 text-center text-white">
        {/* Badge de urgência */}
        {config.urgencyText && (
          <div className="mb-4">
            <span className="urgent-badge inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-600/90 backdrop-blur-sm border-2 border-red-400 text-sm font-black uppercase tracking-wider shadow-lg">
              <FireIcon className="h-4 w-4 animate-bounce" />
              {config.urgencyText}
            </span>
          </div>
        )}

        {/* Título principal */}
        <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black mb-4 drop-shadow-2xl leading-tight">
          {config.title}
        </h2>

        {/* Subtítulo */}
        {config.subtitle && (
          <p className="text-lg sm:text-xl md:text-2xl mb-8 text-white/90 drop-shadow-lg">
            {config.subtitle}
          </p>
        )}

        {/* Timer (se ativo) */}
        {config.showTimer && timeLeft && (
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-black/50 backdrop-blur-md border-2 border-yellow-400/50">
              <ClockIcon className="h-5 w-5 text-yellow-400" />
              <span className="text-sm font-bold text-yellow-400 uppercase tracking-wider mr-2">
                Termina em:
              </span>
              <div className="flex gap-2 sm:gap-3">
                {timeLeft.days > 0 && (
                  <div className="flex flex-col items-center">
                    <span className="text-2xl sm:text-3xl font-black">{String(timeLeft.days).padStart(2, '0')}</span>
                    <span className="text-xs uppercase">dias</span>
                  </div>
                )}
                <div className="flex flex-col items-center">
                  <span className="text-2xl sm:text-3xl font-black">{String(timeLeft.hours).padStart(2, '0')}</span>
                  <span className="text-xs uppercase">horas</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-2xl sm:text-3xl font-black">{String(timeLeft.minutes).padStart(2, '0')}</span>
                  <span className="text-xs uppercase">min</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-2xl sm:text-3xl font-black">{String(timeLeft.seconds).padStart(2, '0')}</span>
                  <span className="text-xs uppercase">seg</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Vagas restantes */}
        {config.showSpotsLeft && config.spotsLeft && (
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-black/50 backdrop-blur-md border-2 border-orange-400/50">
              <UserGroupIcon className="h-5 w-5 text-orange-400" />
              <span className="text-sm font-bold text-orange-400">
                Apenas <span className="text-2xl font-black text-white">{config.spotsLeft}</span> vagas restantes!
              </span>
            </div>
          </div>
        )}

        {/* Textos motivacionais rotativos - CORRIGIDO */}
        {config.motivationalTexts && config.motivationalTexts.length > 0 && (
          <div className="mb-8 min-h-[60px] sm:min-h-[80px] md:min-h-[100px] flex items-center justify-center relative">
            <div className="motivational-text-container w-full">
              {config.motivationalTexts.map((text, index) => (
                <p
                  key={index}
                  className="text-xl sm:text-2xl md:text-3xl font-bold text-yellow-300 drop-shadow-lg"
                >
                  {text}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* CTA Principal */}
        {shouldScrollToCourses ? (
          <button
            onClick={scrollToCourses}
            className="cta-button-glow group relative inline-block px-8 sm:px-12 py-4 sm:py-5 rounded-2xl bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 text-white font-black text-lg sm:text-xl md:text-2xl shadow-2xl hover:shadow-yellow-500/50 transition-all duration-300 hover:scale-110 overflow-hidden cursor-pointer"
          >
            {/* Efeito shine */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            
            <span className="relative z-10 flex items-center gap-3">
              <SparklesIcon className="h-6 w-6 sm:h-8 sm:w-8 animate-pulse" />
              {config.ctaText || 'Ver Cursos Disponíveis'}
              <SparklesIcon className="h-6 w-6 sm:h-8 sm:w-8 animate-pulse" />
            </span>
          </button>
        ) : (
          <Link
            to={ctaLink}
            className="cta-button-glow group relative inline-block px-8 sm:px-12 py-4 sm:py-5 rounded-2xl bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 text-white font-black text-lg sm:text-xl md:text-2xl shadow-2xl hover:shadow-yellow-500/50 transition-all duration-300 hover:scale-110 overflow-hidden"
          >
            {/* Efeito shine */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            
            <span className="relative z-10 flex items-center gap-3">
              <SparklesIcon className="h-6 w-6 sm:h-8 sm:w-8 animate-pulse" />
              {config.ctaText || 'Garantir minha vaga agora'}
              <SparklesIcon className="h-6 w-6 sm:h-8 sm:w-8 animate-pulse" />
            </span>
          </Link>
        )}

        {/* Garantia/Selos */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-sm sm:text-base">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20">
            <span className="text-2xl">✅</span>
            <span className="font-semibold">Garantia de qualidade</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20">
            <span className="text-2xl">🚀</span>
            <span className="font-semibold">Acesso imediato</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20">
            <span className="text-2xl">💎</span>
            <span className="font-semibold">Conteúdo exclusivo</span>
          </div>
        </div>
      </div>
    </section>
  )
}

export default MarketingHero

