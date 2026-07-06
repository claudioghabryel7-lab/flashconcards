import { useRef, useState } from 'react'
import { BookOpen, Clock, Target, XCircle } from 'lucide-react'
import { MODALITY_LABELS, resolveCardFonts, resolveCardGradient } from '../../utils/feedUtils'

export default function StudyPostMedia({
  materia,
  assunto,
  modalidade,
  durationMinutes,
  acertos,
  erros,
  cardTheme,
  onDoubleTapLike,
}) {
  const [showHeart, setShowHeart] = useState(false)
  const lastTap = useRef(0)
  const gradientClass = resolveCardGradient({ modalidade, cardTheme })
  const fonts = resolveCardFonts({ cardTheme })
  const modalityLabel = MODALITY_LABELS[modalidade] || modalidade
  const hasStats = acertos != null

  const handleTap = () => {
    const now = Date.now()
    if (now - lastTap.current < 300) {
      onDoubleTapLike?.()
      setShowHeart(true)
      setTimeout(() => setShowHeart(false), 900)
    }
    lastTap.current = now
  }

  return (
    <button
      type="button"
      onClick={handleTap}
      className={`relative aspect-square w-full text-left outline-none ${gradientClass}`}
      aria-label="Card de estudo — toque duas vezes para curtir"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.22),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(0,0,0,0.35),transparent_60%)]" />

      <div className={`relative flex h-full flex-col justify-between p-5 sm:p-6 ${fonts.bodyClass}`}>
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full bg-black/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
            {modalityLabel}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <Clock className="h-3.5 w-3.5" />
            {durationMinutes || 0} min
          </span>
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/80">
            Sessão de estudo
          </p>
          <h3
            className={`text-2xl font-bold leading-tight text-white drop-shadow-sm sm:text-3xl ${fonts.titleClass}`}
          >
            {materia || 'Matéria'}
          </h3>
          {assunto && (
            <p className="line-clamp-2 text-sm leading-relaxed text-white/90 drop-shadow-sm sm:text-base">
              {assunto}
            </p>
          )}
        </div>

        {hasStats ? (
          <div className="flex gap-3">
            <div className="flex flex-1 items-center gap-2 rounded-2xl bg-black/30 px-4 py-3 backdrop-blur-sm">
              <Target className="h-5 w-5 text-emerald-200" />
              <div>
                <p className="text-xl font-bold text-white">{acertos}</p>
                <p className="text-[10px] uppercase tracking-wide text-white/75">acertos</p>
              </div>
            </div>
            <div className="flex flex-1 items-center gap-2 rounded-2xl bg-black/30 px-4 py-3 backdrop-blur-sm">
              <XCircle className="h-5 w-5 text-rose-200" />
              <div>
                <p className="text-xl font-bold text-white">{erros || 0}</p>
                <p className="text-[10px] uppercase tracking-wide text-white/75">erros</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-white/75">
            <BookOpen className="h-5 w-5" />
            <span className="text-xs font-medium uppercase tracking-wider">Trilha de estudos</span>
          </div>
        )}
      </div>

      {showHeart && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="animate-[feedHeart_0.9s_ease-out_forwards] text-7xl drop-shadow-2xl">
            ❤️
          </span>
        </div>
      )}
    </button>
  )
}
