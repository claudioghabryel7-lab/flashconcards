const HIGHLIGHT_COLORS = ['amarelo', 'verde', 'rosa', 'azul']
export const MAX_COMMENT_LENGTH = 4000

/** Remove caracteres invisíveis e normaliza quebras de linha (colagem de IA). */
export function normalizeCommentInput(text = '') {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .replace(/\t/g, '  ')
    .replace(/[ \u00A0]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
}

/** Insere parágrafos em textos colados sem quebras (comum em respostas de IA). */
export function smartParagraphize(text = '') {
  let s = normalizeCommentInput(text)
  if (!s) return ''

  if (s.includes('\n\n')) {
    return s.trim()
  }

  s = s.replace(
    /([.!?])\s*(?=(Exemplo|Elementos|Critérios|Identidade|Ser |Para |Uma |O texto|A afirmação|\d+\))/gi,
    '$1\n\n',
  )
  s = s.replace(/\.(?=\s*[A-ZÁÉÍÓÚÀÊÔÂÃÕÇ])/g, '.\n\n')
  s = s.replace(/:(?=\s*[A-ZÁÉÍÓÚÀÊÔÂÃÕÇ])/g, ':\n\n')
  s = s.replace(/([.!?])\s*(?=- )/g, '$1\n\n')
  s = s.replace(/\n{3,}/g, '\n\n')

  return s.trim()
}

export function sanitizeCommentForStorage(text = '') {
  const normalized = smartParagraphize(text)
  if (!normalized) return ''
  return normalized.slice(0, MAX_COMMENT_LENGTH)
}

const INLINE_TOKEN =
  /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|==(?:amarelo|verde|rosa|azul):[^=\n]+==|==[^=\n]+==|\\\([\s\S]*?\\\)|\$[^$\n]+\$)/g

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
    } else if (raw.startsWith('\\(') || raw.startsWith('$')) {
      const inner = raw.startsWith('\\(') ? raw.slice(2, -2) : raw.slice(1, -1)
      tokens.push({ type: 'math-inline', text: inner })
    }

    last = match.index + raw.length
  }

  if (last < segment.length) {
    tokens.push({ type: 'plain', text: segment.slice(last) })
  }

  return tokens.length ? tokens : [{ type: 'plain', text: segment }]
}

const DISPLAY_MATH = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$/g

/** Converte texto do comentário em blocos (parágrafos + formatação inline + math display). */
export function parseCommentBlocks(text = '') {
  const normalized = smartParagraphize(text)
  if (!normalized) return []

  const blocks = []
  let cursor = 0

  for (const match of normalized.matchAll(DISPLAY_MATH)) {
    if (match.index > cursor) {
      blocks.push(...paragraphBlocksFromText(normalized.slice(cursor, match.index)))
    }
    blocks.push({
      type: 'math-display',
      latex: match[1] || match[2] || '',
    })
    cursor = match.index + match[0].length
  }

  if (cursor < normalized.length) {
    blocks.push(...paragraphBlocksFromText(normalized.slice(cursor)))
  }

  return blocks
}

function paragraphBlocksFromText(text) {
  return text.split('\n').map((line) => {
    if (!line.trim()) {
      return { type: 'spacer' }
    }
    return {
      type: 'paragraph',
      tokens: parseInlineSegment(line),
    }
  })
}

export function wrapSelection(value, selectionStart, selectionEnd, before, after = before) {
  const selected = value.slice(selectionStart, selectionEnd)
  const inner = selected || ''
  const next = value.slice(0, selectionStart) + before + inner + after + value.slice(selectionEnd)
  const cursorStart = selectionStart + before.length
  const cursorEnd = cursorStart + inner.length
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
