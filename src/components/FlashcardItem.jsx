import { useState } from 'react'
import { motion } from 'framer-motion'
import { HeartIcon } from '@heroicons/react/24/solid'

const cardBaseClass =
  'relative h-64 w-full cursor-pointer rounded-2xl bg-white p-6 text-slate-800 shadow-lg shadow-alego-100 transition'

const FlashcardItem = ({ card, isFavorite, onToggleFavorite }) => {
  const [flipped, setFlipped] = useState(false)

  const toggle = () => setFlipped((prev) => !prev)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onToggleFavorite(card.id)
        }}
        className={`absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border text-white ${
          isFavorite ? 'bg-rose-500 border-rose-500' : 'bg-white border-alego-200 text-rose-500'
        }`}
      >
        <HeartIcon className="h-5 w-5" />
      </button>
      <motion.div
        className="relative"
        style={{ perspective: 1000 }}
        onClick={toggle}
      >
        <motion.div
          className={`${cardBaseClass} ${flipped ? 'opacity-0' : 'opacity-100'}`}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.6 }}
          style={{ backfaceVisibility: 'hidden' }}
        >
          <p className="mb-2 text-xs font-semibold uppercase text-alego-500">
            {card.categoria}
          </p>
          <h3 className="text-2xl font-bold text-alego-700">{card.pergunta}</h3>
          <div className="mt-6 flex flex-wrap gap-2">
            {(card.tags || []).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-alego-50 px-3 py-1 text-xs font-semibold text-alego-600"
              >
                {tag}
              </span>
            ))}
          </div>
        </motion.div>

        <motion.div
          className={`${cardBaseClass} absolute inset-0`}
          animate={{ rotateY: flipped ? 0 : -180 }}
          transition={{ duration: 0.6 }}
          style={{ backfaceVisibility: 'hidden' }}
        >
          <p className="text-sm font-semibold text-alego-500">Resposta</p>
          <p className="mt-2 text-xl font-bold">{card.resposta}</p>
          <p className="mt-4 text-sm text-slate-600">{card.explicacao}</p>
          <p className="mt-4 text-xs font-medium text-alego-500">
            Referência: {card.referencia}
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}

export default FlashcardItem

