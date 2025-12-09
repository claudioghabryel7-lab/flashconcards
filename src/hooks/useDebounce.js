import { useEffect, useState } from 'react'

/**
 * Hook para debounce de valores
 * Útil para otimizar chamadas de API e cálculos pesados
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

/**
 * Hook para throttle de funções
 * Útil para limitar chamadas de eventos (scroll, resize, etc)
 */
export function useThrottle(callback, delay = 300) {
  const [throttleTimer, setThrottleTimer] = useState(null)

  const throttledCallback = (...args) => {
    if (throttleTimer === null) {
      callback(...args)
      const timer = setTimeout(() => {
        setThrottleTimer(null)
      }, delay)
      setThrottleTimer(timer)
    }
  }

  useEffect(() => {
    return () => {
      if (throttleTimer) {
        clearTimeout(throttleTimer)
      }
    }
  }, [throttleTimer])

  return throttledCallback
}

