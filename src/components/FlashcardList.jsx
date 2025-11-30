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
}) => {
  const visited = viewedIds || []
  const currentCard = cards[currentIndex]

  return (
    <div className="space-y-6">
      {/* Botão embaralhar - Tech */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onShuffle}
          className="group/btn relative inline-flex items-center gap-2 rounded-xl border-2 border-purple-500/30 dark:border-purple-400/30 px-4 py-2.5 text-sm font-bold text-purple-600 dark:text-purple-400 transition-all hover:border-purple-500 dark:hover:border-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-900/20 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/10 to-purple-500/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700"></div>
          <ArrowPathRoundedSquareIcon className="h-5 w-5 relative z-10" />
          <span className="relative z-10">Embaralhar</span>
        </button>
      </div>

      {/* Card Principal */}
      {currentCard && (
        <div className="space-y-4">
          <FlashcardItem
            card={currentCard}
            isFavorite={favorites.includes(currentCard.id)}
            onToggleFavorite={onToggleFavorite}
            onRateDifficulty={onRateDifficulty}
            showRating={showRating}
            cardProgress={cardProgress && cardProgress[currentCard.id] ? cardProgress[currentCard.id] : null}
            onExplainCard={onExplainCard}
          />
        </div>
      )}

      {/* Navegação - Tech */}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onPrev}
          className="group/btn relative inline-flex items-center justify-center gap-2 rounded-xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-2 border-blue-500/30 dark:border-blue-400/30 px-5 py-3 text-sm font-bold text-blue-600 dark:text-blue-400 shadow-lg hover:shadow-xl hover:border-blue-500 dark:hover:border-blue-400 hover:scale-105 transition-all overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/10 to-blue-500/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700"></div>
          <span className="relative z-10">← Anterior</span>
        </button>
        
        <div className="relative">
          <div className="absolute inset-0 bg-purple-500/20 rounded-full blur-md"></div>
          <div className="relative px-6 py-2.5 rounded-full bg-gradient-to-r from-purple-500/10 to-blue-500/10 dark:from-purple-500/20 dark:to-blue-500/20 border border-purple-500/30 dark:border-purple-400/30 backdrop-blur-sm">
            <p className="text-sm font-black bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent">
              {currentIndex + 1} / {cards.length}
            </p>
          </div>
        </div>
        
        <button
          type="button"
          onClick={onNext}
          className="group/btn relative inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:shadow-xl hover:shadow-blue-500/50 hover:scale-105 transition-all overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000"></div>
          <span className="relative z-10">Próximo →</span>
        </button>
      </div>

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
              className={`group relative rounded-xl border-2 px-2 py-2.5 text-xs font-bold transition-all overflow-hidden ${
                isCurrent
                  ? 'border-blue-500 dark:border-blue-400 bg-gradient-to-br from-blue-500/20 to-purple-500/20 dark:from-blue-500/30 dark:to-purple-500/30 text-blue-700 dark:text-blue-300 shadow-lg scale-110 z-10'
                  : 'border-slate-200/50 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 hover:border-blue-500/50 dark:hover:border-blue-400/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/20'
              } ${isVisited ? 'opacity-100' : 'opacity-60'}`}
            >
              {/* Background hover */}
              {!isCurrent && (
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-purple-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              )}
              
              {/* Glow para card atual */}
              {isCurrent && (
                <div className="absolute inset-0 bg-blue-500/30 rounded-xl blur-md"></div>
              )}
              
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
