import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import dayjs from 'dayjs'
import FlashcardList from '../components/FlashcardList'
import { db } from '../firebase/config'
import { useAuth } from '../hooks/useAuth'
import { useDarkMode } from '../hooks/useDarkMode.jsx'
import { useStudyTimer } from '../hooks/useStudyTimer'
import { FolderIcon, ChevronRightIcon, ChevronDownIcon, ClockIcon } from '@heroicons/react/24/outline'

const MATERIAS = [
  'Português',
  'Área de Atuação (PL)',
  'Raciocínio Lógico',
  'Constitucional',
  'Administrativo',
  'Legislação Estadual',
  'Realidade de Goiás',
  'Redação',
]

// Estágios do SRS (Spaced Repetition System)
const STAGES = [
  { level: 1, intervalDays: 1 },
  { level: 2, intervalDays: 3 },
  { level: 3, intervalDays: 7 },
  { level: 4, intervalDays: 14 },
  { level: 5, intervalDays: 30 },
  { level: 6, intervalDays: 60 },
]

const FlashcardView = () => {
  const { user, favorites, updateFavorites } = useAuth()
  const { darkMode } = useDarkMode()
  const [cards, setCards] = useState([])
  const [cardProgress, setCardProgress] = useState({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedMateria, setSelectedMateria] = useState(null)
  const [selectedModulo, setSelectedModulo] = useState(null)
  const [expandedMaterias, setExpandedMaterias] = useState({})
  
  // Timer de estudo - ativo quando um módulo está selecionado
  const isStudying = !!selectedMateria && !!selectedModulo
  const { formattedTime, elapsedSeconds } = useStudyTimer(isStudying, user?.uid)

  // Carregar flashcards do Firestore
  useEffect(() => {
    const cardsRef = collection(db, 'flashcards')
    const unsub = onSnapshot(cardsRef, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => ({
        id: docSnapshot.id,
        ...docSnapshot.data(),
      }))
      data.sort((a, b) => {
        if (a.materia !== b.materia) {
          const indexA = MATERIAS.indexOf(a.materia || '')
          const indexB = MATERIAS.indexOf(b.materia || '')
          return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB)
        }
        if (a.modulo !== b.modulo) {
          return (a.modulo || '').localeCompare(b.modulo || '')
        }
        return 0
      })
      setCards(data)
    })
    return () => unsub()
  }, [])

  // Carregar progresso dos cards do usuário
  useEffect(() => {
    if (!user) return () => {}
    
    const userProgressRef = doc(db, 'userProgress', user.uid)
    const unsub = onSnapshot(userProgressRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data()
        setCardProgress(data.cardProgress || {})
      } else {
        setCardProgress({})
      }
    })
    return () => unsub()
  }, [user])

  // Organizar cards por matéria e módulo
  const organizedCards = useMemo(() => {
    const organized = {}
    cards.forEach((card) => {
      const materia = card.materia || 'Sem matéria'
      const modulo = card.modulo || 'Sem módulo'
      if (!organized[materia]) {
        organized[materia] = {}
      }
      if (!organized[materia][modulo]) {
        organized[materia][modulo] = []
      }
      organized[materia][modulo].push(card)
    })
    return organized
  }, [cards])

  // Cards filtrados baseado na seleção
  const filteredCards = useMemo(() => {
    if (!selectedMateria || !selectedModulo) {
      return []
    }
    return organizedCards[selectedMateria]?.[selectedModulo] || []
  }, [selectedMateria, selectedModulo, organizedCards])

  // Calcular próxima revisão com sistema retroativo
  const calculateNextReview = (currentProgress, difficulty, isRetroactive = false) => {
    const now = dayjs()
    let currentStage = currentProgress?.stage || 0
    let nextReview = currentProgress?.nextReview ? dayjs(currentProgress.nextReview) : now

    if (isRetroactive && nextReview.isBefore(now)) {
      const daysLate = now.diff(nextReview, 'day')
      if (daysLate > 0 && currentStage > 0) {
        const reduction = Math.min(Math.floor(daysLate / 3), currentStage)
        currentStage = Math.max(0, currentStage - reduction)
      }
    }

    if (difficulty === 'easy') {
      currentStage = Math.min(STAGES.length - 1, currentStage + (currentStage === 0 ? 2 : 1))
    } else if (difficulty === 'hard') {
      currentStage = Math.max(0, currentStage - 1)
    }

    const stage = STAGES[currentStage] || STAGES[0]
    const nextReviewDate = now.add(stage.intervalDays, 'day')

    return {
      stage: currentStage,
      nextReview: nextReviewDate.toISOString(),
      intervalDays: stage.intervalDays,
    }
  }

  const toggleMateria = (materia) => {
    setExpandedMaterias((prev) => ({
      ...prev,
      [materia]: !prev[materia],
    }))
  }

  const selectModulo = (materia, modulo) => {
    setSelectedMateria(materia)
    setSelectedModulo(modulo)
    setCurrentIndex(0)
  }

  const goNext = () => {
    setCurrentIndex((prev) =>
      prev + 1 >= filteredCards.length ? 0 : prev + 1,
    )
  }

  const goPrev = () => {
    setCurrentIndex((prev) =>
      prev - 1 < 0 ? filteredCards.length - 1 : prev - 1,
    )
  }

  const toggleFavorite = async (id) => {
    const nextFavorites = favorites.includes(id)
      ? favorites.filter((fav) => fav !== id)
      : [...favorites, id]
    await updateFavorites(nextFavorites)
  }

  // Avaliar dificuldade
  const rateDifficulty = async (cardId, difficulty) => {
    if (!user) return
    
    const now = dayjs()
    const currentProgress = cardProgress[cardId] || {}
    const nextReviewDate = currentProgress.nextReview ? dayjs(currentProgress.nextReview) : null
    const isRetroactive = nextReviewDate && now.isAfter(nextReviewDate)
    
    const newProgressData = calculateNextReview(currentProgress, difficulty, isRetroactive)
    
    const newProgress = {
      ...currentProgress,
      ...newProgressData,
      difficulty,
      reviewCount: (currentProgress.reviewCount || 0) + 1,
      lastReviewed: now.toISOString(),
      isRetroactive: isRetroactive || false,
    }
    
    const userProgressRef = doc(db, 'userProgress', user.uid)
    await setDoc(
      userProgressRef,
      {
        cardProgress: {
          ...cardProgress,
          [cardId]: newProgress,
        },
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    )
    
    // Avançar para próximo card após um pequeno delay
    setTimeout(() => {
      goNext()
    }, 300)
  }

  const shuffle = () => {
    setCurrentIndex(0)
  }

  const viewedIds = useMemo(() => {
    return filteredCards.slice(0, currentIndex + 1).map((c) => c.id)
  }, [filteredCards, currentIndex])

  const currentCard = filteredCards[currentIndex]
  const needsReview = true // Sempre mostra os botões de avaliação

  return (
    <section className="space-y-4 sm:space-y-6 px-2 sm:px-0">
      <div 
        className="rounded-2xl p-4 sm:p-6 shadow-sm"
        style={{
          backgroundColor: darkMode ? '#1e293b' : '#ffffff',
          color: darkMode ? '#f1f5f9' : '#1e293b'
        }}
      >
        <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] text-alego-500 dark:text-alego-400">
          Sistema de Repetição Espaçada (SRS)
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
          <div className="flex-1">
            <h1 className="mt-2 text-xl sm:text-2xl md:text-3xl font-bold text-alego-700 dark:text-alego-300">
              Flashcards Organizados por Matéria e Módulo
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {isStudying 
                ? `Estudando: ${selectedMateria} - ${selectedModulo}`
                : 'Selecione uma matéria e módulo para começar a estudar'}
            </p>
          </div>
          {isStudying && (
            <div className="flex items-center gap-2 rounded-full bg-alego-100 dark:bg-alego-900 px-3 sm:px-4 py-2 self-start sm:self-auto">
              <ClockIcon className="h-4 w-4 sm:h-5 sm:w-5 text-alego-600 dark:text-alego-400" />
              <span className="text-xs sm:text-sm font-semibold text-alego-700 dark:text-alego-300">
                {formattedTime}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Árvore de Pastas */}
        <div 
          className="rounded-2xl p-4 sm:p-6 shadow-sm"
          style={{
            backgroundColor: darkMode ? '#1e293b' : '#ffffff',
            color: darkMode ? '#f1f5f9' : '#1e293b'
          }}
        >
          <p className="mb-3 sm:mb-4 text-xs sm:text-sm font-semibold text-alego-600 dark:text-alego-400">
            Estrutura de Estudo:
          </p>
          <div className="space-y-1">
            {MATERIAS.map((materia) => {
              const modulos = organizedCards[materia] ? Object.keys(organizedCards[materia]) : []
              const isExpanded = expandedMaterias[materia]
              const isSelected = selectedMateria === materia
              
              if (modulos.length === 0) return null
              
              return (
                <div key={materia}>
                  <button
                    type="button"
                    onClick={() => toggleMateria(materia)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                      isSelected
                        ? 'bg-alego-100 dark:bg-alego-900 text-alego-700 dark:text-alego-300'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {isExpanded ? (
                      <ChevronDownIcon className="h-4 w-4" />
                    ) : (
                      <ChevronRightIcon className="h-4 w-4" />
                    )}
                    <FolderIcon className="h-5 w-5" />
                    <span className="flex-1">{materia}</span>
                    <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-xs text-slate-700 dark:text-slate-300">
                      {modulos.length}
                    </span>
                  </button>
                  
                  {isExpanded && (
                    <div className="ml-6 mt-1 space-y-1">
                      {modulos.map((modulo) => {
                        const cardsInModulo = organizedCards[materia][modulo] || []
                        const isModuloSelected = selectedMateria === materia && selectedModulo === modulo
                        
                        return (
                          <button
                            key={modulo}
                            type="button"
                            onClick={() => selectModulo(materia, modulo)}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                              isModuloSelected
                                ? 'bg-alego-600 dark:bg-alego-700 text-white'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                          >
                            <span>{modulo}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs ${
                              isModuloSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}>
                              {cardsInModulo.length}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Área de Estudo */}
        <div className="lg:col-span-2">
          {!selectedMateria || !selectedModulo ? (
            <div 
              className="rounded-2xl p-6 sm:p-8 md:p-12 text-center shadow-sm"
              style={{
                backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                color: darkMode ? '#f1f5f9' : '#1e293b'
              }}
            >
              <p className="text-3xl sm:text-4xl mb-3 sm:mb-4">📚</p>
              <p className="text-base sm:text-lg font-semibold text-slate-600 dark:text-slate-300">
                Selecione uma matéria e módulo para começar
              </p>
              <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Navegue pela estrutura ao lado e escolha o conteúdo que deseja estudar
              </p>
            </div>
          ) : filteredCards.length === 0 ? (
            <div 
              className="rounded-2xl p-8 text-center shadow-sm"
              style={{
                backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                color: darkMode ? '#cbd5e1' : '#64748b'
              }}
            >
              <p>Nenhum card encontrado neste módulo.</p>
            </div>
          ) : (
            <div 
              className="rounded-2xl p-4 sm:p-6 shadow-sm"
              style={{
                backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                color: darkMode ? '#f1f5f9' : '#1e293b'
              }}
            >
              <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-alego-600 dark:text-alego-400">
                    {selectedMateria} • {selectedModulo}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {filteredCards.length} {filteredCards.length === 1 ? 'card' : 'cards'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMateria(null)
                    setSelectedModulo(null)
                  }}
                  className="rounded-full border border-slate-300 dark:border-slate-600 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 self-start sm:self-auto"
                >
                  Voltar
                </button>
              </div>
              
              <FlashcardList
                cards={filteredCards}
                currentIndex={currentIndex}
                onSelect={setCurrentIndex}
                onToggleFavorite={toggleFavorite}
                onRateDifficulty={rateDifficulty}
                favorites={favorites}
                cardProgress={cardProgress}
                onPrev={goPrev}
                onNext={goNext}
                onShuffle={shuffle}
                viewedIds={viewedIds}
                showRating={needsReview}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export default FlashcardView
