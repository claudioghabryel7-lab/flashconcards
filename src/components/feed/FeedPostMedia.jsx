import StudyPostMedia from './StudyPostMedia'
import ContentSharePostMedia from './ContentSharePostMedia'
import ContentCommentPostMedia from './ContentCommentPostMedia'
import { FEED_POST_TYPES, getPostOpenUrl, resolvePostType } from '../../utils/feedUtils'

export default function FeedPostMedia({ post, onDoubleTapLike, exportMode = false }) {
  const postType = resolvePostType(post)

  if (postType === FEED_POST_TYPES.TRILHA) {
    return (
      <StudyPostMedia
        materia={post.materia}
        assunto={post.assunto}
        modalidade={post.modalidade}
        durationMinutes={post.durationMinutes}
        acertos={post.acertos}
        erros={post.erros}
        cardTheme={post.cardTheme}
        onDoubleTapLike={onDoubleTapLike}
        exportMode={exportMode}
      />
    )
  }

  if (postType === FEED_POST_TYPES.COMENTARIO) {
    return <ContentCommentPostMedia post={post} exportMode={exportMode} />
  }

  return (
    <ContentSharePostMedia
      post={post}
      cardTheme={post.cardTheme}
      exportMode={exportMode}
      onOpen={exportMode ? undefined : getPostOpenUrl(post)}
    />
  )
}
