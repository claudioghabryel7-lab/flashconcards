import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import CreateStory from '../components/CreateStory'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
} from 'firebase/firestore'
import {
  PhotoIcon,
  BookmarkIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const UserProfile = () => {
  const { userId } = useParams()
  const { user: currentUser } = useAuth()
  const { darkMode } = useDarkMode()
  const [profileUser, setProfileUser] = useState(null)
  const [userPosts, setUserPosts] = useState([])
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('posts') // posts, saved
  const [showCreateStory, setShowCreateStory] = useState(false)

  const isOwnProfile = userId === currentUser?.uid

  // Carregar dados do perfil
  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }

    const userRef = doc(db, 'users', userId)
    const unsub = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        setProfileUser({
          uid: snap.id,
          ...snap.data(),
        })
      }
      setLoading(false)
    })

    return () => unsub()
  }, [userId])

  // Carregar posts do usuário
  useEffect(() => {
    if (!userId) return

    const postsRef = collection(db, 'posts')
    const q = query(
      postsRef,
      where('authorId', '==', userId),
      orderBy('createdAt', 'desc')
    )

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        setUserPosts(data)
      },
      (error) => {
        // Se der erro de índice, carregar sem orderBy
        if (error.code === 'failed-precondition') {
          const q2 = query(postsRef, where('authorId', '==', userId))
          const unsub2 = onSnapshot(q2, (snapshot) => {
            const data = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
            data.sort((a, b) => {
              const aTime = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0) || 0
              const bTime = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0) || 0
              return bTime - aTime
            })
            setUserPosts(data)
          })
          return () => unsub2()
        }
      }
    )

    return () => unsub()
  }, [userId])

  // Carregar stories do usuário
  useEffect(() => {
    if (!userId) return

    const storiesRef = collection(db, 'stories')
    const q = query(
      storiesRef,
      where('authorId', '==', userId)
    )

    const unsub = onSnapshot(q, (snapshot) => {
      const now = new Date()
      const data = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter(story => {
          // Filtrar stories que ainda não expiraram
          if (!story.expiresAt) return false
          const expiresAt = story.expiresAt?.toDate ? story.expiresAt.toDate() : new Date(story.expiresAt)
          return expiresAt > now
        })
      setStories(data)
    }, (error) => {
      // Se der erro, carregar todas e filtrar no cliente
      if (error.code === 'failed-precondition') {
        const unsub2 = onSnapshot(storiesRef, (snapshot) => {
          const now = new Date()
          const data = snapshot.docs
            .map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
            .filter(story => {
              if (!story.expiresAt) return false
              const expiresAt = story.expiresAt?.toDate ? story.expiresAt.toDate() : new Date(story.expiresAt)
              return expiresAt > now && story.authorId === userId
            })
          setStories(data)
        })
        return () => unsub2()
      }
    })

    return () => unsub()
  }, [userId])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-alego-600"></div>
      </div>
    )
  }

  if (!profileUser) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-lg font-semibold text-alego-600">Usuário não encontrado</p>
      </div>
    )
  }

  const postsCount = userPosts.length
  const displayName = profileUser.displayName || profileUser.email?.split('@')[0] || 'Usuário'

  return (
    <div 
      className="max-w-4xl mx-auto px-2 sm:px-4 min-h-screen"
      style={{ backgroundColor: darkMode ? '#000000' : '#ffffff' }}
    >
      {/* Header do Perfil */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
          {/* Avatar/Profile Picture */}
          <div className="flex-shrink-0 mx-auto sm:mx-0">
            <div className="relative">
              <div className="h-24 w-24 sm:h-32 sm:w-32 rounded-full bg-black dark:bg-slate-900 border-4 border-black dark:border-slate-800 overflow-hidden">
                {profileUser.photoURL ? (
                  <img
                    src={profileUser.photoURL}
                    alt={displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <span className="text-white font-bold text-3xl sm:text-4xl">
                      {displayName[0].toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
              {/* Indicador de stories ativos */}
              {stories.length > 0 && (
                <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-gradient-to-br from-yellow-400 to-pink-500 border-4 border-black dark:border-slate-800 animate-pulse"></div>
              )}
            </div>
          </div>

          {/* Informações do Perfil */}
          <div className="flex-1 space-y-4">
            {/* Nome e ações */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <h1 className="text-2xl sm:text-3xl font-light text-slate-900 dark:text-white">
                {displayName}
              </h1>
              {isOwnProfile && (
                <Link
                  to="/profile/edit"
                  className="px-4 py-1.5 text-sm font-semibold border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  Editar perfil
                </Link>
              )}
            </div>

            {/* Estatísticas */}
            <div className="flex gap-6 sm:gap-8">
              <div>
                <span className="font-semibold">{postsCount}</span>
                <span className="ml-1 text-slate-600 dark:text-slate-400">publicações</span>
              </div>
              <div>
                <span className="font-semibold">{profileUser.followersCount || 0}</span>
                <span className="ml-1 text-slate-600 dark:text-slate-400">seguidores</span>
              </div>
              <div>
                <span className="font-semibold">{profileUser.followingCount || 0}</span>
                <span className="ml-1 text-slate-600 dark:text-slate-400">seguindo</span>
              </div>
            </div>

            {/* Bio */}
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{displayName}</p>
              {profileUser.bio && (
                <p className="text-slate-900 dark:text-white mt-1">{profileUser.bio}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stories */}
      <div className="mb-8">
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
          {/* Botão de criar story (se for o próprio perfil) */}
          {isOwnProfile && (
            <button
              type="button"
              onClick={() => setShowCreateStory(true)}
              className="flex-shrink-0 w-20 flex flex-col items-center gap-2"
            >
              <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 p-0.5">
                <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center">
                  <PlusIcon className="h-8 w-8 text-white" />
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">Criar</p>
            </button>
          )}
          
          {stories.map((story) => (
            <div
              key={story.id}
              className="flex-shrink-0 w-20 cursor-pointer"
            >
              <div className="relative">
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600 p-0.5">
                  {story.imageBase64 ? (
                    <img
                      src={story.imageBase64}
                      alt="Story"
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-slate-800"></div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {showCreateStory && (
        <CreateStory onClose={() => setShowCreateStory(false)} />
      )}

      {/* Tabs - Estilo Instagram */}
      <div className="border-t border-slate-300 dark:border-slate-800">
        <div className="flex justify-center gap-12">
          <button
            type="button"
            onClick={() => setActiveTab('posts')}
            className={`flex items-center gap-2 py-4 uppercase text-xs font-semibold tracking-wider border-t-2 transition ${
              activeTab === 'posts'
                ? 'border-black dark:border-white text-black dark:text-white'
                : 'border-transparent text-slate-600 dark:text-slate-400'
            }`}
          >
            <PhotoIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Publicações</span>
          </button>
          {isOwnProfile && (
            <button
              type="button"
              onClick={() => setActiveTab('saved')}
              className={`flex items-center gap-2 py-4 uppercase text-xs font-semibold tracking-wider border-t-2 transition ${
                activeTab === 'saved'
                  ? 'border-black dark:border-white text-black dark:text-white'
                  : 'border-transparent text-slate-600 dark:text-slate-400'
              }`}
            >
              <BookmarkIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Salvos</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid de Posts - Estilo Instagram */}
      <div className="grid grid-cols-3 gap-0.5 sm:gap-1 my-4">
        {activeTab === 'posts' && userPosts.map((post) => (
          <Link
            key={post.id}
            to={`/feed?post=${post.id}`}
            className="aspect-square bg-black dark:bg-black group relative overflow-hidden"
          >
            {post.imageBase64 || post.imageUrl ? (
              <img
                src={post.imageBase64 || post.imageUrl}
                alt="Post"
                className="w-full h-full object-cover group-hover:opacity-75 transition"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <PhotoIcon className="h-8 w-8 text-slate-400" />
              </div>
            )}
            {/* Overlay com estatísticas no hover */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-4 text-white">
              <div className="flex items-center gap-1">
                <span className="font-semibold">❤️</span>
                <span>{post.likesCount || post.likes?.length || 0}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="font-semibold">💬</span>
                <span>{post.commentsCount || post.comments?.length || 0}</span>
              </div>
            </div>
          </Link>
        ))}
        {activeTab === 'posts' && userPosts.length === 0 && (
          <div className="col-span-3 text-center py-12">
            <PhotoIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">Nenhuma publicação ainda</p>
          </div>
        )}
        {activeTab === 'saved' && (
          <div className="col-span-3 text-center py-12">
            <BookmarkIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">Nenhum post salvo</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default UserProfile

