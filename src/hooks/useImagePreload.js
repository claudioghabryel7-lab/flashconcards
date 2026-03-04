import { useEffect, useState } from 'react'
import { preloadImages, generateThumbnailUrl } from '../utils/imageOptimizer'

export const useImagePreload = (imageUrls, options = {}) => {
  const [isLoading, setIsLoading] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [loadedCount, setLoadedCount] = useState(0)

  const {
    priority = 'auto',
    batchSize = 3, // Carregar em lotes para não sobrecarregar
    delay = 100 // Delay entre lotes
  } = options

  useEffect(() => {
    if (!imageUrls || imageUrls.length === 0) {
      setIsLoaded(true)
      return
    }

    const preloadInBatches = async () => {
      setIsLoading(true)
      setError(null)
      setLoadedCount(0)

      try {
        // Processar em lotes
        for (let i = 0; i < imageUrls.length; i += batchSize) {
          const batch = imageUrls.slice(i, i + batchSize)
          
          await preloadImages(batch, priority)
          setLoadedCount(prev => prev + batch.length)
          
          // Delay entre lotes (exceto para alta prioridade)
          if (priority !== 'high' && i + batchSize < imageUrls.length) {
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }

        setIsLoaded(true)
      } catch (err) {
        setError(err)
      } finally {
        setIsLoading(false)
      }
    }

    preloadInBatches()
  }, [imageUrls, priority, batchSize, delay])

  return {
    isLoading,
    isLoaded,
    error,
    loadedCount,
    totalCount: imageUrls?.length || 0,
    progress: imageUrls?.length > 0 ? (loadedCount / imageUrls.length) * 100 : 0
  }
}

// Hook específico para pré-carregar thumbnails
export const useThumbnailPreload = (imageUrls, thumbnailSize = 200) => {
  const thumbnailUrls = imageUrls?.map(url => generateThumbnailUrl(url, thumbnailSize))
  
  return useImagePreload(thumbnailUrls, {
    priority: 'low',
    batchSize: 5,
    delay: 50
  })
}
