import { useState, useEffect, useRef } from 'react'

const LazyImage = ({ 
  src, 
  alt, 
  className = '', 
  placeholder = null,
  onError = null,
  ...props 
}) => {
  const [imageSrc, setImageSrc] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const containerRef = useRef(null)
  const observerRef = useRef(null)
  const imgRef = useRef(null)

  useEffect(() => {
    if (!src) {
      setIsLoading(false)
      setHasError(true)
      return
    }

    let cancelled = false
    let timeoutId = null

    const loadImage = () => {
      if (cancelled) return
      
      setIsLoading(true)
      setHasError(false)
      
      const img = new Image()
      
      img.onload = () => {
        if (!cancelled) {
          setImageSrc(src)
          setIsLoading(false)
          setHasError(false)
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
        }
      }

      img.onerror = () => {
        if (!cancelled) {
          setHasError(true)
          setIsLoading(false)
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
          if (onError) {
            onError()
          }
        }
      }

      // Adicionar timeout para evitar espera infinita
      timeoutId = setTimeout(() => {
        if (!cancelled) {
          setHasError(true)
          setIsLoading(false)
          if (onError) {
            onError()
          }
        }
      }, 10000) // 10 segundos timeout

      img.src = src
    }

    // Para imagens na página inicial (banners, cursos), carregar imediatamente
    // Usar Intersection Observer apenas para imagens que não estão visíveis
    if ('IntersectionObserver' in window && containerRef.current) {
      // Verificar se já está visível na viewport
      const rect = containerRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight
      const isVisible = rect.top < viewportHeight + 200 && rect.bottom > -200
      
      if (isVisible) {
        // Já está visível ou próximo, carregar imediatamente
        loadImage()
      } else {
        // Usar Intersection Observer para lazy loading de imagens fora da viewport
        observerRef.current = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                loadImage()
                if (observerRef.current && containerRef.current) {
                  observerRef.current.unobserve(containerRef.current)
                }
              }
            })
          },
          {
            rootMargin: '200px', // Começar a carregar 200px antes de aparecer
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
      if (observerRef.current && containerRef.current) {
        try {
          observerRef.current.unobserve(containerRef.current)
        } catch (e) {
          // Ignorar erros ao desobservar
        }
      }
    }
  }, [src, onError])

  if (!src || hasError) {
    return (
      <div 
        ref={containerRef}
        className={`flex items-center justify-center bg-slate-200 dark:bg-slate-700 ${className}`}
        {...props}
      >
        {hasError && <span className="text-slate-400 text-xs">Erro ao carregar imagem</span>}
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
        <div className="absolute inset-0 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 animate-pulse z-0" />
      )}
      {imageSrc ? (
        <img
          ref={imgRef}
          src={imageSrc}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isLoading ? 'opacity-0' : 'opacity-100'
          }`}
          loading="lazy"
          onLoad={() => {
            setIsLoading(false)
          }}
          onError={() => {
            setHasError(true)
            setIsLoading(false)
            if (onError) {
              onError()
            }
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 animate-pulse" />
      )}
    </div>
  )
}

export default LazyImage

