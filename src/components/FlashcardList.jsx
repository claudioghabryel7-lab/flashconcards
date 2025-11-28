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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onShuffle}
            className="flex items-center gap-2 rounded-full border border-alego-600 dark:border-alego-500 px-4 py-2 text-sm font-semibold text-alego-600 dark:text-alego-400 transition hover:bg-alego-50 dark:hover:bg-alego-900"
          >
            <ArrowPathRoundedSquareIcon className="h-4 w-4" />
            Embaralhar
          </button>
        </div>
      </div>

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

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          className="rounded-full bg-white dark:bg-slate-800 px-4 py-2 text-sm font-semibold text-alego-600 dark:text-alego-400 shadow"
        >
          Anterior
        </button>
        <p className="text-sm font-semibold text-alego-600 dark:text-alego-400">
          {currentIndex + 1} / {cards.length}
        </p>
        <button
          type="button"
          onClick={onNext}
          className="rounded-full bg-alego-600 dark:bg-alego-700 px-4 py-2 text-sm font-semibold text-white shadow"
        >
          Próximo
        </button>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {cards.map((card, index) => {
          const isFavoriteCard = favorites.includes(card.id)
          const progress = cardProgress && cardProgress[card.id] ? cardProgress[card.id] : null
          const isReviewed = progress && progress.nextReview
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelect(index)}
              className={`relative rounded-xl border px-2 py-3 text-xs font-semibold transition ${
                index === currentIndex
                  ? 'border-alego-600 dark:border-alego-500 bg-alego-50 dark:bg-alego-900 text-alego-700 dark:text-alego-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              } ${visited.includes(card.id) ? 'opacity-100' : 'opacity-70'}`}
            >
              Card {index + 1}
              {isReviewed && (
                <span className="absolute right-1 top-1 text-emerald-600">✓</span>
              )}
              {isFavoriteCard && (
                <span className="absolute right-1 top-4 text-rose-500">♥</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default FlashcardList
