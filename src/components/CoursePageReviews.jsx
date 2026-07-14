import { useEffect, useState } from 'react'
import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { Star } from 'lucide-react'
import { db } from '../firebase/config'
import { fetchActiveMockReviewsForPublic } from '../services/mockReviewsService'

/**
 * Avaliações na página do curso: mocados ativos (com foto) + reais aprovados.
 */
export default function CoursePageReviews({ title = 'O que os alunos dizem' }) {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!db) {
        setLoading(false)
        return
      }
      try {
        let real = []
        try {
          const q = query(collection(db, 'reviews'), where('approved', '==', true), limit(24))
          const snap = await getDocs(q)
          real = snap.docs.map((d) => ({ id: d.id, ...d.data(), isMock: false }))
        } catch {
          const snap = await getDocs(collection(db, 'reviews'))
          real = snap.docs
            .map((d) => ({ id: d.id, ...d.data(), isMock: false }))
            .filter((r) => r.approved === true)
        }

        real = real.filter((r) => String(r.comment || '').trim().length > 0)

        let mocks = []
        try {
          const rows = await fetchActiveMockReviewsForPublic()
          mocks = rows.map((r) => ({
            id: `mock-${r.id}`,
            userName: r.userName,
            comment: r.comment,
            rating: r.rating,
            photoUrl: r.photoUrl,
            isMock: true,
            createdAt: r.createdAt,
          }))
        } catch (err) {
          console.warn('[CoursePageReviews] mocks:', err)
        }

        const merged = [...mocks, ...real]
          .sort((a, b) => {
            const da = a.createdAt?.toDate?.()?.getTime?.() || a.createdAt?.toMillis?.() || 0
            const dbTs = b.createdAt?.toDate?.()?.getTime?.() || b.createdAt?.toMillis?.() || 0
            return dbTs - da
          })
          .slice(0, 9)

        if (!cancelled) setReviews(merged)
      } catch (err) {
        console.error('[CoursePageReviews]', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading || reviews.length === 0) return null

  return (
    <section className="mt-8 space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-cp-accent">Avaliações</p>
          <h2 className="mt-1 text-lg font-bold text-cp-text sm:text-xl">{title}</h2>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review) => {
          const rating = Math.min(5, Math.max(0, Number(review.rating) || 0))
          const initial = String(review.userName || 'A').trim().charAt(0).toUpperCase()
          return (
            <article
              key={review.id}
              className="rounded-2xl border border-cp-border/70 bg-cp-surface/60 p-4 backdrop-blur-sm"
            >
              <div className="mb-3 flex items-center gap-3">
                {review.photoUrl ? (
                  <img
                    src={review.photoUrl}
                    alt=""
                    className="h-11 w-11 rounded-full object-cover ring-2 ring-cp-accent/30"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cp-accent/15 text-sm font-bold text-cp-accent">
                    {initial}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-cp-text">
                    {review.userName || 'Aluno'}
                  </p>
                  <div className="mt-0.5 flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3.5 w-3.5 ${
                          i < rating ? 'fill-amber-400 text-amber-400' : 'text-cp-muted/35'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-cp-muted">“{review.comment}”</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}
