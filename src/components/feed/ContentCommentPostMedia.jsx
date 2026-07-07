import { MessageCircle } from 'lucide-react'
import CommentFormattedText from '../content/CommentFormattedText'
import { POST_TYPE_LABELS, resolveCardFonts, resolveCardTheme, resolvePostType } from '../../utils/feedUtils'

export default function ContentCommentPostMedia({ post, exportMode = false }) {
  const postType = resolvePostType(post)
  const theme = resolveCardTheme({ modalidade: post.modalidade, cardTheme: post.cardTheme })
  const fonts = resolveCardFonts({ cardTheme: post.cardTheme })
  const label = POST_TYPE_LABELS[postType] || 'Comentário'
  const previewText =
    post.itemPreview?.enunciado ||
    post.itemPreview?.pergunta ||
    post.itemPreview?.text ||
    ''

  const Wrapper = exportMode ? 'div' : 'div'

  return (
    <Wrapper
      className={`relative block w-full overflow-hidden text-left outline-none ${exportMode ? '' : ''}`}
      style={{ background: theme.background, minHeight: '320px' }}
    >
      <div
        className="absolute inset-0"
        style={{ backgroundImage: theme.pattern, backgroundSize: 'auto' }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.22),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(0,0,0,0.35),transparent_60%)]" />

      <div className={`relative flex min-h-[320px] flex-col gap-4 p-5 sm:p-6 ${fonts.bodyClass}`}>
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
            <MessageCircle className="h-3.5 w-3.5" />
            {label}
          </span>
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {post.contentType === 'questao' ? 'Questão' : 'Flashcard'}
          </span>
        </div>

        {previewText && (
          <div className="rounded-xl bg-black/25 px-4 py-3 backdrop-blur-sm">
            <p className="font-mono text-[10px] uppercase tracking-wider text-white/70">Conteúdo comentado</p>
            <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-white/95">{previewText}</p>
          </div>
        )}

        {post.commentText && (
          <div className="flex-1 rounded-xl bg-black/30 px-4 py-3 backdrop-blur-sm">
            <p className="font-mono text-[10px] uppercase tracking-wider text-white/70">Comentário</p>
            <div className="comment-on-dark mt-2 max-h-[180px] overflow-hidden text-white [&_.text-cp-text]:text-white [&_em]:text-white/95 [&_mark]:text-inherit">
              <CommentFormattedText text={post.commentText} className="!text-sm !leading-relaxed" />
            </div>
          </div>
        )}

        {(post.materia || post.assunto) && (
          <div className="mt-auto">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/70">
              {post.materia || 'Matéria'}
            </p>
            {post.assunto && (
              <p className="line-clamp-1 text-sm text-white/90">{post.assunto}</p>
            )}
          </div>
        )}
      </div>
    </Wrapper>
  )
}
