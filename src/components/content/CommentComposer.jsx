import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  wrapSelection,
  wrapHighlight,
  HIGHLIGHT_OPTIONS,
  smartParagraphize,
} from '../../utils/commentFormatUtils'
import CommentFormattedText from './CommentFormattedText'

export default function CommentComposer({
  value,
  onChange,
  placeholder = 'Escreva ou cole seu comentário…',
  disabled = false,
  id,
  maxEditorHeight = 240,
}) {
  const textareaRef = useRef(null)
  const mirrorRef = useRef(null)
  const scrollRef = useRef(null)
  const [innerHeight, setInnerHeight] = useState(120)

  useLayoutEffect(() => {
    const mirror = mirrorRef.current
    if (!mirror) return
    setInnerHeight(Math.max(120, mirror.scrollHeight + 2))
  }, [value])

  const syncScroll = () => {
    if (mirrorRef.current && textareaRef.current) {
      mirrorRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  useEffect(() => {
    syncScroll()
  }, [value, innerHeight])

  const scrollByDelta = (deltaY) => {
    const scroller = scrollRef.current
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight) return
    scroller.scrollTop += deltaY
  }

  const handleWheel = (e) => {
    scrollByDelta(e.deltaY)
    e.preventDefault()
  }

  const applyWrap = (before, after) => {
    const el = textareaRef.current
    if (!el || disabled) return
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
    if (!el || disabled) return
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
    const cleaned = smartParagraphize(pasted)
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const next = value.slice(0, start) + cleaned + value.slice(end)
    onChange(next)
    const cursor = start + cleaned.length
    requestAnimationFrame(() => {
      el.setSelectionRange(cursor, cursor)
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
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
        <span className="mx-1 hidden h-4 w-px bg-cp-border sm:block" />
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

      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className={`overflow-y-auto overscroll-contain rounded-xl border border-cp-border bg-cp-surface transition focus-within:border-[var(--cp-accent)] ${
          disabled ? 'opacity-60' : ''
        }`}
        style={{ maxHeight: maxEditorHeight, minHeight: 120 }}
      >
        <div className="relative" style={{ minHeight: innerHeight }}>
          <div
            ref={mirrorRef}
            aria-hidden
            className="pointer-events-none px-3 py-2.5 text-sm leading-relaxed"
          >
            {value.trim() ? (
              <CommentFormattedText text={value} />
            ) : (
              <p className="whitespace-pre-wrap text-cp-muted">{placeholder}</p>
            )}
          </div>

          <textarea
            ref={textareaRef}
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={handlePaste}
            onScroll={syncScroll}
            onWheel={handleWheel}
            disabled={disabled}
            aria-label={placeholder}
            spellCheck
            className="absolute inset-0 z-10 w-full resize-none overflow-hidden bg-transparent px-3 py-2.5 text-sm leading-relaxed text-transparent caret-cp-text outline-none selection:bg-cp-accent/25 disabled:cursor-not-allowed"
            style={{ height: innerHeight, WebkitTextFillColor: 'transparent' }}
          />
        </div>
      </div>
    </div>
  )
}
