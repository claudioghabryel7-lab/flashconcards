/**
 * Filtros de qualidade para flashcards gerados no cliente (antes do checkpoint).
 * Leves o bastante para não forçar regeneração cara; o grosso fica na auditoria.
 * Também remove contradições internas (mesmo lote / lote + já gerados).
 */

const MIN_VERSO = 28
const MIN_FRENTE = 10
const GENERIC_FRONT =
  /^(o que [ée]\b|defina\b|conceito de\b|explique o que\b|qual (a|o) (definição|conceito))\b.{0,40}$/i
const GENERIC_BACK =
  /^(é um|é uma|trata-se de um|trata-se de uma|consiste em)\b.{0,30}$/i

const AFFIRM =
  /\b(sim|verdadeiro|verdade|certo|correto|afirmativ|possui|tem|deve|pode|e permitido|e obrigatori|e cabivel|existe|incide|aplica-se|aplica se)\b/
const NEGATE =
  /\b(nao|nunca|falso|errado|incorreto|vedad|proibid|impossivel|nao possui|nao tem|nao deve|nao pode|nao e permitido|nao e obrigatori|nao e cabivel|inexiste|nao incide|nao se aplica|nao aplica)\b/

function norm(s = '') {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extrai polaridade aproximada do verso (1=afirma, -1=nega, 0=neutro). */
export function inferAnswerPolarity(text = '') {
  const n = norm(text)
  if (!n) return 0
  const hasAff = AFFIRM.test(n)
  const hasNeg = NEGATE.test(n)
  if (hasNeg && !hasAff) return -1
  if (hasAff && !hasNeg) return 1
  // "não é X" / "é incorreto" etc. — prioriza negação se ambas
  if (hasNeg && hasAff) {
    if (/^nao\b|^falso\b|^errado\b|e falso|e errado|e incorreto/.test(n)) return -1
    if (/^sim\b|^verdadeiro\b|^certo\b|e verdadeiro|e correto/.test(n)) return 1
  }
  return 0
}

/** Similaridade grosseira por tokens compartilhados (0–1). */
export function frontSimilarity(a = '', b = '') {
  const ta = new Set(norm(a).split(' ').filter((w) => w.length > 3))
  const tb = new Set(norm(b).split(' ').filter((w) => w.length > 3))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  return inter / Math.max(ta.size, tb.size)
}

/**
 * Detecta pares com frentes muito parecidas e versos de polaridade oposta.
 * @returns {{ index: number, against: number, reason: string }[]}
 */
export function findContradictingIndices(cards = [], priorCards = []) {
  const contradictions = []
  const pool = [
    ...priorCards.map((c, i) => ({
      pergunta: String(c?.pergunta || c?.frente || ''),
      resposta: String(c?.resposta || c?.verso || ''),
      idx: `p${i}`,
      isPrior: true,
    })),
    ...cards.map((c, i) => ({
      pergunta: String(c?.pergunta || c?.frente || ''),
      resposta: String(c?.resposta || c?.verso || ''),
      idx: i,
      isPrior: false,
    })),
  ]

  for (let i = 0; i < pool.length; i += 1) {
    const a = pool[i]
    if (a.isPrior) continue
    const polA = inferAnswerPolarity(a.resposta)
    if (polA === 0) continue

    for (let j = 0; j < i; j += 1) {
      const b = pool[j]
      const sim = frontSimilarity(a.pergunta, b.pergunta)
      if (sim < 0.55) continue
      const polB = inferAnswerPolarity(b.resposta)
      if (polB === 0) continue
      if (polA === -polB) {
        contradictions.push({
          index: a.idx,
          against: b.idx,
          reason: 'contradicao_polaridade',
        })
        break
      }
    }
  }
  return contradictions
}

/**
 * Descarta só cards claramente inválidos (vazio, curto demais, duplicado, genérico extremo).
 * Opcionalmente remove cards que contradizem priorCards ou uns aos outros no lote.
 */
export function filterFlashcardBatch(
  cards = [],
  { topicoNome: _topicoNome = '', disciplina: _disciplina = '', priorCards = [] } = {},
) {
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

    // Contradição com cards já aceitos neste lote ou com priorCards
    const trial = [...kept, { pergunta, resposta }]
    const hits = findContradictingIndices(trial, priorCards)
    if (hits.some((h) => h.index === trial.length - 1)) {
      rejected.push({ pergunta, reason: 'contradicao' })
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

export function validateFlashcardBatchOrThrow(
  cards,
  ctx = {},
  { minKeep = 1 } = {},
) {
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
