import { useRef, useState } from 'react'
import { BookOpen, MessageCircle } from 'lucide-react'
import {
  getPostOpenUrl,
  MODALITY_LABELS,
  resolveCardFonts,
  resolveCardTheme,
  resolveContentQuestionText,
} from '../../utils/feedUtils'

export default function ContentCommentPostMedia({ post, exportMode = false, onDoubleTapLike }) {
  const theme = resolveCardTheme({ modalidade: post.modalidade, cardTheme: post.cardTheme })
  const fonts = resolveCardFonts({ cardTheme: post.cardTheme })
  const modalityLabel = MODALITY_LABELS[post.modalidade] || post.modalidade || 'Comentário'
  const contentLabel =
    post.contentType === 'questao'
      ? 'Questão'
      : post.contentType === 'incidencia'
        ? 'Incidência'
        : 'Flashcard'
  const questionText = resolveContentQuestionText(post)
  const openUrl = exportMode ? null : getPostOpenUrl(post)
  const [showHeart, setShowHeart] = useState(false)
  const lastTap = useRef(0)

  const handleTap = () => {
    if (exportMode) return
    const now = Date.now()
    if (now - lastTap.current < 300) {
      onDoubleTapLike?.()
      setShowHeart(true)
      setTimeout(() => setShowHeart(false), 900)
      return
    }
    lastTap.current = now
    if (openUrl) window.open(openUrl, '_blank', 'noopener,noreferrer')
  }

  const Wrapper = exportMode ? 'div' : 'button'

  return (
    <Wrapper
      type={exportMode ? undefined : 'button'}
      onClick={exportMode ? undefined : handleTap}
      className={`relative aspect-square w-full text-left outline-none ${exportMode ? '' : 'cursor-pointer'}`}
      style={{ background: theme.background }}
      aria-label={exportMode ? undefined : 'Comentário — toque duas vezes para curtir'}
    >
      <div
        className="absolute inset-0"
        style={{ backgroundImage: theme.pattern, backgroundSize: 'auto' }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.22),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(0,0,0,0.35),transparent_60%)]" />

      <div className={`relative flex h-full min-h-0 flex-col p-5 sm:p-6 ${fonts.bodyClass}`}>
        <div className="flex shrink-0 items-start justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
            <MessageCircle className="h-3.5 w-3.5" />
            {modalityLabel}
          </span>
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {contentLabel}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-center py-3">
          {questionText ? (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/75">
                {post.contentType === 'flashcard' ? 'Pergunta' : 'Enunciado'}
              </p>
              <p
                className={`mt-2 line-clamp-[8] text-base font-semibold leading-snug text-white drop-shadow-sm sm:text-lg ${fonts.titleClass}`}
              >
                {questionText}
              </p>
            </>
          ) : (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/80">
                Comentário público
              </p>
              <h3
                className={`mt-2 text-2xl font-bold leading-tight text-white drop-shadow-sm sm:text-3xl ${fonts.titleClass}`}
              >
                {post.materia || 'Matéria'}
              </h3>
              {post.assunto && (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/90 drop-shadow-sm sm:text-base">
                  {post.assunto}
                </p>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 space-y-1">
          {questionText && (
            <p className="line-clamp-1 text-xs font-medium text-white/80">
              {post.materia || 'Matéria'}
              {post.assunto ? ` · ${post.assunto}` : ''}
            </p>
          )}
          {!exportMode && (
            <div className="flex items-center justify-center gap-2 text-white/70">
              <BookOpen className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">
                Toque para abrir · duplo toque para curtir
              </span>
            </div>
          )}
        </div>
      </div>

      {showHeart && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="animate-[feedHeart_0.9s_ease-out_forwards] text-7xl drop-shadow-2xl">
            ❤️
          </span>
        </div>
      )}
    </Wrapper>
  )
}
