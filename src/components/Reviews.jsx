import { useEffect, useState, startTransition } from 'react'
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useNavigate } from 'react-router-dom'
import { StarIcon } from '@heroicons/react/24/solid'
import { motion, AnimatePresence } from 'framer-motion'

const Reviews = () => {
  console.log('🔍 Reviews componente carregando...')
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
    console.log('🔍 Reviews useEffect iniciado...')
    console.log('🔍 db disponível:', !!db)
    
    if (!db) {
      console.log('❌ Firebase db não disponível!')
      setLoading(false)
      return
    }

    const loadReviews = async () => {
      console.log('🔄 Iniciando carregamento das avaliações...')
      try {
        const reviewsRef = collection(db, 'reviews')
        console.log('📁 Collection criada:', reviewsRef)
        
        const snapshot = await getDocs(reviewsRef)
        console.log('📸 Snapshot obtido:', snapshot.size, 'documentos')
        
        const data = snapshot.docs
          .map((doc) => {
            console.log('📄 Documento:', doc.id, doc.data())
            return {
              id: doc.id,
              ...doc.data(),
            }
          })
          .filter((review) => review.approved !== false)
        
        console.log('✅ Dados processados:', data.length, 'avaliações')
        console.log('📊 Primeira avaliação:', data[0])
        
        data.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0)
          const dateB = b.createdAt?.toDate?.() || new Date(0)
          return dateB - dateA
        })
        
        console.log('🔄 Aplicando startTransition...')
        startTransition(() => {
          setReviews(data)
          setLoading(false)
          console.log('✅ Reviews carregadas com sucesso!')
        })
      } catch (error) {
        console.error('❌ [Reviews] Erro ao carregar avaliações:', error)
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
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg animate-pulse">
            <div className="flex gap-1 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <div key={star} className="h-5 w-5 bg-gray-300 rounded-full"></div>
              ))}
            </div>
            <div className="h-20 bg-gray-300 rounded-lg mb-4"></div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-gray-300 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-300 rounded w-24 mb-2"></div>
                <div className="h-3 bg-gray-300 rounded w-16"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Botão para adicionar avaliação - visível para todos */}
      <div className="text-center">
        <button
          onClick={() => {
            if (!user) {
              // Redirecionar para login/cadastro se não estiver logado
              navigate('/login')
              return
            }
            setShowForm(!showForm)
          }}
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl hover:scale-105"
        >
          <StarIcon className="h-5 w-5" />
          {user ? 'Deixar sua avaliação' : 'Avaliar como aluno'}
        </button>
        {!user && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            🎓 Crie sua conta gratuita e compartilhe sua experiência com nossa comunidade
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
            className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-700"
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Sua avaliação
                </label>
                <div className="flex gap-1">
                  {renderStars(formData.rating, true, (rating) => 
                    setFormData(prev => ({ ...prev, rating }))
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Seu comentário
                </label>
                <textarea
                  value={formData.comment}
                  onChange={(e) => setFormData(prev => ({ ...prev, comment: e.target.value }))}
                  placeholder="Compartilhe sua experiência com a plataforma..."
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-600 p-3 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 transition-all resize-none"
                  disabled={submitting}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting || formData.rating === 0 || !formData.comment.trim()}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl px-6 py-3 font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Enviando...' : 'Enviar avaliação'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-6 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Carrossel de 3 comentários em loop - Responsivo */}
      {reviews.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
          <div className="text-6xl mb-4">💬</div>
          <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Nenhuma avaliação ainda
          </h3>
          <p className="text-slate-500 dark:text-slate-400">
            Seja o primeiro a compartilhar sua experiência!
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Desktop: Carrossel de 3 colunas */}
          <div className="hidden lg:block relative overflow-hidden rounded-2xl">
            <div className="relative">
              <div className="flex animate-scroll-horizontal">
                {/* Primeiro conjunto de avaliações */}
                {reviews.map((review, index) => (
                  <div key={`first-${review.id}`} className="w-1/3 flex-shrink-0 px-2">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg border border-slate-200 dark:border-slate-700 h-full">
                      <div className="flex gap-1 mb-4">
                        {renderStars(review.rating)}
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 mb-4 leading-relaxed line-clamp-4 h-24">
                        "{review.comment}"
                      </p>
                      <div className="flex items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-lg">
                          {(review.userName || 'A')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {review.userName || 'Aluno'}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {review.createdAt?.toDate?.().toLocaleDateString('pt-BR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            }) || 'Recentemente'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Segundo conjunto duplicado para loop infinito */}
                {reviews.map((review, index) => (
                  <div key={`second-${review.id}`} className="w-1/3 flex-shrink-0 px-2">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg border border-slate-200 dark:border-slate-700 h-full">
                      <div className="flex gap-1 mb-4">
                        {renderStars(review.rating)}
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 mb-4 leading-relaxed line-clamp-4 h-24">
                        "{review.comment}"
                      </p>
                      <div className="flex items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-lg">
                          {(review.userName || 'A')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {review.userName || 'Aluno'}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {review.createdAt?.toDate?.().toLocaleDateString('pt-BR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            }) || 'Recentemente'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tablet: Grid de 2 colunas */}
          <div className="hidden md:block lg:hidden grid grid-cols-2 gap-4">
            {reviews.slice(0, 4).map((review, index) => (
              <motion.div
                key={review.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white dark:bg-slate-800 rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all hover:scale-105 border border-slate-200 dark:border-slate-700"
              >
                <div className="flex gap-1 mb-3">
                  {renderStars(review.rating)}
                </div>
                <p className="text-slate-700 dark:text-slate-300 mb-3 leading-relaxed line-clamp-3 text-sm min-h-[3rem]">
                  "{review.comment}"
                </p>
                <div className="flex items-center gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
                    {(review.userName || 'A')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm truncate">
                      {review.userName || 'Aluno'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {review.createdAt?.toDate?.().toLocaleDateString('pt-BR', {
                        month: 'short',
                        year: 'numeric'
                      }) || 'Recentemente'}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Mobile: Usar mesma estrutura do desktop */}
          <div className="md:hidden">
            <div className="relative overflow-hidden rounded-2xl">
              <div className="relative">
                <div className="flex animate-scroll-horizontal">
                  {/* Primeiro conjunto de avaliações */}
                  {reviews.map((review, index) => (
                    <div key={`mobile-first-${review.id}`} className="w-1/3 flex-shrink-0 px-2">
                      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg border border-slate-200 dark:border-slate-700 h-full">
                        <div className="flex gap-1 mb-4">
                          {renderStars(review.rating)}
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 mb-4 leading-relaxed line-clamp-4 h-24">
                          "{review.comment}"
                        </p>
                        <div className="flex items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-lg">
                            {(review.userName || 'A')[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {review.userName || 'Aluno'}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {review.createdAt?.toDate?.().toLocaleDateString('pt-BR', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                              }) || 'Recentemente'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Segundo conjunto duplicado para loop infinito */}
                  {reviews.map((review, index) => (
                    <div key={`mobile-second-${review.id}`} className="w-1/3 flex-shrink-0 px-2">
                      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-lg border border-slate-200 dark:border-slate-700 h-full">
                        <div className="flex gap-1 mb-4">
                          {renderStars(review.rating)}
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 mb-4 leading-relaxed line-clamp-4 h-24">
                          "{review.comment}"
                        </p>
                        <div className="flex items-center gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-lg">
                            {(review.userName || 'A')[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {review.userName || 'Aluno'}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {review.createdAt?.toDate?.().toLocaleDateString('pt-BR', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                              }) || 'Recentemente'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Reviews
