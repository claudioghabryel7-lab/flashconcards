import { useEffect, useRef, useState } from 'react'

/**
 * Hook para animações quando elementos entram na viewport
 * Substitui framer-motion para melhor performance
 */
export const useIntersectionObserver = (options = {}) => {
  const [isVisible, setIsVisible] = useState(false)
  const elementRef = useRef(null)

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    // Verificar se IntersectionObserver está disponível
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      // Fallback: mostrar elemento imediatamente se IntersectionObserver não estiver disponível
      setIsVisible(true)
      return
    }

    const once = options.once !== false // Default true
    const threshold = options.threshold || 0.1
    const rootMargin = options.rootMargin || '-100px'

    let observer = null
    
    try {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry && entry.isIntersecting) {
            setIsVisible(true)
            // Opcional: desobservar após aparecer para melhor performance
            if (once && observer) {
              observer.unobserve(element)
            }
          } else if (!once) {
            setIsVisible(false)
          }
        },
        {
          threshold,
          rootMargin,
        }
      )

      observer.observe(element)
    } catch (error) {
      // Se houver erro ao criar observer, mostrar elemento imediatamente
      console.warn('[useIntersectionObserver] Erro ao criar observer:', error)
      setIsVisible(true)
    }

    return () => {
      if (observer && element) {
        try {
          observer.unobserve(element)
        } catch (err) {
          // Ignorar erros ao desobservar
        }
      }
    }
  }, [options])

  return [elementRef, isVisible]
}

