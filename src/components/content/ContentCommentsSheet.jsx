import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HandThumbUpIcon, HandThumbDownIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { HandThumbUpIcon as HandThumbUpSolid, HandThumbDownIcon as HandThumbDownSolid } from '@heroicons/react/24/solid'
import dayjs from 'dayjs'
import PortalOverlay from './PortalOverlay'
import UserAvatar from '../UserAvatar'
import { useAuth } from '../../hooks/useAuth'
import {
  addContentComment,
  subscribeContentComments,
  voteContentComment,
  getUserVoteOnComment,
} from '../../services/contentCommentsService'

function CommentRow({ comment, courseId, currentUserId, onVote }) {
  const [userVote, setUserVote] = useState(null)
  const [voting, setVoting] = useState(false)

  useEffect(() => {
    if (!currentUserId || !comment.id) return
    getUserVoteOnComment(courseId, comment.id, currentUserId).then(setUserVote)
  }, [courseId, comment.id, currentUserId, comment.likes, comment.dislikes])

  const handleVote = async (type) => {
    if (!currentUserId || voting) return
    setVoting(true)
    try {
      await voteContentComment({
        courseId,
        commentId: comment.id,
        userId: currentUserId,
        voteType: type,
      })
      const next = await getUserVoteOnComment(courseId, comment.id, currentUserId)
      setUserVote(next)
      onVote?.()
    } finally {
      setVoting(false)
    }
  }

  const created = comment.createdAt?.toDate?.()
    ? dayjs(comment.createdAt.toDate()).format('DD/MM/YY HH:mm')
    : ''

  return (
    <div className="border-b border-cp-border px-4 py-3 last:border-0">
      <div className="flex gap-3">
        <Link to={`/profile/${comment.userId}`} className="shrink-0">
          <UserAvatar
            photoBase64={comment.userPhotoBase64}
            name={comment.userName || ''}
            size="xs"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/profile/${comment.userId}`}
              className="text-sm font-semibold text-cp-text hover:text-cp-accent"
            >
              {comment.userName || 'Usuário'}
            </Link>
            {created && <span className="font-mono text-[10px] text-cp-muted">{created}</span>}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-cp-text">{comment.text}</p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              disabled={!currentUserId || voting}
              onClick={() => handleVote('like')}
              className={`inline-flex items-center gap-1 text-xs transition ${
                userVote === 'like' ? 'text-[var(--cp-success)]' : 'text-cp-muted hover:text-cp-text'
              }`}
            >
              {userVote === 'like' ? (
                <HandThumbUpSolid className="h-4 w-4" />
              ) : (
                <HandThumbUpIcon className="h-4 w-4" />
              )}
              {comment.likes || 0}
            </button>
            <button
              type="button"
              disabled={!currentUserId || voting}
              onClick={() => handleVote('dislike')}
              className={`inline-flex items-center gap-1 text-xs transition ${
                userVote === 'dislike' ? 'text-red-400' : 'text-cp-muted hover:text-cp-text'
              }`}
            >
              {userVote === 'dislike' ? (
                <HandThumbDownSolid className="h-4 w-4" />
              ) : (
                <HandThumbDownIcon className="h-4 w-4" />
              )}
              {comment.dislikes || 0}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ContentCommentsSheet({
  open,
  onClose,
  courseId,
  contentType,
  contentId,
  topicKey,
  preview,
  contextLabel = 'este conteúdo',
}) {
  const { user, profile } = useAuth()
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open || !courseId || !contentId) return undefined
    setLoading(true)
    const unsub = subscribeContentComments(
      { courseId, contentType, contentId },
      (rows) => {
        setComments(rows)
        setLoading(false)
      },
      () => setLoading(false),
    )
    return () => unsub?.()
  }, [open, courseId, contentType, contentId])

  const handleSubmit = async () => {
    if (!user) {
      setMessage('Faça login para comentar.')
      return
    }
    try {
      setSending(true)
      setMessage('')
      await addContentComment({
        courseId,
        contentType,
        contentId,
        topicKey,
        text,
        preview,
        user,
        profile,
      })
      setText('')
      setMessage('Comentário publicado!')
      setTimeout(() => setMessage(''), 2000)
    } catch (error) {
      setMessage(error.message || 'Erro ao publicar comentário.')
    } finally {
      setSending(false)
    }
  }

  return (
    <PortalOverlay open={open} onClose={onClose} ariaLabel="Comentários públicos">
      <div className="flex items-center justify-between border-b border-cp-border px-4 py-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-cp-muted">Comentários públicos</p>
          <h3 className="cp-headline text-base text-cp-text">{contextLabel}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1.5 text-cp-muted hover:bg-cp-surface hover:text-cp-text"
          aria-label="Fechar"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      {preview && (
        <div className="border-b border-cp-border bg-cp-surface/50 px-4 py-3">
          <p className="line-clamp-3 text-sm text-cp-muted">{preview}</p>
        </div>
      )}

      <div className="min-h-[200px] flex-1 overflow-y-auto overscroll-contain">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-cp-muted">Carregando comentários…</p>
        ) : comments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-cp-muted">
            Nenhum comentário ainda. Seja o primeiro!
          </p>
        ) : (
          comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              courseId={courseId}
              currentUserId={user?.uid}
            />
          ))
        )}
      </div>

      <div className="border-t border-cp-border bg-[var(--cp-bg)] p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={user ? 'Comentário público (visível no seu perfil)…' : 'Faça login para comentar'}
          disabled={!user}
          className="w-full resize-none rounded-xl border border-cp-border bg-cp-surface px-3 py-2.5 text-sm text-cp-text focus:border-[var(--cp-accent)] focus:outline-none disabled:opacity-60"
        />
        {message && <p className="mt-2 text-xs text-cp-muted">{message}</p>}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={sending || !user}
          className="cp-btn-primary mt-3 w-full !text-sm disabled:opacity-60"
        >
          {sending ? 'Publicando…' : 'Publicar comentário'}
        </button>
      </div>
    </PortalOverlay>
  )
}
