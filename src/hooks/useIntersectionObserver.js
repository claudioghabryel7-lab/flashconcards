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

    const once = options.once !== false // Default true
    const threshold = options.threshold || 0.1
    const rootMargin = options.rootMargin || '-100px'

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          // Opcional: desobservar após aparecer para melhor performance
          if (once) {
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

    return () => {
      if (element) {
        observer.unobserve(element)
      }
    }
  }, [options])

  return [elementRef, isVisible]
}

