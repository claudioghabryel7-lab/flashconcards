import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
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
import toast from 'react-hot-toast'

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
  const { user, profile } = useAuth()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [commentInputs, setCommentInputs] = useState({})
  const [expandedComments, setExpandedComments] = useState({})
  const [bookmarks, setBookmarks] = useState([])
  const todayKey = dayjs().format('YYYY-MM-DD')

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
    const text = `${p.authorName} estudou ${p.materia || 'na Trilha'} — ${p.durationMinutes || 0} min`
    const url = `${window.location.origin}/comunidade/publicacao/${p.id}`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Comunidade FlashConCards', text, url })
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`)
        toast.success('Link copiado!')
      }
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Não foi possível compartilhar.')
    }
  }, [])

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
      backHref={`/comunidade/perfil/${post.authorId}`}
      user={user}
      profile={profile}
    >
      <FeedPost
        post={post}
        user={user}
        profile={profile}
        liked={post.likes?.includes(user?.uid)}
        bookmarked={bookmarks.includes(post.id)}
        isToday={post.featuredDate === todayKey}
        commentText={commentInputs[post.id] || ''}
        showAllComments={!!expandedComments[post.id]}
        onToggleLike={() => toggleLike(post.likes)}
        onToggleBookmark={() => toggleBookmark(post.id)}
        onToggleComments={() =>
          setExpandedComments((prev) => ({ ...prev, [post.id]: !prev[post.id] }))
        }
        onCommentChange={(val) => setCommentInputs((prev) => ({ ...prev, [post.id]: val }))}
        onAddComment={addComment}
        onShare={() => sharePost(post)}
      />
    </ComunidadeShell>
  )
}
