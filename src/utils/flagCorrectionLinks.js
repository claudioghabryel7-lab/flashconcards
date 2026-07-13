/**
 * Monta URL para abrir o conteúdo corrigido a partir de uma notificação de flag.
 */
export function buildFlagCorrectionLink(n = {}) {
  if (n.linkPath) return n.linkPath

  const courseId = n.courseId || ''
  const topicKey = n.topicKey || ''
  const contentType = n.contentType || ''

  let materia = ''
  let modulo = ''
  try {
    const decoded = decodeURIComponent(topicKey)
    const parts = decoded.split(' :: ')
    materia = parts[0] || ''
    modulo = parts.slice(1).join(' :: ') || ''
  } catch {
    modulo = topicKey
  }

  if (contentType === 'flashcard') {
    const params = new URLSearchParams()
    if (courseId) params.set('course', courseId)
    if (materia) params.set('materia', materia)
    if (modulo) params.set('modulo', modulo)
    if (n.contentId) params.set('card', String(n.contentId))
    return `/flashcards/estudar?${params.toString()}`
  }
  if ((contentType === 'material' || contentType === 'materia') && courseId && topicKey) {
    return `/conteudo-completo/topic/${courseId}/${encodeURIComponent(topicKey)}`
  }
  if (contentType === 'questao' && courseId && topicKey) {
    return `/questoes-topic/${courseId}/${encodeURIComponent(topicKey)}`
  }
  if (contentType === 'questao') return '/resolver-questoes'
  if (contentType === 'material' || contentType === 'materia') return '/resolver-material'
  if (contentType === 'flashcard') return courseId ? `/flashcards?course=${courseId}` : '/flashcards'
  return '/edital-verticalizado'
}
