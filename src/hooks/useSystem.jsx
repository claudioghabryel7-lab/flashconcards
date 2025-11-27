import { createContext, useContext, useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SystemContext = createContext(null)

export const SystemProvider = ({ children }) => {
  const location = useLocation()
  const [system, setSystem] = useState('alego') // 'alego' ou 'pmgo'

  useEffect(() => {
    // Determinar sistema baseado na rota
    if (location.pathname.startsWith('/pmgo')) {
      setSystem('pmgo')
    } else {
      setSystem('alego')
    }
  }, [location.pathname])

  return (
    <SystemContext.Provider value={{ system, setSystem }}>
      {children}
    </SystemContext.Provider>
  )
}

export const useSystem = () => {
  const context = useContext(SystemContext)
  if (!context) {
    throw new Error('useSystem must be used within SystemProvider')
  }
  return context
}

