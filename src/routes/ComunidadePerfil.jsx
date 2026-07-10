import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { Grid3X3, Loader2, MessageCircle } from 'lucide-react'
import { db, initFirebase } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import UserAvatar from '../components/UserAvatar'
import ComunidadeShell from '../components/feed/ComunidadeShell'
import FeedPostThumbnail from '../components/feed/FeedPostThumbnail'
import UserPublicCommentsList from '../components/content/UserPublicCommentsList'
import { subscribeUserComments, backfillUserCommentsToFeed } from '../services/contentCommentsService'
import { subscribeUserFeedComments } from '../services/userFeedCommentsService'
import {
  followUser,
  subscribeFollowCounts,
  subscribeIsFollowing,
  unfollowUser,
} from '../services/followService'
import { subscribeProfilePosts, profilePostToFeedShape } from '../services/profilePostsService'
import toast from 'react-hot-toast'

export default function ComunidadePerfil() {
  const { userId } = useParams()
  const { user: currentUser, profile: currentProfile } = useAuth()
  const [profileUser, setProfileUser] = useState(null)
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 })
  const [isFollowingUser, setIsFollowingUser] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [profileTab, setProfileTab] = useState('posts')
  const [comments, setComments] = useState([])
  const [feedComments, setFeedComments] = useState([])
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [contentCommentsFailed, setContentCommentsFailed] = useState(false)
  const [backfillDone, setBackfillDone] = useState(false)

  const mergedComments = useMemo(() => {
    const map = new Map()
    ;[...comments, ...feedComments].forEach((item) => {
      const key = item._docPath || `${item.courseId}-${item.id}`
      if (!map.has(key)) map.set(key, item)
    })
    return Array.from(map.values()).sort(
      (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0),
    )
  }, [comments, feedComments])

  const isOwnProfile = userId === currentUser?.uid

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return () => {}
    }

    const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
      setProfileUser(
        snap.exists() && snap.data()?.deleted !== true
          ? { uid: snap.id, ...snap.data() }
          : null,
      )
      setLoading(false)
    })

    return () => unsub()
  }, [userId])

  useEffect(() => {
    if (!userId) return () => {}

    let legacyPosts = []
    let archivedPosts = []

    const mergePosts = () => {
      const archivedIds = new Set(archivedPosts.map((p) => p.feedPostId).filter(Boolean))
      const legacyOnly = legacyPosts
        .filter((p) => !archivedIds.has(p.id))
        .map((p) => profilePostToFeedShape({ ...p, feedPostId: p.id }))
      const merged = [
        ...archivedPosts.map(profilePostToFeedShape),
        ...legacyOnly,
      ]
      merged.sort((a, b) => {
        const at = a.createdAt?.toMillis?.() || 0
        const bt = b.createdAt?.toMillis?.() || 0
        return bt - at
      })
      setPosts(merged)
    }

    const unsubArchive = subscribeProfilePosts(
      userId,
      (rows) => {
        archivedPosts = rows
        mergePosts()
      },
      console.error,
    )

    const postsRef = collection(db, 'trilhaFeed')
    let unsubLegacy = () => {}
    const subscribeLegacy = (useOrder = true) => {
      const q = useOrder
        ? query(postsRef, where('authorId', '==', userId), orderBy('createdAt', 'desc'))
        : query(postsRef, where('authorId', '==', userId))

      unsubLegacy = onSnapshot(
        q,
        (snap) => {
          legacyPosts = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          mergePosts()
        },
        (err) => {
          if (err.code === 'failed-precondition' && useOrder) subscribeLegacy(false)
          else console.error(err)
        },
      )
    }
    subscribeLegacy(true)

    return () => {
      unsubArchive?.()
      unsubLegacy()
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return () => {}
    return subscribeFollowCounts(userId, setFollowCounts)
  }, [userId])

  useEffect(() => {
    if (!currentUser?.uid || !userId || isOwnProfile) {
      setIsFollowingUser(false)
      return () => {}
    }
    return subscribeIsFollowing(currentUser.uid, userId, setIsFollowingUser)
  }, [currentUser?.uid, userId, isOwnProfile])

  useEffect(() => {
    if (!userId) return () => {}

    let cancelled = false
    let unsubContent = () => {}
    let unsubFeed = () => {}
    let retryTimer = null

    const attach = () => {
      initFirebase()
      if (!db) return false

      unsubContent?.()
      unsubFeed?.()

      setCommentsLoading(true)
      setContentCommentsFailed(false)

      let contentReady = false
      let feedReady = false

      const maybeDone = () => {
        if (contentReady && feedReady) setCommentsLoading(false)
      }

      unsubContent = subscribeUserComments(
        userId,
        (rows) => {
          if (cancelled) return
          setComments(rows)
          contentReady = true
          maybeDone()
        },
        () => {
          if (cancelled) return
          setContentCommentsFailed(true)
          setComments([])
          contentReady = true
          maybeDone()
        },
      )

      unsubFeed = subscribeUserFeedComments(
        userId,
        (rows) => {
          if (cancelled) return
          setFeedComments(rows)
          feedReady = true
          maybeDone()
        },
        (err) => {
          if (cancelled) return
          console.error('Erro ao carregar comentários da comunidade:', err)
          feedReady = true
          maybeDone()
        },
      )

      return true
    }

    if (!attach()) {
      retryTimer = setInterval(() => {
        if (cancelled || attach()) clearInterval(retryTimer)
      }, 250)
    }

    return () => {
      cancelled = true
      if (retryTimer) clearInterval(retryTimer)
      unsubContent?.()
      unsubFeed?.()
    }
  }, [userId])

  useEffect(() => {
    if (!isOwnProfile || !currentUser || !comments.length || backfillDone || commentsLoading) return

    const missingFeed = comments.filter((c) => !c.feedPostId)
    if (!missingFeed.length) {
      setBackfillDone(true)
      return
    }

    let cancelled = false
    backfillUserCommentsToFeed({
      user: currentUser,
      profile: currentProfile,
      comments: missingFeed,
    }).then(({ published }) => {
      if (!cancelled && published > 0) {
        toast.success(`${published} comentário(s) republicado(s) na comunidade.`)
      }
      if (!cancelled) setBackfillDone(true)
    })

    return () => {
      cancelled = true
    }
  }, [isOwnProfile, currentUser, currentProfile, comments, backfillDone, commentsLoading])

  const handleFollowToggle = async () => {
    if (!currentUser?.uid || !userId || isOwnProfile || followLoading) return
    setFollowLoading(true)
    try {
      if (isFollowingUser) await unfollowUser(currentUser.uid, userId)
      else await followUser(currentUser.uid, userId)
    } catch {
      toast.error('Erro ao atualizar seguidor.')
    } finally {
      setFollowLoading(false)
    }
  }

  if (loading) {
    return (
      <ComunidadeShell title="Perfil" backHref="/comunidade" user={currentUser} profile={currentProfile}>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-cp-accent" />
        </div>
      </ComunidadeShell>
    )
  }

  if (!profileUser) {
    return (
      <ComunidadeShell title="Perfil" backHref="/comunidade" user={currentUser} profile={currentProfile}>
        <div className="px-6 py-24 text-center text-sm text-cp-muted">Usuário não encontrado.</div>
      </ComunidadeShell>
    )
  }

  const displayName =
    profileUser.displayName || profileUser.email?.split('@')[0] || 'Aluno'

  return (
    <ComunidadeShell title={displayName} backHref="/comunidade" user={currentUser} profile={currentProfile}>
      {/* Profile header — estilo Instagram, compacto */}
      <div className="px-4 py-5">
        <div className="flex items-center gap-5">
          <UserAvatar
            photoBase64={profileUser.photoBase64}
            name={displayName}
            size="md"
            className="!h-[72px] !w-[72px]"
          />

          <div className="grid flex-1 grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-base font-bold text-cp-text">{posts.length}</p>
              <p className="text-[11px] text-cp-muted">publicações</p>
            </div>
            <div>
              <p className="text-base font-bold text-cp-text">{followCounts.followers}</p>
              <p className="text-[11px] text-cp-muted">seguidores</p>
            </div>
            <div>
              <p className="text-base font-bold text-cp-text">{followCounts.following}</p>
              <p className="text-[11px] text-cp-muted">seguindo</p>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-1">
          <p className="text-sm font-semibold text-cp-text">{displayName}</p>
          {profileUser.bio && (
            <p className="text-sm leading-relaxed text-cp-text">{profileUser.bio}</p>
          )}
          {profileUser.oneYearGoal && (
            <p className="text-xs text-cp-muted">Meta 1 ano: {profileUser.oneYearGoal}</p>
          )}
        </div>

        <div className="mt-4">
          {isOwnProfile ? (
            <Link
              to="/perfil"
              className="block w-full rounded-lg border border-cp-border py-1.5 text-center text-sm font-semibold text-cp-text transition hover:bg-cp-surface"
            >
              Editar perfil
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleFollowToggle}
              disabled={followLoading || !currentUser}
              className={`w-full rounded-lg py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
                isFollowingUser
                  ? 'border border-cp-border bg-cp-surface text-cp-text'
                  : 'bg-cp-accent text-white hover:opacity-90'
              }`}
            >
              {followLoading ? '...' : isFollowingUser ? 'Seguindo' : 'Seguir'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-y border-cp-border">
        <button
          type="button"
          onClick={() => setProfileTab('posts')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-[11px] font-semibold uppercase tracking-wider transition ${
            profileTab === 'posts' ? 'border-b-2 border-cp-text text-cp-text' : 'text-cp-muted'
          }`}
        >
          <Grid3X3 className="h-4 w-4" />
          Publicações
        </button>
        <button
          type="button"
          onClick={() => setProfileTab('comments')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-[11px] font-semibold uppercase tracking-wider transition ${
            profileTab === 'comments' ? 'border-b-2 border-cp-text text-cp-text' : 'text-cp-muted'
          }`}
        >
          <MessageCircle className="h-4 w-4" />
          Comentários ({mergedComments.length})
        </button>
      </div>

      {profileTab === 'posts' ? (
        posts.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Grid3X3 className="mx-auto h-10 w-10 text-cp-muted" />
            <p className="mt-3 text-sm text-cp-muted">Nenhuma publicação na Trilha ainda.</p>
            {isOwnProfile && (
              <Link
                to="/trilha"
                className="mt-4 inline-block text-sm font-semibold text-cp-accent"
              >
                Registrar estudo
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5">
            {posts.map((post) => (
              <FeedPostThumbnail key={post.id} post={post} />
            ))}
          </div>
        )
      ) : commentsLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-cp-accent" />
        </div>
      ) : mergedComments.length === 0 && contentCommentsFailed ? (
        <div className="px-6 py-10 text-center text-sm text-amber-600">
          Não foi possível carregar os comentários. Tente novamente em instantes.
        </div>
      ) : (
        <>
          {contentCommentsFailed && (
            <p className="border-b border-amber-500/20 bg-amber-500/10 px-6 py-2 text-center text-xs text-amber-700">
              Alguns comentários em flashcards e questões não carregaram; exibindo o que foi encontrado.
            </p>
          )}
          <UserPublicCommentsList
            comments={mergedComments}
            emptyMessage={
              isOwnProfile
                ? 'Você ainda não comentou em flashcards, questões ou publicações da comunidade.'
                : 'Este usuário ainda não fez comentários públicos.'
            }
          />
        </>
      )}
    </ComunidadeShell>
  )
}
