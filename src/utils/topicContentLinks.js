import { normalizeTopicKeyForStorage } from './topicKeyFirestore'
import { makeTopicKey } from './editalVerticalizadoLoader'

/**
 * Monta deep-link para material / flashcards / questões de um tópico.
 */
export function buildTopicContentLink({
  courseId,
  topicKey,
  contentType,
  contentId,
  disciplinaNome = '',
  topicoNome = '',
  moduloLabel = '',
  linkPath = '',
  professorNote = '',
  flagId = '',
} = {}) {
  if (linkPath) {
    return appendFocusParams(linkPath, { contentId, professorNote, flagId })
  }

  const cid = courseId || 'alego-default'
  const rawKey = topicKey || (topicoNome ? makeTopicKey({ numero: '', nome: topicoNome }) : '')
  const keyForPath = encodeURIComponent(normalizeTopicKeyForStorage(rawKey) || rawKey || '')
  const encodedKey = encodeURIComponent(normalizeTopicKeyForStorage(rawKey) || rawKey || '')
  const disc = encodeURIComponent(disciplinaNome || '')
  const modulo = encodeURIComponent(moduloLabel || topicoNome || '')
  const nome = encodeURIComponent(topicoNome || '')

  let path = '/edital-verticalizado'
  const type = String(contentType || '').toLowerCase()

  if (type === 'flashcard' || type === 'flashcards') {
    path = `/flashcards/topico/${cid}?disciplina=${disc}&modulo=${modulo}&topicKey=${encodedKey}`
  } else if (type === 'questao' || type === 'questoes') {
    path = `/questoes-topic/${cid}/${keyForPath}?nome=${nome}`
  } else if (type === 'material' || type === 'conteudo' || type === 'incidencia') {
    path = `/conteudo-completo/topic/${cid}/${keyForPath}?nome=${nome}`
  }

  return appendFocusParams(path, { contentId, professorNote, flagId })
}

function appendFocusParams(path, { contentId, professorNote, flagId }) {
  if (!contentId && !professorNote && !flagId) return path
  const hasQuery = path.includes('?')
  const params = new URLSearchParams()
  if (contentId) params.set('focusContentId', String(contentId))
  if (professorNote) params.set('professorNote', String(professorNote).slice(0, 500))
  if (flagId) params.set('flagId', String(flagId))
  const q = params.toString()
  if (!q) return path
  return `${path}${hasQuery ? '&' : '?'}${q}`
}
