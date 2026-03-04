import { useState, useEffect, useRef } from 'react'
import { getCachedOptimizedUrl } from '../utils/imageOptimizer'

// Cache simples para URLs de imagens já carregadas
const imageCache = new Map()
const loadingPromises = new Map()

const LazyImage = ({ 
  src, 
  alt, 
  className = '', 
  placeholder = null,
  onError = null,
  priority = false, // Se true, carrega imediatamente sem lazy loading
  retryCount = 0, // Número de tentativas
  width, // Largura desejada para otimização
  height, // Altura desejada para otimização
  quality = 80, // Qualidade da imagem (1-100)
  ...props 
}) => {
  const [imageSrc, setImageSrc] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [retries, setRetries] = useState(0)
  const containerRef = useRef(null)
  const observerRef = useRef(null)
  const imgRef = useRef(null)
  const maxRetries = 2

  useEffect(() => {
    if (!src) {
      setIsLoading(false)
      setHasError(true)
      setImageSrc(null)
      return
    }

    // Verificar cache primeiro
    if (imageCache.has(src)) {
      const cachedData = imageCache.get(src)
      setImageSrc(cachedData.url)
      setIsLoading(false)
      setHasError(cachedData.error)
      return
    }

    // Verificar se já está carregando
    if (loadingPromises.has(src)) {
      loadingPromises.get(src).then(data => {
        setImageSrc(data.url)
        setIsLoading(false)
        setHasError(data.error)
      }).catch(() => {
        setHasError(true)
        setIsLoading(false)
      })
      return
    }

    // Iniciar carregamento
    setIsLoading(true)
    setHasError(false)
    setRetries(0)

    // Criar promise de carregamento
    const loadPromise = new Promise((resolve, reject) => {
      const img = new Image()
      
      img.onload = () => {
        const data = { url: src, error: false }
        imageCache.set(src, data)
        resolve(data)
      }
      
      img.onerror = () => {
        const data = { url: src, error: true }
        imageCache.set(src, data)
        reject(data)
      }
      
      // Para imagens Firebase, usar URL otimizada
      const optimizedSrc = getCachedOptimizedUrl(src, {
        width: width || 800,
        height: height || 600,
        quality: quality
      })
      
      img.src = optimizedSrc
    })

    loadingPromises.set(src, loadPromise)
    
    loadPromise.then(data => {
      setImageSrc(data.url)
      setIsLoading(false)
      setHasError(data.error)
      loadingPromises.delete(src)
    }).catch(() => {
      setHasError(true)
      setIsLoading(false)
      loadingPromises.delete(src)
    })

    return () => {
      // Cleanup
      if (loadingPromises.has(src)) {
        loadingPromises.delete(src)
      }
    }
  }, [src])

  if (!src || hasError) {
    return (
      <div 
        ref={containerRef}
        className={`flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 ${className}`}
        {...props}
      >
        {hasError && (
          <div className="text-center p-4">
            <svg className="w-8 h-8 mx-auto mb-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-slate-400 text-xs block">Imagem não disponível</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className={`relative overflow-hidden ${className}`} 
      {...props}
    >
      {/* Skeleton sempre visível enquanto carregando */}
      {isLoading && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 z-0">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]"></div>
        </div>
      )}
      {imageSrc ? (
        <img
          ref={imgRef}
          src={imageSrc}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 relative z-[1] ${
            isLoading ? 'opacity-0' : 'opacity-100'
          }`}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : "auto"}
          onLoad={() => {
            setIsLoading(false)
            setHasError(false)
            setRetries(0)
          }}
          onError={() => {
            // Se ainda há tentativas, tentar novamente
            if (retries < maxRetries) {
              setRetries(prev => prev + 1)
              setTimeout(() => {
                if (imgRef.current && src) {
                  // Tentar recarregar com cache busting
                  const separator = src.includes('?') ? '&' : '?'
                  imgRef.current.src = src + separator + '_retry=' + Date.now()
                }
              }, 1000 * (retries + 1))
            } else {
              setHasError(true)
              setIsLoading(false)
              if (onError) {
                onError()
              }
            }
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]"></div>
        </div>
      )}
      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  )
}

export default LazyImage

