import { useEffect, useState, useRef } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  increment,
} from 'firebase/firestore'
// Removido: Firebase Storage - usando base64 diretamente no Firestore
import {
  HeartIcon,
  ChatBubbleLeftIcon,
  PaperAirplaneIcon,
  TrashIcon,
  PhotoIcon,
  XMarkIcon,
  ShareIcon,
} from '@heroicons/react/24/solid'
import { HeartIcon as HeartOutlineIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { auth, db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import NotificationToast from '../components/NotificationToast'
import StoriesBar from '../components/StoriesBar'

const SocialFeed = () => {
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [posts, setPosts] = useState([])
  const [newPost, setNewPost] = useState('')
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [commentInputs, setCommentInputs] = useState({})
  const [expandedComments, setExpandedComments] = useState({})
  const [notifications, setNotifications] = useState([])
  const fileInputRef = useRef(null)
  const previousPostsLength = useRef(0)

  // Carregar posts em tempo real
  useEffect(() => {
    if (!user) {
      setPosts([])
      return () => {}
    }
    
    const postsRef = collection(db, 'posts')
    let unsubscribe = null
    
    const tryLoadPosts = (useOrderBy = true) => {
      try {
        const q = useOrderBy 
          ? query(postsRef, orderBy('createdAt', 'desc'))
          : query(postsRef)
        
        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const data = snapshot.docs.map((docSnapshot) => ({
              id: docSnapshot.id,
              ...docSnapshot.data(),
            }))
            // Ordenar por data manualmente
            data.sort((a, b) => {
              const aTime = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0) || 0
              const bTime = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0) || 0
              return bTime - aTime
            })
            
            // Detectar novos posts para notificações
            if (previousPostsLength.current > 0 && data.length > previousPostsLength.current) {
              const previousIds = posts.map(p => p.id)
              const newPosts = data.filter(post => !previousIds.includes(post.id))
              
              newPosts.forEach(post => {
                // Não notificar sobre o próprio post
                if (post.authorId && post.authorId !== user.uid) {
                  const notification = {
                    id: Date.now().toString() + Math.random().toString(),
                    userName: post.authorName || post.authorEmail || 'Alguém',
                    avatar: post.authorAvatar,
                    message: post.imageBase64 || post.imageUrl ? 'publicou uma nova foto' : 'fez uma nova publicação',
                    imagePreview: post.imageBase64 || post.imageUrl,
                    postId: post.id,
                  }
                  setNotifications(prev => [notification, ...prev])
                  
                  // Remover notificação após 5 segundos
                  setTimeout(() => {
                    setNotifications(prev => prev.filter(n => n.id !== notification.id))
                  }, 5000)
                }
              })
            }
            
            previousPostsLength.current = data.length
            setPosts(data)
            setError('')
          },
          (error) => {
            console.error('Erro ao carregar posts:', error)
            if (error.code === 'failed-precondition' && useOrderBy) {
              console.warn('Índice do Firestore não criado. Usando query sem orderBy.')
              tryLoadPosts(false)
              return
            }
            if (error.code === 'permission-denied') {
              setError('Erro de permissão. Verifique se você está autenticado.')
            } else {
              setError(`Erro ao carregar posts: ${error.message || 'Erro desconhecido'}`)
            }
          }
        )
      } catch (err) {
        console.error('Erro ao criar query:', err)
        setError('Erro ao carregar posts. Tente recarregar a página.')
      }
    }
    
    tryLoadPosts(true)
    
    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [user])

  // Selecionar imagem e converter para base64
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecione apenas imagens.')
      return
    }

    // Limitar tamanho (máximo 1MB para base64 - limite do Firestore)
    if (file.size > 1024 * 1024) {
      setError('A imagem é muito grande. Máximo: 1MB. Use imagens menores ou comprima antes de enviar.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const base64Image = e.target.result
      setSelectedImage(file)
      setImagePreview(base64Image)
    }
    reader.onerror = () => {
      setError('Erro ao carregar a imagem. Tente novamente.')
    }
    reader.readAsDataURL(file)
    setError('')
  }

  // Remover imagem selecionada
  const removeImage = () => {
    setSelectedImage(null)
    setImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Criar novo post com imagem (usando base64)
  const createPost = async () => {
    if ((!newPost.trim() && !imagePreview) || !user || sending) return
    
    setSending(true)
    setError('')
    
    try {
      // Criar post no Firestore com imagem em base64
      const postsRef = collection(db, 'posts')
      await addDoc(postsRef, {
        text: newPost.trim() || '',
        imageBase64: imagePreview || null, // Salvar base64 diretamente
        authorId: user.uid,
        authorName: profile?.displayName || user.email?.split('@')[0] || 'Usuário',
        authorEmail: user.email || '',
        authorAvatar: user.photoURL || null,
        likes: [],
        likesCount: 0,
        comments: [],
        commentsCount: 0,
        shares: [],
        sharesCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      
      // Limpar formulário
      setNewPost('')
      setSelectedImage(null)
      setImagePreview(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      setError('')
    } catch (err) {
      console.error('Erro ao criar post:', err)
      setError(`Erro ao publicar: ${err.message || 'Erro desconhecido'}`)
    } finally {
      setSending(false)
    }
  }

  // Curtir/descurtir post
  const toggleLike = async (postId, currentLikes) => {
    if (!user) return
    
    const postRef = doc(db, 'posts', postId)
    const likes = currentLikes || []
    const isLiked = likes.includes(user.uid)
    
    try {
      await updateDoc(postRef, {
        likes: isLiked 
          ? likes.filter(uid => uid !== user.uid)
          : [...likes, user.uid],
        likesCount: isLiked ? increment(-1) : increment(1),
      })
    } catch (err) {
      console.error('Erro ao curtir post:', err)
    }
  }

  // Adicionar comentário
  const addComment = async (postId) => {
    const commentText = commentInputs[postId]
    if (!commentText?.trim() || !user) return
    
    try {
      const postRef = doc(db, 'posts', postId)
      const post = posts.find(p => p.id === postId)
      const currentComments = post?.comments || []
      
      // Não usar serverTimestamp() dentro de arrays - usar new Date() em vez disso
      const newComment = {
        id: Date.now().toString(),
        text: commentText.trim(),
        authorId: user.uid,
        authorName: profile?.displayName || user.email?.split('@')[0] || 'Usuário',
        authorAvatar: user.photoURL || null,
        createdAt: new Date(),
      }
      
      await updateDoc(postRef, {
        comments: [...currentComments, newComment],
        commentsCount: increment(1),
      })
      
      setCommentInputs(prev => ({ ...prev, [postId]: '' }))
      setError('')
    } catch (err) {
      console.error('Erro ao comentar:', err)
      setError(`Erro ao comentar: ${err.message || 'Erro desconhecido'}`)
    }
  }

  // Compartilhar post
  const sharePost = async (postId, postText) => {
    if (!user) return

    try {
      const postRef = doc(db, 'posts', postId)
      const post = posts.find(p => p.id === postId)
      const currentShares = post?.shares || []
      
      // Verificar se já compartilhou
      if (currentShares.includes(user.uid)) {
        setError('Você já compartilhou este post.')
        return
      }

      await updateDoc(postRef, {
        shares: [...currentShares, user.uid],
        sharesCount: increment(1),
      })

      // Também tentar compartilhar via Web Share API se disponível
      const postUrl = `${window.location.origin}/feed?post=${postId}`
      const shareData = {
        title: 'Confira este post!',
        text: postText || 'Veja este post interessante',
        url: postUrl,
      }

      if (navigator.share) {
        try {
          await navigator.share(shareData)
        } catch (shareErr) {
          // Usuário cancelou ou erro no share nativo
          console.log('Compartilhamento nativo cancelado ou indisponível')
        }
      } else {
        // Fallback: copiar link para clipboard
        try {
          await navigator.clipboard.writeText(postUrl)
          alert('Link copiado para a área de transferência!')
        } catch (clipboardErr) {
          console.error('Erro ao copiar link:', clipboardErr)
        }
      }
    } catch (err) {
      console.error('Erro ao compartilhar post:', err)
      setError(`Erro ao compartilhar: ${err.message || 'Erro desconhecido'}`)
    }
  }

  // Deletar post (apenas o autor)
  const deletePost = async (postId) => {
    if (!window.confirm('Deseja realmente excluir este post?')) return
    
    try {
      // Deletar post do Firestore (imagem em base64 será deletada junto)
      await deleteDoc(doc(db, 'posts', postId))
    } catch (err) {
      console.error('Erro ao deletar post:', err)
      setError(`Erro ao deletar post: ${err.message || 'Erro desconhecido'}`)
    }
  }

  // Toggle comentários
  const toggleComments = (postId) => {
    setExpandedComments(prev => ({
      ...prev,
      [postId]: !prev[postId]
    }))
  }

  // Formatar data
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Agora'
    
    try {
      let date
      
      // Lidar com diferentes tipos de timestamp
      if (timestamp instanceof Date) {
        // Se já é um objeto Date
        date = timestamp
      } else if (timestamp.toDate) {
        // Se é um Timestamp do Firestore
        date = timestamp.toDate()
      } else if (timestamp.seconds) {
        // Se tem propriedade seconds (Timestamp do Firestore serializado)
        date = new Date(timestamp.seconds * 1000)
      } else if (typeof timestamp === 'number') {
        // Se é um número (timestamp em milissegundos)
        date = new Date(timestamp)
      } else if (typeof timestamp === 'string') {
        // Se é uma string ISO
        date = new Date(timestamp)
      } else {
        return 'Agora'
      }
      
      // Verificar se a data é válida
      if (isNaN(date.getTime())) {
        return 'Agora'
      }
      
      const now = new Date()
      const diff = now - date
      const minutes = Math.floor(diff / 60000)
      const hours = Math.floor(diff / 3600000)
      const days = Math.floor(diff / 86400000)

      if (minutes < 1) return 'Agora'
      if (minutes < 60) return `${minutes}m`
      if (hours < 24) return `${hours}h`
      if (days < 7) return `${days}d`
      
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    } catch {
      return 'Agora'
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-lg font-semibold text-alego-600 dark:text-alego-400">
          Faça login para ver o feed social
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto pb-20" style={{ backgroundColor: darkMode ? '#000000' : '#ffffff' }}>
      {/* Notificações */}
      {notifications.length > 0 && (
        <NotificationToast 
          notifications={notifications} 
          onRemove={(id) => setNotifications(prev => prev.filter(n => n.id !== id))}
        />
      )}
      
      {/* Header - Estilo Instagram */}
      <div className="bg-white dark:bg-black border-b border-slate-300 dark:border-slate-800 sticky top-0 z-10 py-4 mb-4">
        <div className="flex items-center justify-between px-4">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            FlashSocial
          </h1>
          {user && (
            <Link
              to={`/profile/${user.uid}`}
              className="flex items-center gap-2 hover:opacity-80 transition"
            >
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Você'}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <span className="text-white font-bold text-xs">
                    {(profile?.displayName || user.email || 'U')[0].toUpperCase()}
                  </span>
                </div>
              )}
            </Link>
          )}
        </div>
      </div>

      {/* Stories Bar */}
      <StoriesBar />

      {/* Criar novo post - Estilo Instagram */}
      <div className="bg-white dark:bg-black border-b border-slate-300 dark:border-slate-800 px-4 py-6 mb-4">
        {error && (
          <div className="mb-4 rounded-xl bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}
        
        <div className="flex gap-3">
          {/* Avatar do usuário */}
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'Você'}
              className="h-10 w-10 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-alego-500 to-alego-700 flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-sm">
                {(profile?.displayName || user.email || 'U')[0].toUpperCase()}
              </span>
            </div>
          )}
          
          <div className="flex-1">
            <textarea
              value={newPost}
              onChange={(e) => {
                setNewPost(e.target.value)
                setError('')
              }}
              placeholder="O que você está estudando hoje? Compartilhe sua motivação!"
              rows={3}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm focus:border-alego-400 focus:outline-none resize-none"
            />
            
            {/* Preview da imagem */}
            {imagePreview && (
              <div className="relative mt-3 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full max-h-64 object-cover"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white transition"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            )}
            
            {/* Botões de ação */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-alego-600 dark:hover:text-alego-400 transition"
              >
                <PhotoIcon className="h-5 w-5" />
                <span className="text-sm font-medium">Foto</span>
              </button>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              
              <button
                type="button"
                onClick={createPost}
                disabled={(!newPost.trim() && !selectedImage) || sending}
                className="flex items-center gap-2 rounded-xl bg-alego-600 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-alego-700 transition"
              >
                {sending ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Publicando...
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="h-5 w-5" />
                    Publicar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de posts - Estilo Instagram */}
      <div>
        {posts.length === 0 && (
          <div className="bg-white dark:bg-black p-8 text-center border-b border-slate-300 dark:border-slate-800">
            <p className="text-slate-500 dark:text-slate-400">
              Nenhum post ainda. Seja o primeiro a compartilhar!
            </p>
          </div>
        )}

        {posts.map((post) => {
          const isLiked = post.likes?.includes(user.uid) || false
          const likesCount = post.likesCount || post.likes?.length || 0
          const comments = post.comments || []
          const commentsCount = post.commentsCount || comments.length
          const sharesCount = post.sharesCount || post.shares?.length || 0
          const isAuthor = post.authorId === user.uid
          const showComments = expandedComments[post.id]

          return (
            <article
              key={post.id}
              className="bg-white dark:bg-black border-b border-slate-300 dark:border-slate-800 mb-4"
            >
              {/* Header do post */}
              <div className="flex items-center justify-between px-4 py-3">
                <Link
                  to={`/profile/${post.authorId}`}
                  className="flex items-center gap-3 hover:opacity-80 transition"
                >
                  {post.authorAvatar ? (
                    <img
                      src={post.authorAvatar}
                      alt={post.authorName}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                      <span className="text-white font-bold text-sm">
                        {(post.authorName || 'U')[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      {post.authorName || post.authorEmail}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(post.createdAt)}
                    </p>
                  </div>
                </Link>
                {isAuthor && (
                  <button
                    type="button"
                    onClick={() => deletePost(post.id)}
                    className="text-rose-500 hover:text-rose-600 transition"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                )}
              </div>

              {/* Imagem do post (base64 ou URL) - Estilo Instagram */}
              {(post.imageBase64 || post.imageUrl) && (
                <div className="w-full bg-black">
                  <img
                    src={post.imageBase64 || post.imageUrl}
                    alt="Post"
                    className="w-full aspect-square object-cover"
                  />
                </div>
              )}

              {/* Conteúdo do post */}
              {post.text && (
                <div className="px-4 pb-3">
                  <p className="text-slate-900 dark:text-white whitespace-pre-wrap break-words">
                    {post.text}
                  </p>
                </div>
              )}

              {/* Ações */}
              <div className="px-4 pb-3">
                <div className="flex items-center gap-4 pt-3">
                  <button
                    type="button"
                    onClick={() => toggleLike(post.id, post.likes)}
                    className="flex items-center gap-2 hover:opacity-70 transition"
                  >
                    {isLiked ? (
                      <HeartIcon className="h-6 w-6 text-rose-500" />
                    ) : (
                      <HeartOutlineIcon className="h-6 w-6 text-slate-600 dark:text-slate-400" />
                    )}
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                      {likesCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleComments(post.id)}
                    className="flex items-center gap-2 hover:opacity-70 transition"
                  >
                    <ChatBubbleLeftIcon className="h-6 w-6 text-slate-600 dark:text-slate-400" />
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                      {commentsCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => sharePost(post.id, post.text)}
                    className="flex items-center gap-2 hover:opacity-70 transition"
                  >
                    <ShareIcon className="h-6 w-6 text-slate-600 dark:text-slate-400" />
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                      {sharesCount}
                    </span>
                  </button>
                </div>
              </div>

              {/* Comentários */}
              {showComments && (
                <div className="px-4 pb-4 border-t border-slate-200 dark:border-slate-700">
                  <div className="pt-4 space-y-3 max-h-96 overflow-y-auto">
                    {comments.map((comment) => (
                      <div key={comment.id} className="flex gap-3">
                        {comment.authorAvatar ? (
                          <img
                            src={comment.authorAvatar}
                            alt={comment.authorName}
                            className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-alego-500 to-alego-700 flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-xs">
                              {(comment.authorName || 'U')[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            {comment.authorName}
                          </p>
                          <p className="text-sm text-slate-600 dark:text-slate-400 break-words">
                            {comment.text}
                          </p>
                        </div>
                      </div>
                    ))}
                    {comments.length === 0 && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-2">
                        Nenhum comentário ainda. Seja o primeiro!
                      </p>
                    )}
                  </div>

                  {/* Input de comentário */}
                  <div className="flex gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'Você'}
                        className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-alego-500 to-alego-700 flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-xs">
                          {(profile?.displayName || user.email || 'U')[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    <input
                      type="text"
                      value={commentInputs[post.id] || ''}
                      onChange={(e) => setCommentInputs(prev => ({
                        ...prev,
                        [post.id]: e.target.value
                      }))}
                      onKeyPress={(e) => e.key === 'Enter' && addComment(post.id)}
                      placeholder="Escreva um comentário..."
                      className="flex-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-2 text-sm focus:border-alego-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => addComment(post.id)}
                      className="rounded-full bg-alego-600 px-4 py-2 text-sm font-semibold text-white hover:bg-alego-700 transition"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

export default SocialFeed
