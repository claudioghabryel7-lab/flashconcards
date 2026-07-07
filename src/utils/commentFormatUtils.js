const HIGHLIGHT_COLORS = ['amarelo', 'verde', 'rosa', 'azul']
const MAX_COMMENT_LENGTH = 4000

/** Remove caracteres invisíveis e normaliza quebras de linha (colagem de IA). */
export function normalizeCommentInput(text = '') {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .replace(/\t/g, '  ')
    .replace(/[ \u00A0]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function sanitizeCommentForStorage(text = '') {
  const normalized = normalizeCommentInput(text)
  if (!normalized) return ''
  return normalized.slice(0, MAX_COMMENT_LENGTH)
}

const INLINE_TOKEN =
  /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|==(?:amarelo|verde|rosa|azul):[^=\n]+==|==[^=\n]+==)/g

function parseInlineSegment(segment) {
  const tokens = []
  let last = 0

  for (const match of segment.matchAll(INLINE_TOKEN)) {
    if (match.index > last) {
      tokens.push({ type: 'plain', text: segment.slice(last, match.index) })
    }

    const raw = match[0]
    if (raw.startsWith('**')) {
      tokens.push({ type: 'bold', text: raw.slice(2, -2) })
    } else if (raw.startsWith('*')) {
      tokens.push({ type: 'italic', text: raw.slice(1, -1) })
    } else if (raw.startsWith('==')) {
      const inner = raw.slice(2, -2)
      const colonIdx = inner.indexOf(':')
      const maybeColor = colonIdx > 0 ? inner.slice(0, colonIdx) : ''
      if (HIGHLIGHT_COLORS.includes(maybeColor)) {
        tokens.push({ type: 'mark', color: maybeColor, text: inner.slice(colonIdx + 1) })
      } else {
        tokens.push({ type: 'mark', color: 'amarelo', text: inner })
      }
    }

    last = match.index + raw.length
  }

  if (last < segment.length) {
    tokens.push({ type: 'plain', text: segment.slice(last) })
  }

  return tokens.length ? tokens : [{ type: 'plain', text: segment }]
}

/** Converte texto do comentário em blocos (parágrafos + formatação inline). */
export function parseCommentBlocks(text = '') {
  const normalized = normalizeCommentInput(text)
  if (!normalized) return []

  return normalized.split('\n').map((line) => ({
    tokens: line ? parseInlineSegment(line) : [{ type: 'plain', text: '' }],
  }))
}

export function wrapSelection(value, selectionStart, selectionEnd, before, after = before) {
  const selected = value.slice(selectionStart, selectionEnd) || 'texto'
  const next =
    value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd)
  const cursorStart = selectionStart + before.length
  const cursorEnd = cursorStart + selected.length
  return { value: next, selectionStart: cursorStart, selectionEnd: cursorEnd }
}

export function wrapHighlight(value, selectionStart, selectionEnd, color = 'amarelo') {
  const selected = value.slice(selectionStart, selectionEnd) || 'destaque'
  const token = `==${color}:${selected}==`
  const next = value.slice(0, selectionStart) + token + value.slice(selectionEnd)
  return {
    value: next,
    selectionStart: selectionStart + token.length,
    selectionEnd: selectionStart + token.length,
  }
}

export const HIGHLIGHT_OPTIONS = [
  { id: 'amarelo', label: 'Amarelo', className: 'bg-yellow-200/90 text-yellow-950 dark:bg-yellow-400/25 dark:text-yellow-100' },
  { id: 'verde', label: 'Verde', className: 'bg-emerald-200/90 text-emerald-950 dark:bg-emerald-400/25 dark:text-emerald-100' },
  { id: 'rosa', label: 'Rosa', className: 'bg-pink-200/90 text-pink-950 dark:bg-pink-400/25 dark:text-pink-100' },
  { id: 'azul', label: 'Azul', className: 'bg-cyan-200/90 text-cyan-950 dark:bg-cyan-400/25 dark:text-cyan-100' },
]

export function highlightClass(color) {
  return HIGHLIGHT_OPTIONS.find((o) => o.id === color)?.className || HIGHLIGHT_OPTIONS[0].className
}
