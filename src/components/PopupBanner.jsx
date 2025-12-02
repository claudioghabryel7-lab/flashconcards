import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'

const PopupBanner = () => {
  const [banner, setBanner] = useState(null)
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Carregar banner do popup
    const popupBannerRef = doc(db, 'config', 'popupBanner')
    
    const unsub = onSnapshot(
      popupBannerRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data()
          if (data.active && (data.imageUrl || data.imageBase64)) {
            setBanner(data)
            // Verificar se já foi mostrado hoje
            const lastShown = localStorage.getItem('popupBannerLastShown')
            const today = new Date().toDateString()
            if (lastShown !== today) {
              setShow(true)
            }
          } else {
            setBanner(null)
            setShow(false)
          }
        } else {
          setBanner(null)
          setShow(false)
        }
        setLoading(false)
      },
      (error) => {
        console.error('Erro ao carregar banner popup:', error)
        setLoading(false)
      }
    )

    return () => unsub()
  }, [])

  const handleClose = () => {
    setShow(false)
    // Salvar que foi mostrado hoje
    localStorage.setItem('popupBannerLastShown', new Date().toDateString())
  }

  const handleImageClick = () => {
    if (banner.link) {
      window.open(banner.link, banner.openInNewTab ? '_blank' : '_self')
    }
  }

  if (loading || !banner || !show) {
    return null
  }

  return (
    <AnimatePresence>
      {show && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
            onClick={handleClose}
          />
          
          {/* Popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative max-w-4xl w-full max-h-[90vh] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden">
              {/* Botão fechar */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/90 dark:bg-slate-700/90 hover:bg-white dark:hover:bg-slate-700 transition-colors shadow-lg"
                aria-label="Fechar"
              >
                <XMarkIcon className="h-5 w-5 text-slate-700 dark:text-slate-300" />
              </button>

              {/* Imagem */}
              <div
                onClick={banner.link ? handleImageClick : undefined}
                className={banner.link ? 'cursor-pointer' : ''}
              >
                {banner.imageUrl ? (
                  <img
                    src={banner.imageUrl}
                    alt={banner.title || 'Banner'}
                    className="w-full h-auto max-h-[90vh] object-contain"
                    onError={(e) => {
                      console.error('Erro ao carregar imagem do banner')
                      e.target.style.display = 'none'
                    }}
                  />
                ) : banner.imageBase64 ? (
                  <img
                    src={`data:image/png;base64,${banner.imageBase64}`}
                    alt={banner.title || 'Banner'}
                    className="w-full h-auto max-h-[90vh] object-contain"
                    onError={(e) => {
                      console.error('Erro ao carregar imagem base64 do banner')
                      e.target.style.display = 'none'
                    }}
                  />
                ) : null}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default PopupBanner





