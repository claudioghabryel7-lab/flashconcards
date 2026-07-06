import { useEffect, useState } from 'react'
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
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import UserAvatar from '../components/UserAvatar'
import ComunidadeShell from '../components/feed/ComunidadeShell'
import FeedPostThumbnail from '../components/feed/FeedPostThumbnail'
import UserPublicCommentsList from '../components/content/UserPublicCommentsList'
import { subscribeUserComments } from '../services/contentCommentsService'
import {
  followUser,
  subscribeFollowCounts,
  subscribeIsFollowing,
  unfollowUser,
} from '../services/followService'
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
  const [commentsLoading, setCommentsLoading] = useState(true)

  const isOwnProfile = userId === currentUser?.uid

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return () => {}
    }

    const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
      setProfileUser(snap.exists() ? { uid: snap.id, ...snap.data() } : null)
      setLoading(false)
    })

    return () => unsub()
  }, [userId])

  useEffect(() => {
    if (!userId) return () => {}

    const postsRef = collection(db, 'trilhaFeed')
    let unsub = () => {}

    const subscribe = (useOrder = true) => {
      const q = useOrder
        ? query(postsRef, where('authorId', '==', userId), orderBy('createdAt', 'desc'))
        : query(postsRef, where('authorId', '==', userId))

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
    setCommentsLoading(true)
    const unsub = subscribeUserComments(
      userId,
      (rows) => {
        setComments(rows)
        setCommentsLoading(false)
      },
      () => setCommentsLoading(false),
    )
    return () => unsub?.()
  }, [userId])

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
          Comentários ({comments.length})
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
      ) : (
        <UserPublicCommentsList
          comments={comments}
          emptyMessage={
            isOwnProfile
              ? 'Você ainda não comentou em flashcards ou questões.'
              : 'Este usuário ainda não fez comentários públicos.'
          }
        />
      )}
    </ComunidadeShell>
  )
}
