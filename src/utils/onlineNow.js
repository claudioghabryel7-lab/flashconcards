const DAY_MIN = 4
const NIGHT_MIN = 2
const SOFT_MAX = 9
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

export function isDayWindow(date = new Date()) {
  const hour = date.getHours()
  return hour >= 6 && hour < 23
}

export function getSyntheticOnlineCount(seed = 'global', date = new Date()) {
  const min = isDayWindow(date) ? DAY_MIN : NIGHT_MIN
  const span = SOFT_MAX - min + 1
  const bucket = getMinutesBucket(date)
  const hash = hashString(`${seed}:${bucket}`)
  return min + (hash % span)
}

export function resolveDisplayedOnlineCount(realCount = 0, seed = 'global', date = new Date()) {
  if (realCount > REAL_THRESHOLD) {
    return realCount
  }

  const synthetic = getSyntheticOnlineCount(seed, date)
  return Math.min(SOFT_MAX, Math.max(realCount, synthetic))
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
