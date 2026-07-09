const DISMISSED_KEY = 'cp:floating-comments-dismissed'
const ENABLED_KEY = 'cp:floating-comments-enabled'

function contentKey(courseId, contentType, contentId) {
  return `${courseId || ''}|${contentType || ''}|${contentId || ''}`
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(store))
  } catch {
    // ignore quota errors
  }
}

export function loadDismissedCommentIds(courseId, contentType, contentId) {
  const store = readStore()
  const ids = store[contentKey(courseId, contentType, contentId)] || []
  return new Set(ids)
}

export function persistDismissedCommentIds(courseId, contentType, contentId, ids) {
  const store = readStore()
  const key = contentKey(courseId, contentType, contentId)
  if (!ids.size) {
    delete store[key]
  } else {
    store[key] = [...ids]
  }
  writeStore(store)
}

export function dismissFloatingComment(courseId, contentType, contentId, commentId, currentIds) {
  const next = new Set([...currentIds, commentId])
  persistDismissedCommentIds(courseId, contentType, contentId, next)
  return next
}

export function restoreFloatingComment(courseId, contentType, contentId, commentId, currentIds) {
  const next = new Set(currentIds)
  next.delete(commentId)
  persistDismissedCommentIds(courseId, contentType, contentId, next)
  return next
}

export function restoreAllFloatingComments(courseId, contentType, contentId) {
  persistDismissedCommentIds(courseId, contentType, contentId, new Set())
  return new Set()
}

export function loadFloatingCommentsEnabled() {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

export function saveFloatingCommentsEnabled(enabled) {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0')
  } catch {
    // ignore quota errors
  }
}
