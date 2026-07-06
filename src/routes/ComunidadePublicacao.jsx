import { useCallback, useEffect, useRef, useState } from 'react'
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
import toast from 'react-hot-toast'
import { exportFeedPostAsImage } from '../utils/feedShareExport'
import {
  deleteFeedComment,
  deleteFeedPost,
  updateFeedPostTheme,
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
  const [capturePost, setCapturePost] = useState(null)
  const captureRef = useRef(null)
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
      const newComment = {
        id: `${Date.now()}`,
        text,
        authorId: user.uid,
        authorName: profile?.displayName || user.email?.split('@')[0] || 'Aluno',
        authorPhotoBase64: profile?.photoBase64 || null,
        createdAt: new Date().toISOString(),
      }
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

  const sharePost = useCallback(async (p) => {
    const url = `${window.location.origin}/comunidade/publicacao/${p.id}`
    try {
      setCapturePost(p)
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      })
      if (captureRef.current) {
        await exportFeedPostAsImage(captureRef.current, `concurseiro-preditivo-${p.id}.png`)
        toast.success('Imagem salva com marca d\'água!')
      }
      try {
        await navigator.clipboard.writeText(url)
      } catch {
        /* ignore */
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(url)
          toast.success('Link copiado!')
        } catch {
          toast.error('Não foi possível compartilhar.')
        }
      }
    } finally {
      setCapturePost(null)
    }
  }, [])

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
      />

      {capturePost && (
        <div ref={captureRef} className="pointer-events-none fixed -left-[9999px] top-0 w-[470px]">
          <FeedPostMedia post={capturePost} exportMode />
        </div>
      )}

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
