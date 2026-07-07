'use client'

import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { parseCommentBlocks, highlightClass } from '../../utils/commentFormatUtils'

function renderMath(latex, displayMode = false) {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    })
  } catch {
    return displayMode ? `[${latex}]` : latex
  }
}

function renderToken(token, key) {
  try {
    switch (token.type) {
      case 'bold':
        return (
          <strong key={key} className="font-semibold text-cp-text">
            {token.text}
          </strong>
        )
      case 'italic':
        return (
          <em key={key} className="italic text-cp-text">
            {token.text}
          </em>
        )
      case 'mark':
        if (!token.text) return null
        return (
          <mark
            key={key}
            className={`rounded px-0.5 ${highlightClass(token.color)}`}
          >
            {token.text}
          </mark>
        )
      case 'math-inline':
        return (
          <span
            key={key}
            className="mx-0.5 inline-block align-middle [&_.katex]:text-[1.05em]"
            dangerouslySetInnerHTML={{ __html: renderMath(token.text, false) }}
          />
        )
      default:
        return <span key={key}>{token.text}</span>
    }
  } catch {
    return <span key={key}>{token.text}</span>
  }
}

export default function CommentFormattedText({ text, className = '' }) {
  const blocks = useMemo(() => {
    try {
      return parseCommentBlocks(text)
    } catch {
      return [{ type: 'paragraph', tokens: [{ type: 'plain', text: String(text || '') }] }]
    }
  }, [text])

  if (!blocks.length) {
    return null
  }

  return (
    <div className={`space-y-2 break-words text-sm leading-relaxed text-cp-text ${className}`}>
      {blocks.map((block, blockIdx) => {
        if (block.type === 'spacer') {
          return <div key={blockIdx} className="h-2" aria-hidden />
        }
        if (block.type === 'math-display') {
          return (
            <div
              key={blockIdx}
              className="my-2 overflow-x-auto rounded-lg bg-cp-surface/60 px-3 py-2 text-center [&_.katex]:text-base"
              dangerouslySetInnerHTML={{ __html: renderMath(block.latex, true) }}
            />
          )
        }
        return (
          <p key={blockIdx} className="whitespace-pre-wrap">
            {block.tokens.map((token, tokenIdx) =>
              renderToken(token, `${blockIdx}-${tokenIdx}`),
            )}
          </p>
        )
      })}
    </div>
  )
}
