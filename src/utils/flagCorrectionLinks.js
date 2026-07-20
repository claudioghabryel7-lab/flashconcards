import { buildTopicContentLink } from './topicContentLinks'

/**
 * Monta URL para abrir o conteúdo corrigido a partir de uma notificação de flag.
 */
export function buildFlagCorrectionLink(n = {}) {
  return buildTopicContentLink({
    courseId: n.courseId,
    topicKey: n.topicKey,
    contentType: n.contentType,
    contentId: n.contentId,
    disciplinaNome: n.disciplinaNome || n.disciplina || '',
    topicoNome: n.topicoNome || n.topico || '',
    moduloLabel: n.moduloLabel || n.modulo || '',
    linkPath: n.linkPath,
    professorNote: n.professorNote || n.explanation || n.message || '',
    flagId: n.flagId || n.id || '',
  })
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
