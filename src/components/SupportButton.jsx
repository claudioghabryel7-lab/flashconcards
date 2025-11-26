import { useEffect, useState } from 'react'
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/solid'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const WHATSAPP_NUMBER = '5562981841878' // Número com código do país (55 = Brasil, 62 = Goiás)

const SupportButton = () => {
  const { darkMode } = useDarkMode()
  const [showInfo, setShowInfo] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // Detectar erros no console e na aplicação
  useEffect(() => {
    // Listener para erros JavaScript
    const handleError = (event) => {
      setHasError(true)
      setErrorMessage(event.message || 'Erro detectado na aplicação')
    }

    // Listener para promises rejeitadas
    const handleRejection = (event) => {
      setHasError(true)
      setErrorMessage(event.reason?.message || 'Erro na aplicação')
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)

    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  const openWhatsApp = (customMessage = '') => {
    const baseMessage = 'Olá! Preciso de ajuda com a plataforma de mentoria ALEGO.'
    const message = customMessage || baseMessage
    const fullMessage = hasError 
      ? `${message}\n\nErro encontrado: ${errorMessage}`
      : message
    const encodedMessage = encodeURIComponent(fullMessage)
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodedMessage}`
    window.open(url, '_blank')
  }

  return (
    <div className="fixed bottom-6 left-6 z-50">
      {/* Alerta de Erro (se houver) */}
      {hasError && (
        <div
          className={`mb-3 rounded-lg border-l-4 p-3 shadow-lg ${
            darkMode
              ? 'border-rose-500 bg-rose-900/20 text-rose-200'
              : 'border-rose-500 bg-rose-50 text-rose-800'
          }`}
        >
          <div className="flex items-start gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold">Erro detectado</p>
              <p className="mt-1 text-xs">
                Encontrou um problema? Clique no botão abaixo para entrar em contato.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setHasError(false)}
              className="text-rose-400 hover:text-rose-300"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Botão Principal */}
      <button
        type="button"
        onClick={() => openWhatsApp()}
        className={`group flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-110 ${
          hasError
            ? 'bg-rose-500 hover:bg-rose-600 animate-pulse'
            : 'bg-green-500 hover:bg-green-600'
        }`}
        aria-label="Suporte via WhatsApp"
        title={hasError ? 'Reportar erro via WhatsApp' : 'Fale conosco no WhatsApp'}
      >
        <svg
          className="h-8 w-8 text-white"
          fill="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
      </button>

      {/* Tooltip/Info */}
      {showInfo && (
        <div
          className={`absolute bottom-16 left-0 mb-2 w-64 rounded-lg border p-3 shadow-lg ${
            darkMode
              ? 'border-slate-700 bg-slate-800 text-slate-200'
              : 'border-slate-200 bg-white text-slate-800'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold">Precisa de ajuda?</p>
              <p className="mt-1 text-xs">
                Clique no botão verde para falar conosco no WhatsApp
              </p>
              <p className="mt-2 text-xs font-semibold text-green-600 dark:text-green-400">
                📱 (62) 98184-1878
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Estamos prontos para ajudar com dúvidas, erros ou sugestões!
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowInfo(false)}
              className={`ml-2 ${
                darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Botão de Info (opcional) */}
      <button
        type="button"
        onClick={() => setShowInfo(!showInfo)}
        className={`mt-2 flex h-8 w-8 items-center justify-center rounded-full text-xs transition ${
          darkMode
            ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
        }`}
        title="Informações de suporte"
      >
        ?
      </button>
    </div>
  )
}

export default SupportButton

