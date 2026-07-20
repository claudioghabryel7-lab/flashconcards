const SYNTHETIC_MIN = 0
const SYNTHETIC_MAX = 2
const REAL_THRESHOLD = 2
const OSCILLATION_BUCKET_MS = 3 * 60 * 1000

/** Presença considerada "online" se atualizada nos últimos 45s (3× heartbeat de 15s). */
export const PRESENCE_ONLINE_TTL_MS = 45_000
export const PRESENCE_HEARTBEAT_MS = 15_000

function getMinutesBucket(date = new Date()) {
  return Math.floor(date.getTime() / OSCILLATION_BUCKET_MS)
}

function hashString(value = '') {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

/** Oscilação estável entre 0 e 2 (muda a cada ~3 min por seed). */
export function getSyntheticOnlineCount(seed = 'global', date = new Date()) {
  const span = SYNTHETIC_MAX - SYNTHETIC_MIN + 1
  const bucket = getMinutesBucket(date)
  const hash = hashString(`${seed}:${bucket}`)
  return SYNTHETIC_MIN + (hash % span)
}

/** Real a partir de 2; abaixo disso, oscila sinteticamente de 0 a 2. */
export function resolveDisplayedOnlineCount(realCount = 0, seed = 'global', date = new Date()) {
  if (realCount >= REAL_THRESHOLD) {
    return realCount
  }

  return getSyntheticOnlineCount(seed, date)
}

export function isPresenceFresh(lastSeen, now = Date.now()) {
  if (!lastSeen) return false

  try {
    const millis =
      typeof lastSeen?.toMillis === 'function'
        ? lastSeen.toMillis()
        : lastSeen instanceof Date
          ? lastSeen.getTime()
          : typeof lastSeen === 'number'
            ? lastSeen
            : null

    if (!millis) return false
    return now - millis <= PRESENCE_ONLINE_TTL_MS
  } catch {
    return false
  }
}

/** Online de verdade = status online + heartbeat recente. */
export function isPresenceOnline(data, now = Date.now()) {
  if (!data || data.status !== 'online') return false
  return isPresenceFresh(data.lastSeen || data.updatedAt, now)
}

/** Filtro por curso — null = plataforma inteira. */
export function presenceMatchesCourse(presenceCourseId, filterCourseId) {
  if (!filterCourseId) return true
  if (presenceCourseId == null || presenceCourseId === '') return false
  return String(presenceCourseId) === String(filterCourseId)
}

export function countOnlineFromEntries(entries, { courseId = null, now = Date.now() } = {}) {
  let count = 0
  Object.values(entries || {}).forEach((data) => {
    if (!isPresenceOnline(data, now)) return
    if (!presenceMatchesCourse(data.courseId, courseId)) return
    count += 1
  })
  return count
}

export { REAL_THRESHOLD }
