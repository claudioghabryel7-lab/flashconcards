import { useState, useEffect, memo, useRef } from 'react'
import { HeartIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/solid'
import { useAuth } from '../hooks/useAuth'
import ContentFeedbackActions from './content/ContentFeedbackActions'
import { buildFlashcardContentId } from '../utils/contentCommentIds'

const FlashcardItem = ({
  card,
  isFavorite,
  onToggleFavorite,
  onRateDifficulty,
  showRating = false,
  cardProgress = null,
  onDeleteFlashcard = null,
  onEditFlashcard = null,
  courseId = null,
  topicKey = null,
  cardIndex = 0,
  materia = '',
  assunto = '',
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
  const touchStart = useRef(null)

  const setFlipped = (value) => {
    const next = typeof value === 'function' ? value(flipped) : value
    if (isControlled) onFlipChange?.(next)
    else setInternalFlipped(next)
  }

  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
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

  const handlePointerDown = (e) => {
    if (editing) return
    touchStart.current = { x: e.clientX, y: e.clientY }
  }

  const handlePointerUp = (e) => {
    if (editing || !touchStart.current) return
    const dx = Math.abs(e.clientX - touchStart.current.x)
    const dy = Math.abs(e.clientY - touchStart.current.y)
    touchStart.current = null
    if (dx < 12 && dy < 12) toggle()
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
    setFlipped(false)
    setEditing(true)
  }

  const handleSaveEdit = async () => {
    if (!onEditFlashcard) {
      setEditing(false)
      return
    }
    try {
      setSavingEdit(true)
      await onEditFlashcard(card.id, editPergunta, editResposta)
      setEditing(false)
    } catch {
      // mantém formulário aberto em caso de erro
    } finally {
      setSavingEdit(false)
    }
  }

  const editForm = (
    <div className="w-full space-y-4" onClick={(e) => e.stopPropagation()}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Frente</p>
      <textarea
        value={editPergunta}
        onChange={(e) => setEditPergunta(e.target.value)}
        className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-base font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white sm:text-lg"
        rows={3}
        placeholder="Pergunta"
      />
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Verso</p>
      <textarea
        value={editResposta}
        onChange={(e) => setEditResposta(e.target.value)}
        className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        rows={4}
        placeholder="Resposta"
      />
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={handleSaveEdit}
          disabled={savingEdit}
          className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {savingEdit ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={savingEdit}
          className="rounded-xl border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
        >
          Cancelar
        </button>
      </div>
    </div>
  )

  const handleDelete = () => {
    if (onDeleteFlashcard && window.confirm('Tem certeza que deseja excluir este flashcard?')) {
      onDeleteFlashcard(card.id)
    }
  }

  const showInlineRating = showRating && !ratingBelowCard && flipped
  const cardHeight = 'min-h-[min(340px,52dvh)] h-[min(340px,52dvh)] sm:min-h-[360px] sm:h-[360px]'

  return (
    <div className="relative mx-auto w-full max-w-xl px-0 sm:px-0">
      <div
        className={`relative mx-auto w-full cursor-pointer select-none ${cardHeight}`}
        style={{ perspective: '1200px', WebkitPerspective: '1200px', touchAction: 'manipulation' }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (editing) return
          if (e.code === 'Enter' || e.code === 'Space') {
            e.preventDefault()
            toggle()
          }
        }}
        aria-label={flipped ? 'Mostrar pergunta' : 'Mostrar resposta'}
      >
        <div
          className="relative h-full w-full transition-transform duration-500 ease-out will-change-transform"
          style={{
            transformStyle: 'preserve-3d',
            WebkitTransformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Frente */}
          <div
            className={`absolute inset-0 flex h-full w-full flex-col overflow-hidden rounded-3xl border p-5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.15)] sm:p-8 ${borderColor} ${cardColor}`}
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(0deg) translateZ(1px)',
            }}
          >
            <div className="relative z-10 flex h-full min-h-0 flex-col">
              <div className="absolute left-0 top-0 z-20">
                {courseId && (
                  <ContentFeedbackActions
                    courseId={courseId}
                    contentType="flashcard"
                    contentId={buildFlashcardContentId({ courseId, topicKey, card, cardIndex })}
                    alternateContentIds={card?.id ? [`${card.id}`] : []}
                    topicKey={topicKey}
                    preview={card.pergunta}
                    materia={materia}
                    assunto={assunto}
                    contextLabel="este flashcard"
                    variant="compact"
                  />
                )}
              </div>
              <div className="absolute right-0 top-0 z-20 flex gap-1">
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleFavorite(card.id)
                  }}
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition-all ${
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
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEdit()
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                      aria-label="Editar"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete()
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                      aria-label="Excluir"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-1 py-6 text-center sm:px-2 sm:py-8">
                {editing ? (
                  editForm
                ) : (
                  <>
                    <span className="mb-3 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                      Pergunta
                    </span>
                    <h3 className={`text-lg font-semibold leading-relaxed sm:text-2xl ${textColor}`}>
                      {card.pergunta}
                    </h3>
                    <p className="noji-hint mt-6 text-sm text-slate-400">Toque para revelar a resposta</p>
                  </>
                )}
              </div>

              {(card.materia || card.modulo) && (
                <div className="mt-auto flex shrink-0 flex-wrap justify-center gap-1.5 pt-2">
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

          {/* Verso */}
          <div
            className={`absolute inset-0 flex h-full w-full flex-col overflow-hidden rounded-3xl border p-5 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.15)] sm:p-8 ${borderColor} ${
              cardColor === 'bg-white' || cardColor === 'bg-slate-100'
                ? 'bg-slate-900 dark:bg-slate-800'
                : 'bg-slate-900'
            }`}
            style={{
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg) translateZ(1px)',
            }}
          >
            <div className="relative z-10 flex h-full min-h-0 flex-col">
              <div className="absolute right-0 top-0 z-20 flex gap-1">
                {isAdmin && !editing && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit()
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10"
                    aria-label="Editar verso"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-1 py-4 text-center sm:px-2 sm:py-6">
                {!editing && (
                  <span className="mb-3 inline-flex shrink-0 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/70">
                    Resposta
                  </span>
                )}
                {editing ? (
                  <div className="w-full text-left">{editForm}</div>
                ) : (
                  <div className="w-full text-base font-medium leading-relaxed text-white sm:text-xl">
                    {card.resposta}
                  </div>
                )}
              </div>

              {showInlineRating && (
                <div className="mt-auto shrink-0 space-y-3 border-t border-white/10 pt-4" onClick={(e) => e.stopPropagation()}>
                  <p className="text-center text-xs font-medium text-white/60">Como foi essa revisão?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleRate('hard')}
                      className="noji-rate-hard flex-1 rounded-2xl py-3.5 text-sm font-bold"
                      style={{ touchAction: 'manipulation' }}
                    >
                      Difícil
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRate('easy')}
                      className="noji-rate-easy flex-1 rounded-2xl py-3.5 text-sm font-bold"
                      style={{ touchAction: 'manipulation' }}
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
