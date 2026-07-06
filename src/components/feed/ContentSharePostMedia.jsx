import { BookOpen, Brain, FileText, Layers } from 'lucide-react'
import { POST_TYPE_LABELS, resolveCardFonts, resolveCardTheme, resolvePostType, FEED_POST_TYPES } from '../../utils/feedUtils'

const TYPE_ICONS = {
  flashcards: Layers,
  questoes: Brain,
  material: FileText,
  trilha: BookOpen,
}

export default function ContentSharePostMedia({
  post,
  cardTheme,
  exportMode = false,
  onOpen,
}) {
  const postType = resolvePostType(post)
  const theme = resolveCardTheme({ modalidade: post.modalidade, cardTheme: cardTheme || post.cardTheme })
  const fonts = resolveCardFonts({ cardTheme: cardTheme || post.cardTheme })
  const label = POST_TYPE_LABELS[postType] || postType
  const Icon = TYPE_ICONS[postType] || BookOpen

  const statLabel =
    postType === FEED_POST_TYPES.FLASHCARDS
      ? `${post.itemCount || 0} cards`
      : postType === FEED_POST_TYPES.QUESTOES
        ? `${post.itemCount || 0} questões`
        : postType === FEED_POST_TYPES.MATERIAL
          ? 'Material de apoio'
          : null

  const Wrapper = exportMode ? 'div' : 'a'
  const wrapperProps = exportMode
    ? {}
    : {
        href: onOpen || '#',
        target: '_blank',
        rel: 'noopener noreferrer',
        onClick: (e) => {
          if (!onOpen) e.preventDefault()
        },
      }

  return (
    <Wrapper
      {...wrapperProps}
      className={`relative block aspect-square w-full overflow-hidden text-left outline-none ${exportMode ? '' : 'cursor-pointer'}`}
      style={{ background: theme.background }}
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
            <Icon className="h-3.5 w-3.5" />
            {label}
          </span>
          {statLabel && (
            <span className="rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
              {statLabel}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/80">
            Concurseiro Preditivo
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

        {!exportMode && (
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-white/80">
            Toque para abrir
          </p>
        )}
      </div>
    </Wrapper>
  )
}
