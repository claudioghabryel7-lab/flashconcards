import { ArrowPathRoundedSquareIcon } from '@heroicons/react/24/outline'
import FlashcardItem from './FlashcardItem'

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
  onExplainCard = null,
  onDeleteFlashcard = null,
  onEditFlashcard = null,
}) => {
  const visited = viewedIds || []
  const currentCard = cards[currentIndex]

  return (
    <div className="flex flex-col items-center justify-center min-h-screen w-full space-y-4 sm:space-y-6 px-4 sm:px-0">
      {/* Card Principal */}
      {currentCard && (
        <div className="w-full h-full flex flex-col justify-center items-center space-y-4 sm:space-y-6 max-w-7xl mx-auto">
          <div className="w-full flex justify-center items-center min-h-0 px-2 sm:px-0">
            <FlashcardItem
              card={currentCard}
              isFavorite={favorites.includes(currentCard.id)}
              onToggleFavorite={onToggleFavorite}
              onRateDifficulty={onRateDifficulty}
              showRating={showRating}
              cardProgress={cardProgress && cardProgress[currentCard.id] ? cardProgress[currentCard.id] : null}
              onExplainCard={onExplainCard}
              onDeleteFlashcard={onDeleteFlashcard}
              onEditFlashcard={onEditFlashcard}
            />
          </div>
          
          {/* Navegação - Melhorada para mobile */}
          <div className="flex items-center justify-center gap-2 sm:gap-4 px-2 sm:px-4 pb-2 sm:pb-0">
            <button
              type="button"
              onClick={onPrev}
              className="group/btn relative inline-flex items-center justify-center gap-1 sm:gap-2 rounded-lg bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-white px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-bold text-slate-900 dark:text-white shadow-lg hover:scale-105 transition-all overflow-hidden min-w-[80px] sm:min-w-[100px]"
            >
              <span className="relative z-10">←</span>
              <span className="relative z-10 hidden sm:inline">Anterior</span>
            </button>
            
            <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-bold text-slate-900 dark:text-white px-2">
              <span>{currentIndex + 1}</span>
              <span>/</span>
              <span>{cards.length}</span>
            </div>
            
            <button
              type="button"
              onClick={onNext}
              className="group/btn relative inline-flex items-center justify-center gap-1 sm:gap-2 rounded-lg bg-white dark:bg-slate-900 border-2 border-slate-900 dark:border-white px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-bold text-slate-900 dark:text-white shadow-lg hover:scale-105 transition-all overflow-hidden min-w-[80px] sm:min-w-[100px]"
            >
              <span className="relative z-10 hidden sm:inline">Próximo</span>
              <span className="relative z-10">→</span>
            </button>
          </div>
        </div>
      )}
      
      {/* Grid de mini cards - Tech */}
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 sm:gap-3">
        {cards.map((card, index) => {
          const isFavoriteCard = favorites.includes(card.id)
          const progress = cardProgress && cardProgress[card.id] ? cardProgress[card.id] : null
          const isReviewed = progress && progress.nextReview
          const isCurrent = index === currentIndex
          const isVisited = visited.includes(card.id)
          
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelect(index)}
              className={`group relative rounded border-2 px-2 py-2.5 text-xs font-bold transition-all overflow-hidden ${
                isCurrent
                  ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg scale-110 z-10'
                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white hover:border-slate-900 dark:hover:border-white'
              } ${isVisited ? 'opacity-100' : 'opacity-60'}`}
            >
              <div className="relative z-10 flex flex-col items-center gap-1">
                <span className="font-black">#{index + 1}</span>
                {isReviewed && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">✓</span>
                )}
                {isFavoriteCard && (
                  <span className="text-[10px] text-rose-500">♥</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default FlashcardList
