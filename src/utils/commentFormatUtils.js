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

/** Insere parágrafos em textos colados (comum em respostas de IA). */
export function smartParagraphize(text = '') {
  let s = normalizeCommentInput(text)
  if (!s) return ''

  s = s
    .split('\n')
    .map((line) => line.trim())
    .join('\n')

  s = s.replace(/\)([A-ZÁÉÍÓÚÀÊÔÂÃÕÇ])/g, ')\n\n$1')
  s = s.replace(/([.!?])\s*(?=(Exemplo|Elementos|Critérios|Identidade|Ser |Para |Uma |O texto|A afirmação|\d+[)]))/gi, '$1\n\n')
  s = s.replace(/\.(?=[A-ZÁÉÍÓÚÀÊÔÂÃÕÇ])/g, '.\n\n')
  s = s.replace(/:(?=[A-ZÁÉÍÓÚÀÊÔÂÃÕÇ])/g, ':\n\n')
  s = s.replace(/forma:(?=\s*\\?\()/gi, 'forma:\n\n')
  s = s.replace(/([.!?])\s*(?=- )/g, '$1\n\n')
  s = s.replace(/\n{3,}/g, '\n\n')

  return s.trim()
}

export function sanitizeCommentForStorage(text = '') {
  const normalized = smartParagraphize(text)
  if (!normalized) return ''
  return normalized.slice(0, MAX_COMMENT_LENGTH)
}

const FORMAT_TOKEN =
  /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|==(?:amarelo|verde|rosa|azul):[^=\n]+==|==[^=\n]+==)/g

function readInlineMath(text, start) {
  if (text.slice(start, start + 2) !== '\\(') return null
  let depth = 1
  let i = start + 2
  while (i < text.length - 1) {
    if (text.slice(i, i + 2) === '\\(') {
      depth += 1
      i += 2
      continue
    }
    if (text.slice(i, i + 2) === '\\)') {
      depth -= 1
      if (depth === 0) {
        return {
          raw: text.slice(start, i + 2),
          inner: text.slice(start + 2, i),
          end: i + 2,
        }
      }
      i += 2
      continue
    }
    i += 1
  }
  return null
}

function readDollarMath(text, start) {
  if (text[start] !== '$' || text[start + 1] === '$') return null
  const end = text.indexOf('$', start + 1)
  if (end === -1) return null
  return {
    raw: text.slice(start, end + 1),
    inner: text.slice(start + 1, end),
    end: end + 1,
  }
}

function parseInlineSegment(segment) {
  const tokens = []
  let i = 0

  while (i < segment.length) {
    const math = readInlineMath(segment, i) || readDollarMath(segment, i)
    if (math) {
      const display = /\\begin\{(matrix|pmatrix|bmatrix|vmatrix|align)/.test(math.inner)
      tokens.push({ type: display ? 'math-display-inline' : 'math-inline', text: math.inner })
      i = math.end
      continue
    }

    const slice = segment.slice(i)
    const formatMatch = slice.match(FORMAT_TOKEN)
    if (formatMatch && formatMatch.index === 0) {
      const raw = formatMatch[0]
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
      i += raw.length
      continue
    }

    const nextSpecial = findNextSpecial(segment, i + 1)
    tokens.push({ type: 'plain', text: segment.slice(i, nextSpecial) })
    i = nextSpecial
  }

  return tokens.length ? tokens : [{ type: 'plain', text: segment }]
}

function findNextSpecial(text, from) {
  for (let j = from; j < text.length; j += 1) {
    if (text.slice(j, j + 2) === '\\(') return j
    if (text[j] === '$' && text[j + 1] !== '$') return j
    if (text.slice(j, j + 2) === '**') return j
    if (text[j] === '*' && text[j + 1] !== '*') return j
    if (text.slice(j, j + 2) === '==') return j
  }
  return text.length
}

const DISPLAY_MATH = /\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$/g

export function parseCommentBlocks(text = '') {
  const normalized = smartParagraphize(text)
  if (!normalized) return []

  const blocks = []
  let cursor = 0

  for (const match of normalized.matchAll(DISPLAY_MATH)) {
    if (match.index > cursor) {
      blocks.push(...paragraphBlocksFromText(normalized.slice(cursor, match.index)))
    }
    blocks.push({ type: 'math-display', latex: match[1] || match[2] || '' })
    cursor = match.index + match[0].length
  }

  if (cursor < normalized.length) {
    blocks.push(...paragraphBlocksFromText(normalized.slice(cursor)))
  }

  return blocks
}

function paragraphBlocksFromText(text) {
  return text.split('\n').map((line) => {
    if (!line.trim()) return { type: 'spacer' }
    const tokens = parseInlineSegment(line)
    const hasDisplayMath = tokens.some((t) => t.type === 'math-display-inline')
    if (hasDisplayMath) {
      return tokens.flatMap((token) => {
        if (token.type === 'math-display-inline') {
          return [{ type: 'math-display', latex: token.text }]
        }
        if (token.type === 'plain' && !token.text.trim()) return []
        return [{ type: 'paragraph', tokens: [token] }]
      })
    }
    return { type: 'paragraph', tokens }
  }).flat()
}

export function wrapSelection(value, selectionStart, selectionEnd, before, after = before) {
  const selected = value.slice(selectionStart, selectionEnd)
  const next = value.slice(0, selectionStart) + before + selected + after + value.slice(selectionEnd)
  const cursorStart = selectionStart + before.length
  const cursorEnd = cursorStart + selected.length
  return { value: next, selectionStart: cursorStart, selectionEnd: cursorEnd || cursorStart }
}

export function wrapHighlight(value, selectionStart, selectionEnd, color = 'amarelo') {
  const selected = value.slice(selectionStart, selectionEnd)
  const open = `==${color}:`
  const close = '=='
  if (!selected) {
    const token = `${open}${close}`
    const next = value.slice(0, selectionStart) + token + value.slice(selectionEnd)
    const cursor = selectionStart + open.length
    return { value: next, selectionStart: cursor, selectionEnd: cursor }
  }
  const token = `${open}${selected}${close}`
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
