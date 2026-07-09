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

const CORNER_SNAPS_LEFT = [
  { id: 'tl', leftPct: 0, topPct: 2 },
  { id: 'bl', leftPct: 0, bottomPct: 4 },
]

const CORNER_SNAPS_RIGHT = [
  { id: 'tr', rightPct: 0, topPct: 2 },
  { id: 'br', rightPct: 0, bottomPct: 4 },
]

function defaultPosition(index, side) {
  const topPct = 4 + (index % 5) * 16
  if (side === 'left') return { leftPct: 0, topPct }
  return { rightPct: 0, topPct }
}

function snapToNearestCorner(laneRect, bubbleRect, side) {
  const cy = bubbleRect.top + bubbleRect.height / 2 - laneRect.top
  const yRatio = cy / laneRect.height
  const snaps = side === 'right' ? CORNER_SNAPS_RIGHT : CORNER_SNAPS_LEFT
  return yRatio > 0.5 ? snaps[1] : snaps[0]
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
  laneRef,
  position,
  onPositionChange,
  onDismiss,
  layoutMode = 'lane',
}) {
  const bubbleRef = useRef(null)
  const dragRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const isLaneLayout = layoutMode === 'lane'
  const duration = 26 + (index % 5) * 4
  const delay = (index % 7) * 2.8
  const enterDelay = index * 0.14

  const finishDrag = useCallback(
    (pointerId) => {
      if (!dragRef.current || dragRef.current.pointerId !== pointerId) return
      if (!isLaneLayout) {
        dragRef.current = null
        setIsDragging(false)
        return
      }
      const lane = laneRef.current
      const bubble = bubbleRef.current
      if (lane && bubble) {
        const snap = snapToNearestCorner(
          lane.getBoundingClientRect(),
          bubble.getBoundingClientRect(),
          side,
        )
        if (snap) onPositionChange(comment.id, { ...snap })
      }
      dragRef.current = null
      setIsDragging(false)
    },
    [comment.id, isLaneLayout, laneRef, onPositionChange, side],
  )

  useEffect(() => {
    if (!isDragging || !isLaneLayout) return undefined

    const onMove = (e) => {
      if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return
      const lane = laneRef.current
      const bubble = bubbleRef.current
      if (!lane || !bubble) return

      const laneRect = lane.getBoundingClientRect()
      const { offsetX, offsetY } = dragRef.current
      const bubbleW = bubble.offsetWidth
      const bubbleH = bubble.offsetHeight
      const maxLeft = Math.max(laneRect.width - bubbleW, 0)
      const maxTop = Math.max(laneRect.height - bubbleH, 0)
      const leftPx = Math.min(Math.max(e.clientX - laneRect.left - offsetX, 0), maxLeft)
      const topPx = Math.min(Math.max(e.clientY - laneRect.top - offsetY, 0), maxTop)

      onPositionChange(comment.id, {
        leftPct: (leftPx / laneRect.width) * 100,
        topPct: (topPx / laneRect.height) * 100,
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
  }, [isDragging, comment.id, finishDrag, isLaneLayout, laneRef, onPositionChange])

  const handlePointerDown = (e) => {
    if (!isLaneLayout) return
    if (e.button !== 0) return
    if (e.target.closest('.floating-mini-bubble__close, a')) return
    const lane = laneRef.current
    const bubble = bubbleRef.current
    if (!lane || !bubble) return

    e.preventDefault()
    e.stopPropagation()
    const laneRect = lane.getBoundingClientRect()
    const bubbleRect = bubble.getBoundingClientRect()
    onPositionChange(comment.id, rectToPosition(laneRect, bubbleRect))
    dragRef.current = {
      pointerId: e.pointerId,
      offsetX: e.clientX - bubbleRect.left,
      offsetY: e.clientY - bubbleRect.top,
    }
    setIsDragging(true)
  }

  const style = isLaneLayout
    ? {
        ...positionToStyle(position || defaultPosition(index, side)),
        '--float-duration': `${duration}s`,
        '--float-delay': `${delay}s`,
        '--enter-delay': `${enterDelay}s`,
      }
    : {
        '--float-duration': `${duration}s`,
        '--float-delay': `${delay}s`,
        '--enter-delay': `${enterDelay}s`,
      }

  return (
    <div
      ref={bubbleRef}
      className={`floating-mini-bubble ${isLaneLayout ? '' : 'floating-mini-bubble--stacked'} ${
        isDragging ? 'floating-mini-bubble--dragging' : ''
      } ${side === 'right' ? 'floating-mini-bubble--right' : ''}`}
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
  const [layoutMode, setLayoutMode] = useState('lane')
  const stageRef = useRef(null)
  const leftLaneRef = useRef(null)
  const rightLaneRef = useRef(null)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const sync = () => setLayoutMode(mq.matches ? 'stacked' : 'lane')
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

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
  const leftComments = visibleComments.filter((_, i) => i % 2 === 0)
  const rightComments = visibleComments.filter((_, i) => i % 2 === 1)

  const renderBubble = (comment, index, side, laneRef) => (
    <DraggableFloatingBubble
      key={comment.id}
      comment={comment}
      index={index}
      side={side}
      laneRef={laneRef}
      position={positions[comment.id]}
      onPositionChange={handlePositionChange}
      onDismiss={handleDismiss}
      layoutMode={layoutMode}
    />
  )

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
        className={`floating-comments-stage ${enabled ? 'floating-comments-stage--active' : ''} ${
          showBubbles && layoutMode === 'stacked' ? 'floating-comments-stage--stacked' : ''
        }`}
      >
        {showBubbles && layoutMode === 'stacked' && (
          <div className="floating-comments-mobile-strip" aria-hidden={false}>
            {visibleComments.map((c, i) =>
              renderBubble(c, i, i % 2 === 0 ? 'left' : 'right', stageRef),
            )}
          </div>
        )}

        {showBubbles && layoutMode === 'lane' && (
          <>
            <div ref={leftLaneRef} className="floating-comments-lane floating-comments-lane--left">
              {leftComments.map((c, i) => renderBubble(c, i, 'left', leftLaneRef))}
            </div>
            <div ref={rightLaneRef} className="floating-comments-lane floating-comments-lane--right">
              {rightComments.map((c, i) => renderBubble(c, i, 'right', rightLaneRef))}
            </div>
          </>
        )}

        <div className="floating-comments-content">{children}</div>
      </div>
    </div>
  )
}
