/**
 * Filtros de qualidade para flashcards gerados no cliente (antes do checkpoint).
 */

const MIN_VERSO = 40
const MIN_FRENTE = 12
const GENERIC_FRONT =
  /^(o que [ée]\b|defina\b|conceito de\b|explique o que\b|qual (a|o) (definição|conceito))/i
const GENERIC_BACK =
  /^(é um|é uma|trata-se de um|trata-se de uma|consiste em)\b.{0,40}$/i

function norm(s = '') {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeTopic(topic = '') {
  return norm(topic)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4)
    .slice(0, 12)
}

/**
 * Descarta cards vazios, genéricos, curtos ou claramente fora do tópico.
 */
export function filterFlashcardBatch(cards = [], { topicoNome = '', disciplina = '' } = {}) {
  const topicTokens = tokenizeTopic(topicoNome)
  const discTokens = tokenizeTopic(disciplina)
  const kept = []
  const rejected = []
  const seen = new Set()

  for (const raw of cards) {
    const pergunta = String(raw?.pergunta || raw?.frente || '').trim()
    const resposta = String(raw?.resposta || raw?.verso || '').trim()
    const key = norm(pergunta)

    if (!pergunta || !resposta) {
      rejected.push({ pergunta, reason: 'vazio' })
      continue
    }
    if (pergunta.length < MIN_FRENTE) {
      rejected.push({ pergunta, reason: 'frente_curta' })
      continue
    }
    if (resposta.length < MIN_VERSO) {
      rejected.push({ pergunta, reason: 'verso_curto' })
      continue
    }
    if (seen.has(key)) {
      rejected.push({ pergunta, reason: 'duplicado' })
      continue
    }
    if (GENERIC_FRONT.test(pergunta) && resposta.length < 80) {
      rejected.push({ pergunta, reason: 'generico' })
      continue
    }
    if (GENERIC_BACK.test(resposta)) {
      rejected.push({ pergunta, reason: 'verso_generico' })
      continue
    }

    // Relevância: se temos tokens do tópico, pelo menos 1 deve aparecer em frente OU verso
    // (exceto tópicos muito curtos / genéricos)
    if (topicTokens.length >= 2) {
      const blob = `${norm(pergunta)} ${norm(resposta)}`
      const hitTopic = topicTokens.some((t) => blob.includes(t))
      const hitDisc = discTokens.some((t) => blob.includes(t))
      if (!hitTopic && !hitDisc) {
        rejected.push({ pergunta, reason: 'fora_do_topico' })
        continue
      }
    }

    seen.add(key)
    kept.push({
      ...raw,
      pergunta,
      resposta,
      frente: pergunta,
      verso: resposta,
    })
  }

  return { kept, rejected }
}

export function validateFlashcardBatchOrThrow(cards, ctx = {}, { minKeep = 1 } = {}) {
  const { kept, rejected } = filterFlashcardBatch(cards, ctx)
  if (kept.length < minKeep) {
    const err = new Error(
      `Lote de flashcards rejeitado por qualidade (${kept.length} ok, ${rejected.length} descartados). Regenerando…`,
    )
    err.code = 'flashcards_quality'
    err.rejected = rejected
    throw err
  }
  return kept
}
