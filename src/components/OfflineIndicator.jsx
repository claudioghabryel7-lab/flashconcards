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

  // Não mostrar nada se estiver online
  if (isOnline) {
    return null
  }

  return (
    <div
      className={`
        fixed top-0 left-0 right-0 z-50 
        flex items-center justify-center gap-2 
        px-4 py-2 text-sm font-medium
        shadow-md
        ${darkMode
          ? 'bg-amber-900/90 text-amber-100 border-b border-amber-700'
          : 'bg-amber-50 text-amber-900 border-b border-amber-200'
        }
      `}
    >
      <WifiIcon className="h-5 w-5" />
      <span>Você está offline. Algumas funcionalidades podem estar limitadas.</span>
    </div>
  )
}

export default OfflineIndicator

