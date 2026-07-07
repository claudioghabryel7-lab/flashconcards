import { getPostCaption, resolveContentQuestionText } from './feedUtils'
import {
  captureElementImage,
  shareImageBlob,
  downloadImageBlob,
  isMobileDevice,
} from './imageShareExport'

export function buildFeedShareText(post) {
  const caption = getPostCaption(post)
  if (caption.isCommentPost) {
    const question = caption.questionText || resolveContentQuestionText(post)
    const comment = caption.commentText || post.commentText || ''
    const parts = ['Concurseiro Preditivo — Comentário']
    if (question) parts.push(question)
    if (comment) parts.push(comment)
    return parts.join('\n\n')
  }
  const { verb, materia, assunto, meta } = caption
  let line = `Concurseiro Preditivo — ${verb} ${materia}${assunto || ''}`
  if (meta) line += ` (${meta})`
  return line
}

export function getFeedPostPublicUrl(post) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/comunidade/publicacao/${post.id}`
}

export async function captureFeedPostImage(containerEl) {
  return captureElementImage(containerEl)
}

export const downloadFeedPostImage = downloadImageBlob

export async function shareFeedPost({ containerEl, post }) {
  const blob = await captureFeedPostImage(containerEl)
  const publicUrl = getFeedPostPublicUrl(post)
  const text = buildFeedShareText(post)
  const filename = `concurseiro-preditivo-${post.id}.png`

  const result = await shareImageBlob({ blob, filename, text, url: publicUrl })

  if (result.cancelled) return { ok: true, cancelled: true }
  if (result.ok) return { ok: true, method: result.method }

  return {
    ok: false,
    blob,
    text: result.text,
    publicUrl,
    file: result.file,
    post,
  }
}

export async function retryNativeShare({ blob, post, text, publicUrl }) {
  const filename = post?.id ? `concurseiro-preditivo-${post.id}.png` : 'concurseiro-preditivo.png'
  const shareText = text || `${buildFeedShareText(post)}\n${publicUrl || getFeedPostPublicUrl(post)}`
  const result = await shareImageBlob({
    blob,
    filename,
    text: shareText,
    url: publicUrl || (post ? getFeedPostPublicUrl(post) : ''),
  })
  return result.ok || result.cancelled
}
