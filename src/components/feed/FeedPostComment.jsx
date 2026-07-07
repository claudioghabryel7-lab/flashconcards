import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import UserAvatar from '../UserAvatar'
import CommentFormattedText from '../content/CommentFormattedText'
import { formatCommentTime } from '../../utils/feedUtils'

function FeedReplyRow({
  reply,
  user,
  readOnly,
  canDelete,
  onToggleLike,
  onDelete,
}) {
  const liked = user?.uid && (reply.likes || []).includes(user.uid)
  const likesCount = reply.likesCount ?? reply.likes?.length ?? 0

  return (
    <div className="flex gap-2 text-sm">
      <Link to={`/profile/${reply.authorId}`} className="shrink-0">
        <UserAvatar photoBase64={reply.authorPhotoBase64} name={reply.authorName} size="xs" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          to={`/profile/${reply.authorId}`}
          className="font-semibold text-cp-text hover:text-cp-accent"
        >
          {reply.authorName}
        </Link>
        <CommentFormattedText text={reply.text} className="!text-sm !leading-snug" />
        <div className="mt-1 flex flex-wrap items-center gap-3">
          {!readOnly && (
            <button
              type="button"
              onClick={onToggleLike}
              className={`inline-flex items-center gap-1 text-[11px] font-medium transition ${
                liked ? 'text-rose-500' : 'text-cp-muted hover:text-cp-text'
              }`}
            >
              <Heart className={`h-3.5 w-3.5 ${liked ? 'fill-current' : ''}`} />
              {likesCount > 0 ? likesCount : 'Curtir'}
            </button>
          )}
          {readOnly && likesCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-cp-muted">
              <Heart className="h-3.5 w-3.5 fill-current text-rose-500" />
              {likesCount}
            </span>
          )}
          <p className="text-[10px] text-cp-muted">{formatCommentTime(reply.createdAt)}</p>
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-[10px] font-medium text-rose-500 hover:text-rose-400"
            >
              Apagar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function FeedPostComment({
  comment,
  user,
  readOnly,
  isPostAuthor,
  isAdmin,
  onToggleLike,
  onToggleReplyLike,
  onReply,
  onDeleteComment,
  onDeleteReply,
}) {
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const liked = user?.uid && (comment.likes || []).includes(user.uid)
  const likesCount = comment.likesCount ?? comment.likes?.length ?? 0
  const replies = comment.replies || []
  const canDeleteComment =
    user?.uid === comment.authorId || isPostAuthor || isAdmin
  const canReply = !readOnly && user

  const handleSubmitReply = () => {
    const text = replyText.trim()
    if (!text) return
    onReply?.(text)
    setReplyText('')
    setReplyOpen(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-sm">
        <Link to={`/profile/${comment.authorId}`} className="shrink-0">
          <UserAvatar photoBase64={comment.authorPhotoBase64} name={comment.authorName} size="xs" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to={`/profile/${comment.authorId}`}
            className="font-semibold text-cp-text hover:text-cp-accent"
          >
            {comment.authorName}
          </Link>
          <CommentFormattedText text={comment.text} className="!text-sm !leading-snug" />
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {!readOnly && (
              <button
                type="button"
                onClick={onToggleLike}
                className={`inline-flex items-center gap-1 text-[11px] font-medium transition ${
                  liked ? 'text-rose-500' : 'text-cp-muted hover:text-cp-text'
                }`}
              >
                <Heart className={`h-3.5 w-3.5 ${liked ? 'fill-current' : ''}`} />
                {likesCount > 0 ? likesCount : 'Curtir'}
              </button>
            )}
            {readOnly && likesCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-cp-muted">
                <Heart className="h-3.5 w-3.5 fill-current text-rose-500" />
                {likesCount}
              </span>
            )}
            {canReply && (
              <button
                type="button"
                onClick={() => setReplyOpen((v) => !v)}
                className="text-[11px] font-medium text-cp-muted transition hover:text-cp-text"
              >
                Responder
              </button>
            )}
            <p className="text-[10px] text-cp-muted">{formatCommentTime(comment.createdAt)}</p>
            {canDeleteComment && (
              <button
                type="button"
                onClick={onDeleteComment}
                className="text-[10px] font-medium text-rose-500 hover:text-rose-400"
              >
                Apagar
              </button>
            )}
          </div>
        </div>
      </div>

      {replies.length > 0 && (
        <div className="ml-8 space-y-2 border-l border-cp-border/60 pl-3">
          {replies.map((reply) => (
            <FeedReplyRow
              key={reply.id}
              reply={reply}
              user={user}
              readOnly={readOnly}
              canDelete={user?.uid === reply.authorId || isPostAuthor || isAdmin}
              onToggleLike={() => onToggleReplyLike?.(reply.id)}
              onDelete={() => onDeleteReply?.(reply.id)}
            />
          ))}
        </div>
      )}

      {replyOpen && canReply && (
        <div className="ml-8 flex items-center gap-2 border-l border-cp-border/60 pl-3">
          <input
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={`Responder ${comment.authorName}…`}
            className="min-w-0 flex-1 bg-transparent text-sm text-cp-text outline-none placeholder:text-cp-muted"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmitReply()}
            autoFocus
          />
          {replyText.trim() && (
            <button
              type="button"
              onClick={handleSubmitReply}
              className="shrink-0 text-xs font-semibold text-cp-accent"
            >
              Publicar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
