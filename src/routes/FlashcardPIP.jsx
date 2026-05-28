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
  const [cardColor, setCardColor] = useState('bg-white')
  const [textColor, setTextColor] = useState('text-slate-900')
  const [borderColor, setBorderColor] = useState('border-white')
  const [showColorPicker, setShowColorPicker] = useState(false)

  const colorOptions = [
    { name: 'Branho Padrão', bg: 'bg-white', text: 'text-slate-900', border: 'border-white' },
    { name: 'Cinza Claro', bg: 'bg-slate-100', text: 'text-slate-900', border: 'border-slate-200' },
    { name: 'Cinza Médio', bg: 'bg-slate-200', text: 'text-slate-900', border: 'border-slate-300' },
    { name: 'Cinza Escuro', bg: 'bg-slate-700', text: 'text-white', border: 'border-slate-600' },
    { name: 'Preto', bg: 'bg-slate-900', text: 'text-white', border: 'border-slate-800' },
    { name: 'Azul Claro', bg: 'bg-blue-50', text: 'text-slate-900', border: 'border-blue-100' },
    { name: 'Azul Escuro', bg: 'bg-blue-900', text: 'text-white', border: 'border-blue-800' },
    { name: 'Verde Claro', bg: 'bg-green-50', text: 'text-slate-900', border: 'border-green-100' },
    { name: 'Verde Escuro', bg: 'bg-green-900', text: 'text-white', border: 'border-green-800' },
    { name: 'Roxo Claro', bg: 'bg-purple-50', text: 'text-slate-900', border: 'border-purple-100' },
    { name: 'Roxo Escuro', bg: 'bg-purple-900', text: 'text-white', border: 'border-purple-800' },
  ]

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

  const handleColorChange = (option) => {
    setCardColor(option.bg)
    setTextColor(option.text)
    setBorderColor(option.border)
    setShowColorPicker(false)
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

      {/* Color picker button */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <button
          type="button"
          onClick={() => {
            const searchQuery = encodeURIComponent(`${disciplina}/${modulo}/${currentCard.pergunta}/${currentCard.resposta}`)
            window.open(`https://www.google.com/search?q=${searchQuery}`, '_blank')
          }}
          className="p-3 rounded-lg bg-white text-slate-900 hover:opacity-80 transition"
          title="Pesquisar no Google"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
        
        <button
          type="button"
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="p-3 rounded-lg bg-white text-slate-900 hover:opacity-80 transition"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        </button>
        
        {showColorPicker && (
          <div className="absolute top-14 right-0 bg-white rounded-lg shadow-2xl p-3 z-[100] w-64">
            <div className="grid grid-cols-2 gap-2">
              {colorOptions.map((option) => (
                <button
                  key={option.name}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleColorChange(option)
                  }}
                  className={`p-3 rounded-lg ${option.bg} ${option.text} text-xs font-medium hover:opacity-80 transition border border-slate-200`}
                >
                  {option.name}
                </button>
              ))}
            </div>
          </div>
        )}
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
              className={`${cardColor} rounded-lg p-8 sm:p-12 md:p-16 shadow-2xl border-4 ${borderColor} min-h-[400px] sm:min-h-[500px] md:min-h-[600px] flex flex-col justify-center items-center text-center cursor-pointer`}
            >
              <h2 className={`text-2xl sm:text-3xl md:text-4xl font-bold ${textColor} mb-8 leading-relaxed`}>
                {currentCard.pergunta}
              </h2>

              {!showAnswer && (
                <p className={`${textColor === 'text-white' ? 'text-slate-300' : 'text-slate-500'} text-sm`}>Clique para ver a resposta</p>
              )}

              {showAnswer && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`mt-8 pt-8 border-t-4 ${textColor === 'text-white' ? 'border-white' : 'border-slate-900'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className={`text-lg sm:text-xl md:text-2xl font-medium ${textColor === 'text-white' ? 'text-slate-200' : 'text-slate-700'} leading-relaxed mb-8`}>
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
                  <p className={`text-xs ${textColor === 'text-white' ? 'text-slate-300' : 'text-slate-500'} mt-4 text-center`}>A I.A pode conter erros. Sempre verífique no ícone "Lupa" no canto superior direito, para validar o seu flashcard.</p>
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
