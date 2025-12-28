import { useEffect, useState } from 'react'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { useDarkMode } from '../hooks/useDarkMode'

const InstallPWAButton = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)
  const { darkMode } = useDarkMode()

  useEffect(() => {
    // Detectar se já está instalado (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        window.navigator.standalone === true ||
                        document.referrer.includes('android-app://')

    if (isStandalone) {
      setIsInstalled(true)
      return
    }

    // Detectar iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
    setIsIOS(iOS)

    // Detectar Android
    const android = /Android/.test(navigator.userAgent)
    setIsAndroid(android)

    // Listener para evento beforeinstallprompt (Android/Chrome)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Android/Chrome - mostra prompt nativo
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      
      if (outcome === 'accepted') {
        setDeferredPrompt(null)
        setIsInstalled(true)
      }
    } else if (isIOS) {
      // iOS - mostra instruções
      setShowIOSInstructions(!showIOSInstructions)
    }
  }

  // Não mostrar se já estiver instalado
  if (isInstalled) {
    return null
  }

  // Não mostrar se não for mobile e não tiver prompt de instalação
  if (!isIOS && !isAndroid && !deferredPrompt) {
    return null
  }

  return (
    <div className="mb-6">
      <button
        onClick={handleInstallClick}
        className={`
          w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-semibold
          transition-all shadow-lg hover:shadow-xl
          ${darkMode
            ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700'
            : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700'
          }
        `}
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
        </svg>
        <span>Instalar App para Usar Offline</span>
        <ArrowDownTrayIcon className="h-5 w-5" />
      </button>

      {/* Instruções iOS */}
      {showIOSInstructions && isIOS && (
        <div className={`
          mt-4 p-4 rounded-xl border-2
          ${darkMode
            ? 'bg-slate-800 border-blue-500 text-white'
            : 'bg-blue-50 border-blue-500 text-slate-900'
          }
        `}>
          <h3 className="font-bold mb-2">Como instalar no iPhone/iPad:</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Toque no botão de compartilhar <span className="font-bold">(□↑)</span> na parte inferior da tela</li>
            <li>Role para baixo e toque em <span className="font-bold">"Adicionar à Tela de Início"</span></li>
            <li>Toque em <span className="font-bold">"Adicionar"</span> no canto superior direito</li>
            <li>O app aparecerá na sua tela inicial como um app nativo!</li>
          </ol>
        </div>
      )}
    </div>
  )
}

export default InstallPWAButton

