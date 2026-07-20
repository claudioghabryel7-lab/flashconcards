/**
 * Normaliza e ordena alternativas de questão (A → E).
 * Aceita array, array de objetos ou mapa { A, B, C… }.
 */

const LETTER_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

function letterSortKey(letra) {
  const u = String(letra || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (!u) return 999
  const idx = LETTER_ORDER.indexOf(u[0])
  return idx >= 0 ? idx : 100 + u.charCodeAt(0)
}

function asTexto(value) {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    return String(value.texto ?? value.text ?? value.conteudo ?? '')
  }
  return String(value)
}

/**
 * @returns {{ letra: string, texto: string }[]}
 */
export function normalizeQuestaoAlternativas(raw, limit = 5) {
  if (raw == null) return []

  let list = []

  if (Array.isArray(raw)) {
    list = raw.map((alt, i) => {
      if (alt == null) {
        return { letra: LETTER_ORDER[i] || String(i), texto: '' }
      }
      if (typeof alt === 'string' || typeof alt === 'number') {
        return { letra: LETTER_ORDER[i] || String(i), texto: String(alt) }
      }
      const letraRaw = alt.letra || alt.key || alt.id || LETTER_ORDER[i] || String.fromCharCode(65 + i)
      return {
        letra: String(letraRaw).trim().toUpperCase().replace(/[^A-Z]/g, '') || LETTER_ORDER[i] || 'A',
        texto: asTexto(alt),
      }
    })
  } else if (typeof raw === 'object') {
    list = Object.entries(raw).map(([letra, texto], i) => ({
      letra:
        String(letra || '')
          .trim()
          .toUpperCase()
          .replace(/[^A-Z]/g, '') || LETTER_ORDER[i] || 'A',
      texto: asTexto(texto),
    }))
  }

  list.sort((a, b) => letterSortKey(a.letra) - letterSortKey(b.letra))

  // Remove duplicatas de letra (mantém a primeira na ordem)
  const seen = new Set()
  list = list.filter((item) => {
    if (seen.has(item.letra)) return false
    seen.add(item.letra)
    return true
  })

  return list.slice(0, Math.max(0, limit))
}

/** [[letra, texto], ...] sempre A, B, C, D, E… */
export function sortAlternativasEntries(raw, limit = 5) {
  return normalizeQuestaoAlternativas(raw, limit).map(({ letra, texto }) => [letra, texto])
}

/** Objeto { A: '...', B: '...' } na ordem alfabética das letras. */
export function alternativasAsOrderedObject(raw, limit = 5) {
  return Object.fromEntries(sortAlternativasEntries(raw, limit))
}
