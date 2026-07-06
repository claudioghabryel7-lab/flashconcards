import { useCallback, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { captureElementImage, buildItemShareText } from '../utils/imageShareExport'

export function useItemShare() {
  const captureRef = useRef(null)
  const [shareSheet, setShareSheet] = useState(null)
  const [sharing, setSharing] = useState(false)

  const shareItem = useCallback(async (options) => {
    if (sharing) return null
    setSharing(true)

    try {
      if (!captureRef.current) {
        toast.error('Não foi possível gerar a imagem.')
        return null
      }

      const blob = await captureElementImage(captureRef.current)
      const text = buildItemShareText(options)
      const url =
        options.shareUrl && typeof window !== 'undefined'
          ? options.shareUrl.startsWith('http')
            ? options.shareUrl
            : `${window.location.origin}${options.shareUrl}`
          : typeof window !== 'undefined'
            ? window.location.href
            : ''

      const filename = `concurseiro-preditivo-${options.type || 'item'}.png`

      // Sempre abre o painel — no iOS o usuário escolhe o app (imagem + comunidade)
      setShareSheet({ ok: false, blob, text, url, filename, options })
      return { blob, text, url }
    } catch (err) {
      console.error(err)
      toast.error('Erro ao preparar compartilhamento.')
      return null
    } finally {
      setSharing(false)
    }
  }, [sharing])

  const closeShareSheet = useCallback(() => setShareSheet(null), [])

  return { captureRef, shareItem, sharing, shareSheet, closeShareSheet }
}
