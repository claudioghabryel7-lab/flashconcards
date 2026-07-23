export const CHART_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F97316',
  '#6366F1',
  '#84CC16',
  '#06B6D4',
  '#A855F7',
]

/** Hash estável de string → índice de cor da matéria. */
export function stableColorIndex(name = '') {
  const str = String(name || '')
  let hash = 0
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0
  }
  return hash % CHART_COLORS.length
}

export function colorForSubject(materia = '') {
  return CHART_COLORS[stableColorIndex(materia)]
}

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return { r: 59, g: 130, b: 246 }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Cor do tópico: mesma família da matéria, mas distinta (matriz matéria → tópicos).
 */
export function deriveTopicColor(parentHex, topicKey = '', topicIndex = 0) {
  const { r, g, b } = hexToRgb(parentHex || colorForSubject(topicKey))
  const shift = ((stableColorIndex(topicKey) + topicIndex * 3) % 7) - 3
  const factor = 0.72 + ((Math.abs(shift) + 1) % 5) * 0.06
  const mixWhite = shift > 0
  if (mixWhite) {
    return rgbToHex(
      r + (255 - r) * (1 - factor),
      g + (255 - g) * (1 - factor),
      b + (255 - b) * (1 - factor),
    )
  }
  return rgbToHex(r * factor, g * factor * 0.95, b * factor * 1.05)
}

export function assignChartColors(items = []) {
  return items.map((item, index) => ({
    ...item,
    color: item.color || CHART_COLORS[index % CHART_COLORS.length],
  }))
}

/** Colore itens de gráfico: matéria base + tópicos derivados. */
export function assignSubjectTopicColors(items = []) {
  const subjectOrder = []
  const topicCountBySubject = {}

  return items.map((item) => {
    const materia = item.materia || item.parent || item.name || ''
    if (!subjectOrder.includes(materia)) subjectOrder.push(materia)
    const subjectColor = item.subjectColor || colorForSubject(materia)
    const isTopic = Boolean(item.assunto || item.topic || item.isTopic)
    if (!isTopic) {
      return { ...item, color: item.color || subjectColor, subjectColor }
    }
    const idx = topicCountBySubject[materia] || 0
    topicCountBySubject[materia] = idx + 1
    const topicKey = item.assunto || item.topic || item.name || String(idx)
    return {
      ...item,
      color: item.color || deriveTopicColor(subjectColor, topicKey, idx),
      subjectColor,
    }
  })
}

export function toChartItems(record = {}, valueKey = 'value') {
  return Object.entries(record)
    .map(([name, raw]) => {
      const value = typeof raw === 'number' ? raw : raw?.[valueKey] ?? raw?.value ?? 0
      return { name, value: Number(value) || 0 }
    })
    .filter((item) => item.value > 0)
}
