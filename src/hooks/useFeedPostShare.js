import { useCallback, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { shareFeedPost } from '../utils/feedShareExport'

export function useFeedPostShare() {
  const [capturePost, setCapturePost] = useState(null)
  const [shareSheet, setShareSheet] = useState(null)
  const [sharing, setSharing] = useState(false)
  const captureRef = useRef(null)

  const sharePost = useCallback(async (post) => {
    if (sharing) return
    setSharing(true)
    try {
      setCapturePost(post)
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      })

      let attempts = 0
      while (!captureRef.current && attempts < 24) {
        await new Promise((r) => setTimeout(r, 50))
        attempts += 1
      }

      if (!captureRef.current) {
        toast.error('Não foi possível gerar a imagem.')
        return
      }

      const result = await shareFeedPost({ containerEl: captureRef.current, post })

      if (result.cancelled) return

      if (result.ok) return

      setShareSheet(result)
    } catch (err) {
      console.error(err)
      toast.error('Erro ao preparar compartilhamento.')
    } finally {
      setCapturePost(null)
      setSharing(false)
    }
  }, [sharing])

  const closeShareSheet = useCallback(() => setShareSheet(null), [])

  return {
    sharePost,
    sharing,
    capturePost,
    captureRef,
    shareSheet,
    closeShareSheet,
  }
}
