import { ArrowPathRoundedSquareIcon } from '@heroicons/react/24/outline'
import FlashcardItem from './FlashcardItem'

const filters = [
  { key: 'all', label: 'Todos' },
  { key: 'new', label: 'Não estudados' },
  { key: 'favorite', label: 'Favoritos' },
]

const FlashcardList = ({
  cards,
  currentIndex,
  onSelect,
  onToggleFavorite,
  favorites,
  filter,
  setFilter,
  onPrev,
  onNext,
  onShuffle,
  viewedIds,
}) => {
  const visited = viewedIds || []
  const currentCard = cards[currentIndex]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2">
          {filters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                filter === item.key
                  ? 'bg-alego-600 text-white'
                  : 'bg-white text-alego-600 shadow'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onShuffle}
          className="flex items-center gap-2 rounded-full border border-alego-600 px-4 py-2 text-sm font-semibold text-alego-600 transition hover:bg-alego-50"
        >
          <ArrowPathRoundedSquareIcon className="h-4 w-4" />
          Embaralhar
        </button>
      </div>

      {currentCard && (
        <FlashcardItem
          card={currentCard}
          isFavorite={favorites.includes(currentCard.id)}
          onToggleFavorite={onToggleFavorite}
        />
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-alego-600 shadow"
        >
          Anterior
        </button>
        <p className="text-sm font-semibold text-alego-600">
          {currentIndex + 1} / {cards.length}
        </p>
        <button
          type="button"
          onClick={onNext}
          className="rounded-full bg-alego-600 px-4 py-2 text-sm font-semibold text-white shadow"
        >
          Próximo
        </button>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {cards.map((card, index) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelect(index)}
            className={`rounded-xl border px-2 py-3 text-xs font-semibold transition ${
              index === currentIndex
                ? 'border-alego-600 bg-alego-50 text-alego-700'
                : 'border-slate-200 bg-white text-slate-600'
            } ${visited.includes(card.id) ? 'opacity-100' : 'opacity-70'}`}
          >
            Card {index + 1}
          </button>
        ))}
      </div>
    </div>
  )
}

export default FlashcardList

