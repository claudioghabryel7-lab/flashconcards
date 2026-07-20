/**
 * Filtros de qualidade para flashcards gerados no cliente (antes do checkpoint).
 * Leves o bastante para não forçar regeneração cara; o grosso fica na auditoria.
 */

const MIN_VERSO = 28
const MIN_FRENTE = 10
const GENERIC_FRONT =
  /^(o que [ée]\b|defina\b|conceito de\b|explique o que\b|qual (a|o) (definição|conceito))\b.{0,40}$/i
const GENERIC_BACK =
  /^(é um|é uma|trata-se de um|trata-se de uma|consiste em)\b.{0,30}$/i

function norm(s = '') {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Descarta só cards claramente inválidos (vazio, curto demais, duplicado, genérico extremo).
 * Não rejeita por "fora do tópico" — isso queimava cota em regenerações falsas.
 */
export function filterFlashcardBatch(cards = [], { topicoNome: _topicoNome = '', disciplina: _disciplina = '' } = {}) {
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
    if (GENERIC_FRONT.test(pergunta) && resposta.length < 60) {
      rejected.push({ pergunta, reason: 'generico' })
      continue
    }
    if (GENERIC_BACK.test(resposta)) {
      rejected.push({ pergunta, reason: 'verso_generico' })
      continue
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
