import { useEffect, useState } from 'react'
import { WifiIcon } from '@heroicons/react/24/outline'
import { useDarkMode } from '../hooks/useDarkMode'

const OfflineIndicator = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const { darkMode } = useDarkMode()

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Adicionar padding-bottom ao body quando offline (para não cobrir conteúdo)
  useEffect(() => {
    if (!isOnline) {
      document.body.style.paddingBottom = '64px'
    } else {
      document.body.style.paddingBottom = ''
    }

    return () => {
      document.body.style.paddingBottom = ''
    }
  }, [isOnline])

  // Não mostrar nada se estiver online
  if (isOnline) {
    return null
  }

  return (
    <div
      className={`
        fixed bottom-0 left-0 right-0 z-40 
        flex items-center justify-center gap-2 
        px-4 py-3 text-sm font-medium
        shadow-lg
        ${darkMode
          ? 'bg-amber-900/95 text-amber-100 border-t border-amber-700'
          : 'bg-amber-50 text-amber-900 border-t border-amber-200'
        }
      `}
    >
      <WifiIcon className="h-5 w-5 flex-shrink-0" />
      <span className="text-center">Você está offline. Algumas funcionalidades podem estar limitadas.</span>
    </div>
  )
}

export default OfflineIndicator

