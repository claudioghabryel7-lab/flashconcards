import { useEffect, useMemo, useState } from 'react'
import { ChatBubbleLeftEllipsisIcon } from '@heroicons/react/24/outline'
import UserAvatar from './UserAvatar'
import CommentFormattedText from './content/CommentFormattedText'
import { subscribeContentComments } from '../services/contentCommentsService'
import { buildFlashcardContentId } from '../utils/contentCommentIds'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'

export default function FlashcardFloatingComments({
  enabled,
  onToggle,
  courseId,
  card,
  topicKey,
  cardIndex = 0,
  materia = '',
  assunto = '',
}) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)

  const contentId = useMemo(
    () =>
      card
        ? buildFlashcardContentId({ courseId, topicKey, card, cardIndex })
        : null,
    [courseId, topicKey, card, cardIndex],
  )

  const alternateContentIds = useMemo(
    () => (card?.id ? [`${card.id}`] : []),
    [card?.id],
  )

  useEffect(() => {
    if (!enabled || !courseId || !contentId) {
      setComments([])
      return () => {}
    }

    setLoading(true)
    const unsub = subscribeContentComments(
      { courseId, contentType: 'flashcard', contentId, alternateContentIds },
      (rows) => {
        setComments(rows)
        setLoading(false)
      },
      () => setLoading(false),
    )
    return () => unsub?.()
  }, [enabled, courseId, contentId, alternateContentIds])

  const hasComments = comments.length > 0

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onToggle}
        className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
          enabled
            ? 'border-cp-accent/40 bg-cp-accent/15 text-cp-accent'
            : 'border-cp-border bg-cp-surface/60 text-cp-text hover:border-cp-accent/30'
        }`}
      >
        {enabled ? '☁️ Comentários flutuantes ativos' : 'Ativar comentários flutuantes'}
      </button>

      {enabled && (
        <div className="flashcard-comments-cloud max-h-[min(420px,50dvh)] overflow-y-auto rounded-2xl border border-cp-border/80 bg-cp-surface/95 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.12)] backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-2 border-b border-cp-border/60 pb-2">
            <ChatBubbleLeftEllipsisIcon className="h-4 w-4 text-cp-accent" />
            <p className="text-xs font-semibold text-cp-text">Comentários do flashcard</p>
            {hasComments && (
              <span className="ml-auto rounded-full bg-cp-accent/15 px-2 py-0.5 font-mono text-[10px] text-cp-accent">
                {comments.length}
              </span>
            )}
          </div>

          {loading ? (
            <p className="py-6 text-center text-xs text-cp-muted">Carregando…</p>
          ) : !hasComments ? (
            <p className="py-6 text-center text-xs text-cp-muted">
              Ainda não há comentários neste flashcard.
            </p>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => {
                const created = c.createdAt?.toDate?.()
                  ? dayjs(c.createdAt.toDate()).format('DD/MM/YY HH:mm')
                  : ''
                return (
                  <div
                    key={c.id}
                    className="rounded-xl border border-cp-border/50 bg-cp-bg/40 p-2.5"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <Link to={`/profile/${c.userId}`} className="shrink-0">
                        <UserAvatar
                          photoBase64={c.userPhotoBase64}
                          name={c.userName || ''}
                          size="xs"
                        />
                      </Link>
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-cp-text">
                          {c.userName || 'Usuário'}
                        </p>
                        {created && (
                          <p className="font-mono text-[9px] text-cp-muted">{created}</p>
                        )}
                      </div>
                    </div>
                    <CommentFormattedText text={c.text} className="!text-xs" />
                  </div>
                )
              })}
            </div>
          )}

          {card?.pergunta && (
            <p className="mt-3 line-clamp-3 border-t border-cp-border/50 pt-2 text-[10px] text-cp-muted">
              {card.pergunta}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
