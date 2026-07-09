import FloatingCommentsShell from './content/ContentFloatingComments'
import { buildFlashcardContentId } from '../utils/contentCommentIds'

/** Wrapper para flashcards — usa FloatingCommentsShell. */
export default function FlashcardFloatingComments(props) {
  const { courseId, card, topicKey, cardIndex = 0, enabled, onToggle, materia, assunto, children } = props

  const contentId = card ? buildFlashcardContentId({ courseId, topicKey, card, cardIndex }) : null
  const alternateContentIds = card?.id ? [`${card.id}`] : []

  if (children) {
    return (
      <FloatingCommentsShell
        enabled={enabled}
        onToggle={onToggle}
        courseId={courseId}
        contentType="flashcard"
        contentId={contentId}
        alternateContentIds={alternateContentIds}
        topicKey={topicKey}
        label="comentários neste flashcard"
      >
        {children}
      </FloatingCommentsShell>
    )
  }

  return (
    <FloatingCommentsShell
      enabled={enabled}
      onToggle={onToggle}
      courseId={courseId}
      contentType="flashcard"
      contentId={contentId}
      alternateContentIds={alternateContentIds}
      topicKey={topicKey}
      label="comentários neste flashcard"
    >
      <div />
    </FloatingCommentsShell>
  )
}
