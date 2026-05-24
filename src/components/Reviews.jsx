import { useEffect, useState, startTransition } from 'react'
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { StarIcon } from '@heroicons/react/24/solid'
import { motion, AnimatePresence } from 'framer-motion'

const Reviews = () => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [currentReviewIndex, setCurrentReviewIndex] = useState(0)
  const [formData, setFormData] = useState({
    rating: 0,
    comment: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [hoveredStar, setHoveredStar] = useState(0)

  // Carregar avaliações
  useEffect(() => {
    if (!db) {
      setLoading(false)
      return
    }

    const loadReviews = async () => {
      try {
        const reviewsRef = collection(db, 'reviews')
        const snapshot = await getDocs(reviewsRef)
        const data = snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
          .filter((review) => review.approved !== false)
        
        data.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0)
          const dateB = b.createdAt?.toDate?.() || new Date(0)
          return dateB - dateA
        })
        
        startTransition(() => {
          setReviews(data)
          setLoading(false)
        })
      } catch (error) {
        console.error('[Reviews] Erro ao carregar avaliações:', error)
        setLoading(false)
      }
    }

    loadReviews()
  }, [db])

  // Auto-avançar carrossel mobile
  useEffect(() => {
    if (reviews.length <= 1) return
    
    const timer = setInterval(() => {
      setCurrentReviewIndex((prev) => (prev + 1) % reviews.length)
    }, 5000)
    
    return () => clearInterval(timer)
  }, [reviews.length])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!db || !user || submitting) return

    setSubmitting(true)
    try {
      await addDoc(collection(db, 'reviews'), {
        userId: user.uid,
        userName: profile?.name || user.displayName || 'Aluno',
        rating: formData.rating,
        comment: formData.comment.trim(),
        createdAt: serverTimestamp(),
        approved: false,
      })
      
      setFormData({ rating: 0, comment: '' })
      setShowForm(false)
    } catch (error) {
      console.error('[Reviews] Erro ao enviar avaliação:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const renderStars = (rating = 0, interactive = false, onClick) => {
    return [1, 2, 3, 4, 5].map((star) => {
      const isFilled = star <= rating
      const isHovered = star <= hoveredStar
      
      return (
        <button
          key={star}
          type={interactive ? 'button' : ''}
          onClick={interactive ? () => onClick?.(star) : undefined}
          onMouseEnter={interactive ? () => setHoveredStar(star) : undefined}
          onMouseLeave={interactive ? () => setHoveredStar(0) : undefined}
          disabled={!interactive}
          className={`transition-all duration-200 ${interactive ? 'hover:scale-110' : ''}`}
        >
          <StarIcon
            className={`h-5 w-5 ${
              isFilled || (interactive && isHovered)
                ? 'text-yellow-400 fill-yellow-400'
                : 'text-gray-300'
            }`}
          />
        </button>
      )
    })
  }

  const userHasReviewed = reviews.some(review => review.userId === user?.uid)

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-xl animate-pulse">
            <div className="flex gap-1 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <div key={star} className="h-5 w-5 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
              ))}
            </div>
            <div className="h-24 bg-slate-200 dark:bg-slate-700 rounded-xl mb-4"></div>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24 mb-2"></div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Botão para adicionar avaliação */}
      <div className="text-center">
        <button
          onClick={() => {
            if (!user) {
              navigate('/login')
              return
            }
            setShowForm(!showForm)
          }}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-4 rounded-xl font-bold shadow-xl hover:shadow-2xl transition-all hover:scale-105"
        >
          <StarIcon className="h-5 w-5" />
          {user ? 'Deixar sua avaliação' : 'Avaliar como aluno'}
        </button>
        {!user && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
            Crie sua conta gratuita e compartilhe sua experiência
          </p>
        )}
      </div>

      {/* Formulário de avaliação */}
      <AnimatePresence>
        {showForm && user && !userHasReviewed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white dark:bg-slate-800 rounded-3xl p-8 shadow-2xl border border-slate-200 dark:border-slate-700"
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
                  Sua avaliação
                </label>
                <div className="flex gap-2 justify-center">
                  {renderStars(formData.rating, true, (rating) => 
                    setFormData(prev => ({ ...prev, rating }))
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
                  Seu comentário
                </label>
                <textarea
                  value={formData.comment}
                  onChange={(e) => setFormData(prev => ({ ...prev, comment: e.target.value }))}
                  placeholder="Compartilhe sua experiência com a plataforma..."
                  rows={4}
                  className="w-full rounded-2xl border-2 border-slate-300 dark:border-slate-600 p-4 text-base focus:border-purple-500 focus:outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 transition-all resize-none"
                  disabled={submitting}
                />
              </div>
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={submitting || formData.rating === 0 || !formData.comment.trim()}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-2xl px-8 py-4 font-bold hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Enviando...' : 'Enviar avaliação'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-8 py-4 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-2xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista de avaliações */}
      {reviews.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700">
          <StarIcon className="h-16 w-16 mx-auto mb-4 text-slate-400" />
          <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300 mb-2">
            Nenhuma avaliação ainda
          </h3>
          <p className="text-slate-500 dark:text-slate-400">
            Seja o primeiro a compartilhar sua experiência!
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review, index) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 border border-slate-200 dark:border-slate-700 group"
            >
              <div className="flex gap-1 mb-4">
                {renderStars(review.rating)}
              </div>
              <p className="text-slate-700 dark:text-slate-300 mb-6 leading-relaxed line-clamp-4 min-h-[5rem] italic">
                "{review.comment}"
              </p>
              <div className="flex items-center gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="h-14 w-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg shadow-lg ring-2 ring-slate-200 dark:ring-slate-700 group-hover:ring-purple-500 transition-all">
                  {(review.userName || 'A')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                    {review.userName || 'Aluno'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {review.createdAt?.toDate?.().toLocaleDateString('pt-BR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    }) || 'Recentemente'}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Reviews
