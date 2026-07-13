'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { Star } from 'lucide-react'
import toast from 'react-hot-toast'
import { db } from '@/firebase/config'
import { useAuth } from '@/hooks/useAuth'

const DELAY_MS = 3 * 60 * 1000
const LATER_KEY = (uid) => `cp_course_review_later_${uid}`
const SKIP_PATHS = [
  '/',
  '/login',
  '/register',
  '/cadastro',
  '/pagamento',
  '/payment',
  '/recuperar-senha',
  '/verify-email',
  '/select-course',
]

function shouldSkipPath(pathname) {
  if (!pathname) return true
  if (SKIP_PATHS.includes(pathname)) return true
  if (pathname.startsWith('/admin')) return true
  if (pathname.startsWith('/landing')) return true
  return false
}

async function userAlreadyReviewed(userId) {
  if (!db || !userId) return true
  try {
    const q = query(collection(db, 'reviews'), where('userId', '==', userId), limit(1))
    const snap = await getDocs(q)
    return !snap.empty
  } catch {
    try {
      const snap = await getDocs(collection(db, 'reviews'))
      return snap.docs.some((d) => d.data()?.userId === userId)
    } catch {
      return false
    }
  }
}

/**
 * Pop-up de avaliação do curso após 3 min de uso.
 * "Avaliar depois" → some nesta sessão e só volta no próximo login.
 * Avaliação entra pendente (approved: false) para o admin em Avaliações.
 */
export default function CourseReviewPrompt() {
  const { user, profile, isAdmin } = useAuth()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const [resolvedCourseName, setResolvedCourseName] = useState('seu curso')
  const timerRef = useRef(null)

  const courseId = profile?.selectedCourseId || null

  useEffect(() => {
    if (!courseId || !db) {
      setResolvedCourseName('seu curso')
      return undefined
    }
    let cancelled = false
    ;(async () => {
      try {
        const snap = await getDoc(doc(db, 'courses', courseId))
        if (cancelled) return
        const name = snap.exists() ? snap.data()?.name || snap.data()?.title : null
        setResolvedCourseName(name || 'seu curso')
      } catch {
        if (!cancelled) setResolvedCourseName('seu curso')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [courseId])

  const dismissForThisLogin = useCallback(() => {
    if (!user?.uid || typeof window === 'undefined') return
    try {
      sessionStorage.setItem(LATER_KEY(user.uid), '1')
    } catch {
      /* ignore */
    }
    setOpen(false)
    setReady(false)
  }, [user?.uid])

  // Limpa o "avaliar depois" ao deslogar (próximo login pode mostrar de novo)
  useEffect(() => {
    if (user?.uid) return undefined
    if (typeof window === 'undefined') return undefined
    try {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith('cp_course_review_later_'))
        .forEach((k) => sessionStorage.removeItem(k))
    } catch {
      /* ignore */
    }
    setOpen(false)
    setReady(false)
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    return undefined
  }, [user?.uid])

  // Agenda o pop-up uma vez por login (não reinicia a cada rota)
  useEffect(() => {
    if (!user?.uid || !db || isAdmin) return undefined

    let cancelled = false

    ;(async () => {
      try {
        const later =
          typeof window !== 'undefined' && sessionStorage.getItem(LATER_KEY(user.uid)) === '1'
        if (later) return

        const already = await userAlreadyReviewed(user.uid)
        if (cancelled || already) return

        timerRef.current = window.setTimeout(() => {
          if (!cancelled) setReady(true)
        }, DELAY_MS)
      } catch {
        /* ignore */
      }
    })()

    return () => {
      cancelled = true
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [user?.uid, isAdmin])

  // Abre quando o timer dispara e a rota atual permite
  useEffect(() => {
    if (!ready || !user?.uid || isAdmin) {
      setOpen(false)
      return
    }
    if (shouldSkipPath(pathname)) {
      setOpen(false)
      return
    }
    try {
      if (sessionStorage.getItem(LATER_KEY(user.uid)) === '1') {
        setOpen(false)
        return
      }
    } catch {
      /* ignore */
    }
    setOpen(true)
  }, [ready, pathname, user?.uid, isAdmin])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user || !db || sending) return
    if (rating < 1) {
      toast.error('Escolha de 1 a 5 estrelas.')
      return
    }
    if (!comment.trim()) {
      toast.error('Escreva um comentário curto.')
      return
    }

    setSending(true)
    try {
      await addDoc(collection(db, 'reviews'), {
        userId: user.uid,
        userName: profile?.displayName || profile?.name || user.displayName || 'Aluno',
        userEmail: user.email || profile?.email || null,
        rating,
        comment: comment.trim(),
        courseId: courseId || null,
        courseName: resolvedCourseName || null,
        approved: false,
        source: 'in_app_prompt',
        createdAt: serverTimestamp(),
      })
      toast.success('Avaliação enviada! Fica pendente até o admin aprovar.')
      setOpen(false)
      setReady(false)
      try {
        sessionStorage.setItem(LATER_KEY(user.uid), '1')
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.error('[CourseReviewPrompt]', err)
      toast.error('Não foi possível enviar. Tente de novo.')
    } finally {
      setSending(false)
    }
  }

  if (!open || !user) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="course-review-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-cp-border bg-cp-bg shadow-2xl">
        <div className="border-b border-cp-border px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-cp-accent">
            Sua opinião importa
          </p>
          <h2 id="course-review-title" className="mt-1 text-lg font-semibold text-cp-text">
            Avalie {resolvedCourseName}
          </h2>
          <p className="mt-1 text-sm text-cp-muted">
            Leva menos de um minuto. Após enviar, a avaliação passa pela aprovação do admin.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <p className="mb-2 text-sm font-medium text-cp-text">Nota</p>
            <div className="flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => {
                const filled = star <= (hovered || rating)
                return (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHovered(star)}
                    onMouseLeave={() => setHovered(0)}
                    className="rounded-lg p-1 transition hover:scale-110"
                    aria-label={`${star} estrela${star > 1 ? 's' : ''}`}
                  >
                    <Star
                      className={`h-8 w-8 ${
                        filled ? 'fill-amber-400 text-amber-400' : 'text-cp-muted/35'
                      }`}
                    />
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label htmlFor="course-review-comment" className="mb-2 block text-sm font-medium text-cp-text">
              Comentário
            </label>
            <textarea
              id="course-review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={800}
              placeholder="O que está gostando? O que podemos melhorar?"
              className="w-full resize-none rounded-xl border border-cp-border bg-cp-surface/40 px-3 py-2.5 text-sm text-cp-text outline-none transition focus:border-cp-accent"
              disabled={sending}
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={dismissForThisLogin}
              disabled={sending}
              className="rounded-xl border border-cp-border px-4 py-2.5 text-sm font-semibold text-cp-muted transition hover:bg-cp-surface hover:text-cp-text disabled:opacity-50"
            >
              Avaliar depois
            </button>
            <button
              type="submit"
              disabled={sending || rating < 1 || !comment.trim()}
              className="rounded-xl bg-cp-accent px-4 py-2.5 text-sm font-semibold text-cp-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? 'Enviando...' : 'Enviar avaliação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
