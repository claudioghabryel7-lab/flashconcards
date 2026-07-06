import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import StudyPostMedia from './StudyPostMedia'
import {
  CARD_COLOR_THEMES,
  CARD_FONT_STYLES,
  getDefaultCardTheme,
} from '../../utils/feedUtils'

export default function FeedPostEditModal({ post, open, saving, onClose, onSave }) {
  const defaults = getDefaultCardTheme(post?.modalidade)
  const [color, setColor] = useState(post?.cardTheme?.color || defaults.color)
  const [font, setFont] = useState(post?.cardTheme?.font || defaults.font)

  useEffect(() => {
    if (!open || !post) return
    const d = getDefaultCardTheme(post.modalidade)
    setColor(post.cardTheme?.color || d.color)
    setFont(post.cardTheme?.font || d.font)
  }, [open, post])

  if (!open || !post) return null

  const previewPost = { ...post, cardTheme: { color, font } }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Fechar"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[92vh] w-full max-w-[470px] overflow-y-auto rounded-t-2xl border border-cp-border bg-cp-bg shadow-2xl sm:rounded-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-cp-border bg-cp-bg/95 px-4 py-3 backdrop-blur-md">
          <h2 className="font-display text-base font-bold text-cp-text">Editar publicação</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-cp-muted hover:text-cp-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <div className="overflow-hidden rounded-xl border border-cp-border">
            <StudyPostMedia
              materia={post.materia}
              assunto={post.assunto}
              modalidade={post.modalidade}
              durationMinutes={post.durationMinutes}
              acertos={post.acertos}
              erros={post.erros}
              cardTheme={previewPost.cardTheme}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cp-muted">
              Cor do card
            </p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {Object.entries(CARD_COLOR_THEMES).map(([key, theme]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setColor(key)}
                  className={`flex flex-col items-center gap-1 rounded-xl p-1 transition ${
                    color === key ? 'ring-2 ring-cp-accent ring-offset-2 ring-offset-cp-bg' : ''
                  }`}
                >
                  <span className={`h-10 w-full rounded-lg ${theme.class}`} />
                  <span className="text-[9px] text-cp-muted">{theme.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cp-muted">
              Fonte do texto
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CARD_FONT_STYLES).map(([key, style]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFont(key)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    font === key
                      ? 'border-cp-accent bg-cp-accent/15 text-cp-accent'
                      : 'border-cp-border text-cp-text hover:border-cp-accent/40'
                  } ${style.titleClass}`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-cp-border py-2.5 text-sm font-medium text-cp-text"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => onSave({ color, font })}
              className="flex-1 rounded-xl bg-cp-accent py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
