import { useEffect, useState } from 'react'
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
} from 'firebase/firestore'
import {
  HeartIcon,
  ChatBubbleLeftIcon,
  PaperAirplaneIcon,
  TrashIcon,
} from '@heroicons/react/24/solid'
import { HeartIcon as HeartOutlineIcon } from '@heroicons/react/24/outline'
import { auth, db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'

const SocialFeed = () => {
  const { user, profile } = useAuth()
  const { darkMode } = useDarkMode()
  const [posts, setPosts] = useState([])
  const [newPost, setNewPost] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [commentInputs, setCommentInputs] = useState({}) // { postId: commentText }
  const [expandedComments, setExpandedComments] = useState({}) // { postId: true/false }

  // Carregar posts
  useEffect(() => {
    if (!user) {
      setPosts([])
      return () => {}
    }
    
    const postsRef = collection(db, 'posts')
    let unsubscribe = null
    
    // Função para tentar carregar posts
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
            setPosts(data)
            setError('') // Limpar erro se conseguir carregar
          },
          (error) => {
            console.error('Erro ao carregar posts:', error)
            
            // Se der erro de índice e ainda não tentamos sem orderBy, tentar novamente
            if (error.code === 'failed-precondition' && useOrderBy) {
              console.warn('Índice do Firestore não criado. Usando query sem orderBy.')
              tryLoadPosts(false)
              return
            }
            
            // Se for erro de permissão, dar mensagem específica
            if (error.code === 'permission-denied' || error.message?.includes('permission') || error.message?.includes('Missing or insufficient')) {
              setError('Erro de permissão. Verifique se você está autenticado e se as regras do Firestore foram atualizadas. Atualize as regras no Firebase Console.')
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
    
    // Tentar carregar com orderBy primeiro
    tryLoadPosts(true)
    
    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [user])

  // Criar novo post
  const createPost = async () => {
    if (!newPost.trim() || !user || sending) return
    
    // Verificar se o usuário está realmente autenticado
    const currentUser = auth.currentUser
    if (!currentUser) {
      setError('Você precisa estar autenticado para criar posts. Faça login novamente.')
      return
    }
    
    // Forçar atualização do token de autenticação
    try {
      await currentUser.getIdToken(true) // true = força refresh
    } catch (tokenErr) {
      console.error('Erro ao atualizar token:', tokenErr)
      setError('Erro de autenticação. Faça logout e login novamente.')
      return
    }
    
    setSending(true)
    setError('')
    try {
      // Verificar qual projeto está sendo usado
      console.log('🔥 Projeto Firestore:', db.app.options.projectId)
      console.log('🔥 Usuário autenticado:', {
        uid: currentUser.uid,
        email: currentUser.email,
        token: await currentUser.getIdToken().then(t => t.substring(0, 20) + '...')
      })
      
      const postsRef = collection(db, 'posts')
      const postData = {
        text: newPost.trim(),
        authorId: currentUser.uid,
        authorName: profile?.displayName || currentUser.email || 'Usuário',
        authorEmail: currentUser.email || '',
        likes: [],
        comments: [],
        createdAt: serverTimestamp(),
      }
      
      console.log('🔥 Tentando criar post no projeto:', db.app.options.projectId)
      console.log('🔥 Dados do post:', postData)
      
      await addDoc(postsRef, postData)
      console.log('Post criado com sucesso!')
      setNewPost('')
      setError('')
    } catch (err) {
      console.error('Erro ao criar post:', err)
      console.error('Código do erro:', err.code)
      console.error('Mensagem completa:', err.message)
      console.error('Usuário atual:', currentUser?.uid, currentUser?.email)
      
      if (err.code === 'permission-denied') {
        setError('Erro de permissão. As regras do Firestore precisam ser atualizadas no Firebase Console. Certifique-se de que: 1) As regras foram publicadas, 2) Você aguardou 30 segundos após publicar, 3) Recarregou a página completamente.')
      } else {
        setError(`Erro ao publicar: ${err.message || 'Erro desconhecido'}`)
      }
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
          : [...likes, user.uid]
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
      
      await updateDoc(postRef, {
        comments: [...currentComments, {
          id: Date.now().toString(),
          text: commentText.trim(),
          authorId: user.uid,
          authorName: profile?.displayName || user.email || 'Usuário',
          createdAt: serverTimestamp(),
        }]
      })
      
      setCommentInputs(prev => ({ ...prev, [postId]: '' }))
    } catch (err) {
      console.error('Erro ao comentar:', err)
      setError(`Erro ao comentar: ${err.message || 'Erro desconhecido'}`)
    }
  }

  // Deletar post (apenas o autor)
  const deletePost = async (postId) => {
    if (!window.confirm('Deseja realmente excluir este post?')) return
    
    try {
      await deleteDoc(doc(db, 'posts', postId))
    } catch (err) {
      console.error('Erro ao deletar post:', err)
    }
  }

  // Toggle comentários
  const toggleComments = (postId) => {
    setExpandedComments(prev => ({
      ...prev,
      [postId]: !prev[postId]
    }))
  }

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-lg font-semibold text-alego-600">Faça login para ver o feed</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 px-2 sm:px-0">
      <div 
        className="rounded-2xl p-6 shadow-sm"
        style={{
          backgroundColor: darkMode ? '#1e293b' : '#ffffff',
          color: darkMode ? '#f1f5f9' : '#1e293b'
        }}
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-alego-700 dark:text-alego-300">
          Feed Social
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Compartilhe suas conquistas e motivações com outros alunos!
        </p>
      </div>

      {/* Criar novo post */}
      <div 
        className="rounded-2xl p-6 shadow-sm"
        style={{
          backgroundColor: darkMode ? '#1e293b' : '#ffffff',
          color: darkMode ? '#f1f5f9' : '#1e293b'
        }}
      >
        {error && (
          <div className="mb-4 rounded-xl bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}
        <div className="flex gap-3">
          <div className="flex-1">
            <textarea
              value={newPost}
              onChange={(e) => {
                setNewPost(e.target.value)
                setError('') // Limpar erro ao digitar
              }}
              placeholder="O que você está estudando hoje? Compartilhe sua motivação!"
              rows={3}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-sm focus:border-alego-400 focus:outline-none resize-none"
            />
          </div>
          <button
            type="button"
            onClick={createPost}
            disabled={!newPost.trim() || sending}
            className="flex items-center gap-2 rounded-xl bg-alego-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50 self-end hover:bg-alego-700 transition"
          >
            <PaperAirplaneIcon className="h-5 w-5" />
            {sending ? 'Publicando...' : 'Publicar'}
          </button>
        </div>
      </div>

      {/* Lista de posts */}
      <div className="space-y-4">
        {posts.length === 0 && (
          <div 
            className="rounded-2xl p-8 text-center shadow-sm"
            style={{
              backgroundColor: darkMode ? '#1e293b' : '#ffffff',
              color: darkMode ? '#f1f5f9' : '#1e293b'
            }}
          >
            <p className="text-slate-500 dark:text-slate-400">
              Nenhum post ainda. Seja o primeiro a compartilhar!
            </p>
          </div>
        )}

        {posts.map((post) => {
          const isLiked = post.likes?.includes(user.uid) || false
          const likesCount = post.likes?.length || 0
          const comments = post.comments || []
          const isAuthor = post.authorId === user.uid
          const showComments = expandedComments[post.id]

          return (
            <div
              key={post.id}
              className="rounded-2xl p-6 shadow-sm"
              style={{
                backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                color: darkMode ? '#f1f5f9' : '#1e293b'
              }}
            >
              {/* Header do post */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-alego-700 dark:text-alego-300">
                    {post.authorName || post.authorEmail}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {post.createdAt?.toDate?.().toLocaleString('pt-BR') || 'Agora'}
                  </p>
                </div>
                {isAuthor && (
                  <button
                    type="button"
                    onClick={() => deletePost(post.id)}
                    className="text-rose-500 hover:text-rose-600"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                )}
              </div>

              {/* Conteúdo do post */}
              <p className="mb-4 text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {post.text}
              </p>

              {/* Ações */}
              <div className="flex items-center gap-4 border-t border-slate-200 dark:border-slate-700 pt-3">
                <button
                  type="button"
                  onClick={() => toggleLike(post.id, post.likes)}
                  className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-rose-500"
                >
                  {isLiked ? (
                    <HeartIcon className="h-5 w-5 text-rose-500" />
                  ) : (
                    <HeartOutlineIcon className="h-5 w-5" />
                  )}
                  <span className="text-sm font-semibold">{likesCount}</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleComments(post.id)}
                  className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-alego-500"
                >
                  <ChatBubbleLeftIcon className="h-5 w-5" />
                  <span className="text-sm font-semibold">{comments.length}</span>
                </button>
              </div>

              {/* Comentários */}
              {showComments && (
                <div className="mt-4 space-y-3 border-t border-slate-200 dark:border-slate-700 pt-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                      <p className="text-xs font-semibold text-alego-600 dark:text-alego-400 mb-1">
                        {comment.authorName || comment.authorEmail}
                      </p>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {comment.text}
                      </p>
                    </div>
                  ))}

                  {/* Input de comentário */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={commentInputs[post.id] || ''}
                      onChange={(e) => setCommentInputs(prev => ({
                        ...prev,
                        [post.id]: e.target.value
                      }))}
                      onKeyPress={(e) => e.key === 'Enter' && addComment(post.id)}
                      placeholder="Escreva um comentário..."
                      className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:border-alego-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => addComment(post.id)}
                      className="rounded-lg bg-alego-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default SocialFeed

