import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import FeedStoryAvatar from './FeedStoryAvatar'

export default function FeedHighlightsBar({ highlights, currentUser }) {
  return (
    <div className="border-b border-cp-border bg-cp-surface">
      <div className="flex gap-4 overflow-x-auto px-4 py-4 scrollbar-hide">
        <Link
          to="/trilha"
          className="flex w-[72px] shrink-0 flex-col items-center gap-1.5"
        >
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-cp-border bg-cp-surface">
              <Plus className="h-6 w-6 text-cp-accent" />
            </div>
          </div>
          <span className="max-w-[72px] truncate text-center text-[11px] text-cp-text">
            Registrar
          </span>
        </Link>

        {currentUser && (
          <Link
            to={`/comunidade/perfil/${currentUser.uid}`}
            className="flex w-[72px] shrink-0 flex-col items-center gap-1.5"
          >
            <FeedStoryAvatar
              photoBase64={currentUser.photoBase64}
              name={currentUser.name}
              size="md"
              hasStory={false}
            />
            <span className="max-w-[72px] truncate text-center text-[11px] font-medium text-cp-text">
              Você
            </span>
          </Link>
        )}

        {highlights.map((h, i) => (
          <Link
            key={h.authorId}
            to={`/comunidade/perfil/${h.authorId}`}
            className="flex w-[72px] shrink-0 flex-col items-center gap-1.5"
          >
            <FeedStoryAvatar
              photoBase64={h.authorPhotoBase64}
              name={h.authorName}
              size="md"
              hasStory
              seen={i > 2}
            />
            <span className="max-w-[72px] truncate text-center text-[11px] text-cp-text">
              {h.authorName?.split(' ')[0] || 'Aluno'}
            </span>
            <span className="font-mono text-[10px] text-cp-accent">{h.totalMinutes}m</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
