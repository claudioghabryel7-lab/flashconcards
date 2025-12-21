import { useState, useEffect, useRef } from 'react'

const LazyImage = ({ 
  src, 
  alt, 
  className = '', 
  placeholder = null,
  onError = null,
  priority = false, // Se true, carrega imediatamente sem lazy loading
  retryCount = 0, // Número de tentativas
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
      return
    }

    let cancelled = false
    let timeoutId = null
    let retryTimeoutId = null

    const loadImage = (attempt = 0) => {
      if (cancelled) return
      
      setIsLoading(true)
      setHasError(false)
      
      const img = new Image()
      
      // Adicionar atributos para melhor performance
      img.decoding = 'async'
      if (priority) {
        img.fetchPriority = 'high'
      }
      
      // Tentar usar WebP se suportado (para imagens do Firebase, isso depende do servidor)
      // Mas podemos adicionar parâmetros de qualidade se a URL suportar
      let optimizedSrc = src
      if (src && !src.includes('data:image')) {
        // Se a URL não for base64, podemos tentar adicionar parâmetros de otimização
        // Isso depende do servidor suportar, mas não quebra se não suportar
        if (!src.includes('?')) {
          // Alguns CDNs suportam parâmetros de qualidade
          // optimizedSrc = src + '?q=80&w=1200' // Exemplo para Cloudinary/Imagix
        }
      }
      
      img.onload = () => {
        if (!cancelled) {
          setImageSrc(src)
          setIsLoading(false)
          setHasError(false)
          setRetries(0)
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
        }
      }

      img.onerror = () => {
        if (!cancelled) {
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
          
          // Tentar novamente se ainda há tentativas disponíveis
          if (attempt < maxRetries) {
            setRetries(attempt + 1)
            retryTimeoutId = setTimeout(() => {
              loadImage(attempt + 1)
            }, 1000 * (attempt + 1)) // Delay incremental: 1s, 2s
          } else {
            setHasError(true)
            setIsLoading(false)
            if (onError) {
              onError()
            }
          }
        }
      }

      // Timeout reduzido para 5 segundos (mais responsivo)
      timeoutId = setTimeout(() => {
        if (!cancelled) {
          // Tentar novamente se ainda há tentativas e não foi cancelado
          if (attempt < maxRetries) {
            setRetries(attempt + 1)
            retryTimeoutId = setTimeout(() => {
              loadImage(attempt + 1)
            }, 1000 * (attempt + 1))
          } else {
            setHasError(true)
            setIsLoading(false)
            if (onError) {
              onError()
            }
          }
        }
      }, 5000) // 5 segundos timeout

      // Tentar carregar a imagem
      img.src = src
    }

    // Se priority=true ou já está visível, carregar imediatamente
    if (priority) {
      loadImage()
    } else if ('IntersectionObserver' in window && containerRef.current) {
      // Verificar se já está visível na viewport
      const rect = containerRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      const isVisible = rect.top < viewportHeight + 300 && rect.bottom > -300
      
      if (isVisible) {
        // Já está visível ou próximo, carregar imediatamente
        loadImage()
      } else {
        // Usar Intersection Observer para lazy loading de imagens fora da viewport
        observerRef.current = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting && !cancelled) {
                loadImage()
                if (observerRef.current && containerRef.current) {
                  observerRef.current.unobserve(containerRef.current)
                }
              }
            })
          },
          {
            rootMargin: '300px', // Começar a carregar 300px antes de aparecer
          }
        )

        observerRef.current.observe(containerRef.current)
      }
    } else {
      // Fallback: carregar imediatamente se não houver IntersectionObserver
      loadImage()
    }

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId)
      }
      if (observerRef.current && containerRef.current) {
        try {
          observerRef.current.unobserve(containerRef.current)
        } catch (e) {
          // Ignorar erros ao desobservar
        }
      }
    }
  }, [src, onError, priority])

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
      {isLoading && !imageSrc && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 z-0">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-[shimmer_2s_infinite]"></div>
        </div>
      )}
      {imageSrc ? (
        <img
          ref={imgRef}
          src={imageSrc}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-500 ${
            isLoading ? 'opacity-0' : 'opacity-100'
          }`}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          onLoad={() => {
            setIsLoading(false)
          }}
          onError={() => {
            // Se ainda há tentativas, não marcar como erro ainda
            if (retries < maxRetries) {
              setRetries(retries + 1)
              setTimeout(() => {
                if (imgRef.current && src) {
                  imgRef.current.src = src + (src.includes('?') ? '&' : '?') + '_retry=' + (retries + 1)
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

