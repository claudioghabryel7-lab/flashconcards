import { useEffect, useState } from 'react'
import { collection, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { StarIcon } from '@heroicons/react/24/solid'
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline'

const Reviews = () => {
  const { user, profile } = useAuth()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
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
        <div className="h-32 bg-slate-100 animate-pulse rounded-xl" />
        <div className="h-32 bg-slate-100 animate-pulse rounded-xl" />
      </div>
    )
  }

  const averageRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0

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

      {/* Lista de avaliações */}
      {reviews.length === 0 ? (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
          <p>Nenhuma avaliação ainda. Seja o primeiro a avaliar!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div
              key={review.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {review.userName || 'Aluno'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {review.createdAt?.toDate?.().toLocaleDateString('pt-BR') || 'Data não disponível'}
                  </p>
                </div>
                {renderStars(review.rating)}
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-2">
                {review.comment}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Reviews

