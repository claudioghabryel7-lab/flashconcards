/** Presença considerada "online" se atualizada nos últimos 45s (3× heartbeat de 15s). */
export const PRESENCE_ONLINE_TTL_MS = 45_000

export const PRESENCE_HEARTBEAT_MS = 15_000

/** Intervalo em que o número simulado de online pode mudar (evita flicker). */
export const SIMULATED_ONLINE_TICK_MS = 4 * 60 * 1000

function hashSeed(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}

/** 21:45–05:59 = noite/madrugada; 06:00–21:44 = horário de estudo. */
export function isOnlineNightPeriod(date = new Date()) {
  const hour = date.getHours()
  const minute = date.getMinutes()
  if (hour > 21 || (hour === 21 && minute >= 45)) return true
  if (hour < 6) return true
  return false
}

export function getSimulatedOnlineRange(now = Date.now()) {
  return isOnlineNightPeriod(new Date(now))
    ? { min: 2, max: 9 }
    : { min: 7, max: 23 }
}

function pickInRange(min, max, now, seed) {
  const bucket = Math.floor(now / SIMULATED_ONLINE_TICK_MS)
  const span = max - min + 1
  return min + (hashSeed(`${seed}:${bucket}`) % span)
}

/**
 * Contagem exibida no badge — simulada por faixa horária.
 * Madrugada/noite (21:45–06h): 2–9 · Dia (06h–21:44): 7–23
 */
export function getSimulatedOnlineCount(
  now = Date.now(),
  { courseId = null, platformWide = true } = {},
) {
  const { min, max } = getSimulatedOnlineRange(now)
  const platformCount = pickInRange(min, max, now, 'platform')

  if (platformWide || !courseId) return platformCount

  const ratio = 0.22 + (hashSeed(String(courseId)) % 48) / 100
  const scaled = Math.round(platformCount * ratio)
  const courseMin = Math.max(1, Math.floor(min * 0.35))
  const courseMax = Math.max(courseMin, Math.floor(max * 0.7))
  return Math.max(courseMin, Math.min(courseMax, scaled || courseMin))
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
