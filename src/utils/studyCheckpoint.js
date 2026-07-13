/** Persistência leve da posição de estudo (questões/flashcards) no navegador. */

function storageKey(kind, userId, courseId, scopeKey) {
  return `fcc:checkpoint:${kind}:${userId || 'anon'}:${courseId || 'none'}:${scopeKey || 'default'}`
}

export function loadStudyCheckpoint(kind, { userId, courseId, scopeKey }) {
  if (typeof window === 'undefined') return 0
  try {
    const raw = localStorage.getItem(storageKey(kind, userId, courseId, scopeKey))
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
  } catch {
    return 0
  }
}

export function saveStudyCheckpoint(kind, { userId, courseId, scopeKey }, index) {
  if (typeof window === 'undefined') return
  try {
    const n = Math.max(0, Math.floor(Number(index) || 0))
    localStorage.setItem(storageKey(kind, userId, courseId, scopeKey), String(n))
  } catch {
    /* ignore */
  }
}

export function clearStudyCheckpoint(kind, { userId, courseId, scopeKey }) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(storageKey(kind, userId, courseId, scopeKey))
  } catch {
    /* ignore */
  }
}
