import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase/config'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'

const HomeBanner = () => {
  const [banners, setBanners] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)

  // Carregar banners do Firestore
  useEffect(() => {
    const bannersRef = collection(db, 'homeBanners')
    const q = query(bannersRef, orderBy('order', 'asc'))
    
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter((banner) => banner.active !== false) // Filtrar apenas ativos
      
      setBanners(data)
      setLoading(false)
    }, (error) => {
      console.error('Erro ao carregar banners:', error)
      setBanners([])
      setLoading(false)
    })

    return () => unsub()
  }, [])

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

  if (loading) {
    return null // Não mostra nada enquanto carrega
  }

  if (banners.length === 0) {
    return null // Não mostra nada se não houver banners
  }

  const currentBanner = banners[currentIndex]

  return (
    <div className="relative w-full overflow-hidden rounded-2xl shadow-lg mb-6 sm:mb-8" style={{ height: '400px' }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={currentBanner.id}
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -300 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="relative w-full h-full"
        >
          {currentBanner.link ? (
            <Link to={currentBanner.link} className="block w-full h-full">
              <img
                src={currentBanner.imageUrl || currentBanner.imageBase64}
                alt={currentBanner.title || 'Banner'}
                className="w-full h-full object-cover"
                style={{ objectFit: 'cover', objectPosition: 'center' }}
              />
            </Link>
          ) : (
            <img
              src={currentBanner.imageUrl || currentBanner.imageBase64}
              alt={currentBanner.title || 'Banner'}
              className="w-full h-full object-cover"
              style={{ objectFit: 'cover', objectPosition: 'center' }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Indicadores */}
      {banners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2">
          {banners.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setCurrentIndex(index)}
              className={`h-2 rounded-full transition-all ${
                index === currentIndex
                  ? 'w-8 bg-white'
                  : 'w-2 bg-white/50 hover:bg-white/75'
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
            className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 shadow-lg transition"
            aria-label="Banner anterior"
          >
            <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setCurrentIndex((prev) => (prev + 1) % banners.length)}
            className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-white/80 hover:bg-white rounded-full p-2 shadow-lg transition"
            aria-label="Próximo banner"
          >
            <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}

export default HomeBanner

