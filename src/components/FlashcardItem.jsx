import { useState, useEffect, memo } from 'react'
import { HeartIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/solid'
import { useAuth } from '../hooks/useAuth'

const FlashcardItem = ({
  card,
  isFavorite,
  onToggleFavorite,
  onRateDifficulty,
  showRating = false,
  cardProgress = null,
  onDeleteFlashcard = null,
  onEditFlashcard = null,
  cardColor = 'bg-white',
  textColor = 'text-slate-900',
  borderColor = 'border-slate-200',
  flipped: flippedProp,
  onFlipChange = null,
  ratingBelowCard = true,
}) => {
  const [internalFlipped, setInternalFlipped] = useState(false)
  const isControlled = typeof flippedProp === 'boolean'
  const flipped = isControlled ? flippedProp : internalFlipped

  const setFlipped = (value) => {
    const next = typeof value === 'function' ? value(flipped) : value
    if (isControlled) onFlipChange?.(next)
    else setInternalFlipped(next)
  }

  const [editing, setEditing] = useState(false)
  const [editPergunta, setEditPergunta] = useState(card.pergunta)
  const [editResposta, setEditResposta] = useState(card.resposta)
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    setFlipped(false)
    setEditing(false)
    setEditPergunta(card.pergunta)
    setEditResposta(card.resposta)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id])

  const toggle = () => {
    if (editing) return
    setFlipped(!flipped)
  }

  const handleRate = (difficulty) => {
    if (onRateDifficulty) {
      onRateDifficulty(card.id, difficulty)
      setTimeout(() => setFlipped(false), 200)
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

  const showInlineRating = showRating && !ratingBelowCard && flipped

  return (
    <div className="noji-card-wrap relative mx-auto w-full max-w-xl px-1 sm:px-0">
      <div className="noji-flip-container relative mx-auto w-full min-h-[320px] cursor-pointer select-none sm:min-h-[360px]">
        <div className={`noji-flip-inner ${flipped ? 'is-flipped' : ''}`} onClick={toggle}>
        <div
          className={`noji-card-face noji-flip-front flex flex-col rounded-3xl ${cardColor} p-6 sm:p-8 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.15)] border ${borderColor}`}
        >
          <div className="relative z-10 flex h-full min-h-[280px] flex-col sm:min-h-[320px]">
            <div className="absolute right-0 top-0 z-20 flex gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleFavorite(card.id)
                }}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
                  isFavorite
                    ? 'bg-rose-50 text-rose-500 dark:bg-rose-950/40'
                    : 'text-slate-400 hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-slate-800'
                }`}
                aria-label={isFavorite ? 'Remover dos favoritos' : 'Favoritar'}
              >
                <HeartIcon className="h-5 w-5" />
              </button>
              {isAdmin && !editing && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit()
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Editar"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete()
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                    aria-label="Excluir"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>

            <div className="flex flex-1 flex-col items-center justify-center px-2 py-8 text-center">
              {editing ? (
                <div className="w-full space-y-4" onClick={(e) => e.stopPropagation()}>
                  <textarea
                    value={editPergunta}
                    onChange={(e) => setEditPergunta(e.target.value)}
                    className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-lg font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    rows={4}
                    placeholder="Pergunta"
                  />
                  <div className="flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveEdit}
                      className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="mb-4 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                    Pergunta
                  </span>
                  <h3 className={`text-xl font-semibold leading-relaxed sm:text-2xl ${textColor}`}>
                    {card.pergunta}
                  </h3>
                  <p className="noji-hint mt-8 text-sm text-slate-400">
                    Toque para revelar a resposta
                  </p>
                </>
              )}
            </div>

            {(card.materia || card.modulo) && (
              <div className="mt-auto flex flex-wrap justify-center gap-1.5 pt-2">
                {card.materia && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {card.materia}
                  </span>
                )}
                {card.modulo && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {card.modulo}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          className={`noji-card-face noji-flip-back flex flex-col rounded-3xl p-6 sm:p-8 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.15)] border ${borderColor} ${
            cardColor === 'bg-white' || cardColor === 'bg-slate-100'
              ? 'bg-slate-900 dark:bg-slate-800'
              : 'bg-slate-900'
          }`}
        >
          <div className="relative z-10 flex h-full min-h-[280px] flex-col sm:min-h-[320px]">
            <div className="flex flex-1 flex-col items-center justify-center px-2 py-6 text-center">
              <span className="mb-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/70">
                Resposta
              </span>
              {editing ? (
                <div className="w-full space-y-4" onClick={(e) => e.stopPropagation()}>
                  <textarea
                    value={editResposta}
                    onChange={(e) => setEditResposta(e.target.value)}
                    className="w-full resize-none rounded-2xl border border-white/20 bg-white/10 p-4 text-base text-white"
                    rows={6}
                    placeholder="Resposta"
                  />
                </div>
              ) : (
                <div className="max-h-[240px] overflow-y-auto text-lg font-medium leading-relaxed text-white sm:text-xl">
                  {card.resposta}
                </div>
              )}
            </div>

            {showInlineRating && (
              <div className="mt-auto space-y-3 border-t border-white/10 pt-4" onClick={(e) => e.stopPropagation()}>
                <p className="text-center text-xs font-medium text-white/60">Como foi essa revisão?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleRate('hard')}
                    className="noji-rate-hard flex-1 rounded-2xl py-3.5 text-sm font-bold"
                  >
                    Difícil
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRate('easy')}
                    className="noji-rate-easy flex-1 rounded-2xl py-3.5 text-sm font-bold"
                  >
                    Fácil
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}

export default memo(FlashcardItem)
