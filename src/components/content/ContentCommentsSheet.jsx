import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  HandThumbUpIcon,
  HandThumbDownIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { HandThumbUpIcon as HandThumbUpSolid, HandThumbDownIcon as HandThumbDownSolid } from '@heroicons/react/24/solid'
import dayjs from 'dayjs'
import PortalOverlay from './PortalOverlay'
import UserAvatar from '../UserAvatar'
import CommentFormattedText from './CommentFormattedText'
import CommentComposer from './CommentComposer'
import { useAuth } from '../../hooks/useAuth'
import {
  addContentComment,
  subscribeContentComments,
  voteContentComment,
  getUserVoteOnComment,
  updateContentComment,
  deleteContentComment,
} from '../../services/contentCommentsService'

function CommentRow({ comment, courseId, currentUserId, isAdmin, onVote }) {
  const [userVote, setUserVote] = useState(null)
  const [voting, setVoting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(comment.text || '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const isOwner = currentUserId && comment.userId === currentUserId
  const canManage = isOwner || isAdmin

  useEffect(() => {
    if (!currentUserId || !comment.id) return
    getUserVoteOnComment(courseId, comment.id, currentUserId).then(setUserVote)
  }, [courseId, comment.id, currentUserId, comment.likes, comment.dislikes])

  useEffect(() => {
    if (!editing) setEditText(comment.text || '')
  }, [comment.text, editing])

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

  const handleSaveEdit = async () => {
    if (!canManage || saving) return
    setSaving(true)
    try {
      await updateContentComment({
        courseId,
        commentId: comment.id,
        text: editText,
        userId: currentUserId,
        isAdmin,
      })
      setEditing(false)
    } catch (error) {
      alert(error.message || 'Erro ao editar comentário.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!canManage || deleting) return
    if (!window.confirm('Apagar este comentário?')) return
    setDeleting(true)
    try {
      await deleteContentComment({
        courseId,
        commentId: comment.id,
        userId: currentUserId,
        isAdmin,
      })
    } catch (error) {
      alert(error.message || 'Erro ao apagar comentário.')
    } finally {
      setDeleting(false)
    }
  }

  const created = comment.createdAt?.toDate?.()
    ? dayjs(comment.createdAt.toDate()).format('DD/MM/YY HH:mm')
    : ''
  const edited = comment.editedAt?.toDate?.()
    ? dayjs(comment.editedAt.toDate()).format('DD/MM/YY HH:mm')
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
            {edited && (
              <span className="font-mono text-[10px] text-cp-muted">· editado {edited}</span>
            )}
            {canManage && !editing && (
              <span className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-lg p-1 text-cp-muted transition hover:bg-cp-surface hover:text-cp-text"
                  title="Editar"
                >
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-lg p-1 text-cp-muted transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
                  title="Apagar"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </div>

          {editing ? (
            <div className="mt-2 space-y-2">
              <CommentComposer value={editText} onChange={setEditText} maxEditorHeight={180} />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="cp-btn-primary !py-1.5 !text-xs disabled:opacity-60"
                >
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="cp-btn-ghost !py-1.5 !text-xs"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1">
              <CommentFormattedText text={comment.text} />
            </div>
          )}

          {!editing && (
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
          )}
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
  alternateContentIds = [],
  topicKey,
  preview,
  materia = '',
  assunto = '',
  contextLabel = 'este conteúdo',
}) {
  const { user, profile, isAdmin } = useAuth()
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open || !courseId || !contentId) return undefined
    setComments([])
    setLoading(true)
    setText('')
    setMessage('')
    const unsub = subscribeContentComments(
      { courseId, contentType, contentId, alternateContentIds },
      (rows) => {
        setComments(rows)
        setLoading(false)
      },
      () => setLoading(false),
    )
    return () => unsub?.()
  }, [open, courseId, contentType, contentId, alternateContentIds])

  const handleSubmit = async () => {
    if (!user) {
      setMessage('Faça login para comentar.')
      return
    }
    try {
      setSending(true)
      setMessage('')
      const result = await addContentComment({
        courseId,
        contentType,
        contentId,
        topicKey,
        text,
        preview,
        materia,
        assunto,
        user,
        profile,
      })
      setText('')
      if (result.feedWarning) {
        setMessage(result.feedWarning)
      } else if (result.feedPostId) {
        setMessage('Publicado na comunidade! Confira em /comunidade')
      } else {
        setMessage('Comentário publicado!')
      }
      setTimeout(() => setMessage(''), 2000)
    } catch (error) {
      setMessage(error.message || 'Erro ao publicar comentário.')
    } finally {
      setSending(false)
    }
  }

  return (
    <PortalOverlay open={open} onClose={onClose} ariaLabel="Comentários públicos" size="large">
      <div className="flex h-full max-h-[90dvh] min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-cp-border px-4 py-3">
          <div className="min-w-0 pr-2">
            <p className="font-mono text-[10px] uppercase tracking-wide text-cp-muted">Comentários públicos</p>
            <h3 className="cp-headline truncate text-base text-cp-text">{contextLabel}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-cp-muted hover:bg-cp-surface hover:text-cp-text"
            aria-label="Fechar"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {preview && (
          <div className="shrink-0 border-b border-cp-border bg-cp-surface/50 px-4 py-3">
            <p className="line-clamp-4 text-sm leading-relaxed text-cp-muted">{preview}</p>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                isAdmin={isAdmin}
              />
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-cp-border bg-[var(--cp-bg)] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <CommentComposer
            value={text}
            onChange={setText}
            disabled={!user}
            maxEditorHeight={240}
            placeholder={user ? 'Escreva ou cole — já aparece formatado…' : 'Faça login para comentar'}
          />
          {message && <p className="mt-2 text-xs text-cp-muted">{message}</p>}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={sending || !user || !text.trim()}
            className="cp-btn-primary mt-2 w-full shrink-0 !py-2.5 !text-sm disabled:opacity-60"
          >
            {sending ? 'Publicando…' : 'Publicar comentário'}
          </button>
        </div>
      </div>
    </PortalOverlay>
  )
}
