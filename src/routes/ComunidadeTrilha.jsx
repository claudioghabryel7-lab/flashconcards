import { useEffect, useMemo, useState } from 'react'
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
import { Heart, MessageCircle, Sparkles } from 'lucide-react'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import UserAvatar from '../components/UserAvatar'
import { CPPageHeader } from '@/components/cp/CPPageLayout'
import toast from 'react-hot-toast'

const MODALITY_LABELS = {
  teoria: 'Teoria',
  revisao: 'Revisão',
  exercicios: 'Exercícios',
  'lei-seca': 'Lei seca',
}

export default function ComunidadeTrilha() {
  const { user, profile } = useAuth()
  const [posts, setPosts] = useState([])
  const [commentInputs, setCommentInputs] = useState({})
  const [expandedComments, setExpandedComments] = useState({})
  const todayKey = dayjs().format('YYYY-MM-DD')

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
    return [...byUser.values()].sort((a, b) => b.totalMinutes - a.totalMinutes).slice(0, 8)
  }, [posts, todayKey])

  const toggleLike = async (postId, likes = []) => {
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
  }

  const addComment = async (postId) => {
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
    } catch {
      toast.error('Erro ao comentar.')
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-10">
      <CPPageHeader
        badge="Comunidade"
        title="Destaques de estudo"
        subtitle="Veja quem estudou hoje, curta e comente os registros da Trilha."
        backHref="/dashboard"
      />

      {dailyHighlights.length > 0 && (
        <div className="cp-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-cp-accent" />
            <h2 className="font-semibold text-cp-text">Destaques de hoje</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-1">
            {dailyHighlights.map((h) => (
              <Link
                key={h.authorId}
                to={`/profile/${h.authorId}`}
                className="flex min-w-[88px] flex-col items-center gap-2 rounded-2xl border border-cp-border bg-cp-surface p-3 transition hover:border-cp-accent/30"
              >
                <UserAvatar photoBase64={h.authorPhotoBase64} name={h.authorName} size="md" />
                <p className="max-w-[80px] truncate text-center text-xs font-medium text-cp-text">
                  {h.authorName}
                </p>
                <p className="font-mono text-[10px] text-cp-accent">{h.totalMinutes} min</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {posts.length === 0 && (
          <div className="cp-card p-8 text-center text-sm text-cp-muted">
            Nenhuma publicação ainda. Registre um bloco na{' '}
            <Link to="/trilha" className="text-cp-accent underline">
              Trilha
            </Link>{' '}
            para aparecer aqui.
          </div>
        )}

        {posts.map((post) => {
          const liked = post.likes?.includes(user?.uid)
          const modality = MODALITY_LABELS[post.modalidade] || post.modalidade
          const isToday = post.featuredDate === todayKey

          return (
            <article key={post.id} className="cp-card p-5">
              <div className="flex items-start gap-3">
                <Link to={`/profile/${post.authorId}`}>
                  <UserAvatar photoBase64={post.authorPhotoBase64} name={post.authorName} size="sm" />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/profile/${post.authorId}`}
                      className="font-medium text-cp-text hover:text-cp-accent"
                    >
                      {post.authorName}
                    </Link>
                    {isToday && (
                      <span className="rounded-full bg-cp-accent/15 px-2 py-0.5 font-mono text-[10px] text-cp-accent">
                        destaque hoje
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-cp-text">
                    Estudou <strong>{post.materia || 'matéria'}</strong>
                    {post.assunto ? ` — ${post.assunto}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-cp-muted">
                    {modality} · {post.durationMinutes || 0} min
                    {post.acertos != null ? ` · ${post.acertos} acertos, ${post.erros || 0} erros` : ''}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-4 border-t border-cp-border pt-3">
                <button
                  type="button"
                  onClick={() => toggleLike(post.id, post.likes)}
                  className={`inline-flex items-center gap-1.5 text-sm transition ${
                    liked ? 'text-rose-400' : 'text-cp-muted hover:text-cp-text'
                  }`}
                >
                  <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
                  {post.likesCount || post.likes?.length || 0}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedComments((prev) => ({ ...prev, [post.id]: !prev[post.id] }))
                  }
                  className="inline-flex items-center gap-1.5 text-sm text-cp-muted hover:text-cp-text"
                >
                  <MessageCircle className="h-4 w-4" />
                  {post.commentsCount || post.comments?.length || 0}
                </button>
              </div>

              {expandedComments[post.id] && (
                <div className="mt-3 space-y-2 border-t border-cp-border pt-3">
                  {(post.comments || []).map((c) => (
                    <div key={c.id} className="flex gap-2 text-sm">
                      <UserAvatar photoBase64={c.authorPhotoBase64} name={c.authorName} size="xs" />
                      <div>
                        <p className="font-medium text-cp-text">{c.authorName}</p>
                        <p className="text-cp-muted">{c.text}</p>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      value={commentInputs[post.id] || ''}
                      onChange={(e) =>
                        setCommentInputs((prev) => ({ ...prev, [post.id]: e.target.value }))
                      }
                      placeholder="Comentar..."
                      className="flex-1 rounded-xl border border-cp-border bg-cp-surface px-3 py-2 text-sm text-cp-text outline-none"
                      onKeyDown={(e) => e.key === 'Enter' && addComment(post.id)}
                    />
                    <button type="button" onClick={() => addComment(post.id)} className="cp-btn-ghost !text-xs">
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
