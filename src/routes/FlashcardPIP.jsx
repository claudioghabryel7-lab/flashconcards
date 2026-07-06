import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { fetchFlashcardsForTopico } from '../services/topicoFlashcardsService'
import { useSRSDeck } from '../hooks/useSRSDeck'
import {
  persistCardReview,
  getRatingButtonLabel,
  getNextReviewLabel,
} from '../utils/spacedRepetition'
import { motion, AnimatePresence } from 'framer-motion'

const FlashcardPIP = () => {
  const { courseId: courseIdParam } = useParams()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()

  const disciplina = decodeURIComponent(searchParams.get('disciplina') || '')
  const modulo = decodeURIComponent(searchParams.get('modulo') || '')
  const topicKey = searchParams.get('topicKey') || ''

  const [allCards, setAllCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [cardProgress, setCardProgress] = useState({})
  const [sessionHard, setSessionHard] = useState([])
  const [completed, setCompleted] = useState(false)
  const [errorCount, setErrorCount] = useState(0)
  const [cardColor, setCardColor] = useState('bg-white')
  const [textColor, setTextColor] = useState('text-slate-900')
  const [borderColor, setBorderColor] = useState('border-white')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const ratingRef = useRef(false)

  const colorOptions = [
    { name: 'Branco', bg: 'bg-white', text: 'text-slate-900', border: 'border-white' },
    { name: 'Cinza', bg: 'bg-slate-100', text: 'text-slate-900', border: 'border-slate-200' },
    { name: 'Escuro', bg: 'bg-slate-800', text: 'text-white', border: 'border-slate-700' },
    { name: 'Azul', bg: 'bg-blue-50', text: 'text-slate-900', border: 'border-blue-200' },
    { name: 'Verde', bg: 'bg-emerald-50', text: 'text-slate-900', border: 'border-emerald-200' },
    { name: 'Roxo', bg: 'bg-violet-50', text: 'text-slate-900', border: 'border-violet-200' },
  ]

  const { dueQueue, stats, bumpNow, requeueCard } = useSRSDeck(allCards, cardProgress)

  const [sessionQueue, setSessionQueue] = useState([])
  const sessionInitialized = useRef(false)

  useEffect(() => {
    sessionInitialized.current = false
    setSessionQueue([])
    setCurrentIndex(0)
    setShowAnswer(false)
    setSessionHard([])
    setCompleted(false)
    setErrorCount(0)
  }, [courseIdParam, disciplina, modulo, topicKey])

  useEffect(() => {
    if (loading || sessionInitialized.current) return
    if (dueQueue.length === 0 && allCards.length === 0) return
    const dueIds = new Set(dueQueue.map((c) => c.id))
    const extra = sessionHard.filter((c) => !dueIds.has(c.id))
    setSessionQueue([...extra, ...dueQueue])
    sessionInitialized.current = true
  }, [loading, dueQueue, sessionHard, allCards.length])

  const sessionCards = sessionQueue

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'userProgress', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        setCardProgress(snapshot.data().cardProgress || {})
      }
    })
    return () => unsub()
  }, [user])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const courseId = courseIdParam || 'alego-default'
        const existing = await fetchFlashcardsForTopico(courseId, disciplina, modulo, topicKey)
        setAllCards(existing)
        setCurrentIndex(0)
        setShowAnswer(false)
        setSessionHard([])
        setCompleted(false)
        setErrorCount(0)
      } catch (error) {
        console.error('Erro ao carregar flashcards:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [courseIdParam, disciplina, modulo, topicKey])

  useEffect(() => {
    if (currentIndex >= sessionCards.length && sessionCards.length > 0 && !completed) {
      setCurrentIndex(Math.max(0, sessionCards.length - 1))
    }
  }, [sessionCards.length, currentIndex, completed])

  const currentCard = sessionCards[currentIndex]
  const currentProgress = currentCard ? cardProgress[currentCard.id] : null

  const advanceCard = useCallback(() => {
    setShowAnswer(false)
    setTimeout(() => {
      setCurrentIndex((prev) => {
        const next = prev + 1
        if (next >= sessionCards.length) {
          if (sessionHard.length > 0) {
            return 0
          }
          setCompleted(true)
          return prev
        }
        return next
      })
    }, 250)
  }, [sessionCards.length, sessionHard.length])

  const handleRate = async (difficulty) => {
    if (!user || !currentCard || ratingRef.current) return
    ratingRef.current = true

    try {
      const { updated } = await persistCardReview(
        user.uid,
        currentCard.id,
        cardProgress,
        difficulty,
        courseIdParam || 'alego-default',
      )
      setCardProgress(updated)
      bumpNow()

      if (difficulty === 'hard') {
        setErrorCount((prev) => prev + 1)
        setSessionHard((prev) => {
          if (prev.some((c) => c.id === currentCard.id)) return prev
          return [...prev, currentCard]
        })
        setSessionQueue((prev) => {
          if (prev.some((c) => c.id === currentCard.id)) return prev
          return [...prev, currentCard]
        })
        requeueCard(currentCard)
      }

      advanceCard()
    } catch (error) {
      console.error('Erro ao salvar revisão:', error)
    } finally {
      ratingRef.current = false
    }
  }

  const handleColorChange = (option) => {
    setCardColor(option.bg)
    setTextColor(option.text)
    setBorderColor(option.border)
    setShowColorPicker(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-900">
        <div className="text-center text-white">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-white border-t-transparent" />
          <p>Carregando flashcards...</p>
        </div>
      </div>
    )
  }

  if (allCards.length === 0) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-900">
        <p className="text-white">Nenhum flashcard encontrado.</p>
      </div>
    )
  }

  if (completed || sessionCards.length === 0) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-900 p-4">
        <div className="max-w-md rounded-2xl bg-white p-10 text-center">
          <h2 className="mb-4 text-3xl font-bold text-slate-900">Concluído!</h2>
          <p className="mb-2 text-lg text-slate-700">
            {stats.due === 0
              ? 'Todas as revisões deste tópico estão em dia.'
              : `${stats.due} card(s) ainda pendente(s) — volte quando vencerem.`}
          </p>
          {errorCount > 0 && (
            <p className="text-slate-600">Marcados como difícil nesta sessão: {errorCount}</p>
          )}
          <button
            type="button"
            onClick={() => window.close()}
            className="mt-6 rounded-xl bg-slate-900 px-6 py-3 font-bold text-white transition hover:opacity-80"
          >
            Fechar
          </button>
        </div>
      </div>
    )
  }

  const hardLabel = getRatingButtonLabel('hard', currentProgress)
  const easyLabel = getRatingButtonLabel('easy', currentProgress)
  const nextReviewLabel = getNextReviewLabel(currentProgress)

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-900 p-3 sm:p-4">
      <div className="fixed left-3 top-3 z-50 text-sm font-bold text-white sm:left-4 sm:top-4">
        {currentIndex + 1} / {sessionCards.length}
        <span className="ml-2 text-xs font-normal text-slate-400">
          · {stats.due} vencidos
        </span>
      </div>

      <div className="fixed right-3 top-3 z-50 flex gap-2 sm:right-4 sm:top-4">
        <button
          type="button"
          onClick={() => {
            const q = encodeURIComponent(
              `${disciplina}/${currentCard.pergunta}/${currentCard.resposta} esse flashcard está correto?`,
            )
            window.open(`https://www.google.com/search?q=${q}`, '_blank')
          }}
          className="rounded-lg bg-white p-3 text-slate-900 transition hover:opacity-80"
          title="Pesquisar no Google"
        >
          <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="rounded-lg bg-white p-3 text-slate-900 transition hover:opacity-80"
        >
          <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        </button>
        {showColorPicker && (
          <div className="absolute right-0 top-14 z-[100] grid w-56 grid-cols-2 gap-2 rounded-xl bg-white p-3 shadow-2xl">
            {colorOptions.map((option) => (
              <button
                key={option.name}
                type="button"
                onClick={() => handleColorChange(option)}
                className={`rounded-lg border p-2 text-xs font-medium ${option.bg} ${option.text} ${option.border}`}
              >
                {option.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-full max-w-4xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentCard.id}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.25 }}
          >
            <button
              type="button"
              onClick={() => !showAnswer && setShowAnswer(true)}
              className={`${cardColor} flex min-h-[min(520px,72dvh)] w-full flex-col items-center justify-center rounded-2xl border-4 p-6 text-center shadow-2xl sm:p-10 ${borderColor}`}
              style={{ touchAction: 'manipulation' }}
            >
              <h2 className={`mb-6 text-xl font-bold leading-relaxed sm:text-3xl md:text-4xl ${textColor}`}>
                {currentCard.pergunta}
              </h2>

              {!showAnswer && (
                <p className={`text-sm ${textColor === 'text-white' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Toque para ver a resposta
                </p>
              )}

              {showAnswer && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-4 w-full border-t-4 pt-6 ${textColor === 'text-white' ? 'border-white' : 'border-slate-900'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className={`mb-6 max-h-[40dvh] overflow-y-auto text-base font-medium leading-relaxed sm:text-xl ${
                      textColor === 'text-white' ? 'text-slate-200' : 'text-slate-700'
                    }`}
                  >
                    {currentCard.resposta}
                  </div>

                  {nextReviewLabel && (
                    <p className="mb-4 text-xs text-slate-500">Última revisão agendada: {nextReviewLabel}</p>
                  )}

                  <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <button
                      type="button"
                      onClick={() => handleRate('hard')}
                      className="rounded-xl bg-slate-900 px-6 py-4 font-bold text-white transition active:scale-[0.98] sm:px-8"
                    >
                      Difícil · {hardLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRate('easy')}
                      className="rounded-xl bg-indigo-600 px-6 py-4 font-bold text-white transition active:scale-[0.98] sm:px-8"
                    >
                      Fácil · {easyLabel}
                    </button>
                  </div>
                </motion.div>
              )}
            </button>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

export default FlashcardPIP
