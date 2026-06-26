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

const ConCurseiroSocial = () => {
  const { user, profile, isAdmin } = useAuth()
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
  
  // Verificar se usuário tem acesso a curso
  // Permitir que usuários autenticados publiquem (mesmo sem curso comprado)
  const hasCourseAccess = profile && (profile.selectedCourseId !== undefined || profile.purchasedCourses?.length > 0 || isAdmin || profile.hasActiveSubscription)

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

  // Curtir/descurtir post (apenas usuários com curso)
  const toggleLike = async (postId, currentLikes) => {
    if (!user || !hasCourseAccess) {
      setError('Você precisa ter acesso a um curso para interagir com as publicações.')
      return
    }
    
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
      setError('Erro ao curtir post. Você precisa ter acesso a um curso.')
    }
  }

  // Adicionar comentário (apenas usuários com curso)
  const addComment = async (postId) => {
    const commentText = commentInputs[postId]
    if (!commentText?.trim() || !user) return
    
    if (!hasCourseAccess) {
      setError('Você precisa ter acesso a um curso para comentar.')
      return
    }
    
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

  // Compartilhar post (apenas usuários com curso)
  const sharePost = async (postId, postText) => {
    if (!user) return
    
    if (!hasCourseAccess) {
      setError('Você precisa ter acesso a um curso para compartilhar.')
      return
    }

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
        <p className="text-lg font-semibold text-accent-orange">
          Faça login para ver o feed social
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto pb-20">
      {/* Notificações */}
      {notifications.length > 0 && (
        <NotificationToast 
          notifications={notifications} 
          onRemove={(id) => setNotifications(prev => prev.filter(n => n.id !== id))}
        />
      )}
      
      {/* Header - Estilo Instagram */}
      <div className="bg-background-card border-b border-border-primary sticky top-0 z-10 py-4 mb-4">
        <div className="flex items-center justify-between px-4">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-accent-orange to-accent-cyan bg-clip-text text-transparent">
            ConCurseiroSocial
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
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-accent-orange to-accent-cyan flex items-center justify-center">
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
      <div className="bg-background-card border-b border-border-primary px-4 py-6 mb-4">
        {error && (
          <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
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
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-accent-orange to-accent-cyan flex items-center justify-center flex-shrink-0">
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
              className="w-full rounded-xl border border-border-primary bg-background-primary px-4 py-3 text-sm focus:border-accent-orange focus:outline-none resize-none"
            />
            
            {/* Preview da imagem */}
            {imagePreview && (
              <div className="relative mt-3 rounded-xl overflow-hidden border border-border-primary">
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
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-primary">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 text-text-secondary hover:text-accent-orange transition"
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
          <div className="bg-background-card p-8 text-center border-b border-border-primary">
            <p className="text-text-secondary">
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
              className="bg-background-card border border-border-primary rounded-2xl mb-4 overflow-hidden shadow-lg"
            >
              {/* Header do post */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border-primary">
                <Link
                  to={`/profile/${post.authorId}`}
                  className="flex items-center gap-3 hover:opacity-80 transition"
                >
                  {post.authorAvatar ? (
                    <img
                      src={post.authorAvatar}
                      alt={post.authorName}
                      className="h-10 w-10 rounded-full object-cover ring-2 ring-accent-orange/30"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-accent-orange to-accent-cyan flex items-center justify-center ring-2 ring-accent-orange/30">
                      <span className="text-background-primary font-bold text-sm">
                        {(post.authorName || 'U')[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-text-primary">
                      {post.authorName || post.authorEmail}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {formatDate(post.createdAt)}
                    </p>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  {/* Badge de Notícia */}
                  {post.isNews && (
                    <span className="px-2 py-1 text-xs font-semibold bg-accent-orange text-background-primary rounded-full">
                      📰 Notícia
                    </span>
                  )}
                  {/* Opção para admin marcar como notícia */}
                  {isAdmin && !post.isNews && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await updateDoc(doc(db, 'posts', post.id), {
                            isNews: true,
                          })
                        } catch (err) {
                          console.error('Erro ao marcar como notícia:', err)
                          setError('Erro ao marcar como notícia')
                        }
                      }}
                      className="px-2 py-1 text-xs font-semibold bg-accent-orange/20 text-accent-orange rounded hover:bg-accent-orange/30 transition"
                      title="Marcar como notícia"
                    >
                      📰 Notícia
                    </button>
                  )}
                  {(isAuthor || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => deletePost(post.id)}
                      className="text-rose-500 hover:text-rose-600 transition"
                      title={isAdmin && !isAuthor ? "Deletar como admin" : "Deletar post"}
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Imagem do post (base64 ou URL) - Estilo Instagram */}
              {(post.imageBase64 || post.imageUrl) && (
                <div className="w-full bg-background-primary">
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
                  <p className="text-text-primary whitespace-pre-wrap break-words">
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
                    disabled={!hasCourseAccess}
                    className={`flex items-center gap-2 transition ${
                      hasCourseAccess 
                        ? 'hover:opacity-70' 
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                    title={!hasCourseAccess ? 'Você precisa ter acesso a um curso para interagir' : ''}
                  >
                    {isLiked ? (
                      <HeartIcon className="h-6 w-6 text-accent-orange" />
                    ) : (
                      <HeartOutlineIcon className="h-6 w-6 text-text-secondary" />
                    )}
                    <span className="text-sm font-semibold text-text-secondary">
                      {likesCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleComments(post.id)}
                    className="flex items-center gap-2 hover:opacity-70 transition"
                  >
                    <ChatBubbleLeftIcon className="h-6 w-6 text-text-secondary" />
                    <span className="text-sm font-semibold text-text-secondary">
                      {commentsCount}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => sharePost(post.id, post.text)}
                    className="flex items-center gap-2 hover:opacity-70 transition"
                  >
                    <ShareIcon className="h-6 w-6 text-text-secondary" />
                    <span className="text-sm font-semibold text-text-secondary">
                      {sharesCount}
                    </span>
                  </button>
                </div>
              </div>

              {/* Comentários */}
              {showComments && (
                <div className="px-4 pb-4 border-t border-border-primary">
                  <div className="pt-4 space-y-4 max-h-96 overflow-y-auto">
                    {comments.map((comment) => (
                      <div key={comment.id} className="group">
                        <div className="flex gap-3">
                          {comment.authorAvatar ? (
                            <img
                              src={comment.authorAvatar}
                              alt={comment.authorName}
                              className="h-10 w-10 rounded-full object-cover flex-shrink-0 ring-2 ring-accent-cyan/30 group-hover:ring-accent-cyan transition-all"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-accent-orange to-accent-cyan flex items-center justify-center flex-shrink-0 ring-2 ring-accent-cyan/30 group-hover:ring-accent-cyan transition-all shadow-md">
                              <span className="text-background-primary font-bold text-sm">
                                {(comment.authorName || 'U')[0].toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="bg-background-primary rounded-2xl px-4 py-3 group-hover:bg-background-card-hover transition-all">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-bold text-text-primary">
                                  {comment.authorName}
                                </p>
                                <span className="text-xs text-text-secondary">
                                  • {formatDate(comment.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm text-text-secondary leading-relaxed break-words">
                                {comment.text}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {comments.length === 0 && (
                      <div className="text-center py-6">
                        <div className="text-4xl mb-2">💬</div>
                        <p className="text-sm font-medium text-text-secondary">
                          Nenhum comentário ainda
                        </p>
                        <p className="text-xs text-text-secondary mt-1">
                          Seja o primeiro a comentar!
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Input de comentário */}
                  <div className="flex gap-3 mt-4 pt-4 border-t border-border-primary">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.displayName || 'Você'}
                        className="h-10 w-10 rounded-full object-cover flex-shrink-0 ring-2 ring-accent-orange/30"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-accent-orange to-accent-cyan flex items-center justify-center flex-shrink-0 ring-2 ring-accent-orange/30 shadow-md">
                        <span className="text-background-primary font-bold text-sm">
                          {(profile?.displayName || user.email || 'U')[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={commentInputs[post.id] || ''}
                        onChange={(e) => setCommentInputs(prev => ({
                          ...prev,
                          [post.id]: e.target.value
                        }))}
                        onKeyPress={(e) => e.key === 'Enter' && hasCourseAccess && addComment(post.id)}
                        placeholder={hasCourseAccess ? "Escreva um comentário..." : "Você precisa ter acesso a um curso para comentar"}
                        disabled={!hasCourseAccess}
                        className={`w-full rounded-full border-2 border-border-primary bg-background-card px-5 py-3 text-sm focus:border-accent-orange focus:ring-2 focus:ring-accent-orange/20 focus:outline-none transition-all ${
                          !hasCourseAccess ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => addComment(post.id)}
                      disabled={!hasCourseAccess}
                      className={`rounded-full bg-gradient-to-r from-accent-orange to-accent-cyan px-5 py-3 text-sm font-semibold text-background-primary shadow-lg hover:shadow-xl hover:scale-105 transition-all ${
                        hasCourseAccess 
                          ? 'hover:shadow-glow' 
                          : 'opacity-50 cursor-not-allowed'
                      }`}
                      title={!hasCourseAccess ? 'Você precisa ter acesso a um curso para comentar' : ''}
                    >
                      <PaperAirplaneIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
    </div>
  )
}

export default ConCurseiroSocial
