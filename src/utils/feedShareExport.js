import html2canvas from 'html2canvas'

export async function exportFeedPostAsImage(containerEl, filename = 'concurseiro-preditivo-post.png') {
  if (!containerEl) throw new Error('Elemento não encontrado')

  const canvas = await html2canvas(containerEl, {
    scale: 2,
    useCORS: true,
    backgroundColor: null,
    logging: false,
  })

  const watermarkCanvas = document.createElement('canvas')
  watermarkCanvas.width = canvas.width
  watermarkCanvas.height = canvas.height
  const ctx = watermarkCanvas.getContext('2d')
  if (!ctx) throw new Error('Canvas não suportado')

  ctx.drawImage(canvas, 0, 0)

  const padding = Math.round(canvas.width * 0.04)
  const fontSize = Math.max(14, Math.round(canvas.width * 0.035))
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 6
  ctx.fillText('Concurseiro Preditivo', canvas.width - padding, canvas.height - padding)

  return new Promise((resolve, reject) => {
    watermarkCanvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Falha ao gerar imagem'))
          return
        }

        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        link.click()
        URL.revokeObjectURL(url)
        resolve(blob)
      },
      'image/png',
      0.95,
    )
  })
}

export async function shareFeedPostImage(blob, title = 'Concurseiro Preditivo') {
  if (!blob || !navigator.share || !navigator.canShare) return false
  const file = new File([blob], 'post.png', { type: 'image/png' })
  if (!navigator.canShare({ files: [file] })) return false
  await navigator.share({ title, files: [file] })
  return true
}
