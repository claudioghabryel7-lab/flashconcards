'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDownTrayIcon, DevicePhoneMobileIcon } from '@heroicons/react/24/outline'

/**
 * Botão para instalar o PWA (Android/iOS/desktop).
 * variant="icon" → ícone compacto no header/dashboard
 * variant="banner" → botão largo (legado)
 */
const InstallPWAButton = ({ variant = 'banner', className = '' }) => {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://')

    if (isStandalone) {
      setIsInstalled(true)
      return undefined
    }

    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream)
    setIsAndroid(/Android/.test(navigator.userAgent))

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    const handleInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
      setOpen(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (isInstalled) return null

  const runNativeInstall = async () => {
    if (!deferredPrompt) return false
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
      setIsInstalled(true)
      setOpen(false)
      return true
    }
    return false
  }

  const handleClick = async () => {
    if (deferredPrompt) {
      await runNativeInstall()
      return
    }
    setOpen((v) => !v)
  }

  if (variant === 'icon') {
    return (
      <div className={`relative ${className}`} ref={panelRef}>
        <button
          type="button"
          onClick={handleClick}
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-cp-border text-cp-muted transition hover:border-cp-accent/30 hover:bg-cp-surface hover:text-cp-text"
          aria-label="Baixar app"
          aria-expanded={open}
          title="Baixar app (Android / iOS)"
        >
          <DevicePhoneMobileIcon className="h-4 w-4" />
        </button>

        {open && (
          <div className="absolute right-0 top-full z-[80] mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-cp-border bg-cp-bg p-4 shadow-2xl">
            <p className="text-sm font-semibold text-cp-text">Instalar o app</p>
            <p className="mt-1 text-xs text-cp-muted">
              Use o FlashConCards como aplicativo no celular ou computador — mais rápido e com
              notificações sonoras.
            </p>

            {deferredPrompt ? (
              <button
                type="button"
                onClick={runNativeInstall}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-cp-accent px-3 py-2.5 text-sm font-semibold text-cp-bg transition hover:opacity-90"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                Instalar agora
              </button>
            ) : null}

            {isIOS ? (
              <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs text-cp-muted">
                <li>
                  Toque em <strong className="text-cp-text">Compartilhar</strong> (□↑) no Safari
                </li>
                <li>
                  Escolha <strong className="text-cp-text">Adicionar à Tela de Início</strong>
                </li>
                <li>
                  Confirme em <strong className="text-cp-text">Adicionar</strong>
                </li>
              </ol>
            ) : isAndroid ? (
              <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs text-cp-muted">
                <li>Abra o menu do Chrome (⋮)</li>
                <li>
                  Toque em <strong className="text-cp-text">Instalar app</strong> ou{' '}
                  <strong className="text-cp-text">Adicionar à tela inicial</strong>
                </li>
              </ol>
            ) : (
              <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs text-cp-muted">
                <li>No Chrome/Edge, abra o menu (⋮)</li>
                <li>
                  Clique em <strong className="text-cp-text">Instalar FlashConCards</strong> ou no
                  ícone ⊕ na barra de endereço
                </li>
              </ol>
            )}
          </div>
        )}
      </div>
    )
  }

  if (!isIOS && !isAndroid && !deferredPrompt) return null

  return (
    <div className={`mb-6 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 font-semibold text-white shadow-lg transition-all hover:from-blue-700 hover:to-purple-700 hover:shadow-xl"
      >
        <DevicePhoneMobileIcon className="h-6 w-6" />
        <span>Instalar App para Usar Offline</span>
        <ArrowDownTrayIcon className="h-5 w-5" />
      </button>

      {open && isIOS && (
        <div className="mt-4 rounded-xl border-2 border-blue-500 bg-blue-50 p-4 text-slate-900 dark:bg-slate-800 dark:text-white">
          <h3 className="mb-2 font-bold">Como instalar no iPhone/iPad:</h3>
          <ol className="list-inside list-decimal space-y-2 text-sm">
            <li>
              Toque no botão de compartilhar <span className="font-bold">(□↑)</span> na parte
              inferior da tela
            </li>
            <li>
              Role para baixo e toque em <span className="font-bold">Adicionar à Tela de Início</span>
            </li>
            <li>
              Toque em <span className="font-bold">Adicionar</span> no canto superior direito
            </li>
          </ol>
        </div>
      )}
    </div>
  )
}

export default InstallPWAButton
