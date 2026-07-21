/**
 * Normaliza e ordena alternativas de questão (A → E).
 * Aceita array, array de objetos ou mapa { A, B, C… }.
 *
 * Importante: Firestore não preserva ordem de chaves em mapas.
 * Sempre usar as funções deste módulo na UI — nunca Object.entries cru.
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
    return String(value.texto ?? value.text ?? value.conteudo ?? value.value ?? '')
  }
  return String(value)
}

function extractLeadingLetter(text = '') {
  const m = String(text)
    .trim()
    .match(/^([A-Ha-h])\s*[\)\].:\-–—]\s*(.*)$/s)
  if (!m) return null
  return { letra: m[1].toUpperCase(), texto: m[2].trim() }
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
        const parsed = extractLeadingLetter(String(alt))
        if (parsed?.texto) {
          return { letra: parsed.letra, texto: parsed.texto }
        }
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

  // Reindexa para A..E se vier só texto sem letras válidas
  const letters = list.map((item) => item.letra)
  const hasValidLetters = letters.every((l) => LETTER_ORDER.includes(l))
  if (!hasValidLetters) {
    list = list.map((item, i) => ({
      ...item,
      letra: LETTER_ORDER[i] || String.fromCharCode(65 + i),
    }))
  }

  return list.slice(0, Math.max(0, limit))
}

/** [[letra, texto], ...] sempre A, B, C, D, E… — use isto na UI. */
export function sortAlternativasEntries(raw, limit = 5) {
  return normalizeQuestaoAlternativas(raw, limit).map(({ letra, texto }) => [letra, texto])
}

/**
 * Objeto { A: '...', B: '...' } reconstruído na ordem A→E.
 * Evita depender da ordem de inserção/Firestore.
 */
export function alternativasAsOrderedObject(raw, limit = 5) {
  const ordered = {}
  for (const { letra, texto } of normalizeQuestaoAlternativas(raw, limit)) {
    ordered[letra] = texto
  }
  return ordered
}

/** Atalho para map em React: sempre A→E. */
export function mapOrderedAlternativas(raw, limit = 5) {
  return sortAlternativasEntries(raw, limit)
}
