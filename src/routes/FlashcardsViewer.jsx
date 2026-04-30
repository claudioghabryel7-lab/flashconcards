import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode'
import {
  ChevronLeftIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

export default function FlashcardsViewer() {
  const { user } = useAuth()
  const { darkMode } = useDarkMode()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()

  // Estados
  const [loading, setLoading] = useState(true)
  const [topicFlashcards, setTopicFlashcards] = useState([])
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [topicInfo, setTopicInfo] = useState(null)
  const [courseId, setCourseId] = useState('')
  const [courseName, setCourseName] = useState('')

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    // Obter parâmetros da URL ou do state
    const params = new URLSearchParams(location.search)
    const disciplina = params.get('disciplina') || location.state?.disciplina
    const topico = params.get('topico') || location.state?.topico
    const topicoNumero = params.get('topicoNumero') || location.state?.topicoNumero
    const courseIdParam = params.get('courseId') || location.state?.courseId
    const flashcardsFromState = location.state?.flashcards

    if (!disciplina || !topico || !courseIdParam) {
      navigate('/flashcards2.0')
      return
    }

    setCourseId(courseIdParam)
    setTopicInfo({
      disciplina: disciplina,
      topico: topicoNumero ? `${topicoNumero} ${topico}` : topico
    })

    // Carregar nome do curso
    const loadCourseName = async () => {
      try {
        const courseDoc = await getDoc(doc(db, 'courses', courseIdParam))
        if (courseDoc.exists()) {
          const data = courseDoc.data()
          setCourseName(data.name || data.competition || '')
        }
      } catch (error) {
        console.error('Erro ao carregar nome do curso:', error)
      }
    }

    // Usar flashcards passados por state (mais rápido) ou carregar do Firestore
    if (flashcardsFromState && flashcardsFromState.length > 0) {
      console.log('Usando flashcards passados por state:', flashcardsFromState.length)
      setTopicFlashcards(flashcardsFromState)
      setLoading(false)
    } else {
      console.log('Carregando flashcards do Firestore...')
      // Carregar flashcards do tópico
      const loadTopicFlashcards = () => {
        const flashcardsQuery = query(
          collection(db, 'users', user.uid, 'flashcards'),
          where('courseId', '==', courseIdParam),
          where('materia', '==', disciplina),
          where('topico', '==', topico),
          orderBy('createdAt', 'desc'),
          limit(50) // Limitar para performance
        )

        const unsubscribe = onSnapshot(flashcardsQuery, (snapshot) => {
          const flashcards = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }))
          console.log('Flashcards carregados do Firestore:', flashcards.length)
          setTopicFlashcards(flashcards)
          setLoading(false)
        }, (error) => {
          console.error('Erro ao carregar flashcards:', error)
          setLoading(false)
        })

        return unsubscribe
      }

      loadCourseName()
      const unsubscribe = loadTopicFlashcards()

      return () => {
        if (unsubscribe) unsubscribe()
      }
    }
  }, [user, navigate, location])

  // Navegação entre flashcards
  const nextCard = () => {
    if (currentCardIndex < topicFlashcards.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1)
      setIsFlipped(false)
    }
  }

  const prevCard = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(currentCardIndex - 1)
      setIsFlipped(false)
    }
  }

  // Teclado shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        nextCard()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prevCard()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        setIsFlipped(!isFlipped)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [currentCardIndex, isFlipped, topicFlashcards.length])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">Carregando flashcards...</p>
        </div>
      </div>
    )
  }

  if (topicFlashcards.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-6">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-12 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Nenhum flashcard encontrado
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Este tópico ainda não possui flashcards gerados.
            </p>
            <button
              onClick={() => navigate('/flashcards2.0')}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all"
            >
              Voltar para Flashcards
            </button>
          </div>
        </div>
      </div>
    )
  }

  const currentCard = topicFlashcards[currentCardIndex]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-4 sm:py-6">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-4 sm:mb-6 md:mb-8">
          <button
            onClick={() => navigate('/flashcards2.0')}
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 mb-3 sm:mb-4 text-sm sm:text-base"
          >
            <ChevronLeftIcon className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">Voltar para Flashcards</span>
            <span className="sm:hidden">Voltar</span>
          </button>
          
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 dark:text-white mb-2">
              FLASHCARDS
            </h1>
            {courseName && (
              <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-400 mb-2">
                {courseName}
              </p>
            )}
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400">
              {topicInfo?.disciplina} - {topicInfo?.topico}
            </p>
          </div>
        </div>

        {/* Contador e Controles */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
          <div className="text-center sm:text-left">
            <span className="text-lg font-semibold text-slate-900 dark:text-white">
              Flashcard {currentCardIndex + 1} de {topicFlashcards.length}
            </span>
          </div>
          
          <div className="flex gap-2 sm:gap-3">
            <button
              onClick={prevCard}
              disabled={currentCardIndex === 0}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                currentCardIndex === 0
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg'
              }`}
            >
              Anterior
            </button>
            <button
              onClick={nextCard}
              disabled={currentCardIndex === topicFlashcards.length - 1}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                currentCardIndex === topicFlashcards.length - 1
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg'
              }`}
            >
              Próximo
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentCardIndex + 1) / topicFlashcards.length) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Container do Flashcard com Flip 3D */}
        <div className="relative h-[400px] sm:h-[450px] md:h-[500px] mb-8" style={{ perspective: '1000px' }}>
          <div 
            className="absolute inset-0 w-full h-full transition-transform duration-700 cursor-pointer"
            style={{
              transformStyle: 'preserve-3d',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
            }}
            onClick={() => setIsFlipped(!isFlipped)}
          >
            {/* Frente do Flashcard */}
            <div 
              className="absolute inset-0 w-full h-full rounded-2xl shadow-2xl flex flex-col justify-center items-center p-6 sm:p-8 md:p-12 bg-gradient-to-br from-blue-600 to-blue-700 text-white"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <div className="text-center max-w-4xl">
                <div className="text-sm sm:text-base uppercase tracking-wide mb-4 sm:mb-6 font-semibold text-blue-200">
                  {currentCard.materia}
                </div>
                <h3 className="text-xl sm:text-2xl md:text-3xl font-bold mb-6 sm:mb-8 leading-relaxed">
                  {currentCard.pergunta}
                </h3>
                <div className="text-sm sm:text-base opacity-75 text-blue-100">
                  <div className="mb-2">Clique para ver a resposta</div>
                  <div className="text-xs opacity-60">Use as setas ou Espaço para navegar</div>
                </div>
              </div>
            </div>

            {/* Verso do Flashcard */}
            <div 
              className="absolute inset-0 w-full h-full rounded-2xl shadow-2xl flex flex-col justify-center items-center p-6 sm:p-8 md:p-12 bg-gradient-to-br from-green-600 to-green-700 text-white"
              style={{ 
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)'
              }}
            >
              <div className="text-center max-w-4xl">
                <div className="text-sm sm:text-base uppercase tracking-wide mb-4 sm:mb-6 font-semibold text-green-200">
                  Resposta
                </div>
                <p className="text-lg sm:text-xl md:text-2xl leading-relaxed">
                  {currentCard.resposta}
                </p>
                <div className="text-sm sm:text-base opacity-75 text-green-100 mt-6 sm:mt-8">
                  <div className="mb-2">Clique para voltar à pergunta</div>
                  <div className="text-xs opacity-60">Use as setas ou Enter para virar</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Informações Adicionais */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <span className="text-sm text-gray-600 dark:text-gray-400">Tópico</span>
            <p className="font-semibold text-gray-900 dark:text-white">
              {currentCard.topicoNumero} {currentCard.topico}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <span className="text-sm text-gray-600 dark:text-gray-400">Dificuldade</span>
            <p className="font-semibold text-gray-900 dark:text-white capitalize">
              {currentCard.dificuldade || 'médio'}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
            <span className="text-sm text-gray-600 dark:text-gray-400">Revisões</span>
            <p className="font-semibold text-gray-900 dark:text-white">
              {currentCard.reviewCount || 0}
            </p>
          </div>
        </div>

        {/* Atalhos de Teclado */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-lg px-4 py-2 shadow">
            <span>Atalhos:</span>
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">Espaço</kbd>
            <span>Próximo</span>
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">Enter</kbd>
            <span>Virar</span>
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">Setas</kbd>
            <span>Navegar</span>
          </div>
        </div>
      </div>
    </div>
  )
}
