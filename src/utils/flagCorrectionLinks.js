/**
 * Monta URL para abrir o conteúdo corrigido a partir de uma notificação de flag.
 * Preferência: rota por tópico (Guia Mentorado) + foco no card.
 */
export function buildFlagCorrectionLink(n = {}) {
  if (n.linkPath && String(n.linkPath).includes('/flashcards/topico/')) {
    return n.linkPath
  }

  const courseId = n.courseId || ''
  const topicKey = n.topicKey || ''
  const contentType = n.contentType || ''
  const contentId = n.contentId ? String(n.contentId) : ''

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
    if (courseId && topicKey) {
      const params = new URLSearchParams()
      params.set('topicKey', topicKey)
      if (materia) params.set('disciplina', materia)
      if (modulo) params.set('modulo', modulo)
      if (contentId) params.set('card', contentId)
      return `/flashcards/topico/${encodeURIComponent(courseId)}?${params.toString()}`
    }
    const params = new URLSearchParams()
    if (courseId) params.set('course', courseId)
    if (materia) params.set('materia', materia)
    if (modulo) params.set('modulo', modulo)
    if (contentId) params.set('card', contentId)
    const qs = params.toString()
    return qs ? `/flashcards/estudar?${qs}` : '/flashcards'
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

  // linkPath legado (pode apontar para estudar sem card) — só usa se nada melhor
  if (n.linkPath) return n.linkPath
  return '/edital-verticalizado'
}

/** Índice do card na lista (aceita id parcial / sufixo _fc_). */
export function findCardIndex(cards = [], contentId = '') {
  if (!contentId || !cards?.length) return -1
  const raw = String(contentId)
  const short = raw.replace(/^.*_fc_/, '').replace(/^.*\//, '')
  const idx = cards.findIndex((c) => {
    const id = String(c.id || '')
    return (
      id === raw ||
      id === short ||
      raw.endsWith(id) ||
      id.endsWith(short) ||
      raw.includes(id) ||
      id.includes(short)
    )
  })
  return idx
}
