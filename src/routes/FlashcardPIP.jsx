import { useEffect, useState, useRef } from 'react'
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
  nextIndexAfterRating,
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

  const { dueQueue, stats, bumpNow, requeueCard, removeFromRequeue, clearRequeue } = useSRSDeck(
    allCards,
    cardProgress,
  )

  const [sessionQueue, setSessionQueue] = useState([])
  const sessionInitialized = useRef(false)

  useEffect(() => {
    sessionInitialized.current = false
    setSessionQueue([])
    setCurrentIndex(0)
    setShowAnswer(false)
    setCompleted(false)
    setErrorCount(0)
    clearRequeue()
  }, [courseIdParam, disciplina, modulo, topicKey, clearRequeue])

  // Inicializa a fila uma vez com os due; depois a fila é gerida pelas avaliações
  useEffect(() => {
    if (loading || sessionInitialized.current) return
    if (dueQueue.length === 0 && allCards.length === 0) return
    setSessionQueue([...dueQueue])
    sessionInitialized.current = true
    if (dueQueue.length === 0) setCompleted(true)
  }, [loading, dueQueue, allCards.length])

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
        setCompleted(false)
        setErrorCount(0)
        sessionInitialized.current = false
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

  const handleRate = async (difficulty) => {
    if (!user || !currentCard || ratingRef.current) return
    ratingRef.current = true
    const rated = currentCard
    const indexBefore = currentIndex

    try {
      const { updated } = await persistCardReview(
        user.uid,
        rated.id,
        cardProgress,
        difficulty,
        courseIdParam || 'alego-default',
      )
      setCardProgress(updated)
      bumpNow()
      setShowAnswer(false)

      if (difficulty === 'hard') {
        setErrorCount((prev) => prev + 1)
        requeueCard(rated)
        // Move o card atual para o fim e avança para o próximo (mesmo índice após remoção)
        setSessionQueue((prev) => {
          const without = prev.filter((c) => c.id !== rated.id)
          const next = [...without, rated]
          setCurrentIndex(nextIndexAfterRating(indexBefore, next.length))
          return next
        })
      } else {
        removeFromRequeue(rated.id)
        setSessionQueue((prev) => {
          const next = prev.filter((c) => c.id !== rated.id)
          if (next.length === 0) {
            setCompleted(true)
            setCurrentIndex(0)
          } else {
            setCurrentIndex(nextIndexAfterRating(indexBefore, next.length))
          }
          return next
        })
      }
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
        <div className="max-w-md rounded-2xl bg-white p-8 text-center sm:p-10">
          <h2 className="mb-4 text-2xl font-bold text-slate-900 sm:text-3xl">Concluído!</h2>
          <p className="mb-2 text-base text-slate-700 sm:text-lg">
            {stats.due === 0
              ? 'Todas as revisões deste tópico estão em dia.'
              : `${stats.due} card(s) ainda pendente(s) — volte quando vencerem.`}
          </p>
          {errorCount > 0 && (
            <p className="text-sm text-slate-600">Marcados como difícil nesta sessão: {errorCount}</p>
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
      <div className="fixed left-3 top-3 z-50 text-xs font-bold text-white sm:left-4 sm:top-4 sm:text-sm">
        {currentIndex + 1} / {sessionCards.length}
        <span className="ml-2 text-[10px] font-normal text-slate-400 sm:text-xs">
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
          className="rounded-lg bg-white p-2.5 text-slate-900 transition hover:opacity-80 sm:p-3"
          title="Pesquisar no Google"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="rounded-lg bg-white p-2.5 text-slate-900 transition hover:opacity-80 sm:p-3"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      <div className="w-full max-w-3xl px-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentCard.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.2 }}
          >
            <button
              type="button"
              onClick={() => !showAnswer && setShowAnswer(true)}
              className={`${cardColor} flex min-h-[min(420px,62dvh)] w-full max-w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-4 p-4 text-center shadow-2xl sm:min-h-[min(520px,72dvh)] sm:p-8 ${borderColor}`}
              style={{ touchAction: 'manipulation' }}
            >
              <h2
                className={`mb-4 max-w-full break-words font-semibold leading-snug sm:mb-6 sm:font-bold sm:leading-relaxed ${textColor}`}
                style={{ fontSize: 'clamp(0.95rem, 2.8vw + 0.55rem, 1.75rem)' }}
              >
                {currentCard.pergunta}
              </h2>

              {!showAnswer && (
                <p className={`text-xs sm:text-sm ${textColor === 'text-white' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Toque para ver a resposta
                </p>
              )}

              {showAnswer && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-3 w-full border-t-4 pt-4 sm:mt-4 sm:pt-6 ${textColor === 'text-white' ? 'border-white' : 'border-slate-900'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className={`mb-5 max-h-[36dvh] max-w-full overflow-y-auto break-words font-medium leading-relaxed sm:mb-6 sm:max-h-[40dvh] ${
                      textColor === 'text-white' ? 'text-slate-200' : 'text-slate-700'
                    }`}
                    style={{ fontSize: 'clamp(0.875rem, 2vw + 0.45rem, 1.25rem)' }}
                  >
                    {currentCard.resposta}
                  </div>

                  {nextReviewLabel && (
                    <p className="mb-3 text-[11px] text-slate-500 sm:mb-4 sm:text-xs">
                      Última revisão agendada: {nextReviewLabel}
                    </p>
                  )}

                  <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center sm:gap-3">
                    <button
                      type="button"
                      onClick={() => handleRate('hard')}
                      className="rounded-xl bg-slate-900 px-5 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] sm:px-8 sm:py-4 sm:text-base"
                    >
                      Difícil · {hardLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRate('easy')}
                      className="rounded-xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white transition active:scale-[0.98] sm:px-8 sm:py-4 sm:text-base"
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
