import { buildTopicContentLink } from './topicContentLinks'
import { buildFlashcardContentId } from './contentCommentIds'

function simpleHash(text = '') {
  let h = 0
  const s = String(text)
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36)
}

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

/**
 * Índice do card na lista — matching estrito (sem includes frouxo).
 * @param {Array} cards
 * @param {string} contentId
 * @param {{ courseId?: string, topicKey?: string }} [opts]
 */
export function findCardIndex(cards = [], contentId = '', opts = {}) {
  if (!contentId || !cards?.length) return -1
  const raw = String(contentId).trim()
  const afterFc = raw.includes('_fc_') ? raw.slice(raw.indexOf('_fc_') + 4) : raw
  const hashFromId = afterFc.match(/_h([a-z0-9]+)$/i)?.[1] || ''
  const isSynthetic = /_i\d+_h[a-z0-9]+$/i.test(afterFc)

  // 1) contentId canônico gerado pelo builder
  if (opts.courseId) {
    const byBuilt = cards.findIndex((c, i) => {
      const built = buildFlashcardContentId({
        courseId: opts.courseId,
        topicKey: opts.topicKey,
        card: c,
        cardIndex: i,
      })
      return built === raw
    })
    if (byBuilt >= 0) return byBuilt
  }

  // 2) ID do documento Firestore (nunca matching por substring)
  if (afterFc && !isSynthetic) {
    const byId = cards.findIndex((c) => {
      const id = String(c?.id || '').trim()
      if (!id) return false
      return id === afterFc || id === raw || raw.endsWith(`_fc_${id}`)
    })
    if (byId >= 0) return byId
  }

  // 3) Hash da pergunta (_h…)
  if (hashFromId) {
    const byHash = cards.findIndex((c) => {
      const pergunta = String(c?.pergunta || c?.frente || '').slice(0, 240)
      return pergunta && simpleHash(pergunta) === hashFromId
    })
    if (byHash >= 0) return byHash
  }

  // 4) Legado: course_fc_topic_{hash} sem _iN_h
  if (!hashFromId && afterFc) {
    const legacyHash = afterFc.match(/_([a-z0-9]+)$/i)?.[1]
    if (legacyHash && legacyHash.length >= 4) {
      const byLegacy = cards.findIndex((c) => {
        const pergunta = String(c?.pergunta || c?.frente || '').slice(0, 240)
        return pergunta && simpleHash(pergunta) === legacyHash
      })
      if (byLegacy >= 0) return byLegacy
    }
  }

  return -1
}

/**
 * Índice da questão na lista pelo contentId (hash do enunciado / número / índice).
 */
export function findQuestaoIndexInList(questoes = [], contentId = '', preview = '') {
  if (!contentId || !questoes?.length) return -1
  const id = String(contentId)
  const eHash = id.match(/_e([a-z0-9]+)/i)?.[1] || ''
  const iIndex = id.match(/_i(\d+)/)?.[1]
  const qNumero = id.match(/_q(\d+)_/)?.[1]
  const isCanonical = /_n\d+_q\d+_/.test(id)

  if (eHash) {
    const byHash = questoes.findIndex((q) => {
      const enunciado = String(q?.enunciado || '').slice(0, 240)
      return enunciado && simpleHash(enunciado) === eHash
    })
    if (byHash >= 0) return byHash
  }

  const previewNorm = String(preview || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .toLowerCase()
  if (previewNorm.length >= 16) {
    const byPreview = questoes.findIndex((q) => {
      const hay = String(q?.enunciado || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
      return hay.includes(previewNorm) || previewNorm.includes(hay.slice(0, 100))
    })
    if (byPreview >= 0) return byPreview
  }

  if (qNumero != null) {
    const num = Number(qNumero)
    const byNumero = questoes.findIndex(
      (q) => Number(q?.numero) === num || Number(q?.number) === num,
    )
    if (byNumero >= 0) return byNumero
  }

  if (iIndex != null) {
    const idx = Number(iIndex)
    if (Number.isFinite(idx) && questoes[idx]) return idx
  }

  if (!isCanonical) {
    const trailing = id.match(/_(\d+)$/)
    if (trailing) {
      const idx = Number(trailing[1])
      if (Number.isFinite(idx) && questoes[idx]) return idx
    }
  }

  return -1
}

/** Extrai nível do contentId canônico (_n3_). */
export function parseNivelFromContentId(contentId = '') {
  const m = String(contentId || '').match(/_n(\d+)(?:_|$)/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n >= 1 && n <= 10 ? n : null
}
