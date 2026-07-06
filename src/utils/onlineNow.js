const DAY_MIN = 5
const DAY_MAX = 9
const NIGHT_MIN = 0
const NIGHT_MAX = 9
const REAL_THRESHOLD = 10

function getMinutesBucket(date = new Date()) {
  return Math.floor(date.getTime() / (10 * 60 * 1000))
}

function hashString(value = '') {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

/** Dia: 06h–22h59 | Noite: 23h–05h59 */
export function isDayWindow(date = new Date()) {
  const hour = date.getHours()
  return hour >= 6 && hour < 23
}

export function getSyntheticOnlineCount(seed = 'global', date = new Date()) {
  const isDay = isDayWindow(date)
  const min = isDay ? DAY_MIN : NIGHT_MIN
  const max = isDay ? DAY_MAX : NIGHT_MAX
  const span = max - min + 1
  const bucket = getMinutesBucket(date)
  const hash = hashString(`${seed}:${bucket}`)
  return min + (hash % span)
}

export function resolveDisplayedOnlineCount(realCount = 0, seed = 'global', date = new Date()) {
  if (realCount > REAL_THRESHOLD) {
    return realCount
  }

  const synthetic = getSyntheticOnlineCount(seed, date)
  const isDay = isDayWindow(date)

  if (isDay) {
    return Math.min(DAY_MAX, Math.max(realCount, synthetic))
  }

  // À noite: pode ser 0; se houver poucos reais, usa o sintético (0–9)
  return Math.min(NIGHT_MAX, Math.max(realCount, synthetic))
}

export function isPresenceFresh(lastSeen, now = Date.now()) {
  if (!lastSeen) return false

  try {
    const millis =
      typeof lastSeen?.toMillis === 'function'
        ? lastSeen.toMillis()
        : lastSeen instanceof Date
          ? lastSeen.getTime()
          : null

    if (!millis) return false
    return now - millis <= 45_000
  } catch {
    return false
  }
}
