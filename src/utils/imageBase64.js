const MAX_BYTES = 900 * 1024

export function readImageAsBase64(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) {
      reject(new Error('Selecione uma imagem válida.'))
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Não foi possível processar a imagem.'))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        let quality = 0.85
        let dataUrl = canvas.toDataURL('image/jpeg', quality)
        while (dataUrl.length > MAX_BYTES && quality > 0.4) {
          quality -= 0.1
          dataUrl = canvas.toDataURL('image/jpeg', quality)
        }
        if (dataUrl.length > MAX_BYTES) {
          reject(new Error('Imagem muito grande. Use uma foto menor.'))
          return
        }
        resolve(dataUrl)
      }
      img.onerror = () => reject(new Error('Erro ao carregar a imagem.'))
      img.src = reader.result
    }
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo.'))
    reader.readAsDataURL(file)
  })
}
