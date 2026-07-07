import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  doc,
  increment,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore'
import dayjs from 'dayjs'
import { Loader2 } from 'lucide-react'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import ComunidadeShell from '../components/feed/ComunidadeShell'
import FeedPost from '../components/feed/FeedPost'
import FeedPostEditModal from '../components/feed/FeedPostEditModal'
import FeedPostMedia from '../components/feed/FeedPostMedia'
import FeedShareSheet from '../components/feed/FeedShareSheet'
import toast from 'react-hot-toast'
import { useFeedPostShare } from '../hooks/useFeedPostShare'
import {
  deleteFeedComment,
  deleteFeedPost,
  deleteFeedReply,
  updateFeedPostTheme,
  buildFeedComment,
  buildFeedReply,
  toggleFeedCommentLike,
  toggleFeedReplyLike,
  addFeedCommentReply,
} from '../services/trilhaFeedMutations'

const BOOKMARK_KEY = 'trilhaFeedBookmarks'

function loadBookmarks(uid) {
  try {
    const raw = localStorage.getItem(`${BOOKMARK_KEY}:${uid}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveBookmarks(uid, ids) {
  try {
    localStorage.setItem(`${BOOKMARK_KEY}:${uid}`, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

export default function ComunidadePublicacao() {
  const { postId } = useParams()
  const { user, profile, isAdmin } = useAuth()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [commentInputs, setCommentInputs] = useState({})
  const [expandedComments, setExpandedComments] = useState({})
  const [bookmarks, setBookmarks] = useState([])
  const [editingPost, setEditingPost] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const {
    sharePost,
    capturePost,
    captureRef,
    shareSheet,
    closeShareSheet,
  } = useFeedPostShare()
  const todayKey = dayjs().format('YYYY-MM-DD')
  const readOnly = !user

  useEffect(() => {
    if (!user) return () => {}
    setBookmarks(loadBookmarks(user.uid))
  }, [user])

  useEffect(() => {
    if (!postId) {
      setLoading(false)
      return () => {}
    }

    const unsub = onSnapshot(doc(db, 'trilhaFeed', postId), (snap) => {
      setPost(snap.exists() ? { id: snap.id, ...snap.data() } : null)
      setLoading(false)
    })

    return () => unsub()
  }, [postId])

  const toggleLike = useCallback(
    async (likes = []) => {
      if (!user || !postId) return
      const isLiked = likes.includes(user.uid)
      try {
        await updateDoc(doc(db, 'trilhaFeed', postId), {
          likes: isLiked ? likes.filter((id) => id !== user.uid) : [...likes, user.uid],
          likesCount: isLiked ? increment(-1) : increment(1),
        })
      } catch {
        toast.error('Erro ao curtir.')
      }
    },
    [user, postId],
  )

  const addComment = useCallback(
    async () => {
      const text = commentInputs[postId]?.trim()
      if (!text || !user || !post) return
      const comments = post.comments || []
      const newComment = buildFeedComment({
        user,
        profile,
        text,
      })
      try {
        await updateDoc(doc(db, 'trilhaFeed', postId), {
          comments: [...comments, newComment],
          commentsCount: increment(1),
        })
        setCommentInputs((prev) => ({ ...prev, [postId]: '' }))
        setExpandedComments((prev) => ({ ...prev, [postId]: true }))
      } catch {
        toast.error('Erro ao comentar.')
      }
    },
    [commentInputs, user, profile, post, postId],
  )

  const toggleBookmark = useCallback(
    (id) => {
      if (!user) return
      setBookmarks((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        saveBookmarks(user.uid, next)
        return next
      })
    },
    [user],
  )

  const handleDeletePost = useCallback(async () => {
    if (!post || !window.confirm('Apagar esta publicação?')) return
    try {
      await deleteFeedPost(post.id)
      toast.success('Publicação apagada.')
      window.history.back()
    } catch {
      toast.error('Erro ao apagar.')
    }
  }, [post])

  const handleDeleteComment = useCallback(
    async (commentId) => {
      if (!post) return
      try {
        await deleteFeedComment(post.id, post.comments, commentId)
        toast.success('Comentário apagado.')
      } catch {
        toast.error('Erro ao apagar comentário.')
      }
    },
    [post],
  )

  const handleToggleCommentLike = useCallback(
    async (commentId) => {
      if (!user || !post) return
      try {
        await toggleFeedCommentLike(post.id, post.comments, commentId, user.uid)
      } catch {
        toast.error('Erro ao curtir comentário.')
      }
    },
    [user, post],
  )

  const handleToggleReplyLike = useCallback(
    async (commentId, replyId) => {
      if (!user || !post) return
      try {
        await toggleFeedReplyLike(post.id, post.comments, commentId, replyId, user.uid)
      } catch {
        toast.error('Erro ao curtir resposta.')
      }
    },
    [user, post],
  )

  const handleAddReply = useCallback(
    async (commentId, text) => {
      if (!user || !post || !text.trim()) return
      try {
        const reply = buildFeedReply({ user, profile, text: text.trim() })
        await addFeedCommentReply(post.id, post.comments, commentId, reply)
        setExpandedComments((prev) => ({ ...prev, [post.id]: true }))
      } catch {
        toast.error('Erro ao responder comentário.')
      }
    },
    [user, profile, post],
  )

  const handleDeleteReply = useCallback(
    async (commentId, replyId) => {
      if (!post) return
      try {
        await deleteFeedReply(post.id, post.comments, commentId, replyId)
        toast.success('Resposta apagada.')
      } catch {
        toast.error('Erro ao apagar resposta.')
      }
    },
    [post],
  )

  const handleSaveEdit = useCallback(
    async (cardTheme) => {
      if (!editingPost) return
      setSavingEdit(true)
      try {
        await updateFeedPostTheme(editingPost.id, cardTheme)
        toast.success('Publicação atualizada.')
        setEditingPost(null)
      } catch {
        toast.error('Erro ao salvar.')
      } finally {
        setSavingEdit(false)
      }
    },
    [editingPost],
  )

  if (loading) {
    return (
      <ComunidadeShell title="Publicação" backHref="/comunidade" user={user} profile={profile}>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-cp-accent" />
        </div>
      </ComunidadeShell>
    )
  }

  if (!post) {
    return (
      <ComunidadeShell title="Publicação" backHref="/comunidade" user={user} profile={profile}>
        <div className="px-6 py-24 text-center text-sm text-cp-muted">Publicação não encontrada.</div>
      </ComunidadeShell>
    )
  }

  return (
    <ComunidadeShell
      title={post.authorName || 'Publicação'}
      backHref="/comunidade"
      user={user}
      profile={profile}
    >
      {readOnly && (
        <div className="mb-4 rounded-xl border border-cp-border bg-cp-surface px-4 py-3 text-sm text-cp-muted">
          Visualização pública —{' '}
          <Link to="/login" className="font-medium text-cp-accent hover:underline">
            faça login
          </Link>{' '}
          para curtir e comentar.
        </div>
      )}
      <FeedPost
        post={post}
        user={user}
        profile={profile}
        isAdmin={isAdmin}
        readOnly={readOnly}
        liked={post.likes?.includes(user?.uid)}
        bookmarked={bookmarks.includes(post.id)}
        isToday={post.featuredDate === todayKey}
        commentText={commentInputs[post.id] || ''}
        showAllComments
        onToggleLike={() => toggleLike(post.likes)}
        onToggleBookmark={() => toggleBookmark(post.id)}
        onToggleComments={() =>
          setExpandedComments((prev) => ({ ...prev, [post.id]: !prev[post.id] }))
        }
        onCommentChange={(val) => setCommentInputs((prev) => ({ ...prev, [post.id]: val }))}
        onAddComment={addComment}
        onShare={() => sharePost(post)}
        onEditPost={() => setEditingPost(post)}
        onDeletePost={handleDeletePost}
        onDeleteComment={handleDeleteComment}
        onDeleteReply={handleDeleteReply}
        onToggleCommentLike={handleToggleCommentLike}
        onToggleReplyLike={handleToggleReplyLike}
        onAddReply={handleAddReply}
      />

      {capturePost && (
        <div ref={captureRef} className="pointer-events-none fixed -left-[9999px] top-0 w-full max-w-[720px]">
          <FeedPostMedia post={capturePost} exportMode />
        </div>
      )}

      {shareSheet && <FeedShareSheet data={shareSheet} onClose={closeShareSheet} />}

      <FeedPostEditModal
        post={editingPost}
        open={!!editingPost}
        saving={savingEdit}
        onClose={() => setEditingPost(null)}
        onSave={handleSaveEdit}
      />
    </ComunidadeShell>
  )
}
