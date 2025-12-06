import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase/config'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import LazyImage from './LazyImage'

const HomeBanner = () => {
  const [banners, setBanners] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  // Carregar banners do Firestore com cache
  useEffect(() => {
    // Tentar carregar do cache primeiro
    const cacheKey = 'homeBanners'
    try {
      const cached = localStorage.getItem(`firebase_cache_${cacheKey}`)
      if (cached) {
        const { data: cachedData, timestamp } = JSON.parse(cached)
        const now = Date.now()
        if (now - timestamp < 5 * 60 * 1000 && cachedData) {
          setBanners(cachedData)
          setLoading(false)
        }
      }
    } catch (err) {
      console.warn('Erro ao ler cache de banners:', err)
    }
    
    const bannersRef = collection(db, 'homeBanners')
    const q = query(bannersRef, orderBy('order', 'asc'))
    let retryCount = 0
    const maxRetries = 3
    
    const loadData = () => {
      const unsub = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .filter((banner) => banner.active !== false) // Filtrar apenas ativos
        
        setBanners(data)
        setLoading(false)
        retryCount = 0
        
        // Salvar no cache
        try {
          localStorage.setItem(`firebase_cache_${cacheKey}`, JSON.stringify({
            data,
            timestamp: Date.now(),
          }))
        } catch (err) {
          console.warn('Erro ao salvar cache de banners:', err)
        }
      }, (error) => {
        console.error('Erro ao carregar banners:', error)
        
        // Retry logic
        if (retryCount < maxRetries) {
          retryCount++
          setTimeout(() => {
            loadData()
          }, 1000 * retryCount)
        } else {
          setBanners([])
          setLoading(false)
        }
      })
      return unsub
    }
    
    const unsub = loadData()
    return () => unsub()
  }, [])

  // Preload das próximas imagens do banner
  useEffect(() => {
    if (banners.length <= 1) return

    // Preload do próximo banner
    const nextIndex = (currentIndex + 1) % banners.length
    const nextBanner = banners[nextIndex]
    if (nextBanner && (nextBanner.imageUrl || nextBanner.imageBase64)) {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = nextBanner.imageUrl || nextBanner.imageBase64
      document.head.appendChild(link)
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
      <div className="relative w-full overflow-hidden rounded-3xl shadow-xl mb-6 sm:mb-8 border border-slate-200 dark:border-slate-700 h-[200px] sm:h-[300px] md:h-[400px] lg:h-[500px]">
        <div className="w-full h-full bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 animate-pulse" />
      </div>
    )
  }

  if (banners.length === 0) {
    return null // Não mostra nada se não houver banners
  }

  const currentBanner = banners[currentIndex]

  return (
    <div className="relative w-full overflow-hidden rounded-3xl shadow-xl mb-6 sm:mb-8 border border-slate-200/50 dark:border-slate-700/50 h-[200px] sm:h-[300px] md:h-[400px] lg:h-[500px]">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentBanner.id}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
          className="relative w-full h-full"
        >
          {currentBanner.link ? (
            <Link to={currentBanner.link} className="block w-full h-full group">
              <LazyImage
                src={currentBanner.imageUrl || currentBanner.imageBase64}
                alt={currentBanner.title || 'Banner'}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                style={{ objectFit: 'cover', objectPosition: 'center' }}
                priority={true}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </Link>
          ) : (
            <LazyImage
              src={currentBanner.imageUrl || currentBanner.imageBase64}
              alt={currentBanner.title || 'Banner'}
              className="w-full h-full object-cover"
              style={{ objectFit: 'cover', objectPosition: 'center' }}
              priority={true}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Indicadores */}
      {banners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2 z-10">
          {banners.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setCurrentIndex(index)}
              className={`h-2.5 rounded-full transition-all duration-300 shadow-lg ${
                index === currentIndex
                  ? 'w-10 bg-white scale-110'
                  : 'w-2.5 bg-white/60 hover:bg-white/80 hover:scale-110'
              }`}
              aria-label={`Ir para banner ${index + 1}`}
            />
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
  )
}

export default HomeBanner

