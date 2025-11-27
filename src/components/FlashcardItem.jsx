import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HeartIcon } from '@heroicons/react/24/solid'

const FlashcardItem = ({ 
  card, 
  isFavorite, 
  onToggleFavorite, 
  onRateDifficulty,
  showRating = false,
  cardProgress = null,
  onExplainCard = null
}) => {
  const [flipped, setFlipped] = useState(false)
  const [showLevelUp, setShowLevelUp] = useState(false)

  const toggle = () => {
    setFlipped(!flipped)
  }

  const handleRate = (difficulty) => {
    if (onRateDifficulty) {
      // Mostrar animação de level up se foi fácil
      if (difficulty === 'easy' && cardProgress) {
        const currentStage = cardProgress.stage || 0
        if (currentStage < 5) {
          setShowLevelUp(true)
          setTimeout(() => setShowLevelUp(false), 2000)
        }
      }
      
      onRateDifficulty(card.id, difficulty)
      // Reset após um delay para permitir a animação
      setTimeout(() => {
        setFlipped(false)
      }, 300)
    }
  }

  const currentStage = cardProgress?.stage || 0
  const stageInfo = [
    { label: 'Novo', color: 'bg-slate-200 dark:bg-slate-700' },
    { label: 'Estágio 1', color: 'bg-blue-200 dark:bg-blue-800' },
    { label: 'Estágio 2', color: 'bg-indigo-200 dark:bg-indigo-800' },
    { label: 'Estágio 3', color: 'bg-purple-200 dark:bg-purple-800' },
    { label: 'Estágio 4', color: 'bg-pink-200 dark:bg-pink-800' },
    { label: 'Estágio 5', color: 'bg-emerald-200 dark:bg-emerald-800' },
    { label: 'Mestre', color: 'bg-yellow-200 dark:bg-yellow-800' },
  ][currentStage] || { label: 'Novo', color: 'bg-slate-200 dark:bg-slate-700' }

  return (
    <div className="relative mx-auto max-w-md w-full md:max-w-lg px-2 sm:px-0">
      <AnimatePresence>
        {showLevelUp && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
          >
            <div className="rounded-full bg-emerald-500 px-6 sm:px-8 py-3 sm:py-4 text-xl sm:text-2xl font-black text-white shadow-2xl">
              ⭐ Subiu de Nível!
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="relative h-56 sm:h-64 w-full cursor-pointer"
        style={{ perspective: 1000 }}
        onClick={toggle}
      >
        {/* Frente do Card */}
        <motion.div
          className="absolute inset-0 flex flex-col justify-between rounded-2xl bg-white dark:bg-slate-800 p-4 shadow-xl border-4 border-alego-500 dark:border-alego-600"
          animate={{ 
            rotateY: flipped ? 180 : 0
          }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          style={{ 
            backfaceVisibility: 'hidden', 
            transformStyle: 'preserve-3d'
          }}
        >
          {/* Botão de favoritar - dentro do card para girar junto */}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggleFavorite(card.id)
            }}
            className={`absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${
              isFavorite 
                ? 'bg-rose-500 border-rose-600 text-white' 
                : 'bg-white dark:bg-slate-800 border-alego-300 dark:border-alego-600 text-rose-500 dark:text-rose-400'
            }`}
          >
            <HeartIcon className="h-4 w-4" />
          </button>

          {/* Badge de estágio - dentro do card para girar junto */}
          {cardProgress && cardProgress.stage > 0 && (
            <div className="absolute left-3 top-3 z-20">
              <div className={`rounded-full ${stageInfo.color} px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200`}>
                {stageInfo.label}
              </div>
            </div>
          )}

          <div className="mb-2 flex items-center gap-2 mt-10">
            {card.materia && (
              <span className="rounded-full bg-alego-100 dark:bg-alego-900 px-2 py-1 text-xs font-semibold text-alego-700 dark:text-alego-300">
                {card.materia}
              </span>
            )}
            {card.modulo && (
              <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
                {card.modulo}
              </span>
            )}
          </div>
          <div className="flex-1 flex items-center justify-center">
            <h3 className="text-base sm:text-lg md:text-xl font-bold text-alego-700 dark:text-alego-300 text-center px-2 sm:px-4">
              {card.pergunta}
            </h3>
          </div>
          {!flipped && (
            <p className="text-xs text-center text-slate-500 dark:text-slate-400 px-2">
              Clique para ver a resposta
            </p>
          )}
        </motion.div>

        {/* Verso do Card */}
        <motion.div
          className="absolute inset-0 flex flex-col justify-between rounded-2xl bg-gradient-to-br from-alego-600 to-alego-500 dark:from-alego-700 dark:to-alego-600 p-4 text-white shadow-xl border-4 border-alego-400 dark:border-alego-500"
          animate={{ 
            rotateY: flipped ? 0 : -180
          }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          style={{ 
            backfaceVisibility: 'hidden', 
            transformStyle: 'preserve-3d'
          }}
        >
          <p className="text-xs font-semibold text-alego-100 uppercase tracking-wide">
            Resposta
          </p>
          <div className="flex-1 flex items-center justify-center">
            <p className="text-base sm:text-lg font-bold text-center px-2 sm:px-4">
              {card.resposta}
            </p>
          </div>
          
          {showRating && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: flipped ? 1 : 0, y: flipped ? 0 : 20 }}
              transition={{ delay: flipped ? 0.3 : 0 }}
              className="space-y-2"
              style={{ pointerEvents: flipped ? 'auto' : 'none' }}
            >
              <p className="text-xs font-semibold text-alego-100 text-center">
                Como foi essa revisão?
              </p>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRate('hard')
                    }}
                    className="flex-1 rounded-lg bg-rose-500 px-2 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg hover:bg-rose-600 border-2 border-rose-600 min-h-[44px]"
                  >
                    🔴 Difícil
                  </motion.button>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRate('easy')
                    }}
                    className="flex-1 rounded-lg bg-emerald-500 px-2 sm:px-3 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg hover:bg-emerald-600 border-2 border-emerald-600 min-h-[44px]"
                  >
                    🟢 Fácil
                  </motion.button>
                </div>
                {onExplainCard && (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onExplainCard(card)
                    }}
                    className="w-full rounded-lg bg-white/90 text-alego-700 font-semibold border-2 border-alego-200 px-3 py-2 text-xs sm:text-sm shadow-sm hover:bg-white"
                  >
                    💡 Explicação da IA
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </div>
  )
}

export default FlashcardItem
