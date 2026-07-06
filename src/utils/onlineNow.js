const SYNTHETIC_MIN = 0
const SYNTHETIC_MAX = 2
const REAL_THRESHOLD = 2
const OSCILLATION_BUCKET_MS = 3 * 60 * 1000

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
          : null

    if (!millis) return false
    return now - millis <= 45_000
  } catch {
    return false
  }
}

export { REAL_THRESHOLD }
