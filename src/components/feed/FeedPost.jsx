import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bookmark,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Share2,
} from 'lucide-react'
import UserAvatar from '../UserAvatar'
import FeedStoryAvatar from './FeedStoryAvatar'
import StudyPostMedia from './StudyPostMedia'
import { formatCommentTime, formatFeedTime, MODALITY_LABELS } from '../../utils/feedUtils'

export default function FeedPost({
  post,
  user,
  profile,
  liked,
  bookmarked,
  isToday,
  commentText,
  showAllComments,
  onToggleLike,
  onToggleBookmark,
  onToggleComments,
  onCommentChange,
  onAddComment,
  onShare,
}) {
  const [likeAnim, setLikeAnim] = useState(false)
  const likesCount = post.likesCount || post.likes?.length || 0
  const comments = post.comments || []
  const commentsCount = post.commentsCount || comments.length
  const modality = MODALITY_LABELS[post.modalidade] || post.modalidade
  const previewComments = showAllComments ? comments : comments.slice(0, 2)

  const handleLike = () => {
    onToggleLike()
    if (!liked) {
      setLikeAnim(true)
      setTimeout(() => setLikeAnim(false), 400)
    }
  }

  const handleDoubleTapLike = () => {
    if (!liked) onToggleLike()
  }

  return (
    <article className="border-b border-cp-border bg-cp-surface">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Link to={`/profile/${post.authorId}`} className="shrink-0">
          <FeedStoryAvatar
            photoBase64={post.authorPhotoBase64}
            name={post.authorName}
            size="sm"
            hasStory={isToday}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              to={`/profile/${post.authorId}`}
              className="truncate text-sm font-semibold text-cp-text hover:text-cp-accent"
            >
              {post.authorName}
            </Link>
            {isToday && (
              <span className="rounded-full bg-cp-accent/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-cp-accent">
                destaque
              </span>
            )}
          </div>
          <p className="text-[11px] text-cp-muted">{formatFeedTime(post.createdAt)}</p>
        </div>
        <button
          type="button"
          className="shrink-0 p-1 text-cp-muted transition hover:text-cp-text"
          aria-label="Mais opções"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>

      {/* Media */}
      <StudyPostMedia
        materia={post.materia}
        assunto={post.assunto}
        modalidade={post.modalidade}
        durationMinutes={post.durationMinutes}
        acertos={post.acertos}
        erros={post.erros}
        onDoubleTapLike={handleDoubleTapLike}
      />

      {/* Actions */}
      <div className="flex items-center justify-between px-3 pt-2.5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleLike}
            className={`transition active:scale-90 ${liked ? 'text-rose-500' : 'text-cp-text hover:text-cp-muted'}`}
            aria-label={liked ? 'Descurtir' : 'Curtir'}
          >
            <Heart
              className={`h-6 w-6 ${liked || likeAnim ? 'fill-current scale-110' : ''} transition-transform`}
            />
          </button>
          <button
            type="button"
            onClick={onToggleComments}
            className="text-cp-text transition hover:text-cp-muted active:scale-90"
            aria-label="Comentários"
          >
            <MessageCircle className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={onShare}
            className="text-cp-text transition hover:text-cp-muted active:scale-90"
            aria-label="Compartilhar"
          >
            <Share2 className="h-6 w-6" />
          </button>
        </div>
        <button
          type="button"
          onClick={onToggleBookmark}
          className={`transition active:scale-90 ${bookmarked ? 'text-cp-accent' : 'text-cp-text hover:text-cp-muted'}`}
          aria-label={bookmarked ? 'Remover dos salvos' : 'Salvar'}
        >
          <Bookmark className={`h-6 w-6 ${bookmarked ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* Likes */}
      {likesCount > 0 && (
        <p className="px-3 pt-1.5 text-sm font-semibold text-cp-text">
          {likesCount} {likesCount === 1 ? 'curtida' : 'curtidas'}
        </p>
      )}

      {/* Caption */}
      <div className="px-3 pt-1">
        <p className="text-sm leading-relaxed text-cp-text">
          <Link
            to={`/profile/${post.authorId}`}
            className="mr-1 font-semibold hover:text-cp-accent"
          >
            {post.authorName}
          </Link>
          estudou <span className="font-medium">{post.materia || 'matéria'}</span>
          {post.assunto ? (
            <>
              {' '}
              — <span className="text-cp-muted">{post.assunto}</span>
            </>
          ) : null}
        </p>
        <p className="mt-0.5 text-xs text-cp-muted">
          {modality} · {post.durationMinutes || 0} min
          {post.acertos != null ? ` · ${post.acertos}✓ ${post.erros || 0}✗` : ''}
        </p>
      </div>

      {/* Comments preview */}
      <div className="space-y-2 px-3 pt-2 pb-1">
        {commentsCount > 2 && !showAllComments && (
          <button
            type="button"
            onClick={onToggleComments}
            className="text-sm text-cp-muted hover:text-cp-text"
          >
            Ver todos os {commentsCount} comentários
          </button>
        )}

        {previewComments.map((c) => (
          <div key={c.id} className="flex gap-2 text-sm">
            <Link to={`/profile/${c.authorId}`} className="shrink-0">
              <UserAvatar photoBase64={c.authorPhotoBase64} name={c.authorName} size="xs" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="leading-snug">
                <Link
                  to={`/profile/${c.authorId}`}
                  className="mr-1.5 font-semibold text-cp-text hover:text-cp-accent"
                >
                  {c.authorName}
                </Link>
                <span className="text-cp-text">{c.text}</span>
              </p>
              <p className="mt-0.5 text-[10px] text-cp-muted">{formatCommentTime(c.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Comment input */}
      <div className="flex items-center gap-2 border-t border-cp-border/60 px-3 py-3">
        <UserAvatar
          photoBase64={profile?.photoBase64}
          name={profile?.displayName || user?.email}
          size="xs"
        />
        <input
          value={commentText}
          onChange={(e) => onCommentChange(e.target.value)}
          placeholder="Adicione um comentário..."
          className="min-w-0 flex-1 bg-transparent text-sm text-cp-text outline-none placeholder:text-cp-muted"
          onKeyDown={(e) => e.key === 'Enter' && commentText.trim() && onAddComment()}
        />
        {commentText.trim() && (
          <button
            type="button"
            onClick={onAddComment}
            className="shrink-0 text-sm font-semibold text-cp-accent transition hover:text-cp-accent/80"
          >
            Publicar
          </button>
        )}
      </div>
    </article>
  )
}
