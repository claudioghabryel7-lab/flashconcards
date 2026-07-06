import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { MODALITY_LABELS, resolveCardTheme } from '../../utils/feedUtils'

export default function FeedPostThumbnail({ post }) {
  const theme = resolveCardTheme(post)
  const modality = MODALITY_LABELS[post.modalidade] || post.modalidade
  const likes = post.likesCount || post.likes?.length || 0
  const comments = post.commentsCount || post.comments?.length || 0

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
          {modality}
        </span>
        <div>
          <p className="line-clamp-2 text-[10px] font-bold leading-tight text-white drop-shadow">
            {post.materia || 'Estudo'}
          </p>
          <p className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] text-white/85">
            <Clock className="h-2.5 w-2.5" />
            {post.durationMinutes || 0}m
          </p>
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/45 opacity-0 transition group-hover:opacity-100">
        <span className="text-xs font-semibold text-white">❤️ {likes}</span>
        <span className="text-xs font-semibold text-white">💬 {comments}</span>
      </div>
    </Link>
  )
}
