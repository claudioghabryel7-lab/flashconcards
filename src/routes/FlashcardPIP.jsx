import { useEffect, useState, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import {
  fetchFlashcardsForTopico,
} from '../services/topicoFlashcardsService'
import { motion, AnimatePresence } from 'framer-motion'
import dayjs from 'dayjs'

const FlashcardPIP = () => {
  const { courseId: courseIdParam } = useParams()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  
  const disciplina = decodeURIComponent(searchParams.get('disciplina') || '')
  const modulo = decodeURIComponent(searchParams.get('modulo') || '')
  const topicKey = searchParams.get('topicKey') || ''
  const speed = parseInt(searchParams.get('speed') || '5000') // milliseconds per card

  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [cardProgress, setCardProgress] = useState({})
  const [difficultCards, setDifficultCards] = useState([])
  const [completed, setCompleted] = useState(false)
  const [errorCount, setErrorCount] = useState(0)

  // Load card progress
  useEffect(() => {
    if (!user) return
    const userProgressRef = doc(db, 'userProgress', user.uid)
    const unsub = onSnapshot(userProgressRef, (snapshot) => {
      if (snapshot.exists()) {
        setCardProgress(snapshot.data().cardProgress || {})
      }
    })
    return () => unsub()
  }, [user])

  // Load flashcards
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const courseId = courseIdParam || 'alego-default'
        const existing = await fetchFlashcardsForTopico(courseId, disciplina, modulo, topicKey)
        
        // Shuffle cards for random order
        const shuffled = [...existing].sort(() => Math.random() - 0.5)
        setCards(shuffled)
        setShowAnswer(true)
      } catch (error) {
        console.error('Erro ao carregar flashcards:', error)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [courseIdParam, disciplina, modulo, topicKey])

  const currentCard = cards[currentIndex]

  const handleRate = async (difficulty) => {
    if (!user) return
    const current = cardProgress[currentCard.id] || {}
    const now = dayjs()
    const intervalMinutes = difficulty === 'easy' ? 15 : 1
    const next = {
      ...current,
      nextReview: now.add(intervalMinutes, 'minute').toISOString(),
      reviewCount: (current.reviewCount || 0) + 1,
      lastDifficulty: difficulty,
    }
    const updated = { ...cardProgress, [currentCard.id]: next }
    setCardProgress(updated)
    await setDoc(
      doc(db, 'userProgress', user.uid),
      { cardProgress: updated },
      { merge: true }
    )
    
    if (difficulty === 'hard') {
      setErrorCount(prev => prev + 1)
      setDifficultCards(prev => [...prev, currentCard])
    }
    
    // Move to next card
    setShowAnswer(false)
    setTimeout(() => {
      if (currentIndex < cards.length - 1) {
        setCurrentIndex(prev => prev + 1)
      } else {
        // Check if there are difficult cards to repeat
        if (difficultCards.length > 0) {
          setCards(difficultCards)
          setDifficultCards([])
          setCurrentIndex(0)
        } else {
          setCompleted(true)
        }
      }
    }, 300)
  }

  const handleCardClick = () => {
    if (!showAnswer) {
      setShowAnswer(true)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent mx-auto mb-4"></div>
          <p>Carregando flashcards...</p>
        </div>
      </div>
    )
  }

  if (cards.length === 0) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <p>Nenhum flashcard encontrado.</p>
        </div>
      </div>
    )
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="bg-white rounded-lg p-12 text-center max-w-md">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">🎉 Concluído!</h2>
          <p className="text-xl text-slate-700 mb-2">Você errou {errorCount} vez(es)</p>
          <p className="text-slate-600">Todos os flashcards foram marcados como fáceis.</p>
          <button
            type="button"
            onClick={() => window.close()}
            className="mt-6 px-6 py-3 bg-slate-900 text-white rounded-lg font-bold hover:opacity-80 transition"
          >
            Fechar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      {/* Progress indicator */}
      <div className="fixed top-4 left-4 text-white text-sm font-bold z-50">
        {currentIndex + 1} / {cards.length}
      </div>

      {/* Flashcard */}
      <div className="w-full max-w-4xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            <div 
              onClick={handleCardClick}
              className="bg-white rounded-lg p-8 sm:p-12 md:p-16 shadow-2xl border-4 border-white min-h-[400px] sm:min-h-[500px] md:min-h-[600px] flex flex-col justify-center items-center text-center cursor-pointer"
            >
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-8 leading-relaxed">
                {currentCard.pergunta}
              </h2>

              {!showAnswer && (
                <p className="text-slate-500 text-sm">Clique para ver a resposta</p>
              )}

              {showAnswer && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="mt-8 pt-8 border-t-4 border-slate-900"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-lg sm:text-xl md:text-2xl font-medium text-slate-700 leading-relaxed mb-8">
                    {currentCard.resposta}
                  </div>
                  
                  <div className="flex gap-4 justify-center">
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleRate('hard')}
                      className="px-8 py-4 rounded-lg bg-slate-900 text-white font-bold hover:opacity-80 transition"
                    >
                      Difícil (1 min)
                    </motion.button>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleRate('easy')}
                      className="px-8 py-4 rounded-lg bg-slate-900 text-white font-bold hover:opacity-80 transition"
                    >
                      Fácil (15 min)
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

export default FlashcardPIP
