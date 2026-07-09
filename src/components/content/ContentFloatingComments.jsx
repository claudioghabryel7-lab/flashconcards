import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { XMarkIcon } from '@heroicons/react/24/solid'
import UserAvatar from '../UserAvatar'
import ContentFeedbackActions from './ContentFeedbackActions'
import { subscribeContentComments } from '../../services/contentCommentsService'
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
  const style = { top: pos.topPct != null ? `${pos.topPct}%` : undefined }
  if (pos.leftPct != null) style.left = `${pos.leftPct}%`
  if (pos.rightPct != null) style.right = `${pos.rightPct}%`
  if (pos.bottomPct != null) {
    style.bottom = `${pos.bottomPct}%`
    delete style.top
  }
  return style
}

function DraggableFloatingBubble({ comment, index, side, stageRef, position, onPositionChange, onDismiss }) {
  const bubbleRef = useRef(null)
  const dragRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const duration = 26 + (index % 5) * 4
  const delay = (index % 7) * 2.8

  const handlePointerDown = (e) => {
    if (e.button !== 0) return
    if (e.target.closest('.floating-mini-bubble__close, a')) return
    const stage = stageRef.current
    const bubble = bubbleRef.current
    if (!stage || !bubble) return

    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const stageRect = stage.getBoundingClientRect()
    const bubbleRect = bubble.getBoundingClientRect()
    dragRef.current = {
      pointerId: e.pointerId,
      offsetX: e.clientX - bubbleRect.left,
      offsetY: e.clientY - bubbleRect.top,
      stageRect,
    }
    setIsDragging(true)
  }

  const handlePointerMove = (e) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return
    const { offsetX, offsetY, stageRect } = dragRef.current
    const bubble = bubbleRef.current
    if (!bubble) return

    const bubbleW = bubble.offsetWidth
    const bubbleH = bubble.offsetHeight
    const maxLeft = stageRect.width - bubbleW
    const maxTop = stageRect.height - bubbleH
    const leftPx = Math.min(Math.max(e.clientX - stageRect.left - offsetX, 0), maxLeft)
    const topPx = Math.min(Math.max(e.clientY - stageRect.top - offsetY, 0), maxTop)

    onPositionChange(comment.id, {
      leftPct: (leftPx / stageRect.width) * 100,
      topPct: (topPx / stageRect.height) * 100,
    })
  }

  const handlePointerUp = (e) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return
    const stage = stageRef.current
    const bubble = bubbleRef.current
    if (stage && bubble) {
      const snap = snapToNearestCorner(stage.getBoundingClientRect(), bubble.getBoundingClientRect())
      if (snap) onPositionChange(comment.id, { ...snap })
    }
    dragRef.current = null
    setIsDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const style = {
    ...positionToStyle(position || defaultPosition(index, side)),
    '--float-duration': `${duration}s`,
    '--float-delay': `${delay}s`,
  }

  return (
    <div
      ref={bubbleRef}
      className={`floating-mini-bubble ${isDragging ? 'floating-mini-bubble--dragging' : ''} ${
        side === 'right' ? 'floating-mini-bubble--right' : ''
      }`}
      style={style}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <button
        type="button"
        className="floating-mini-bubble__close"
        aria-label="Fechar comentário"
        title="Remover da tela"
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
  )
}

/** Balões flutuantes nas laterais — arrastáveis, dispensáveis e com snap nos cantos. */
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
  const stageRef = useRef(null)

  useEffect(() => {
    setDismissedIds(new Set())
    setPositions({})
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

  const handleDismiss = useCallback((id) => {
    setDismissedIds((prev) => new Set([...prev, id]))
  }, [])

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
