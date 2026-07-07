import { parseCommentBlocks, highlightClass } from '../../utils/commentFormatUtils'

function renderToken(token, key) {
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
      return (
        <mark
          key={key}
          className={`rounded px-0.5 ${highlightClass(token.color)}`}
        >
          {token.text}
        </mark>
      )
    default:
      return <span key={key}>{token.text}</span>
  }
}

export default function CommentFormattedText({ text, className = '' }) {
  const blocks = parseCommentBlocks(text)

  if (!blocks.length) {
    return null
  }

  return (
    <div className={`space-y-1.5 break-words text-sm leading-relaxed text-cp-text ${className}`}>
      {blocks.map((block, blockIdx) => (
        <p key={blockIdx} className="whitespace-pre-wrap">
          {block.tokens.map((token, tokenIdx) =>
            renderToken(token, `${blockIdx}-${tokenIdx}`),
          )}
        </p>
      ))}
    </div>
  )
}
