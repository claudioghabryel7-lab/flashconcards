import { useEffect, useState } from 'react'
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { StarIcon } from '@heroicons/react/24/solid'
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline'
import { motion, AnimatePresence } from 'framer-motion'

const Reviews = () => {
  const { user, profile } = useAuth()
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
    const reviewsRef = collection(db, 'reviews')
    
    const unsub = onSnapshot(reviewsRef, (snapshot) => {
      const data = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter((review) => review.approved !== false) // Filtrar apenas aprovadas
      
      // Ordenar manualmente por data (mais recente primeiro)
      data.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0)
        const dateB = b.createdAt?.toDate?.() || new Date(0)
        return dateB - dateA
      })
      
      setReviews(data)
      setLoading(false)
    }, (error) => {
      console.error('Erro ao carregar avaliações:', error)
      setReviews([])
      setLoading(false)
    })

    return () => unsub()
  }, [])

  // Verificar se usuário já avaliou
  const userHasReviewed = user && reviews.some(r => r.userId === user.uid)

  // Auto-play do carrossel de avaliações
  useEffect(() => {
    if (reviews.length <= 1) return

    const timer = setInterval(() => {
      setCurrentReviewIndex((prev) => (prev + 1) % reviews.length)
    }, 6000) // 6 segundos por avaliação

    return () => clearInterval(timer)
  }, [reviews.length])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!user) {
      alert('Você precisa estar logado para avaliar.')
      return
    }

    if (formData.rating === 0) {
      alert('Por favor, selecione uma avaliação com estrelas.')
      return
    }

    if (!formData.comment.trim()) {
      alert('Por favor, escreva um comentário.')
      return
    }

    setSubmitting(true)
    try {
      await addDoc(collection(db, 'reviews'), {
        userId: user.uid,
        userName: profile?.displayName || user.email,
        userEmail: user.email,
        rating: formData.rating,
        comment: formData.comment.trim(),
        approved: false, // Admin precisa aprovar
        createdAt: serverTimestamp(),
      })

      setFormData({ rating: 0, comment: '' })
      setShowForm(false)
      alert('Avaliação enviada! Ela será publicada após aprovação do administrador.')
    } catch (err) {
      console.error('Erro ao enviar avaliação:', err)
      alert('Erro ao enviar avaliação. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const renderStars = (rating, interactive = false, onStarClick = null) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = interactive 
            ? star <= (hoveredStar || formData.rating)
            : star <= rating
          
          const StarComponent = isFilled ? StarIcon : StarOutlineIcon
          
          return (
            <button
              key={star}
              type={interactive ? "button" : undefined}
              onClick={interactive && onStarClick ? () => onStarClick(star) : undefined}
              onMouseEnter={interactive ? () => setHoveredStar(star) : undefined}
              onMouseLeave={interactive ? () => setHoveredStar(0) : undefined}
              disabled={!interactive || submitting}
              className={interactive ? "cursor-pointer transition-transform hover:scale-110" : ""}
            >
              <StarComponent
                className={`h-5 w-5 ${
                  isFilled ? 'text-yellow-400' : 'text-gray-300'
                }`}
              />
            </button>
          )
        })}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-48 bg-slate-100 animate-pulse rounded-2xl" />
      </div>
    )
  }

  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0

  const currentReview = reviews[currentReviewIndex]

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-alego-700 dark:text-alego-300">
            Avaliações dos Alunos
          </h2>
          {reviews.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              {renderStars(Math.round(averageRating))}
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {averageRating.toFixed(1)} ({reviews.length} {reviews.length === 1 ? 'avaliação' : 'avaliações'})
              </span>
            </div>
          )}
        </div>
        {user && !userHasReviewed && (
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="rounded-full bg-alego-600 px-4 py-2 text-sm font-semibold text-white hover:bg-alego-700 transition"
          >
            {showForm ? 'Cancelar' : 'Avaliar'}
          </button>
        )}
      </div>

      {/* Formulário de avaliação */}
      {showForm && user && !userHasReviewed && (
        <form onSubmit={handleSubmit} className="rounded-2xl border-2 border-alego-200 dark:border-alego-700 p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Sua avaliação
            </label>
            {renderStars(0, true, (rating) => setFormData(prev => ({ ...prev, rating })))}
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Seu comentário
            </label>
            <textarea
              value={formData.comment}
              onChange={(e) => setFormData(prev => ({ ...prev, comment: e.target.value }))}
              placeholder="Compartilhe sua experiência com a mentoria..."
              rows={4}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 p-3 text-sm focus:border-alego-500 focus:outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              disabled={submitting}
            />
          </div>
          <button
            type="submit"
            disabled={submitting || formData.rating === 0 || !formData.comment.trim()}
            className="rounded-full bg-alego-600 px-6 py-2 text-sm font-semibold text-white hover:bg-alego-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Enviando...' : 'Enviar Avaliação'}
          </button>
        </form>
      )}

      {/* Carrossel de Avaliações */}
      {reviews.length === 0 ? (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <p>Nenhuma avaliação ainda. Seja o primeiro a avaliar!</p>
        </div>
      ) : (
        <div className="relative">
          {/* Carrossel */}
          <div className="relative w-full overflow-hidden rounded-xl shadow-md" style={{ height: '180px' }}>
            <AnimatePresence mode="wait">
              {currentReview && (
                <motion.div
                  key={currentReview.id}
                  initial={{ opacity: 0, x: 300 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -300 }}
                  transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                  className="absolute inset-0 p-6 bg-gradient-to-br from-alego-50 via-white to-alego-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900 border border-alego-200 dark:border-alego-700 rounded-xl"
                >
                  <div className="flex flex-col items-center text-center space-y-3 h-full justify-center">
                    {/* Estrelas */}
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <StarIcon
                          key={star}
                          className={`h-5 w-5 ${
                            star <= currentReview.rating ? 'text-yellow-400' : 'text-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                    
                    {/* Comentário */}
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 max-w-2xl leading-relaxed line-clamp-3">
                      "{currentReview.comment}"
                    </p>
                    
                    {/* Autor e Data */}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-alego-500 to-alego-600 flex items-center justify-center text-white font-semibold text-sm">
                        {(currentReview.userName || 'A')[0].toUpperCase()}
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {currentReview.userName || 'Aluno'}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {currentReview.createdAt?.toDate?.().toLocaleDateString('pt-BR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric'
                          }) || 'Data não disponível'}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Botões de navegação */}
            {reviews.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setCurrentReviewIndex((prev) => (prev - 1 + reviews.length) % reviews.length)}
                  className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-white/90 hover:bg-white dark:bg-slate-800/90 dark:hover:bg-slate-800 rounded-full p-1.5 shadow-md transition z-10"
                  aria-label="Avaliação anterior"
                >
                  <svg className="w-5 h-5 text-gray-800 dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentReviewIndex((prev) => (prev + 1) % reviews.length)}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-white/90 hover:bg-white dark:bg-slate-800/90 dark:hover:bg-slate-800 rounded-full p-1.5 shadow-md transition z-10"
                  aria-label="Próxima avaliação"
                >
                  <svg className="w-5 h-5 text-gray-800 dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}

            {/* Indicadores */}
            {reviews.length > 1 && (
              <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex gap-1.5 z-10">
                {reviews.map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setCurrentReviewIndex(index)}
                    className={`h-1.5 rounded-full transition-all ${
                      index === currentReviewIndex
                        ? 'w-6 bg-alego-600 dark:bg-alego-400'
                        : 'w-1.5 bg-white/50 dark:bg-slate-400/50 hover:bg-white/75 dark:hover:bg-slate-400/75'
                    }`}
                    aria-label={`Ir para avaliação ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Reviews

