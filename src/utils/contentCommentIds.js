/** IDs estáveis para vincular comentários a um flashcard ou questão específica. */

function simpleHash(text = '') {
  let h = 0
  for (let i = 0; i < text.length; i += 1) {
    h = (h << 5) - h + text.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36)
}

export function sanitizeTopicKeyForContentId(topicKey = '') {
  if (!topicKey) return 'topico'

  let decoded = topicKey
  try {
    decoded = decodeURIComponent(topicKey)
  } catch {
    decoded = topicKey
  }

  let sanitized = decoded
    .replace(/::/g, '_DC_')
    .replace(/\//g, '_SL_')
    .replace(/\\/g, '_BS_')
    .trim()

  if (!sanitized) sanitized = `h${simpleHash(topicKey)}`
  if (sanitized.length > 120) sanitized = sanitized.slice(0, 120)

  return sanitized
}

/**
 * ID único por questão dentro de um pacote/nível de tópico.
 */
export function buildQuestaoContentId({
  topicKey,
  nivel = 1,
  questao,
  questionIndex = 0,
  packId = '',
}) {
  const topic = sanitizeTopicKeyForContentId(topicKey)
  const numero = questao?.numero ?? questionIndex + 1
  const enunciadoKey = questao?.enunciado ? simpleHash(String(questao.enunciado).slice(0, 240)) : ''
  const stable =
    questao?.id ||
    questao?.uid ||
    (enunciadoKey ? `e${enunciadoKey}` : `i${questionIndex}`)
  const pack = packId ? `_p${String(packId).slice(0, 40)}` : ''

  return `${topic}_n${nivel}_q${numero}_${stable}${pack}`.slice(0, 500)
}

/**
 * ID único por flashcard (Firestore doc id ou hash da pergunta).
 */
export function buildLegacyQuestaoContentId({ topicKey, nivel = 1, questionIndex = 0, sanitizeTopicKey }) {
  const topic = sanitizeTopicKey ? sanitizeTopicKey(topicKey) : sanitizeTopicKeyForContentId(topicKey)
  return `${topic}_n${nivel}_q${questionIndex}`
}

export function buildFlashcardContentId({ courseId, topicKey, card, cardIndex = 0 }) {
  if (card?.id) {
    return `${courseId || 'course'}_fc_${card.id}`
  }

  const topic = sanitizeTopicKeyForContentId(topicKey)
  const pergunta = card?.pergunta || card?.frente || ''
  const hash = pergunta ? simpleHash(pergunta.slice(0, 240)) : `idx${cardIndex}`
  return `${courseId || 'course'}_fc_${topic}_${hash}`.slice(0, 500)
}
