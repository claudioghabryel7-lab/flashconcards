import { useState } from 'react'

import { motion, AnimatePresence } from 'framer-motion'
import { HeartIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/solid'
import { useAuth } from '../hooks/useAuth'

const FlashcardItem = ({ 
  card, 
  isFavorite, 
  onToggleFavorite, 
  onRateDifficulty,
  showRating = false,
  cardProgress = null,
  onExplainCard = null,
  onDeleteFlashcard = null,
  onEditFlashcard = null
}) => {
  const [flipped, setFlipped] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editPergunta, setEditPergunta] = useState(card.pergunta)
  const [editResposta, setEditResposta] = useState(card.resposta)
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const toggle = () => {
    setFlipped(!flipped)
  }

  const handleRate = (difficulty) => {
    if (onRateDifficulty) {
      onRateDifficulty(card.id, difficulty)
      setTimeout(() => {
        setFlipped(false)
      }, 300)
    }
  }

  const handleEdit = () => {
    setEditPergunta(card.pergunta)
    setEditResposta(card.resposta)
    setEditing(true)
    setFlipped(false)
  }

  const handleSaveEdit = () => {
    if (onEditFlashcard) {
      onEditFlashcard(card.id, editPergunta, editResposta)
    }
    setEditing(false)
  }

  const handleDelete = () => {
    if (onDeleteFlashcard && window.confirm('Tem certeza que deseja excluir este flashcard?')) {
      onDeleteFlashcard(card.id)
    }
  }

  return (
    <div className='relative mx-auto w-full max-w-2xl xl:max-w-3xl px-2 sm:px-0 mb-4'>
      <motion.div
        className='relative min-h-[400px] sm:min-h-[450px] md:min-h-[500px] max-h-[85vh] sm:max-h-[90vh] w-full cursor-pointer group overflow-visible'
        style={{ perspective: 1200 }}
        onClick={toggle}
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          className='absolute inset-0 flex flex-col justify-between rounded-3xl bg-gradient-to-br from-white via-blue-50/30 to-purple-50/30 dark:from-slate-800 dark:via-blue-900/20 dark:to-purple-900/20 p-3 sm:p-4 md:p-6 shadow-2xl border-2 sm:border-4 border-blue-500/50 dark:border-blue-400/50 backdrop-blur-sm overflow-hidden'
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          style={{ backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' }}
        >
          <div className='relative z-10 h-full flex flex-col overflow-hidden min-h-0'>
            {/* Botões de ação */}
            <div className='absolute right-2 sm:right-3 md:right-4 top-2 sm:top-3 md:top-4 z-20 flex gap-2'>
              {/* Botão de favoritos */}
              <button
                type='button'
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleFavorite(card.id)
                }}
                className={'group/fav flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl transition-all touch-manipulation ' +
                  (isFavorite 
                    ? 'text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-900/20' 
                    : 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20')
                }
              >
                <HeartIcon className='h-5 w-5 sm:h-6 sm:w-6' />
              </button>
              
              {/* Botão de editar (apenas admin) */}
              {isAdmin && !editing && (
                <button
                  type='button'
                  onClick={(event) => {
                    event.stopPropagation()
                    handleEdit()
                  }}
                  className='group/edit flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl transition-all touch-manipulation text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                >
                  <PencilIcon className='h-5 w-5 sm:h-6 sm:w-6' />
                </button>
              )}
              
              {/* Botão de excluir (apenas admin) */}
              {isAdmin && !editing && (
                <button
                  type='button'
                  onClick={(event) => {
                    event.stopPropagation()
                    handleDelete()
                  }}
                  className='group/delete flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl transition-all touch-manipulation text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                >
                  <TrashIcon className='h-5 w-5 sm:h-6 sm:w-6' />
                </button>
              )}
            </div>

            <div className='flex-1 flex flex-col justify-center items-center text-center px-2 sm:px-4 py-4 sm:py-6'>
              {editing ? (
                <div className='w-full space-y-4' onClick={(e) => e.stopPropagation()}>
                  <textarea
                    value={editPergunta}
                    onChange={(e) => setEditPergunta(e.target.value)}
                    className='w-full p-3 rounded-lg border-2 border-blue-300 dark:border-blue-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-lg font-bold resize-none'
                    rows={3}
                    placeholder='Pergunta'
                  />
                  <div className='flex gap-2 justify-center'>
                    <button
                      type='button'
                      onClick={handleSaveEdit}
                      className='px-4 py-2 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition'
                    >
                      Salvar
                    </button>
                    <button
                      type='button'
                      onClick={() => setEditing(false)}
                      className='px-4 py-2 bg-slate-500 text-white rounded-lg font-bold hover:bg-slate-600 transition'
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className='text-lg sm:text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4 sm:mb-6 leading-relaxed'>
                    {card.pergunta}
                  </h3>
                  
                  <div className='text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium'>
                    Clique para ver resposta 
                  </div>
                </>
              )}
            </div>

            <div className='flex flex-wrap gap-1 sm:gap-2 justify-center'>
              {card.materia && (
                <span className='px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs rounded-full'>
                  {card.materia}
                </span>
              )}
              {card.modulo && (
                <span className='px-2 py-1 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 text-xs rounded-full'>
                  {card.modulo}
                </span>
              )}
              {cardProgress?.lastDifficulty && (
                <span className={`px-2 py-1 text-xs rounded-full ${
                  cardProgress.lastDifficulty === 'easy' 
                    ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' 
                    : 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300'
                }`}>
                  Última: {cardProgress.lastDifficulty === 'easy' ? 'Fácil' : 'Difícil'}
                </span>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          className='absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-50 via-green-50/50 to-teal-50/30 dark:from-emerald-900/20 dark:via-green-900/20 dark:to-teal-900/20 p-3 sm:p-4 md:p-6 shadow-2xl border-2 sm:border-4 border-emerald-500/50 dark:border-emerald-400/50 backdrop-blur-sm overflow-hidden'
          animate={{ rotateY: flipped ? 0 : 180 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          style={{ backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' }}
        >
          <div className='relative z-10 h-full flex flex-col'>
            <div className='flex-1 flex flex-col justify-center items-center text-center px-2 sm:px-4 py-4 sm:py-6 min-h-0'>
              <div className='mb-4 sm:mb-6'>
                <div className='inline-flex px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'>
                  Resposta
                </div>
              </div>
              
              {editing ? (
                <div className='w-full space-y-4' onClick={(e) => e.stopPropagation()}>
                  <textarea
                    value={editResposta}
                    onChange={(e) => setEditResposta(e.target.value)}
                    className='w-full p-3 rounded-lg border-2 border-emerald-300 dark:border-emerald-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-base resize-none'
                    rows={6}
                    placeholder='Resposta'
                  />
                  <div className='flex gap-2 justify-center'>
                    <button
                      type='button'
                      onClick={handleSaveEdit}
                      className='px-4 py-2 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition'
                    >
                      Salvar
                    </button>
                    <button
                      type='button'
                      onClick={() => setEditing(false)}
                      className='px-4 py-2 bg-slate-500 text-white rounded-lg font-bold hover:bg-slate-600 transition'
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className='text-base sm:text-lg md:text-xl font-medium text-slate-800 dark:text-slate-100 leading-relaxed overflow-y-auto max-h-[200px] sm:max-h-[300px] md:max-h-[400px] px-1'>
                  {card.resposta}
                </div>
              )}
            </div>
            
            {showRating && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: flipped ? 1 : 0, y: flipped ? 0 : 20 }}
                transition={{ delay: flipped ? 0.3 : 0 }}
                className='space-y-2 sm:space-y-2.5 md:space-y-3 mt-2 sm:mt-3 md:mt-4 flex-shrink-0 pb-2 sm:pb-0'
                style={{ pointerEvents: flipped ? 'auto' : 'none' }}
              >
                {cardProgress?.lastDifficulty && (
                  <div className='flex justify-center mb-2'>
                    <span className={`px-3 py-1 text-xs rounded-full font-medium ${
                      cardProgress.lastDifficulty === 'easy' 
                        ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' 
                        : 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300'
                    }`}>
                      Última revisão: {cardProgress.lastDifficulty === 'easy' ? 'Fácil' : 'Difícil'}
                    </span>
                  </div>
                )}
                
                <p className='text-center text-xs sm:text-sm md:text-base font-bold text-slate-600 dark:text-slate-300 mb-3 sm:mb-4'>
                  Como foi essa revisão?
                </p>
                <div className='flex gap-2 sm:gap-3'>
                  <motion.button
                    type='button'
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRate('hard')
                    }}
                    className='group/btn relative flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 px-3 sm:px-4 md:px-5 py-3 sm:py-3.5 md:py-4 text-xs sm:text-sm md:text-base font-black text-white shadow-xl hover:shadow-2xl hover:shadow-orange-500/50 border-2 border-white/20 min-h-[48px] sm:min-h-[52px] md:min-h-[56px] overflow-hidden touch-manipulation'
                  >
                    <span className='relative z-10 flex items-center justify-center gap-2 sm:gap-2.5 md:gap-3'>
                      <span className='text-sm sm:text-base md:text-lg'></span>
                      <span className='whitespace-nowrap'>Difícil</span>
                      <span className='text-xs sm:text-sm opacity-75'>(1 min)</span>
                    </span>
                  </motion.button>
                  <motion.button
                    type='button'
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRate('easy')
                    }}
                    className='group/btn relative flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-3 sm:px-4 md:px-5 py-3 sm:py-3.5 md:py-4 text-xs sm:text-sm md:text-base font-black text-white shadow-xl hover:shadow-2xl hover:shadow-emerald-500/50 border-2 border-white/20 min-h-[48px] sm:min-h-[52px] md:min-h-[56px] overflow-hidden touch-manipulation'
                  >
                    <span className='relative z-10 flex items-center justify-center gap-2 sm:gap-2.5 md:gap-3'>
                      <span className='text-sm sm:text-base md:text-lg'></span>
                      <span className='whitespace-nowrap'>Fácil</span>
                      <span className='text-xs sm:text-sm opacity-75'>(15 min)</span>
                    </span>
                  </motion.button>
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

