import { useState, useEffect, useCallback } from 'react'
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  SwatchIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'
import FlashcardItem from './FlashcardItem'
import { useSearchParams } from 'react-router-dom'
import { getRatingButtonLabel } from '../utils/spacedRepetition'

const COLOR_OPTIONS = [
  { name: 'Branco', bg: 'bg-white', text: 'text-slate-900', border: 'border-slate-200' },
  { name: 'Cinza', bg: 'bg-slate-100', text: 'text-slate-900', border: 'border-slate-300' },
  { name: 'Azul', bg: 'bg-blue-50', text: 'text-slate-900', border: 'border-blue-200' },
  { name: 'Verde', bg: 'bg-emerald-50', text: 'text-slate-900', border: 'border-emerald-200' },
  { name: 'Roxo', bg: 'bg-violet-50', text: 'text-slate-900', border: 'border-violet-200' },
  { name: 'Escuro', bg: 'bg-slate-800', text: 'text-white', border: 'border-slate-700' },
]

const FlashcardList = ({
  cards,
  currentIndex,
  onSelect,
  onToggleFavorite,
  onRateDifficulty = null,
  favorites,
  cardProgress = {},
  onPrev,
  onNext,
  onShuffle,
  viewedIds,
  showRating = false,
  onDeleteFlashcard = null,
  onEditFlashcard = null,
  courseId = null,
  topicKey = null,
  deckTitle = '',
  deckSubtitle = '',
}) => {
  const [searchParams] = useSearchParams()
  const [flipped, setFlipped] = useState(false)
  const [cardColor, setCardColor] = useState(COLOR_OPTIONS[0].bg)
  const [textColor, setTextColor] = useState(COLOR_OPTIONS[0].text)
  const [borderColor, setBorderColor] = useState(COLOR_OPTIONS[0].border)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const currentCard = cards[currentIndex]
  const progress = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0
  const reviewedCount = (viewedIds || []).length

  const disciplina = decodeURIComponent(searchParams.get('disciplina') || '')

  useEffect(() => {
    setFlipped(false)
  }, [currentIndex, currentCard?.id])

  const handleRate = useCallback(
    (difficulty) => {
      if (!currentCard || !onRateDifficulty) return
      onRateDifficulty(currentCard.id, difficulty)
      setFlipped(false)
    },
    [currentCard, onRateDifficulty]
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return
      if (!currentCard) return

      if (e.code === 'Space') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (e.code === 'ArrowLeft') {
        onPrev?.()
      } else if (e.code === 'ArrowRight') {
        onNext?.()
      } else if (showRating && flipped) {
        if (e.key === '1' || e.key === 'h') handleRate('hard')
        if (e.key === '2' || e.key === 'e') handleRate('easy')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentCard, flipped, showRating, handleRate, onPrev, onNext])

  const handleColorChange = (option) => {
    setCardColor(option.bg)
    setTextColor(option.text)
    setBorderColor(option.border)
    setShowColorPicker(false)
  }

  if (!currentCard) return null

  const cardProg = cardProgress[currentCard.id]
  const hardLabel = getRatingButtonLabel('hard', cardProg)
  const easyLabel = getRatingButtonLabel('easy', cardProg)

  return (
    <div className="noji-study mx-auto flex w-full max-w-2xl min-w-0 flex-col overflow-x-clip pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* Barra de progresso — estilo Noji */}
      <div className="mb-4 min-w-0 space-y-2">
        <div className="flex min-w-0 items-center justify-between gap-2 text-xs font-medium text-cp-muted">
          <span className="min-w-0 break-words">
            {reviewedCount} revisados · {cards.length - reviewedCount} restantes
          </span>
          <span className="shrink-0 font-mono tabular-nums">
            {currentIndex + 1}/{cards.length}
          </span>
        </div>
        <div className="noji-progress-track h-1.5 overflow-hidden rounded-full bg-cp-border/60">
          <div
            className="noji-progress-fill h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Toolbar compacta — título opcional quando não há header externo */}
      {(deckTitle || deckSubtitle) && (
        <div className="mb-2 min-w-0">
          {deckSubtitle && (
            <p className="truncate text-[11px] font-medium uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
              {deckSubtitle}
            </p>
          )}
          {deckTitle && (
            <p className="truncate text-sm font-semibold text-cp-text">{deckTitle}</p>
          )}
        </div>
      )}
      <div className="mb-4 flex items-center justify-end gap-2">
        <div className="relative flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const q = encodeURIComponent(
                `${disciplina}/${currentCard.pergunta}/${currentCard.resposta} esse flashcard está correto?`
              )
              window.open(`https://www.google.com/search?q=${q}`, '_blank')
            }}
            className="noji-tool-btn"
            title="Pesquisar no Google"
          >
            <MagnifyingGlassIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="noji-tool-btn"
            title="Cor do card"
          >
            <SwatchIcon className="h-4 w-4" />
          </button>
          {onShuffle && (
            <button type="button" onClick={onShuffle} className="noji-tool-btn" title="Embaralhar">
              <ArrowPathIcon className="h-4 w-4" />
            </button>
          )}
          {showColorPicker && (
            <div className="absolute right-0 top-full z-50 mt-2 grid w-48 grid-cols-2 gap-1.5 rounded-2xl border border-cp-border bg-cp-surface p-2 shadow-xl">
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.name}
                  type="button"
                  onClick={() => handleColorChange(option)}
                  className={`rounded-xl border px-2 py-2 text-[11px] font-medium ${option.bg} ${option.text} ${option.border}`}
                >
                  {option.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Card principal */}
      <div className="flex min-w-0 max-w-full flex-1 flex-col items-center justify-center overflow-x-clip py-2">
        <FlashcardItem
          card={currentCard}
          flipped={flipped}
          onFlipChange={setFlipped}
          isFavorite={favorites.includes(currentCard.id)}
          onToggleFavorite={onToggleFavorite}
          onRateDifficulty={onRateDifficulty}
          showRating={showRating}
          cardProgress={cardProgress[currentCard.id] || null}
          onDeleteFlashcard={onDeleteFlashcard}
          onEditFlashcard={onEditFlashcard}
          courseId={courseId}
          topicKey={topicKey}
          cardIndex={currentIndex}
          materia={deckSubtitle}
          assunto={deckTitle}
          cardColor={cardColor}
          textColor={textColor}
          borderColor={borderColor}
          ratingBelowCard
        />
      </div>

      {/* Avaliação SRS — abaixo do card (Noji) */}
      {showRating && flipped ? (
        <div className="noji-rating mt-4 space-y-2 sm:space-y-3">
          <p className="text-center text-sm font-medium text-cp-muted">
            Quão bem você lembrou?
          </p>
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => handleRate('hard')}
              className="noji-rate-hard group flex flex-col items-center rounded-2xl px-3 py-3 transition active:scale-[0.98] sm:px-4 sm:py-4"
              style={{ touchAction: 'manipulation' }}
            >
              <span className="text-sm font-bold sm:text-base">Difícil</span>
              <span className="mt-0.5 text-[11px] opacity-80">Repetir em {hardLabel || '1 min'}</span>
              <span className="mt-1 text-[10px] opacity-50">Tecla 1</span>
            </button>
            <button
              type="button"
              onClick={() => handleRate('easy')}
              className="noji-rate-easy group flex flex-col items-center rounded-2xl px-3 py-3 transition active:scale-[0.98] sm:px-4 sm:py-4"
              style={{ touchAction: 'manipulation' }}
            >
              <span className="text-sm font-bold sm:text-base">Fácil</span>
              <span className="mt-0.5 text-[11px] opacity-80">Próximo em {easyLabel || '15 min'}</span>
              <span className="mt-1 text-[10px] opacity-50">Tecla 2</span>
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-4 max-w-full break-words px-1 text-center text-xs text-cp-muted">
          <kbd className="rounded border border-cp-border bg-cp-bg px-1.5 py-0.5 font-mono text-[10px]">Espaço</kbd>
          {' '}para virar ·{' '}
          <kbd className="rounded border border-cp-border bg-cp-bg px-1.5 py-0.5 font-mono text-[10px]">←</kbd>
          {' '}
          <kbd className="rounded border border-cp-border bg-cp-bg px-1.5 py-0.5 font-mono text-[10px]">→</kbd>
          {' '}navegar
        </p>
      )}

      {/* Navegação lateral */}
      <div className="mt-4 flex items-center justify-center gap-3 sm:gap-4">
        <button type="button" onClick={onPrev} className="noji-nav-btn" aria-label="Anterior">
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <div className="flex gap-1">
          {cards.slice(0, Math.min(cards.length, 12)).map((card, index) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelect(index)}
              className={`h-1.5 rounded-full transition-all ${
                index === currentIndex
                  ? 'w-6 bg-indigo-500'
                  : (viewedIds || []).includes(card.id)
                    ? 'w-1.5 bg-emerald-400/70'
                    : 'w-1.5 bg-cp-border'
              }`}
              aria-label={`Card ${index + 1}`}
            />
          ))}
          {cards.length > 12 && (
            <span className="ml-1 self-center text-[10px] text-cp-muted">+{cards.length - 12}</span>
          )}
        </div>
        <button type="button" onClick={onNext} className="noji-nav-btn" aria-label="Próximo">
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

export default FlashcardList
