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
  const [formData, setFormData] = useState({
    rating: 0,
    comment: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [hoveredStar, setHoveredStar] = useState(0)

  // Carregar avaliações - simplificado
  useEffect(() => {
    console.log('🔍 Reviews useEffect iniciado...')
    
    const loadReviews = async () => {
      try {
        console.log('🔄 Tentando carregar do Firebase...')
        const reviewsRef = collection(db, 'reviews')
        const snapshot = await getDocs(reviewsRef)
        const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })).filter((review) => review.approved !== false)
        
        console.log('✅ Dados carregados:', data.length, 'reviews')
        setReviews(data)
        setLoading(false)
      } catch (error) {
        console.error('❌ Erro:', error)
        setLoading(false)
      }
    }

    // Timeout para garantir que carregue
    setTimeout(() => {
      loadReviews()
    }, 100)
  }, [db])

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
  const userHasReviewed = reviews.some(review => review.userId === user?.uid)

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <div>Carregando...</div>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>Avaliações dos Alunos</h2>
      
      {/* Botão para adicionar avaliação */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <button
          onClick={() => {
            if (!user) {
              navigate('/login')
              return
            }
            setShowForm(!showForm)
          }}
          style={{
            padding: '12px 24px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          {user ? 'Deixar sua avaliação' : 'Avaliar como aluno'}
        </button>
      </div>

      {/* Lista de avaliações - Mobile */}
      <div className="md:hidden">
        {reviews.length > 0 ? (
          reviews.slice(0, 3).map((review) => (
            <div key={review.id} style={{ 
              background: 'white', 
              padding: '20px', 
              marginBottom: '16px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <span key={star} style={{ 
                    color: star <= review.rating ? '#fbbf24' : '#d1d5db',
                    fontSize: '20px'
                  }}>
                    ★
                  </span>
                ))}
              </div>
              <p style={{ 
                color: '#374151', 
                marginBottom: '16px',
                lineHeight: '1.5'
              }}>
                "{review.comment}"
              </p>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px',
                paddingTop: '16px',
                borderTop: '1px solid #e2e8f0'
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold'
                }}>
                  {(review.userName || 'A')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ 
                    fontWeight: 'bold', 
                    color: '#111827',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {review.userName || 'Aluno'}
                  </p>
                  <p style={{ 
                    fontSize: '14px', 
                    color: '#6b7280'
                  }}>
                    {review.createdAt?.toDate?.().toLocaleDateString('pt-BR') || 'Recentemente'}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <div>Nenhuma avaliação ainda</div>
          </div>
        )}
      </div>

      {/* Desktop - mantido como estava */}
      <div className="hidden md:block">
        <div className="text-center py-12">
          <div>Desktop mode - working</div>
        </div>
      </div>
    </div>
  )
}

export default Reviews
