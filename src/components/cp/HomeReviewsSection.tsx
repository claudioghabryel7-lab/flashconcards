'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { db } from '@/firebase/config'

type Review = {
  id: string
  userName?: string
  rating?: number
  comment?: string
  approved?: boolean
  createdAt?: { toDate?: () => Date }
}

/**
 * Comentários públicos aprovados (mesma coleção `reviews` da aba Avaliações do admin).
 * Só aparece se houver pelo menos um comentário aprovado.
 */
export default function HomeReviewsSection() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!db) {
        setLoading(false)
        return
      }
      try {
        const reviewsRef = collection(db, 'reviews')
        let rows: Review[] = []
        try {
          const q = query(reviewsRef, where('approved', '==', true), limit(24))
          const snap = await getDocs(q)
          rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Review, 'id'>) }))
        } catch {
          const snap = await getDocs(reviewsRef)
          rows = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Review, 'id'>) }))
            .filter((r) => r.approved === true)
        }

        rows = rows
          .filter((r) => String(r.comment || '').trim().length > 0)
          .sort((a, b) => {
            const da = a.createdAt?.toDate?.()?.getTime?.() || 0
            const dbTs = b.createdAt?.toDate?.()?.getTime?.() || 0
            return dbTs - da
          })
          .slice(0, 12)

        if (!cancelled) setReviews(rows)
      } catch (err) {
        console.error('[HomeReviewsSection]', err)
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
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="relative mt-16 overflow-hidden rounded-2xl border border-cp-border/70 bg-cp-surface/40 p-6 sm:mt-20 sm:p-10"
    >
      <div className="pointer-events-none absolute -left-16 top-0 h-40 w-40 rounded-full bg-cp-accent/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 right-0 h-48 w-48 rounded-full bg-cp-accent2/10 blur-3xl" />

      <div className="relative text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cp-accent">Avaliações</p>
        <h2 className="mt-2 text-xl font-medium text-cp-text sm:text-2xl">
          O que os alunos estão dizendo
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-cp-muted">
          Comentários aprovados no painel administrativo — só aparecem quando há avaliações públicas.
        </p>
      </div>

      <div className="relative mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review, idx) => {
          const rating = Math.min(5, Math.max(0, Number(review.rating) || 0))
          return (
            <motion.article
              key={review.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: Math.min(idx * 0.05, 0.3) }}
              className="rounded-2xl border border-cp-border/60 bg-cp-bg/50 p-5 text-left"
            >
              <div className="mb-3 flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-4 w-4 ${
                      i < rating ? 'fill-amber-400 text-amber-400' : 'text-cp-muted/40'
                    }`}
                  />
                ))}
              </div>
              <p className="text-sm leading-relaxed text-cp-text">“{review.comment}”</p>
              <p className="mt-4 text-xs font-semibold text-cp-muted">
                {review.userName || 'Aluno'}
              </p>
            </motion.article>
          )
        })}
      </div>
    </motion.section>
  )
}
