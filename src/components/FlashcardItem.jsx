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
            initial={{ opacity: 0, scale: 0.5, y: -50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.5, y: -100 }}
            className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500 rounded-full blur-2xl opacity-50 animate-pulse"></div>
              <div className="relative rounded-full bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 px-8 py-4 text-xl font-black text-white shadow-2xl border-4 border-white">
                ⭐ Subiu de Nível!
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="relative h-[400px] sm:h-[450px] w-full cursor-pointer group"
        style={{ perspective: 1200 }}
        onClick={toggle}
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.2 }}
      >
        {/* Frente do Card - Design Tecnológico */}
        <motion.div
          className="absolute inset-0 flex flex-col justify-between rounded-3xl bg-gradient-to-br from-white via-blue-50/30 to-purple-50/30 dark:from-slate-800 dark:via-blue-900/20 dark:to-purple-900/20 p-6 shadow-2xl border-4 border-blue-500/50 dark:border-blue-400/50 backdrop-blur-sm"
          animate={{ 
            rotateY: flipped ? 180 : 0
          }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          style={{ 
            backfaceVisibility: 'hidden', 
            transformStyle: 'preserve-3d'
          }}
        >
          {/* Background glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-cyan-500/5 rounded-3xl"></div>
          <div className="relative z-10">
            {/* Botão de favoritar - Tech */}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onToggleFavorite(card.id)
              }}
              className={`group/fav absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-xl transition-all ${
                isFavorite 
                  ? 'bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/50' 
                  : 'bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-2 border-rose-500/30 dark:border-rose-400/30 text-rose-500 dark:text-rose-400 hover:border-rose-500 dark:hover:border-rose-400'
              }`}
            >
              {isFavorite && (
                <div className="absolute inset-0 bg-rose-500 rounded-xl blur-md opacity-50 group-hover/fav:opacity-75 transition-opacity"></div>
              )}
              <HeartIcon className="h-5 w-5 relative z-10" />
            </button>

            {/* Badge de estágio - Tech */}
            {cardProgress && cardProgress.stage > 0 && (
              <div className="absolute left-4 top-4 z-20">
                <div className={`relative rounded-xl ${stageInfo.color} px-3 py-1.5 text-xs font-black text-slate-700 dark:text-slate-200 shadow-lg border-2 border-white/50 dark:border-slate-900/50`}>
                  {stageInfo.label}
                </div>
              </div>
            )}

            {/* Badges de matéria/modulo */}
            <div className="mb-4 flex items-center gap-2 mt-12">
              {card.materia && (
                <span className="rounded-full bg-gradient-to-r from-blue-500/20 to-cyan-500/20 dark:from-blue-500/30 dark:to-cyan-500/30 border border-blue-500/30 dark:border-blue-400/30 px-3 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 backdrop-blur-sm">
                  {card.materia}
                </span>
              )}
              {card.modulo && (
                <span className="rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 dark:from-purple-500/30 dark:to-pink-500/30 border border-purple-500/30 dark:border-purple-400/30 px-3 py-1 text-xs font-bold text-purple-700 dark:text-purple-300 backdrop-blur-sm">
                  {card.modulo}
                </span>
              )}
            </div>
            
            {/* Pergunta */}
            <div className="flex-1 flex items-center justify-center min-h-[200px]">
              <h3 className="text-lg sm:text-xl md:text-2xl font-black text-slate-900 dark:text-white text-center px-4 leading-tight">
                {card.pergunta}
              </h3>
            </div>
            
            {/* Hint */}
            {!flipped && (
              <div className="mt-4 text-center">
                <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 animate-pulse">
                  👆 Clique para ver a resposta
                </p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Verso do Card - Design Tecnológico */}
        <motion.div
          className="absolute inset-0 flex flex-col justify-between rounded-3xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-600 dark:from-blue-700 dark:via-purple-700 dark:to-cyan-700 p-6 text-white shadow-2xl border-4 border-blue-400 dark:border-blue-500 backdrop-blur-sm"
          animate={{ 
            rotateY: flipped ? 0 : -180
          }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          style={{ 
            backfaceVisibility: 'hidden', 
            transformStyle: 'preserve-3d'
          }}
        >
          {/* Background pattern */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5 rounded-3xl"></div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_50%)] rounded-3xl"></div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-black uppercase tracking-widest text-white/90">
                ✓ Resposta
              </p>
            </div>
            
            {/* Resposta */}
            <div className="flex-1 flex items-center justify-center min-h-[200px]">
              <p className="text-lg sm:text-xl md:text-2xl font-black text-center px-4 leading-tight drop-shadow-lg">
                {card.resposta}
              </p>
            </div>
            
            {/* Botões de avaliação - Tech */}
            {showRating && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: flipped ? 1 : 0, y: flipped ? 0 : 20 }}
                transition={{ delay: flipped ? 0.3 : 0 }}
                className="space-y-3"
                style={{ pointerEvents: flipped ? 'auto' : 'none' }}
              >
                <p className="text-xs font-black uppercase tracking-widest text-white/90 text-center">
                  Como foi essa revisão?
                </p>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRate('hard')
                      }}
                      className="group/btn relative flex-1 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 px-4 py-3 text-sm font-black text-white shadow-xl hover:shadow-2xl hover:shadow-rose-500/50 border-2 border-white/20 min-h-[52px] overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000"></div>
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        <span>🔴</span>
                        <span>Difícil</span>
                      </span>
                    </motion.button>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRate('easy')
                      }}
                      className="group/btn relative flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-4 py-3 text-sm font-black text-white shadow-xl hover:shadow-2xl hover:shadow-emerald-500/50 border-2 border-white/20 min-h-[52px] overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-1000"></div>
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        <span>🟢</span>
                        <span>Fácil</span>
                      </span>
                    </motion.button>
                  </div>
                  {onExplainCard && (
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onExplainCard(card)
                      }}
                      className="group/btn relative w-full rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm text-slate-900 dark:text-white font-bold border-2 border-white/30 px-4 py-3 text-sm shadow-lg hover:shadow-xl overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/10 to-purple-500/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700"></div>
                      <span className="relative z-10 flex items-center justify-center gap-2">
                        <span>💡</span>
                        <span>Explicação da IA</span>
                      </span>
                    </motion.button>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

export default FlashcardItem
