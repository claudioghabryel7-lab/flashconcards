import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { POST_TYPE_LABELS, resolveCardTheme, resolvePostType, FEED_POST_TYPES } from '../../utils/feedUtils'
import { formatStudyMinutes } from '../../utils/feedTimeUtils'

export default function FeedPostThumbnail({ post }) {
  const theme = resolveCardTheme(post)
  const postType = resolvePostType(post)
  const typeLabel = POST_TYPE_LABELS[postType] || postType
  const likes = post.likesCount || post.likes?.length || 0
  const comments = post.commentsCount || post.comments?.length || 0
  const isTrilha = postType === FEED_POST_TYPES.TRILHA

  return (
    <Link
      to={`/comunidade/publicacao/${post.id}`}
      className="group relative aspect-square overflow-hidden"
      style={{ background: theme.background }}
    >
      <div
        className="absolute inset-0"
        style={{ backgroundImage: theme.pattern, backgroundSize: 'auto' }}
      />
      <div className="absolute inset-0 bg-black/15 transition group-hover:bg-black/35" />
      <div className="relative flex h-full flex-col justify-between p-2">
        <span className="w-fit rounded bg-black/35 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-white">
          {isTrilha ? (post.modalidade || 'estudo') : typeLabel}
        </span>
        <div>
          <p className="line-clamp-2 text-[10px] font-bold leading-tight text-white drop-shadow">
            {post.materia || 'Estudo'}
          </p>
          {isTrilha ? (
            <p className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] text-white/85">
              <Clock className="h-2.5 w-2.5" />
              {formatStudyMinutes(post.durationMinutes || 0)}
            </p>
          ) : postType === FEED_POST_TYPES.COMENTARIO ? (
            <p className="mt-0.5 text-[9px] text-white/85 line-clamp-2">
              {(post.contentPreview || post.commentText || 'Comentário').slice(0, 60)}
            </p>
          ) : (
            <p className="mt-0.5 text-[9px] text-white/85">
              {post.itemCount ? `${post.itemCount} itens` : 'Abrir'}
            </p>
          )}
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/45 opacity-0 transition group-hover:opacity-100">
        <span className="text-xs font-semibold text-white">❤️ {likes}</span>
        <span className="text-xs font-semibold text-white">💬 {comments}</span>
      </div>
    </Link>
  )
}
