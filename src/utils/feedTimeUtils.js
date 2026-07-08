import dayjs from 'dayjs'

/** Janela de exibição no feed e nos destaques (stories) da comunidade. */
export const FEED_TTL_MS = 12 * 60 * 60 * 1000

const MAX_SESSION_MINUTES = 720

export function getPostTimestamp(ts) {
  if (!ts) return 0
  const date = ts?.toDate?.() || (ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts))
  const ms = date.getTime()
  return Number.isNaN(ms) ? 0 : ms
}

export function normalizeDurationMinutes(value) {
  let n = Number(value) || 0
  if (n <= 0) return 0
  // Valores muito altos costumam ser segundos gravados como minutos
  if (n > 600 && n < 200_000) n = Math.round(n / 60)
  return Math.min(Math.max(0, Math.round(n)), MAX_SESSION_MINUTES)
}

export function formatStudyMinutes(minutes) {
  const mins = normalizeDurationMinutes(minutes)
  if (mins < 1) return '<1min'
  if (mins < 60) return `${mins}min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

export function isFeedPostActive(post, now = Date.now()) {
  if (!post) return false
  if (post.hiddenFromFeed) return false

  if (post.expiresAt) {
    const exp = getPostTimestamp(post.expiresAt)
    return exp > now
  }

  const created = getPostTimestamp(post.createdAt)
  if (!created) return true
  return now - created < FEED_TTL_MS
}

export function feedExpiresAtTimestamp() {
  return dayjs().add(12, 'hour').toDate()
}
