import dayjs from 'dayjs'
import { HandThumbUpIcon, HandThumbDownIcon } from '@heroicons/react/24/outline'
import CommentFormattedText from './CommentFormattedText'

export default function UserPublicCommentsList({ comments, emptyMessage }) {
  if (!comments.length) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-sm text-cp-muted">{emptyMessage || 'Nenhum comentário público ainda.'}</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-cp-border">
      {comments.map((comment) => {
        const when = comment.createdAt?.toDate?.()
          ? dayjs(comment.createdAt.toDate()).format('DD/MM/YYYY HH:mm')
          : ''
        const typeLabel = comment.contentType === 'questao' ? 'Questão' : 'Flashcard'

        return (
          <div key={comment._docPath || `${comment.courseId}-${comment.id}`} className="px-4 py-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="cp-badge cp-badge-accent !text-[10px]">{typeLabel}</span>
              {when && <span className="font-mono text-[10px] text-cp-muted">{when}</span>}
            </div>
            {comment.preview && (
              <p className="mb-2 line-clamp-2 rounded-lg border border-cp-border bg-cp-surface/50 px-3 py-2 text-xs text-cp-muted">
                {comment.preview}
              </p>
            )}
            <CommentFormattedText text={comment.text} />
            {comment.editedAt?.toDate?.() && (
              <p className="mt-1 font-mono text-[10px] text-cp-muted">
                editado em {dayjs(comment.editedAt.toDate()).format('DD/MM/YYYY HH:mm')}
              </p>
            )}
            <div className="mt-2 flex items-center gap-4 text-xs text-cp-muted">
              <span className="inline-flex items-center gap-1">
                <HandThumbUpIcon className="h-3.5 w-3.5" />
                {comment.likes || 0}
              </span>
              <span className="inline-flex items-center gap-1">
                <HandThumbDownIcon className="h-3.5 w-3.5" />
                {comment.dislikes || 0}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
