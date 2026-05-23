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
          className='absolute inset-0 flex flex-col justify-between rounded-lg bg-white dark:bg-slate-900 p-4 sm:p-6 md:p-8 shadow-2xl border-2 border-slate-900 dark:border-white overflow-hidden'
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
                className={'group/fav flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg transition-all touch-manipulation border border-slate-300 dark:border-slate-600 ' +
                  (isFavorite 
                    ? 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-600' 
                    : 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-600')
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
                  className='group/edit flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg transition-all touch-manipulation text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-900 dark:hover:border-white'
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
                  className='group/delete flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-lg transition-all touch-manipulation text-slate-400 hover:text-red-500 border border-slate-300 dark:border-slate-600 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-600'
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
                    className='w-full p-3 rounded-lg border-2 border-slate-900 dark:border-white bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-lg font-bold resize-none'
                    rows={3}
                    placeholder='Pergunta'
                  />
                  <div className='flex gap-2 justify-center'>
                    <button
                      type='button'
                      onClick={handleSaveEdit}
                      className='px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg font-bold hover:opacity-80 transition'
                    >
                      Salvar
                    </button>
                    <button
                      type='button'
                      onClick={() => setEditing(false)}
                      className='px-4 py-2 border-2 border-slate-900 dark:border-white text-slate-900 dark:text-white rounded-lg font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition'
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className='text-lg sm:text-xl md:text-2xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6 leading-relaxed'>
                    {card.pergunta}
                  </h3>
                  
                  <div className='text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium'>
                    Clique para ver resposta 
                  </div>
                </>
              )}
            </div>

            <div className='flex flex-wrap gap-1 sm:gap-2 justify-center'>
              {card.materia && (
                <span className='px-2 py-1 border border-slate-900 dark:border-white text-slate-900 dark:text-white text-xs rounded'>
                  {card.materia}
                </span>
              )}
              {card.modulo && (
                <span className='px-2 py-1 border border-slate-900 dark:border-white text-slate-900 dark:text-white text-xs rounded'>
                  {card.modulo}
                </span>
              )}
              {cardProgress?.lastDifficulty && (
                <span className={`px-2 py-1 text-xs rounded border ${
                  cardProgress.lastDifficulty === 'easy' 
                    ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400' 
                    : 'border-orange-600 text-orange-600 dark:border-orange-400 dark:text-orange-400'
                }`}>
                  Última: {cardProgress.lastDifficulty === 'easy' ? 'Fácil' : 'Difícil'}
                </span>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          className='absolute inset-0 rounded-lg bg-slate-900 dark:bg-white p-4 sm:p-6 md:p-8 shadow-2xl border-2 border-slate-900 dark:border-white overflow-hidden'
          animate={{ rotateY: flipped ? 0 : 180 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          style={{ backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' }}
        >
          <div className='relative z-10 h-full flex flex-col'>
            <div className='flex-1 flex flex-col justify-center items-center text-center px-2 sm:px-4 py-4 sm:py-6 min-h-0'>
              <div className='mb-4 sm:mb-6'>
                <div className='inline-flex px-3 py-1 rounded text-xs font-bold border border-white dark:border-slate-900 text-white dark:text-slate-900'>
                  Resposta
                </div>
              </div>
              
              {editing ? (
                <div className='w-full space-y-4' onClick={(e) => e.stopPropagation()}>
                  <textarea
                    value={editResposta}
                    onChange={(e) => setEditResposta(e.target.value)}
                    className='w-full p-3 rounded-lg border-2 border-white dark:border-slate-900 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-base resize-none'
                    rows={6}
                    placeholder='Resposta'
                  />
                  <div className='flex gap-2 justify-center'>
                    <button
                      type='button'
                      onClick={handleSaveEdit}
                      className='px-4 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg font-bold hover:opacity-80 transition'
                    >
                      Salvar
                    </button>
                    <button
                      type='button'
                      onClick={() => setEditing(false)}
                      className='px-4 py-2 border-2 border-white dark:border-slate-900 text-white dark:text-slate-900 rounded-lg font-bold hover:bg-slate-800 dark:hover:bg-slate-200 transition'
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className='text-base sm:text-lg md:text-xl font-medium text-white dark:text-slate-900 leading-relaxed overflow-y-auto max-h-[200px] sm:max-h-[300px] md:max-h-[400px] px-1'>
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
                    <span className={`px-3 py-1 text-xs rounded font-medium border ${
                      cardProgress.lastDifficulty === 'easy' 
                        ? 'border-white dark:border-slate-900 text-white dark:text-slate-900' 
                        : 'border-white dark:border-slate-900 text-white dark:text-slate-900'
                    }`}>
                      Última revisão: {cardProgress.lastDifficulty === 'easy' ? 'Fácil' : 'Difícil'}
                    </span>
                  </div>
                )}
                
                <p className='text-center text-xs sm:text-sm md:text-base font-bold text-white dark:text-slate-900 mb-3 sm:mb-4'>
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
                    className='group/btn relative flex-1 rounded-lg bg-white dark:bg-slate-900 px-3 sm:px-4 md:px-5 py-3 sm:py-3.5 md:py-4 text-xs sm:text-sm md:text-base font-black text-slate-900 dark:text-white border-2 border-white dark:border-slate-900 min-h-[48px] sm:min-h-[52px] md:min-h-[56px] overflow-hidden touch-manipulation hover:opacity-80 transition'
                  >
                    <span className='relative z-10 flex items-center justify-center gap-2 sm:gap-2.5 md:gap-3'>
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
                    className='group/btn relative flex-1 rounded-lg bg-white dark:bg-slate-900 px-3 sm:px-4 md:px-5 py-3 sm:py-3.5 md:py-4 text-xs sm:text-sm md:text-base font-black text-slate-900 dark:text-white border-2 border-white dark:border-slate-900 min-h-[48px] sm:min-h-[52px] md:min-h-[56px] overflow-hidden touch-manipulation hover:opacity-80 transition'
                  >
                    <span className='relative z-10 flex items-center justify-center gap-2 sm:gap-2.5 md:gap-3'>
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

