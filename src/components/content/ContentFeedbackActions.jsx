import { lazy, Suspense, useEffect, useState } from 'react'
import { ChatBubbleLeftEllipsisIcon, FlagIcon } from '@heroicons/react/24/outline'

const ContentCommentsSheet = lazy(() => import('./ContentCommentsSheet'))
const ContentFlagSheet = lazy(() => import('./ContentFlagSheet'))

export default function ContentFeedbackActions({
  courseId,
  contentType,
  contentId,
  alternateContentIds = [],
  topicKey = null,
  preview = '',
  materia = '',
  assunto = '',
  contextLabel = 'este conteúdo',
  variant = 'compact',
  className = '',
}) {
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)

  useEffect(() => {
    setCommentsOpen(false)
    setFlagOpen(false)
  }, [contentId, contentType, courseId])

  if (!courseId || !contentId) return null

  const btnBase =
    variant === 'compact'
      ? 'flex h-9 w-9 items-center justify-center rounded-full transition'
      : 'inline-flex items-center gap-1.5 rounded-full border border-cp-border px-3 py-1.5 text-xs font-medium transition'

  return (
    <>
      <div className={`flex items-center gap-1 ${className}`}>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            setCommentsOpen(true)
          }}
          className={`${btnBase} text-cp-muted hover:bg-cp-surface hover:text-[var(--cp-accent-2)]`}
          aria-label="Comentários"
          title="Comentários públicos"
        >
          <ChatBubbleLeftEllipsisIcon className="h-4 w-4" />
          {variant === 'inline' && <span>Comentar</span>}
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            setFlagOpen(true)
          }}
          className={`${btnBase} text-cp-muted hover:bg-[var(--cp-accent-4)]/10 hover:text-[var(--cp-accent-4)]`}
          aria-label="Sinalizar atenção"
          title="Sinalizar atenção"
        >
          <FlagIcon className="h-4 w-4" />
          {variant === 'inline' && <span>Sinalizar</span>}
        </button>
      </div>

      {commentsOpen && (
        <Suspense fallback={null}>
          <ContentCommentsSheet
            key={`${courseId}:${contentType}:${contentId}`}
            open={commentsOpen}
            onClose={() => setCommentsOpen(false)}
            courseId={courseId}
            contentType={contentType}
            contentId={contentId}
            alternateContentIds={alternateContentIds}
            topicKey={topicKey}
            preview={preview}
            materia={materia}
            assunto={assunto}
            contextLabel={contextLabel}
          />
        </Suspense>
      )}

      {flagOpen && (
        <Suspense fallback={null}>
          <ContentFlagSheet
            open={flagOpen}
            onClose={() => setFlagOpen(false)}
            courseId={courseId}
            contentType={contentType}
            contentId={contentId}
            topicKey={topicKey}
            preview={preview}
            contextLabel={contextLabel}
            disciplinaNome={materia}
            topicoNome={assunto}
            moduloLabel={assunto}
          />
        </Suspense>
      )}
    </>
  )
}
