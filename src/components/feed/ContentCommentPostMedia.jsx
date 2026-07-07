import { useRef, useState } from 'react'
import { BookOpen, MessageCircle } from 'lucide-react'
import { getPostOpenUrl, MODALITY_LABELS, resolveCardFonts, resolveCardTheme } from '../../utils/feedUtils'

export default function ContentCommentPostMedia({ post, exportMode = false, onDoubleTapLike }) {
  const theme = resolveCardTheme({ modalidade: post.modalidade, cardTheme: post.cardTheme })
  const fonts = resolveCardFonts({ cardTheme: post.cardTheme })
  const modalityLabel = MODALITY_LABELS[post.modalidade] || post.modalidade || 'Comentário'
  const contentLabel = post.contentType === 'questao' ? 'Questão' : 'Flashcard'
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

      <div className={`relative flex h-full flex-col justify-between p-5 sm:p-6 ${fonts.bodyClass}`}>
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
            <MessageCircle className="h-3.5 w-3.5" />
            {modalityLabel}
          </span>
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {contentLabel}
          </span>
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/80">
            Comentário público
          </p>
          <h3
            className={`text-2xl font-bold leading-tight text-white drop-shadow-sm sm:text-3xl ${fonts.titleClass}`}
          >
            {post.materia || 'Matéria'}
          </h3>
          {post.assunto && (
            <p className="line-clamp-2 text-sm leading-relaxed text-white/90 drop-shadow-sm sm:text-base">
              {post.assunto}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 text-white/75">
          <BookOpen className="h-5 w-5" />
          <span className="text-xs font-medium uppercase tracking-wider">
            Toque para abrir o conteúdo
          </span>
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
