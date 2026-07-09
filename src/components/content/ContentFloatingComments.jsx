import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { XMarkIcon } from '@heroicons/react/24/solid'
import UserAvatar from '../UserAvatar'
import ContentFeedbackActions from './ContentFeedbackActions'
import { subscribeContentComments } from '../../services/contentCommentsService'
import {
  dismissFloatingComment,
  loadDismissedCommentIds,
  restoreAllFloatingComments,
  restoreFloatingComment,
} from '../../utils/floatingCommentsPrefs'
import '../../styles/floating-comments.css'

function stripCommentPreview(text = '') {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const CORNER_SNAPS = [
  { id: 'tl', leftPct: 1, topPct: 4 },
  { id: 'tr', rightPct: 1, topPct: 4 },
  { id: 'bl', leftPct: 1, bottomPct: 6 },
  { id: 'br', rightPct: 1, bottomPct: 6 },
]

function defaultPosition(index, side) {
  const topPct = 6 + (index % 5) * 15
  if (side === 'left') return { leftPct: 0.5, topPct }
  return { rightPct: 0.5, topPct }
}

function snapToNearestCorner(stageRect, bubbleRect) {
  const cx = bubbleRect.left + bubbleRect.width / 2 - stageRect.left
  const cy = bubbleRect.top + bubbleRect.height / 2 - stageRect.top
  const xRatio = cx / stageRect.width
  const yRatio = cy / stageRect.height
  const threshold = 0.28

  if (xRatio < threshold && yRatio < threshold) return CORNER_SNAPS[0]
  if (xRatio > 1 - threshold && yRatio < threshold) return CORNER_SNAPS[1]
  if (xRatio < threshold && yRatio > 1 - threshold) return CORNER_SNAPS[2]
  if (xRatio > 1 - threshold && yRatio > 1 - threshold) return CORNER_SNAPS[3]
  return null
}

function positionToStyle(pos) {
  if (!pos) return {}
  const style = {}
  if (pos.leftPct != null) style.left = `${pos.leftPct}%`
  if (pos.rightPct != null) style.right = `${pos.rightPct}%`
  if (pos.topPct != null) style.top = `${pos.topPct}%`
  if (pos.bottomPct != null) style.bottom = `${pos.bottomPct}%`
  return style
}

function rectToPosition(stageRect, bubbleRect) {
  const leftPx = bubbleRect.left - stageRect.left
  const topPx = bubbleRect.top - stageRect.top
  return {
    leftPct: (leftPx / stageRect.width) * 100,
    topPct: (topPx / stageRect.height) * 100,
  }
}

function DraggableFloatingBubble({
  comment,
  index,
  side,
  stageRef,
  position,
  onPositionChange,
  onDismiss,
}) {
  const bubbleRef = useRef(null)
  const dragRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const duration = 26 + (index % 5) * 4
  const delay = (index % 7) * 2.8
  const enterDelay = index * 0.14

  const finishDrag = useCallback(
    (pointerId) => {
      if (!dragRef.current || dragRef.current.pointerId !== pointerId) return
      const stage = stageRef.current
      const bubble = bubbleRef.current
      if (stage && bubble) {
        const snap = snapToNearestCorner(stage.getBoundingClientRect(), bubble.getBoundingClientRect())
        if (snap) onPositionChange(comment.id, { ...snap })
      }
      dragRef.current = null
      setIsDragging(false)
    },
    [comment.id, onPositionChange, stageRef],
  )

  useEffect(() => {
    if (!isDragging) return undefined

    const onMove = (e) => {
      if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return
      const stage = stageRef.current
      const bubble = bubbleRef.current
      if (!stage || !bubble) return

      const stageRect = stage.getBoundingClientRect()
      const { offsetX, offsetY } = dragRef.current
      const bubbleW = bubble.offsetWidth
      const bubbleH = bubble.offsetHeight
      const maxLeft = Math.max(stageRect.width - bubbleW, 0)
      const maxTop = Math.max(stageRect.height - bubbleH, 0)
      const leftPx = Math.min(Math.max(e.clientX - stageRect.left - offsetX, 0), maxLeft)
      const topPx = Math.min(Math.max(e.clientY - stageRect.top - offsetY, 0), maxTop)

      onPositionChange(comment.id, {
        leftPct: (leftPx / stageRect.width) * 100,
        topPct: (topPx / stageRect.height) * 100,
      })
    }

    const onUp = (e) => finishDrag(e.pointerId)

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
    }
  }, [isDragging, comment.id, finishDrag, onPositionChange, stageRef])

  const handlePointerDown = (e) => {
    if (e.button !== 0) return
    if (e.target.closest('.floating-mini-bubble__close, a')) return
    const stage = stageRef.current
    const bubble = bubbleRef.current
    if (!stage || !bubble) return

    e.preventDefault()
    e.stopPropagation()
    const stageRect = stage.getBoundingClientRect()
    const bubbleRect = bubble.getBoundingClientRect()
    onPositionChange(comment.id, rectToPosition(stageRect, bubbleRect))
    dragRef.current = {
      pointerId: e.pointerId,
      offsetX: e.clientX - bubbleRect.left,
      offsetY: e.clientY - bubbleRect.top,
    }
    setIsDragging(true)
  }

  const style = {
    ...positionToStyle(position || defaultPosition(index, side)),
    '--float-duration': `${duration}s`,
    '--float-delay': `${delay}s`,
    '--enter-delay': `${enterDelay}s`,
  }

  return (
    <div
      ref={bubbleRef}
      className={`floating-mini-bubble ${isDragging ? 'floating-mini-bubble--dragging' : ''} ${
        side === 'right' ? 'floating-mini-bubble--right' : ''
      }`}
      style={style}
      onPointerDown={handlePointerDown}
    >
      <div className="floating-mini-bubble__inner">
        <button
          type="button"
          className="floating-mini-bubble__close"
          aria-label="Ocultar comentário"
          title="Ocultar comentário"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onDismiss(comment.id)
          }}
        >
          <XMarkIcon className="h-3 w-3" />
        </button>
        <Link
          to={`/profile/${comment.userId}`}
          className="floating-mini-bubble__avatar"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <UserAvatar photoBase64={comment.userPhotoBase64} name={comment.userName || ''} size="sm" />
        </Link>
        <div className="floating-mini-bubble__body">
          <span className="floating-mini-bubble__name">{comment.userName || 'Usuário'}</span>
          <span className="floating-mini-bubble__text">{stripCommentPreview(comment.text)}</span>
        </div>
      </div>
    </div>
  )
}

/** Balões flutuantes — entrada animada, arrastáveis, ocultáveis com restauração manual. */
export default function FloatingCommentsShell({
  enabled,
  onToggle,
  courseId,
  contentType,
  contentId,
  alternateContentIds = [],
  topicKey = null,
  showComposeButton = false,
  composePreview = '',
  composeMateria = '',
  composeAssunto = '',
  composeContextLabel = 'este conteúdo',
  children,
}) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)
  const [dismissedIds, setDismissedIds] = useState(() => new Set())
  const [positions, setPositions] = useState({})
  const [showHiddenPanel, setShowHiddenPanel] = useState(false)
  const stageRef = useRef(null)

  useEffect(() => {
    setPositions({})
    setShowHiddenPanel(false)
    if (courseId && contentType && contentId) {
      setDismissedIds(loadDismissedCommentIds(courseId, contentType, contentId))
    } else {
      setDismissedIds(new Set())
    }
  }, [contentId, courseId, contentType])

  useEffect(() => {
    if (!enabled || !courseId || !contentId) {
      setComments([])
      return () => {}
    }

    setLoading(true)
    const unsub = subscribeContentComments(
      { courseId, contentType, contentId, alternateContentIds, topicKey },
      (rows) => {
        setComments(rows.slice(0, 8))
        setLoading(false)
      },
      () => setLoading(false),
    )
    return () => unsub?.()
  }, [enabled, courseId, contentType, contentId, alternateContentIds, topicKey])

  const visibleComments = useMemo(
    () => comments.filter((c) => !dismissedIds.has(c.id)),
    [comments, dismissedIds],
  )

  const hiddenComments = useMemo(
    () => comments.filter((c) => dismissedIds.has(c.id)),
    [comments, dismissedIds],
  )

  const handleDismiss = useCallback(
    (id) => {
      setDismissedIds((prev) =>
        dismissFloatingComment(courseId, contentType, contentId, id, prev),
      )
    },
    [courseId, contentType, contentId],
  )

  const handleRestore = useCallback(
    (id) => {
      setDismissedIds((prev) =>
        restoreFloatingComment(courseId, contentType, contentId, id, prev),
      )
    },
    [courseId, contentType, contentId],
  )

  const handleRestoreAll = useCallback(() => {
    setDismissedIds(restoreAllFloatingComments(courseId, contentType, contentId))
    setShowHiddenPanel(false)
  }, [courseId, contentType, contentId])

  const handlePositionChange = useCallback((id, pos) => {
    setPositions((prev) => ({ ...prev, [id]: pos }))
  }, [])

  const showBubbles = enabled && !loading && visibleComments.length > 0

  return (
    <div className="floating-comments-root">
      <div className="floating-comments-toolbar flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          className={`floating-comments-toggle rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
            enabled
              ? 'border-cp-accent/40 bg-cp-accent/15 text-cp-accent'
              : 'border-cp-border bg-cp-surface/60 text-cp-text hover:border-cp-accent/30'
          }`}
        >
          {enabled ? '☁️ Comentários flutuantes ativos' : 'Ativar comentários flutuantes'}
        </button>

        {enabled && hiddenComments.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowHiddenPanel((v) => !v)}
              className="rounded-xl border border-cp-border bg-cp-surface/60 px-3 py-2 text-xs font-semibold text-cp-muted transition hover:border-cp-accent/30 hover:text-cp-text"
            >
              {hiddenComments.length} oculto{hiddenComments.length > 1 ? 's' : ''}
            </button>
            {showHiddenPanel && (
              <div className="floating-comments-hidden-panel absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-cp-border bg-cp-surface p-2 shadow-xl">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-cp-muted">
                  Comentários ocultos
                </p>
                <ul className="max-h-48 space-y-1 overflow-y-auto">
                  {hiddenComments.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => handleRestore(c.id)}
                        className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-cp-text transition hover:bg-cp-accent/10"
                      >
                        <span className="font-semibold">{c.userName || 'Usuário'}</span>
                        <span className="mt-0.5 block truncate text-cp-muted">
                          {stripCommentPreview(c.text)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={handleRestoreAll}
                  className="mt-2 w-full rounded-lg border border-cp-border px-2 py-1.5 text-xs font-medium text-cp-accent transition hover:bg-cp-accent/10"
                >
                  Mostrar todos
                </button>
              </div>
            )}
          </div>
        )}

        {showComposeButton && courseId && contentId && (
          <ContentFeedbackActions
            courseId={courseId}
            contentType={contentType}
            contentId={contentId}
            alternateContentIds={alternateContentIds}
            topicKey={topicKey}
            preview={composePreview}
            materia={composeMateria}
            assunto={composeAssunto}
            contextLabel={composeContextLabel}
            variant="inline"
            className="!gap-1"
          />
        )}
      </div>

      <div
        ref={stageRef}
        className={`floating-comments-stage ${enabled ? 'floating-comments-stage--active' : ''}`}
      >
        {showBubbles &&
          visibleComments.map((c, i) => (
            <DraggableFloatingBubble
              key={c.id}
              comment={c}
              index={i}
              side={i % 2 === 0 ? 'left' : 'right'}
              stageRef={stageRef}
              position={positions[c.id]}
              onPositionChange={handlePositionChange}
              onDismiss={handleDismiss}
            />
          ))}

        <div className="floating-comments-content">{children}</div>
      </div>
    </div>
  )
}
