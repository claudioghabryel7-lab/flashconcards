import FloatingCommentsShell from './content/ContentFloatingComments'
import { buildIncidenciaMateriaContentId, buildMateriaContentId } from '../utils/contentCommentIds'

/** Comentários flutuantes para materiais de estudo (somente balões). */
export default function MaterialFloatingComments({
  enabled,
  onToggle,
  courseId,
  topicKey = null,
  disciplinaKey = null,
  kind = 'completo',
  preview = '',
  materia = '',
  assunto = '',
  children,
}) {
  const contentId =
    kind === 'incidencia'
      ? buildIncidenciaMateriaContentId({ courseId, disciplinaKey: disciplinaKey || topicKey })
      : buildMateriaContentId({ courseId, topicKey, kind })

  const contentType = kind === 'incidencia' ? 'incidencia' : 'materia'

  return (
    <FloatingCommentsShell
      enabled={enabled}
      onToggle={onToggle}
      courseId={courseId}
      contentType={contentType}
      contentId={contentId}
      topicKey={topicKey}
      showComposeButton
      composePreview={preview}
      composeMateria={materia}
      composeAssunto={assunto}
      composeContextLabel="este material"
    >
      {children}
    </FloatingCommentsShell>
  )
}
