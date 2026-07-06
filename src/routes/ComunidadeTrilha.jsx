import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore'
import dayjs from 'dayjs'
import { Compass } from 'lucide-react'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import FeedHighlightsBar from '../components/feed/FeedHighlightsBar'
import FeedPost from '../components/feed/FeedPost'
import ComunidadeShell from '../components/feed/ComunidadeShell'
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

export default function ComunidadeTrilha() {
  const { user, profile } = useAuth()
  const [posts, setPosts] = useState([])
  const [commentInputs, setCommentInputs] = useState({})
  const [expandedComments, setExpandedComments] = useState({})
  const [bookmarks, setBookmarks] = useState([])
  const todayKey = dayjs().format('YYYY-MM-DD')

  useEffect(() => {
    if (!user) return () => {}
    setBookmarks(loadBookmarks(user.uid))
  }, [user])

  useEffect(() => {
    if (!user) return () => {}

    const postsRef = collection(db, 'trilhaFeed')
    let unsub = () => {}

    const subscribe = (useOrder = true) => {
      const q = useOrder ? query(postsRef, orderBy('createdAt', 'desc')) : query(postsRef)
      unsub = onSnapshot(
        q,
        (snap) => {
          const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          data.sort((a, b) => {
            const at = a.createdAt?.toMillis?.() || 0
            const bt = b.createdAt?.toMillis?.() || 0
            return bt - at
          })
          setPosts(data)
        },
        (err) => {
          if (err.code === 'failed-precondition' && useOrder) subscribe(false)
          else console.error(err)
        },
      )
    }

    subscribe(true)
    return () => unsub()
  }, [user])

  const dailyHighlights = useMemo(() => {
    const todayPosts = posts.filter((p) => p.featuredDate === todayKey)
    const byUser = new Map()
    todayPosts.forEach((p) => {
      const prev = byUser.get(p.authorId) || {
        authorId: p.authorId,
        authorName: p.authorName,
        authorPhotoBase64: p.authorPhotoBase64,
        totalMinutes: 0,
        sessions: 0,
      }
      prev.totalMinutes += p.durationMinutes || 0
      prev.sessions += 1
      if (p.authorPhotoBase64) prev.authorPhotoBase64 = p.authorPhotoBase64
      byUser.set(p.authorId, prev)
    })
    return [...byUser.values()].sort((a, b) => b.totalMinutes - a.totalMinutes).slice(0, 10)
  }, [posts, todayKey])

  const toggleLike = useCallback(
    async (postId, likes = []) => {
      if (!user) return
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
    [user],
  )

  const addComment = useCallback(
    async (postId) => {
      const text = commentInputs[postId]?.trim()
      if (!text || !user) return
      const post = posts.find((p) => p.id === postId)
      const comments = post?.comments || []
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
    [commentInputs, user, profile, posts],
  )

  const toggleBookmark = useCallback(
    (postId) => {
      if (!user) return
      setBookmarks((prev) => {
        const next = prev.includes(postId) ? prev.filter((id) => id !== postId) : [...prev, postId]
        saveBookmarks(user.uid, next)
        return next
      })
    },
    [user],
  )

  const sharePost = useCallback(async (post) => {
    const text = `${post.authorName} estudou ${post.materia || 'na Trilha'} — ${post.durationMinutes || 0} min no FlashConCards`
    const url = `${window.location.origin}/comunidade`
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

  const currentUserHighlight = user
    ? {
        uid: user.uid,
        name: profile?.displayName || user.email?.split('@')[0] || 'Você',
        photoBase64: profile?.photoBase64 || null,
      }
    : null

  return (
    <ComunidadeShell user={user} profile={profile}>
      {(dailyHighlights.length > 0 || user) && (
        <FeedHighlightsBar highlights={dailyHighlights} currentUser={currentUserHighlight} />
      )}

      {posts.length === 0 ? (
        <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-cp-accent/10">
            <Compass className="h-10 w-10 text-cp-accent" />
          </div>
          <div>
            <p className="font-semibold text-cp-text">Nenhuma publicação ainda</p>
            <p className="mt-1 text-sm text-cp-muted">
              Registre um bloco na Trilha e apareça no feed da comunidade.
            </p>
          </div>
          <Link
            to="/trilha"
            className="rounded-full bg-cp-accent px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Ir para a Trilha
          </Link>
        </div>
      ) : (
        posts.map((post) => (
          <FeedPost
            key={post.id}
            post={post}
            user={user}
            profile={profile}
            liked={post.likes?.includes(user?.uid)}
            bookmarked={bookmarks.includes(post.id)}
            isToday={post.featuredDate === todayKey}
            commentText={commentInputs[post.id] || ''}
            showAllComments={!!expandedComments[post.id]}
            onToggleLike={() => toggleLike(post.id, post.likes)}
            onToggleBookmark={() => toggleBookmark(post.id)}
            onToggleComments={() =>
              setExpandedComments((prev) => ({ ...prev, [post.id]: !prev[post.id] }))
            }
            onCommentChange={(val) =>
              setCommentInputs((prev) => ({ ...prev, [post.id]: val }))
            }
            onAddComment={() => addComment(post.id)}
            onShare={() => sharePost(post)}
          />
        ))
      )}
    </ComunidadeShell>
  )
}
