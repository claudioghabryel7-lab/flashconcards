const MIN_FLASHCARDS = 40
const MAX_FLASHCARDS = 60
const MIN_VERSO_CHARS = 40

function validateFlashcardsList(flashcards = [], options = {}) {
  const errors = []
  const min = options.min ?? MIN_FLASHCARDS
  const max = options.max ?? MAX_FLASHCARDS
  const list = Array.isArray(flashcards) ? flashcards : []

  if (list.length < min) {
    errors.push(`Flashcards insuficientes: ${list.length} (mínimo ${min}).`)
  }
  if (list.length > max) {
    errors.push(`Flashcards em excesso: ${list.length} (máximo ${max}).`)
  }

  const seen = new Set()
  list.forEach((card, idx) => {
    const frente = String(card?.frente || card?.pergunta || '').trim()
    const verso = String(card?.verso || card?.resposta || '').trim()
    const key = frente.toLowerCase()

    if (!frente) errors.push(`Card ${idx + 1}: frente vazia.`)
    if (!verso) errors.push(`Card ${idx + 1}: verso vazio.`)
    if (idx < 15 && verso.length < MIN_VERSO_CHARS) {
      errors.push(`Card ${idx + 1}: verso muito curto (${verso.length} chars).`)
    }
    if (key && seen.has(key)) errors.push(`Card ${idx + 1}: frente duplicada.`)
    if (key) seen.add(key)
  })

  return { ok: errors.length === 0, errors }
}

module.exports = {
  validateFlashcardsList,
  MIN_FLASHCARDS,
  MAX_FLASHCARDS,
}
