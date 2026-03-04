// Utilitário para otimizar URLs de imagens do Firebase Storage

export const optimizeFirebaseImage = (imageUrl, options = {}) => {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return imageUrl
  }

  // Se não for URL do Firebase Storage, retornar original
  if (!imageUrl.includes('firebasestorage.googleapis.com') && !imageUrl.includes('storage.googleapis.com')) {
    return imageUrl
  }

  const {
    width = 800,
    height = 600,
    quality = 80,
    format = 'auto'
  } = options

  // Construir parâmetros de otimização
  const params = new URLSearchParams()
  
  // Adicionar parâmetros de redimensionamento
  if (width) params.append('_w', width.toString())
  if (height) params.append('_h', height.toString())
  
  // Adicionar parâmetros de qualidade
  if (quality && quality !== 100) params.append('_q', quality.toString())
  
  // Formato da imagem
  if (format && format !== 'auto') params.append('_f', format)
  
  // Flag de otimização
  params.append('_opt', '1')

  // Adicionar parâmetros à URL
  const separator = imageUrl.includes('?') ? '&' : '?'
  return `${imageUrl}${separator}${params.toString()}`
}

// Função para pré-carregar múltiplas imagens
export const preloadImages = async (imageUrls, priority = 'auto') => {
  const promises = imageUrls.map(url => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const optimizedUrl = optimizeFirebaseImage(url, { width: 400, height: 300 })
      
      img.onload = () => resolve(url)
      img.onerror = () => reject(new Error(`Failed to load: ${url}`))
      
      // Definir prioridade de carregamento
      if (priority === 'high') {
        img.fetchPriority = 'high'
      } else if (priority === 'low') {
        img.fetchPriority = 'low'
      }
      
      img.src = optimizedUrl
    })
  })

  try {
    await Promise.all(promises)
    return { success: true, loaded: imageUrls.length }
  } catch (error) {
    console.warn('Some images failed to preload:', error)
    return { success: false, error }
  }
}

// Função para gerar thumbnails
export const generateThumbnailUrl = (imageUrl, size = 200) => {
  return optimizeFirebaseImage(imageUrl, {
    width: size,
    height: size,
    quality: 60,
    format: 'webp'
  })
}

// Cache de URLs otimizadas
const optimizedCache = new Map()

export const getCachedOptimizedUrl = (imageUrl, options = {}) => {
  const cacheKey = `${imageUrl}-${JSON.stringify(options)}`
  
  if (optimizedCache.has(cacheKey)) {
    return optimizedCache.get(cacheKey)
  }
  
  const optimized = optimizeFirebaseImage(imageUrl, options)
  optimizedCache.set(cacheKey, optimized)
  
  return optimized
}
