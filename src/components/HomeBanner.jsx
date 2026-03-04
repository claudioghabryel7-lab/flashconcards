import { useEffect, useState, startTransition } from 'react'
import { collection, getDocs, query, orderBy, where, limit } from 'firebase/firestore'
import { db } from '../firebase/config'
import { Link } from 'react-router-dom'
import LazyImage from './LazyImage'

const HomeBanner = () => {
  const [banners, setBanners] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  // Carregar banners do Firestore com cache otimizado
  useEffect(() => {
    if (!db) {
      setLoading(false)
      return
    }

    const cacheKey = 'homeBanners'
    const CACHE_DURATION = 10 * 60 * 1000 // 10 minutos
    
    // Carregar do cache imediatamente (síncrono para renderização instantânea)
    try {
      const cached = localStorage.getItem(`firebase_cache_${cacheKey}`)
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached)
        const now = Date.now()
        if (now - timestamp < CACHE_DURATION && cachedData && cachedData.length > 0) {
          startTransition(() => {
            setBanners(cachedData)
            setLoading(false)
          })
          // Continuar carregando em background para atualizar cache
        } else {
          // Cache expirado, mostrar skeleton
          setLoading(true)
        }
      }
    } catch (err) {
      console.warn('Erro ao ler cache de banners:', err)
    }
    
    // Carregar do Firestore (usar getDocs ao invés de onSnapshot para dados estáticos)
    const loadBanners = async () => {
      try {
        const bannersRef = collection(db, 'homeBanners')
        // Query completamente simples - sem where, orderBy ou limit
        // Filtrar, ordenar e limitar tudo no código após buscar
        const q = query(bannersRef)
        
        const snapshot = await getDocs(q)
        const data = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .filter((banner) => banner.active !== false) // Filtrar ativos no código
          .sort((a, b) => {
            // Ordenar por 'order' no código (se existir, senão manter ordem original)
            const orderA = a.order ?? 999
            const orderB = b.order ?? 999
            return orderA - orderB
          })
          .slice(0, 10) // Limitar a 10 banners ativos
        
        // Atualizar estado de forma não bloqueante
        startTransition(() => {
          setBanners(data)
          setLoading(false)
        })
        
        // Salvar no cache (apenas dados essenciais)
        try {
          const compressedBanners = data.map(banner => ({
            id: banner.id,
            imageUrl: banner.imageUrl, // Apenas URL, não base64
            link: banner.link,
            active: banner.active,
            order: banner.order,
          }))
          localStorage.setItem(`firebase_cache_${cacheKey}`, JSON.stringify({
            data: compressedBanners,
            timestamp: Date.now(),
          }))
        } catch (err) {
          if (err.name !== 'QuotaExceededError') {
          console.warn('Erro ao salvar cache de banners:', err)
          }
        }
      } catch (error) {
        // Ignorar erros de índice (pode ser cache do navegador)
        if (error.code === 'failed-precondition') {
          console.warn('Índice necessário. Limpe o cache do navegador ou crie o índice no Firebase Console.')
          // Tentar usar cache se disponível
          try {
            const cached = localStorage.getItem(`firebase_cache_${cacheKey}`)
            if (cached) {
              const { data: cachedData } = JSON.parse(cached)
              if (cachedData && cachedData.length > 0) {
                startTransition(() => {
                  setBanners(cachedData)
                  setLoading(false)
                })
                return
              }
            }
          } catch {}
        } else {
          console.error('Erro ao carregar banners:', error)
        }
        setLoading(false)
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
      setTimeout(() => loadBanners(), 100)
    } else {
      // Carregar imediatamente se não houver cache
      loadBanners()
    }
  }, [])

  // Preload das próximas imagens do banner (apenas imageUrl, não base64)
  useEffect(() => {
    if (banners.length <= 1) return

    // Preload do próximo banner (apenas se for URL externa)
    const nextIndex = (currentIndex + 1) % banners.length
    const nextBanner = banners[nextIndex]
    if (nextBanner && nextBanner.imageUrl && !nextBanner.imageUrl.startsWith('data:')) {
      try {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
        link.href = nextBanner.imageUrl
      document.head.appendChild(link)
      } catch (err) {
        // Ignorar erros de preload
      }
    }
  }, [banners, currentIndex])

  // Auto-play do carrossel
  useEffect(() => {
    if (banners.length <= 1) return

    const currentBanner = banners[currentIndex]
    const duration = currentBanner?.duration || 5000 // 5 segundos padrão

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length)
    }, duration)

    return () => clearInterval(timer)
  }, [banners, currentIndex])

  // Mostrar skeleton enquanto carrega para evitar flash
  if (loading) {
    return (
      <div className="banner-aligned-content mb-6 sm:mb-8">
        <div className="banner-container border border-slate-200 dark:border-slate-700">
          {/* Container com aspect ratio responsivo */}
          <div className="banner-aspect-ratio">
            <div className="absolute inset-0 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  if (banners.length === 0) {
    return null // Não mostra nada se não houver banners
  }

  const currentBanner = banners[currentIndex]

  return (
    <div className="banner-aligned-content mb-6 sm:mb-8">
      <div className="banner-container border border-slate-200/50 dark:border-slate-700/50 above-fold">
        {/* Container com aspect ratio responsivo baseado em 1080x602 (~16:9) */}
        <div className="banner-aspect-ratio">
          <div
            key={currentBanner.id}
            className="relative w-full h-full animate-banner-fade"
          >
            {currentBanner.link ? (
              <Link to={currentBanner.link} className="block w-full h-full group">
                <LazyImage
                  src={currentBanner.imageUrl || currentBanner.imageBase64}
                  alt={currentBanner.title || 'Banner'}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  width={1920}
                  height={1080}
                  quality={90}
                  priority={true}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </Link>
            ) : (
              <LazyImage
                src={currentBanner.imageUrl || currentBanner.imageBase64}
                alt={currentBanner.title || 'Banner'}
                className="w-full h-full object-cover"
                width={1920}
                height={1080}
                quality={90}
                priority={true}
              />
            )}
          </div>
        </div>

      {/* Indicadores */}
      {banners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2 z-10">
          {banners.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setCurrentIndex(index)}
              className={`h-4 w-4 rounded-full transition-all duration-300 shadow-lg min-w-[16px] min-h-[16px] p-1 ${
                index === currentIndex
                  ? 'w-10 bg-white scale-110'
                  : 'bg-white/60 hover:bg-white/80 hover:scale-110'
              }`}
              aria-label={`Ir para banner ${index + 1} de ${banners.length}`}
              aria-current={index === currentIndex ? 'true' : 'false'}
              style={{ willChange: 'transform, width' }}
            >
              <span className="sr-only">Banner {index + 1}</span>
            </button>
          ))}
        </div>
      )}

      {/* Botões de navegação (opcional) */}
      {banners.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length)}
            className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-2.5 shadow-xl transition-all duration-200 hover:scale-110 z-10 backdrop-blur-sm"
            aria-label="Banner anterior"
          >
            <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => (prev + 1) % banners.length)}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-2.5 shadow-xl transition-all duration-200 hover:scale-110 z-10 backdrop-blur-sm"
            aria-label="Próximo banner"
          >
            <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}
      </div>
    </div>
  )
}

export default HomeBanner

