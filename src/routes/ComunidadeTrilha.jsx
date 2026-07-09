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
import CoursePeopleSuggestions from '../components/feed/CoursePeopleSuggestions'
import FeedPost from '../components/feed/FeedPost'
import FeedPostEditModal from '../components/feed/FeedPostEditModal'
import FeedPostMedia from '../components/feed/FeedPostMedia'
import FeedShareSheet from '../components/feed/FeedShareSheet'
import FeedPostComposer from '../components/feed/FeedPostComposer'
import ComunidadeShell from '../components/feed/ComunidadeShell'
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
  pinFeedPost,
  unpinFeedPost,
  reportFeedPost,
} from '../services/trilhaFeedMutations'
import { isFeedPostActive, normalizeDurationMinutes } from '../utils/feedTimeUtils'
import { sortFeedPosts } from '../utils/feedSortUtils'
import {
  useCommunityAuthors,
  resolveCommunityAuthor,
  isAuthorVisible,
} from '../hooks/useCommunityAuthors'
import { cleanupOrphanCommunityData } from '../services/communityUserService'

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
  const { user, profile, isAdmin } = useAuth()
  const [posts, setPosts] = useState([])
  const [commentInputs, setCommentInputs] = useState({})
  const [expandedComments, setExpandedComments] = useState({})
  const [bookmarks, setBookmarks] = useState([])
  const [editingPost, setEditingPost] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const todayKey = dayjs().format('YYYY-MM-DD')
  const {
    sharePost,
    sharing,
    capturePost,
    captureRef,
    shareSheet,
    closeShareSheet,
  } = useFeedPostShare()

  useEffect(() => {
    if (!user) return () => {}
    setBookmarks(loadBookmarks(user.uid))
  }, [user])

  useEffect(() => {
    if (!db) return () => {}

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
  }, [])

  const activePosts = useMemo(() => posts.filter((p) => isFeedPostActive(p)), [posts])

  const authorIds = useMemo(() => {
    const ids = new Set()
    activePosts.forEach((post) => {
      if (post.authorId) ids.add(post.authorId)
      ;(post.comments || []).forEach((comment) => {
        if (comment.authorId) ids.add(comment.authorId)
        ;(comment.replies || []).forEach((reply) => {
          if (reply.authorId) ids.add(reply.authorId)
        })
      })
    })
    return [...ids]
  }, [activePosts])

  const { authorsMap } = useCommunityAuthors(authorIds)

  const visiblePosts = useMemo(
    () => sortFeedPosts(activePosts.filter((post) => isAuthorVisible(post.authorId, authorsMap))),
    [activePosts, authorsMap],
  )

  useEffect(() => {
    if (!isAdmin) return () => {}
    let cancelled = false
    cleanupOrphanCommunityData().then((result) => {
      if (!cancelled && result.removedPosts > 0) {
        toast.success(`${result.removedPosts} publicação(ões) de contas removidas foram limpas.`)
      }
    })
    return () => {
      cancelled = true
    }
  }, [isAdmin])

  const dailyHighlights = useMemo(() => {
    const byUser = new Map()
    visiblePosts.forEach((p) => {
      const live = resolveCommunityAuthor(p.authorId, authorsMap, p)
      if (!live) return
      const prev = byUser.get(p.authorId) || {
        authorId: p.authorId,
        authorName: live.displayName,
        authorPhotoBase64: live.photoBase64,
        totalMinutes: 0,
        sessions: 0,
      }
      prev.totalMinutes += normalizeDurationMinutes(p.durationMinutes || 0)
      prev.sessions += 1
      prev.authorName = live.displayName
      if (live.photoBase64) prev.authorPhotoBase64 = live.photoBase64
      byUser.set(p.authorId, prev)
    })
    return [...byUser.values()].sort((a, b) => b.totalMinutes - a.totalMinutes).slice(0, 10)
  }, [visiblePosts, authorsMap])

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

  const handleDeletePost = useCallback(
    async (post) => {
      if (!window.confirm('Apagar esta publicação? Essa ação não pode ser desfeita.')) return
      try {
        await deleteFeedPost(post.id)
        toast.success('Publicação apagada.')
      } catch {
        toast.error('Erro ao apagar publicação.')
      }
    },
    [],
  )

  const handleDeleteComment = useCallback(async (post, commentId) => {
    try {
      await deleteFeedComment(post.id, post.comments, commentId)
      toast.success('Comentário apagado.')
    } catch {
      toast.error('Erro ao apagar comentário.')
    }
  }, [])

  const handleToggleCommentLike = useCallback(
    async (post, commentId) => {
      if (!user) return
      try {
        await toggleFeedCommentLike(post.id, post.comments, commentId, user.uid)
      } catch {
        toast.error('Erro ao curtir comentário.')
      }
    },
    [user],
  )

  const handleToggleReplyLike = useCallback(
    async (post, commentId, replyId) => {
      if (!user) return
      try {
        await toggleFeedReplyLike(post.id, post.comments, commentId, replyId, user.uid)
      } catch {
        toast.error('Erro ao curtir resposta.')
      }
    },
    [user],
  )

  const handleAddReply = useCallback(
    async (post, commentId, text) => {
      if (!user || !text.trim()) return
      try {
        const reply = buildFeedReply({ user, profile, text: text.trim() })
        await addFeedCommentReply(post.id, post.comments, commentId, reply)
        setExpandedComments((prev) => ({ ...prev, [post.id]: true }))
      } catch {
        toast.error('Erro ao responder comentário.')
      }
    },
    [user, profile],
  )

  const handleDeleteReply = useCallback(async (post, commentId, replyId) => {
    try {
      await deleteFeedReply(post.id, post.comments, commentId, replyId)
      toast.success('Resposta apagada.')
    } catch {
      toast.error('Erro ao apagar resposta.')
    }
  }, [])

  const handleSaveEdit = useCallback(
    async (cardTheme) => {
      if (!editingPost) return
      setSavingEdit(true)
      try {
        await updateFeedPostTheme(editingPost.id, cardTheme)
        toast.success('Publicação atualizada.')
        setEditingPost(null)
      } catch {
        toast.error('Erro ao salvar alterações.')
      } finally {
        setSavingEdit(false)
      }
    },
    [editingPost],
  )

  const handlePinPost = useCallback(
    async (post) => {
      if (!user?.uid) return
      try {
        await pinFeedPost(post.id, user.uid)
        toast.success('Publicação fixada no topo por 24 horas.')
      } catch {
        toast.error('Erro ao fixar publicação.')
      }
    },
    [user],
  )

  const handleUnpinPost = useCallback(async (post) => {
    try {
      await unpinFeedPost(post.id)
      toast.success('Fixação removida.')
    } catch {
      toast.error('Erro ao remover fixação.')
    }
  }, [])

  const handleReportPost = useCallback(
    async (post) => {
      if (!user) {
        toast.error('Faça login para denunciar.')
        return
      }
      if (!window.confirm('Denunciar esta publicação? Nossa equipe irá analisar.')) return
      try {
        await reportFeedPost({
          postId: post.id,
          reporterId: user.uid,
          postAuthorId: post.authorId,
        })
        toast.success('Denúncia enviada. Obrigado!')
      } catch {
        toast.error('Erro ao enviar denúncia.')
      }
    },
    [user],
  )

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

      <CoursePeopleSuggestions
        courseId={profile?.selectedCourseId || 'alego-default'}
        currentUserId={user?.uid}
      />

      <FeedPostComposer user={user} profile={profile} />

      {visiblePosts.length === 0 ? (
        <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-cp-accent/10">
            <Compass className="h-10 w-10 text-cp-accent" />
          </div>
          <div>
            <p className="font-semibold text-cp-text">Nenhuma publicação ainda</p>
            <p className="mt-1 text-sm text-cp-muted">
              Publique uma dúvida acima ou registre um bloco na Trilha.
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
        visiblePosts.map((post) => (
          <FeedPost
            key={post.id}
            post={post}
            authorsMap={authorsMap}
            user={user}
            profile={profile}
            isAdmin={isAdmin}
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
            onEditPost={() => setEditingPost(post)}
            onDeletePost={() => handleDeletePost(post)}
            onPinPost={() => handlePinPost(post)}
            onUnpinPost={() => handleUnpinPost(post)}
            onReportPost={() => handleReportPost(post)}
            onDeleteComment={(commentId) => handleDeleteComment(post, commentId)}
            onDeleteReply={(commentId, replyId) => handleDeleteReply(post, commentId, replyId)}
            onToggleCommentLike={(commentId) => handleToggleCommentLike(post, commentId)}
            onToggleReplyLike={(commentId, replyId) => handleToggleReplyLike(post, commentId, replyId)}
            onAddReply={(commentId, text) => handleAddReply(post, commentId, text)}
          />
        ))
      )}

      <FeedPostEditModal
        post={editingPost}
        open={!!editingPost}
        saving={savingEdit}
        onClose={() => setEditingPost(null)}
        onSave={handleSaveEdit}
      />

      {capturePost && (
        <div ref={captureRef} className="pointer-events-none fixed -left-[9999px] top-0 w-full max-w-[720px]">
          <FeedPostMedia post={capturePost} exportMode />
        </div>
      )}

      {shareSheet && <FeedShareSheet data={shareSheet} onClose={closeShareSheet} />}
    </ComunidadeShell>
  )
}
