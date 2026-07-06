import html2canvas from 'html2canvas'
import { getPostCaption } from './feedUtils'

export function buildFeedShareText(post) {
  const { verb, materia, assunto, meta } = getPostCaption(post)
  let line = `Concurseiro Preditivo — ${verb} ${materia}${assunto || ''}`
  if (meta) line += ` (${meta})`
  return line
}

export function getFeedPostPublicUrl(post) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/comunidade/publicacao/${post.id}`
}

/** Gera PNG com marca d'água — retorna Blob (sem baixar). */
export async function captureFeedPostImage(containerEl) {
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
        if (!blob) reject(new Error('Falha ao gerar imagem'))
        else resolve(blob)
      },
      'image/png',
      0.95,
    )
  })
}

export function downloadFeedPostImage(blob, filename = 'concurseiro-preditivo.png') {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Abre o seletor nativo de apps (WhatsApp, Instagram, etc.) com imagem + texto.
 * Retorna { ok, cancelled, blob, text, publicUrl, file } para fallback manual.
 */
export async function shareFeedPost({ containerEl, post }) {
  const blob = await captureFeedPostImage(containerEl)
  const publicUrl = getFeedPostPublicUrl(post)
  const text = buildFeedShareText(post)
  const shareText = `${text}\n${publicUrl}`
  const file = new File([blob], `concurseiro-preditivo-${post.id}.png`, { type: 'image/png' })
  const isMobile = /Android|iPhone|iPad|iPod/i.test(
    typeof navigator !== 'undefined' ? navigator.userAgent : '',
  )

  if (typeof navigator !== 'undefined' && navigator.share) {
    const withImage = {
      title: 'Concurseiro Preditivo',
      text: shareText,
      files: [file],
    }

    try {
      if (!navigator.canShare || navigator.canShare({ files: [file] })) {
        await navigator.share(withImage)
        return { ok: true, method: 'native-file' }
      }
    } catch (err) {
      if (err?.name === 'AbortError') return { ok: true, cancelled: true }
    }

    if (isMobile) {
      try {
        await navigator.share({ title: 'Concurseiro Preditivo', text: shareText })
        return { ok: true, method: 'native-text' }
      } catch (err) {
        if (err?.name === 'AbortError') return { ok: true, cancelled: true }
      }
    }
  }

  return {
    ok: false,
    blob,
    text: shareText,
    publicUrl,
    file,
    post,
  }
}

/** Tenta novamente o compartilhamento nativo a partir de um blob já gerado. */
export async function retryNativeShare({ blob, post, text, publicUrl }) {
  if (!navigator?.share) return false
  const shareText = text || `${buildFeedShareText(post)}\n${publicUrl || getFeedPostPublicUrl(post)}`
  const file = new File([blob], `concurseiro-preditivo-${post.id}.png`, { type: 'image/png' })

  try {
    const payload = { title: 'Concurseiro Preditivo', text: shareText, files: [file] }
    if (!navigator.canShare || navigator.canShare({ files: [file] })) {
      await navigator.share(payload)
      return true
    }
    await navigator.share({ title: 'Concurseiro Preditivo', text: shareText })
    return true
  } catch (err) {
    if (err?.name === 'AbortError') return true
    return false
  }
}
