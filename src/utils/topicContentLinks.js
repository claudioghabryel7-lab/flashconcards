import { normalizeTopicKeyForStorage } from './topicKeyFirestore'

/** Extrai numero/nome de uma topicKey canônica ("4 :: Nome do tópico"). */
export function parseTopicKeyParts(topicKey = '') {
  const normalized = normalizeTopicKeyForStorage(topicKey)
  if (!normalized) return { numero: '', nome: '', normalized: '' }

  if (!normalized.includes(' :: ')) {
    const trimmed = normalized.trim()
    const isNumericLike = /^\d+(\.\d+)*$/.test(trimmed)
    return {
      numero: isNumericLike ? trimmed : '',
      nome: isNumericLike ? '' : trimmed,
      normalized,
    }
  }

  const parts = normalized.split(' :: ')
  const numero = (parts[0] || '').trim()
  const nome = parts.slice(1).join(' :: ').trim()
  return { numero, nome, normalized }
}

/** Mesmo formato usado no edital verticalizado (modulo dos flashcards). */
export function formatModuloFromTopicKey(topicKey = '', moduloLabel = '') {
  if (moduloLabel) return moduloLabel
  const { numero, nome } = parseTopicKeyParts(topicKey)
  if (numero && nome) return `${numero} - ${nome}`
  return nome || numero || ''
}

export function encodeTopicKeyForPath(topicKey = '') {
  const normalized = normalizeTopicKeyForStorage(topicKey)
  return normalized ? encodeURIComponent(normalized) : ''
}

export function encodeTopicKeyForQuery(topicKey = '') {
  return encodeTopicKeyForPath(topicKey)
}

function normalizeContentType(contentType = '') {
  const t = String(contentType || '').toLowerCase()
  if (t === 'flashcards' || t === 'flashcard') return 'flashcard'
  if (t === 'materia' || t === 'material') return 'material'
  if (t === 'questoes' || t === 'questao') return 'questao'
  if (t === 'incidencia') return 'incidencia'
  if (t === 'topico') return 'flashcard'
  return t
}

/**
 * Monta URL alinhada ao EditalVerticalizado para flashcard / material / questão.
 */
export function buildTopicContentLink({
  courseId = '',
  topicKey = '',
  contentType = '',
  contentId = '',
  disciplinaNome = '',
  topicoNome = '',
  moduloLabel = '',
  linkPath = '',
} = {}) {
  const course = courseId || ''
  const type = normalizeContentType(contentType)
  const { nome: parsedNome } = parseTopicKeyParts(topicKey)
  const effectiveTopicoNome = topicoNome || parsedNome || ''
  const effectiveModulo = formatModuloFromTopicKey(topicKey, moduloLabel)
  const effectiveDisciplina = disciplinaNome || ''
  const topicPath = encodeTopicKeyForPath(topicKey)

  if (type === 'flashcard') {
    if (course && topicKey) {
      const params = new URLSearchParams()
      const normalized = normalizeTopicKeyForStorage(topicKey)
      params.set('topicKey', normalized)
      if (effectiveDisciplina) params.set('disciplina', effectiveDisciplina)
      if (effectiveModulo) params.set('modulo', effectiveModulo)
      if (contentId) params.set('card', String(contentId))
      return `/flashcards/topico/${encodeURIComponent(course)}?${params.toString()}`
    }
    const params = new URLSearchParams()
    if (course) params.set('course', course)
    if (effectiveDisciplina) params.set('materia', effectiveDisciplina)
    if (effectiveModulo) params.set('modulo', effectiveModulo)
    if (contentId) params.set('card', String(contentId))
    const qs = params.toString()
    return qs ? `/flashcards/estudar?${qs}` : course ? `/flashcards?course=${course}` : '/flashcards'
  }

  if (type === 'material') {
    if (course && topicPath) {
      const nomeQs = effectiveTopicoNome
        ? `?nome=${encodeURIComponent(effectiveTopicoNome)}`
        : ''
      return `/conteudo-completo/topic/${encodeURIComponent(course)}/${topicPath}${nomeQs}`
    }
    return '/resolver-material'
  }

  if (type === 'questao') {
    if (course && topicPath) {
      const nomeQs = effectiveTopicoNome
        ? `?nome=${encodeURIComponent(effectiveTopicoNome)}`
        : ''
      return `/questoes-topic/${encodeURIComponent(course)}/${topicPath}${nomeQs}`
    }
    return '/resolver-questoes'
  }

  if (type === 'incidencia') {
    if (course && topicKey) {
      const idx = String(topicKey).replace(/^incidencia_/, '').replace(/^d/, '')
      if (idx !== '') return `/conteudo-incidencia/${encodeURIComponent(course)}/${idx}`
    }
    return '/resolver-material'
  }

  if (type === 'vespera') return '/vespera-de-prova'

  if (linkPath) return linkPath
  return '/edital-verticalizado'
}
