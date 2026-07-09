/** Presença considerada "online" se atualizada nos últimos 45s (3× heartbeat de 15s). */
export const PRESENCE_ONLINE_TTL_MS = 45_000

export const PRESENCE_HEARTBEAT_MS = 15_000

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
