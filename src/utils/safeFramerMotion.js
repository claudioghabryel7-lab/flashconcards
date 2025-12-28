// Wrapper seguro para framer-motion que trata erros de inicialização
import { useState, useEffect } from 'react'

let motion = null
let AnimatePresence = null
let framerMotionLoaded = false
let framerMotionError = null

// Função para carregar framer-motion de forma segura
const loadFramerMotion = async () => {
  if (framerMotionLoaded) {
    return { motion, AnimatePresence, error: framerMotionError }
  }

  try {
    const framerMotion = await import('framer-motion')
    motion = framerMotion.motion
    AnimatePresence = framerMotion.AnimatePresence
    framerMotionLoaded = true
    framerMotionError = null
    return { motion, AnimatePresence, error: null }
  } catch (error) {
    console.error('[SafeFramerMotion] Erro ao carregar framer-motion:', error)
    framerMotionError = error
    
    // Retornar componentes fallback (div normal)
    motion = {
      div: ({ children, ...props }) => <div {...props}>{children}</div>,
      button: ({ children, ...props }) => <button {...props}>{children}</button>,
      span: ({ children, ...props }) => <span {...props}>{children}</span>,
    }
    AnimatePresence = ({ children }) => children
    framerMotionLoaded = true
    
    return { motion, AnimatePresence, error }
  }
}

// Exportar função de carregamento
export const getFramerMotion = loadFramerMotion

// Exportar componentes diretamente (serão undefined até carregar)
export { motion, AnimatePresence }

// Hook para usar framer-motion de forma segura
export const useFramerMotion = () => {
  const [loaded, setLoaded] = useState(framerMotionLoaded)
  const [error, setError] = useState(framerMotionError)

  useEffect(() => {
    if (!framerMotionLoaded) {
      loadFramerMotion().then(({ error }) => {
        setLoaded(true)
        setError(error)
      })
    }
  }, [])

  return { motion, AnimatePresence, loaded, error }
}

