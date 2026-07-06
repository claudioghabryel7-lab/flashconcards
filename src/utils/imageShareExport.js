import html2canvas from 'html2canvas'

const WATERMARK = 'Concurseiro Preditivo'

export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/** Gera imagem PNG/JPEG com marca d'água a partir de um elemento DOM. */
export async function captureElementImage(containerEl, { format = 'png' } = {}) {
  if (!containerEl) throw new Error('Elemento não encontrado')

  const canvas = await html2canvas(containerEl, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#1e1b4b',
    logging: false,
    allowTaint: true,
  })

  const out = document.createElement('canvas')
  out.width = canvas.width
  out.height = canvas.height
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Canvas não suportado')

  ctx.drawImage(canvas, 0, 0)

  const padding = Math.round(canvas.width * 0.04)
  const fontSize = Math.max(14, Math.round(canvas.width * 0.032))
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 6
  ctx.fillText(WATERMARK, canvas.width - padding, canvas.height - padding)

  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png'
  const quality = format === 'jpeg' ? 0.92 : 0.95

  return new Promise((resolve, reject) => {
    out.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Falha ao gerar imagem'))
        else resolve(blob)
      },
      mime,
      quality,
    )
  })
}

export function downloadImageBlob(blob, filename = 'concurseiro-preditivo.png') {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function buildShareFile(blob, filename) {
  const type = blob.type || 'image/png'
  return new File([blob], filename, { type })
}

/**
 * Compartilhamento nativo otimizado para iOS (arquivo primeiro, depois texto).
 */
export async function shareImageBlob({
  blob,
  filename = 'concurseiro-preditivo.png',
  text = '',
  url = '',
}) {
  const shareText = [text, url].filter(Boolean).join('\n')
  const file = buildShareFile(blob, filename)

  if (typeof navigator === 'undefined' || !navigator.share) {
    return { ok: false, blob, file, text: shareText, cancelled: false }
  }

  const tryShare = async (payload) => {
    if (navigator.canShare && !navigator.canShare(payload)) return false
    await navigator.share(payload)
    return true
  }

  // iOS: compartilhar só a imagem costuma abrir Instagram/WhatsApp corretamente
  if (isIOSDevice()) {
    try {
      if (await tryShare({ files: [file] })) {
        return { ok: true, method: 'ios-files', blob, file, text: shareText }
      }
    } catch (err) {
      if (err?.name === 'AbortError') return { ok: true, cancelled: true, blob, file, text: shareText }
    }

    // JPEG como fallback no iOS
    if (blob.type === 'image/png') {
      try {
        const jpegBlob = await convertBlobToJpeg(blob)
        const jpegFile = buildShareFile(jpegBlob, filename.replace(/\.png$/i, '.jpg'))
        if (await tryShare({ files: [jpegFile] })) {
          return { ok: true, method: 'ios-jpeg', blob: jpegBlob, file: jpegFile, text: shareText }
        }
      } catch (err) {
        if (err?.name === 'AbortError') return { ok: true, cancelled: true, blob, file, text: shareText }
      }
    }
  }

  // Geral: imagem + texto
  try {
    const withAll = shareText ? { files: [file], text: shareText } : { files: [file] }
    if (await tryShare(withAll)) {
      return { ok: true, method: 'files-text', blob, file, text: shareText }
    }
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: true, cancelled: true, blob, file, text: shareText }
  }

  try {
    if (await tryShare({ files: [file] })) {
      return { ok: true, method: 'files-only', blob, file, text: shareText }
    }
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: true, cancelled: true, blob, file, text: shareText }
  }

  if (isMobileDevice() && shareText) {
    try {
      await navigator.share({ text: shareText })
      return { ok: true, method: 'text-only', blob, file, text: shareText }
    } catch (err) {
      if (err?.name === 'AbortError') return { ok: true, cancelled: true, blob, file, text: shareText }
    }
  }

  return { ok: false, blob, file, text: shareText, cancelled: false }
}

async function convertBlobToJpeg(pngBlob) {
  const bitmap = await createImageBitmap(pngBlob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG falhou'))), 'image/jpeg', 0.92)
  })
}

export function buildItemShareText({ type, materia, assunto, itemIndex }) {
  const kind = type === 'flashcard' ? 'FlashCard' : type === 'questao' ? 'Questão' : 'Conteúdo'
  const pos = itemIndex != null ? ` #${itemIndex + 1}` : ''
  const topic = assunto ? ` — ${assunto}` : ''
  return `Concurseiro Preditivo — ${kind}${pos} de ${materia || 'estudos'}${topic}`
}
