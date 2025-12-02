import { useState, useEffect, useRef } from 'react'

const LazyImage = ({ 
  src, 
  alt, 
  className = '', 
  placeholder = null,
  onError = null,
  ...props 
}) => {
  const [imageSrc, setImageSrc] = useState(placeholder || null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const imgRef = useRef(null)
  const observerRef = useRef(null)

  useEffect(() => {
    if (!src) {
      setIsLoading(false)
      setHasError(true)
      return
    }

    // Se já está carregado, não precisa de lazy loading
    const img = new Image()
    let cancelled = false

    const loadImage = () => {
      img.onload = () => {
        if (!cancelled) {
          setImageSrc(src)
          setIsLoading(false)
          setHasError(false)
        }
      }

      img.onerror = () => {
        if (!cancelled) {
          setHasError(true)
          setIsLoading(false)
          if (onError) {
            onError()
          }
        }
      }

      // Adicionar timeout para evitar espera infinita
      const timeout = setTimeout(() => {
        if (!cancelled) {
          setHasError(true)
          setIsLoading(false)
          if (onError) {
            onError()
          }
        }
      }, 10000) // 10 segundos timeout

      img.src = src

      return () => {
        cancelled = true
        clearTimeout(timeout)
      }
    }

    // Usar Intersection Observer para lazy loading
    if ('IntersectionObserver' in window) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              loadImage()
              observerRef.current?.unobserve(entry.target)
            }
          })
        },
        {
          rootMargin: '50px', // Começar a carregar 50px antes de aparecer
        }
      )

      if (imgRef.current) {
        observerRef.current.observe(imgRef.current)
      }
    } else {
      // Fallback para navegadores sem IntersectionObserver
      loadImage()
    }

    return () => {
      if (observerRef.current && imgRef.current) {
        observerRef.current.unobserve(imgRef.current)
      }
      cancelled = true
    }
  }, [src, onError])

  if (!src || hasError) {
    return (
      <div 
        className={`flex items-center justify-center bg-slate-200 dark:bg-slate-700 ${className}`}
        {...props}
      >
        {hasError && <span className="text-slate-400 text-xs">Erro ao carregar imagem</span>}
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden ${className}`} {...props}>
      {isLoading && !imageSrc && (
        <div className="absolute inset-0 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 animate-pulse" />
      )}
      {imageSrc && (
        <img
          ref={imgRef}
          src={imageSrc}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isLoading ? 'opacity-0' : 'opacity-100'
          }`}
          loading="lazy"
          onError={() => {
            setHasError(true)
            setIsLoading(false)
            if (onError) {
              onError()
            }
          }}
        />
      )}
    </div>
  )
}

export default LazyImage

