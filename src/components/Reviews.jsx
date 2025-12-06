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

  // Auto-play do carrossel de avaliações (todas as telas)
  useEffect(() => {
    if (reviews.length === 0) return

    const timer = setInterval(() => {
      setCurrentReviewIndex((prev) => (prev + 1) % reviews.length)
    }, 5000) // 5 segundos por avaliação

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-alego-700 dark:text-alego-300 mb-2">
            ⭐ Avaliações dos Alunos
          </h2>
          {reviews.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {renderStars(Math.round(averageRating))}
                <span className="text-lg font-bold text-alego-600 dark:text-alego-400 ml-1">
                  {averageRating.toFixed(1)}
                </span>
              </div>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                ({reviews.length} {reviews.length === 1 ? 'avaliação' : 'avaliações'})
              </span>
            </div>
          )}
        </div>
        {user && !userHasReviewed && (
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="rounded-xl bg-gradient-to-r from-alego-600 to-alego-700 px-6 py-3 text-sm font-bold text-white hover:from-alego-700 hover:to-alego-800 transition-all shadow-lg hover:shadow-xl hover:scale-105"
          >
            {showForm ? 'Cancelar' : '✨ Avaliar'}
          </button>
        )}
      </div>

      {/* Formulário de avaliação */}
      {showForm && user && !userHasReviewed && (
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          onSubmit={handleSubmit}
          className="rounded-2xl bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 border-2 border-alego-200 dark:border-alego-700 p-6 sm:p-8 space-y-5 shadow-xl"
        >
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
              Sua avaliação
            </label>
            <div className="flex gap-1 scale-125 origin-left">
              {renderStars(0, true, (rating) => setFormData(prev => ({ ...prev, rating })))}
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
              className="w-full rounded-xl border-2 border-slate-300 dark:border-slate-600 p-4 text-sm focus:border-alego-500 focus:outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 transition-all resize-none"
              disabled={submitting}
            />
          </div>
          <button
            type="submit"
            disabled={submitting || formData.rating === 0 || !formData.comment.trim()}
            className="rounded-xl bg-gradient-to-r from-alego-600 to-alego-700 px-8 py-3 text-sm font-bold text-white hover:from-alego-700 hover:to-alego-800 transition-all shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {submitting ? 'Enviando...' : '📤 Enviar Avaliação'}
          </button>
        </motion.form>
      )}

      {/* Carrossel Dinâmico de Avaliações */}
      {reviews.length === 0 ? (
        <div className="text-center py-12 px-6 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border-2 border-slate-200 dark:border-slate-700">
          <div className="text-5xl mb-4">💬</div>
          <p className="text-lg font-semibold text-slate-600 dark:text-slate-400 mb-2">
            Nenhuma avaliação ainda
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-500">
            Seja o primeiro a compartilhar sua experiência!
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Carrossel Desktop - Mostra 3 comentários por vez */}
          <div className="hidden lg:block relative overflow-hidden rounded-2xl">
            <div className="relative h-[320px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentReviewIndex}
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -50, scale: 0.95 }}
                  transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                  className="grid grid-cols-3 gap-4 lg:gap-6 h-full"
                >
                  {/* Mostrar 3 avaliações por vez */}
                  {[0, 1, 2].map((offset) => {
                    const reviewIndex = (currentReviewIndex + offset) % reviews.length
                    const review = reviews[reviewIndex]
                    if (!review) return null
                    
                    return (
                      <motion.div
                        key={`${review.id}-${offset}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4, delay: offset * 0.1 }}
                        className="group relative rounded-2xl bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 border border-slate-200/60 dark:border-slate-700/60 p-6 shadow-lg hover:shadow-2xl transition-all hover:scale-105 hover:-translate-y-2"
                      >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-alego-500/10 to-purple-500/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        <div className="relative z-10 h-full flex flex-col">
                          {/* Estrelas */}
                          <div className="flex gap-1 mb-3">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <StarIcon
                                key={star}
                                className={`h-4 w-4 transition-all ${
                                  star <= review.rating 
                                    ? 'text-yellow-400 fill-yellow-400 scale-110' 
                                    : 'text-gray-300'
                                }`}
                              />
                            ))}
                          </div>
                          
                          {/* Comentário */}
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4 leading-relaxed line-clamp-5 flex-1">
                            "{review.comment}"
                          </p>
                          
                          {/* Autor e Data */}
                          <div className="flex items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700 mt-auto">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-alego-500 to-alego-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                              {(review.userName || 'A')[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                                {review.userName || 'Aluno'}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {review.createdAt?.toDate?.().toLocaleDateString('pt-BR', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric'
                                }) || 'Data não disponível'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </motion.div>
              </AnimatePresence>

              {/* Botões de navegação Desktop */}
              {reviews.length > 3 && (
                <>
                  <button
                    type="button"
                    onClick={() => setCurrentReviewIndex((prev) => (prev - 1 + reviews.length) % reviews.length)}
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-white/95 hover:bg-white dark:bg-slate-800/95 dark:hover:bg-slate-800 rounded-xl p-3 shadow-2xl transition-all hover:scale-110 z-20 backdrop-blur-sm border border-slate-200 dark:border-slate-700"
                    aria-label="Avaliações anteriores"
                  >
                    <svg className="w-6 h-6 text-gray-800 dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentReviewIndex((prev) => (prev + 1) % reviews.length)}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-white/95 hover:bg-white dark:bg-slate-800/95 dark:hover:bg-slate-800 rounded-xl p-3 shadow-2xl transition-all hover:scale-110 z-20 backdrop-blur-sm border border-slate-200 dark:border-slate-700"
                    aria-label="Próximas avaliações"
                  >
                    <svg className="w-6 h-6 text-gray-800 dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </>
              )}

              {/* Indicadores Desktop */}
              {reviews.length > 3 && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2 z-20">
                  {Array.from({ length: Math.ceil(reviews.length / 3) }).map((_, index) => {
                    const isActive = Math.floor(currentReviewIndex / 3) === index
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setCurrentReviewIndex(index * 3)}
                        className={`h-2 rounded-full transition-all duration-300 shadow-md ${
                          isActive
                            ? 'w-8 bg-alego-600 dark:bg-alego-400 scale-110'
                            : 'w-2 bg-white/60 dark:bg-slate-400/60 hover:bg-white/80 dark:hover:bg-slate-400/80'
                        }`}
                        aria-label={`Ir para página ${index + 1}`}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Carrossel Tablet - Mostra 2 comentários por vez */}
          <div className="hidden md:block lg:hidden relative overflow-hidden rounded-2xl">
            <div className="relative h-[300px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentReviewIndex}
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                  className="grid grid-cols-2 gap-4 h-full"
                >
                  {[0, 1].map((offset) => {
                    const reviewIndex = (currentReviewIndex + offset) % reviews.length
                    const review = reviews[reviewIndex]
                    if (!review) return null
                    
                    return (
                      <motion.div
                        key={`${review.id}-${offset}`}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4, delay: offset * 0.1 }}
                        className="group relative rounded-2xl bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 border border-slate-200/60 dark:border-slate-700/60 p-5 shadow-lg hover:shadow-2xl transition-all hover:scale-105"
                      >
                        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-alego-500/10 to-purple-500/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative z-10 h-full flex flex-col">
                          <div className="flex gap-1 mb-3">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <StarIcon
                                key={star}
                                className={`h-4 w-4 ${
                                  star <= review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'
                                }`}
                              />
                            ))}
                          </div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-4 leading-relaxed line-clamp-4 flex-1">
                            "{review.comment}"
                          </p>
                          <div className="flex items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700 mt-auto">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-alego-500 to-alego-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                              {(review.userName || 'A')[0].toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                                {review.userName || 'Aluno'}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {review.createdAt?.toDate?.().toLocaleDateString('pt-BR', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric'
                                }) || 'Data não disponível'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </motion.div>
              </AnimatePresence>

              {reviews.length > 2 && (
                <>
                  <button
                    type="button"
                    onClick={() => setCurrentReviewIndex((prev) => (prev - 1 + reviews.length) % reviews.length)}
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 bg-white/95 hover:bg-white dark:bg-slate-800/95 rounded-xl p-2.5 shadow-xl transition-all hover:scale-110 z-10"
                  >
                    <svg className="w-5 h-5 text-gray-800 dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentReviewIndex((prev) => (prev + 1) % reviews.length)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-white/95 hover:bg-white dark:bg-slate-800/95 rounded-xl p-2.5 shadow-xl transition-all hover:scale-110 z-10"
                  >
                    <svg className="w-5 h-5 text-gray-800 dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex gap-2 z-10">
                    {Array.from({ length: Math.ceil(reviews.length / 2) }).map((_, index) => {
                      const isActive = Math.floor(currentReviewIndex / 2) === index
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => setCurrentReviewIndex(index * 2)}
                          className={`h-2 rounded-full transition-all ${
                            isActive ? 'w-6 bg-alego-600 dark:bg-alego-400' : 'w-2 bg-white/60 dark:bg-slate-400/60'
                          }`}
                        />
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Carrossel Mobile - 1 comentário por vez */}
          <div className="md:hidden relative">
            <div className="relative w-full overflow-hidden rounded-2xl shadow-xl h-[320px]">
              <AnimatePresence mode="wait">
                {currentReview && (
                  <motion.div
                    key={currentReview.id}
                    initial={{ opacity: 0, x: 300, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -300, scale: 0.95 }}
                    transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                    className="absolute inset-0 p-6 bg-gradient-to-br from-white via-slate-50 to-alego-50/30 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex flex-col h-full justify-between">
                      {/* Estrelas com animação */}
                      <motion.div 
                        className="flex gap-1 justify-center mb-4"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring" }}
                      >
                        {[1, 2, 3, 4, 5].map((star) => (
                          <motion.div
                            key={star}
                            initial={{ opacity: 0, rotate: -180 }}
                            animate={{ opacity: 1, rotate: 0 }}
                            transition={{ delay: 0.1 * star }}
                          >
                            <StarIcon
                              className={`h-6 w-6 ${
                                star <= currentReview.rating 
                                  ? 'text-yellow-400 fill-yellow-400' 
                                  : 'text-gray-300'
                              }`}
                            />
                          </motion.div>
                        ))}
                      </motion.div>
                      
                      {/* Comentário */}
                      <motion.p 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-base font-medium text-slate-800 dark:text-slate-200 text-center leading-relaxed mb-6 flex-1 flex items-center justify-center"
                      >
                        "{currentReview.comment}"
                      </motion.p>
                      
                      {/* Autor e Data */}
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="flex items-center gap-3 justify-center pt-4 border-t border-slate-200 dark:border-slate-700"
                      >
                        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-alego-500 to-alego-600 flex items-center justify-center text-white font-bold text-base shadow-lg">
                          {(currentReview.userName || 'A')[0].toUpperCase()}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {currentReview.userName || 'Aluno'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {currentReview.createdAt?.toDate?.().toLocaleDateString('pt-BR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            }) || 'Data não disponível'}
                          </p>
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Botões de navegação Mobile */}
              {reviews.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setCurrentReviewIndex((prev) => (prev - 1 + reviews.length) % reviews.length)}
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 bg-white/95 hover:bg-white dark:bg-slate-800/95 dark:hover:bg-slate-800 rounded-xl p-2.5 shadow-xl transition-all hover:scale-110 z-10 backdrop-blur-sm"
                    aria-label="Avaliação anterior"
                  >
                    <svg className="w-6 h-6 text-gray-800 dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentReviewIndex((prev) => (prev + 1) % reviews.length)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-white/95 hover:bg-white dark:bg-slate-800/95 dark:hover:bg-slate-800 rounded-xl p-2.5 shadow-xl transition-all hover:scale-110 z-10 backdrop-blur-sm"
                    aria-label="Próxima avaliação"
                  >
                    <svg className="w-6 h-6 text-gray-800 dark:text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </>
              )}

              {/* Indicadores Mobile */}
              {reviews.length > 1 && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2 z-10">
                  {reviews.map((_, index) => (
                    <motion.button
                      key={index}
                      type="button"
                      onClick={() => setCurrentReviewIndex(index)}
                      initial={false}
                      animate={{
                        width: index === currentReviewIndex ? 32 : 8,
                        backgroundColor: index === currentReviewIndex 
                          ? 'rgb(37 99 235)' 
                          : 'rgba(255, 255, 255, 0.6)'
                      }}
                      className={`h-2 rounded-full transition-all duration-300 shadow-md`}
                      aria-label={`Ir para avaliação ${index + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Reviews

