import { useRef } from 'react'
import {
  wrapSelection,
  wrapHighlight,
  HIGHLIGHT_OPTIONS,
  normalizeCommentInput,
} from '../../utils/commentFormatUtils'

export default function CommentComposer({
  value,
  onChange,
  placeholder = 'Escreva seu comentário…',
  disabled = false,
  rows = 4,
  id,
}) {
  const textareaRef = useRef(null)

  const applyWrap = (before, after) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const { value: next, selectionStart, selectionEnd } = wrapSelection(
      value,
      start,
      end,
      before,
      after,
    )
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(selectionStart, selectionEnd)
    })
  }

  const applyHighlight = (color) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const { value: next, selectionStart, selectionEnd } = wrapHighlight(value, start, end, color)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(selectionStart, selectionEnd)
    })
  }

  const handlePaste = (e) => {
    const pasted = e.clipboardData?.getData('text/plain')
    if (!pasted) return
    e.preventDefault()
    const el = textareaRef.current
    if (!el) return
    const cleaned = normalizeCommentInput(pasted)
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const next = value.slice(0, start) + cleaned + value.slice(end)
    onChange(next)
    const cursor = start + cleaned.length
    requestAnimationFrame(() => {
      el.setSelectionRange(cursor, cursor)
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-cp-border bg-cp-surface/60 p-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => applyWrap('**', '**')}
          className="rounded-lg px-2.5 py-1 text-xs font-bold text-cp-muted transition hover:bg-cp-surface hover:text-cp-text disabled:opacity-50"
          title="Negrito"
        >
          B
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => applyWrap('*', '*')}
          className="rounded-lg px-2.5 py-1 text-xs italic text-cp-muted transition hover:bg-cp-surface hover:text-cp-text disabled:opacity-50"
          title="Itálico"
        >
          I
        </button>
        <span className="mx-1 h-4 w-px bg-cp-border" />
        {HIGHLIGHT_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => applyHighlight(opt.id)}
            className={`rounded-lg px-2 py-1 text-[10px] font-medium transition hover:opacity-90 disabled:opacity-50 ${opt.className}`}
            title={`Grifar ${opt.label}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={handlePaste}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full resize-y rounded-xl border border-cp-border bg-cp-surface px-3 py-2.5 font-mono text-sm leading-relaxed text-cp-text focus:border-[var(--cp-accent)] focus:outline-none disabled:opacity-60"
      />

      <p className="text-[10px] text-cp-muted">
        Dica: selecione o texto e use B, I ou grifar. Colagens de IA são limpas automaticamente.
      </p>
    </div>
  )
}
