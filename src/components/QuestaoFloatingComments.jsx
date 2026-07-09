import FloatingCommentsShell from './content/ContentFloatingComments'

export default function QuestaoFloatingComments({
  enabled,
  onToggle,
  courseId,
  contentId,
  alternateContentIds = [],
  topicKey = null,
  children,
}) {
  return (
    <FloatingCommentsShell
      enabled={enabled}
      onToggle={onToggle}
      courseId={courseId}
      contentType="questao"
      contentId={contentId}
      alternateContentIds={alternateContentIds}
      topicKey={topicKey}
    >
      {children}
    </FloatingCommentsShell>
  )
}
