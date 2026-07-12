/** Presença considerada "online" se atualizada nos últimos 45s (3× heartbeat de 15s). */
export const PRESENCE_ONLINE_TTL_MS = 45_000

export const PRESENCE_HEARTBEAT_MS = 15_000

/** Intervalo entre pequenos ajustes do número simulado. */
export const SIMULATED_ONLINE_STEP_MS = 75 * 1000

/** @deprecated use SIMULATED_ONLINE_STEP_MS */
export const SIMULATED_ONLINE_TICK_MS = SIMULATED_ONLINE_STEP_MS

const STORAGE_KEY = 'cp_simulated_online_v2'
const TARGET_BUCKET_MS = 12 * 60 * 1000
const MAX_STEP = 3

function hashSeed(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}

/** Minutos desde meia-noite em America/Sao_Paulo. */
export function getSaoPauloMinutesSinceMidnight(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date(now))

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

/**
 * Faixas (horário de Brasília):
 * 06:36–21:34 → 4–57
 * 21:34–00:00 → 2–13
 * 00:00–05:10 → 0–3
 * 05:10–06:36 → 3–5
 */
export function getSimulatedOnlineRange(now = Date.now()) {
  const m = getSaoPauloMinutesSinceMidnight(now)

  if (m >= 396 && m < 1294) {
    return { min: 4, max: 57, period: 'study' }
  }
  if (m >= 1294) {
    return { min: 2, max: 13, period: 'evening' }
  }
  if (m < 310) {
    return { min: 0, max: 3, period: 'lateNight' }
  }
  return { min: 3, max: 5, period: 'dawn' }
}

/** @deprecated use getSimulatedOnlineRange */
export function isOnlineNightPeriod(date = new Date()) {
  const { period } = getSimulatedOnlineRange(date.getTime())
  return period === 'evening' || period === 'lateNight' || period === 'dawn'
}

function pickTargetInRange(min, max, now, seed) {
  const bucket = Math.floor(now / TARGET_BUCKET_MS)
  const span = max - min + 1
  return min + (hashSeed(`${seed}:${bucket}`) % span)
}

function loadSimulatedState() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return null
}

function saveSimulatedState(state) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

/**
 * Avança 1–3 unidades em direção ao alvo (nunca salto grande).
 */
function stepToward(current, target, min, max, now) {
  const value = clamp(current, min, max)
  const goal = clamp(target, min, max)

  if (value === goal) {
    const wander = (hashSeed(`wander:${Math.floor(now / SIMULATED_ONLINE_STEP_MS)}`) % 3) - 1
    return clamp(value + wander, min, max)
  }

  const diff = goal - value
  const stepSize = 1 + (hashSeed(`step:${Math.floor(now / SIMULATED_ONLINE_STEP_MS)}`) % MAX_STEP)
  const step = Math.sign(diff) * Math.min(Math.abs(diff), stepSize)
  return clamp(value + step, min, max)
}

function evolveSimulatedCount(now, seed = 'platform') {
  const { min, max, period } = getSimulatedOnlineRange(now)
  const target = pickTargetInRange(min, max, now, seed)
  const stored = loadSimulatedState()
  const elapsed = stored?.updatedAt ? now - stored.updatedAt : Infinity

  let count = stored?.count

  if (count == null || Number.isNaN(count)) {
    count = pickTargetInRange(min, max, now - TARGET_BUCKET_MS, `${seed}:init`)
  } else if (stored.period !== period) {
    count = clamp(count, min, max)
  } else {
    count = clamp(count, min, max)
  }

  if (elapsed >= SIMULATED_ONLINE_STEP_MS * 0.85) {
    count = stepToward(count, target, min, max, now)
    saveSimulatedState({ count, updatedAt: now, period, seed })
  }

  return count
}

/**
 * Contagem exibida no badge — sobe/desce aos poucos dentro da faixa do horário (Brasília).
 */
export function getSimulatedOnlineCount(
  now = Date.now(),
  { courseId = null, platformWide = true } = {},
) {
  const platformCount = evolveSimulatedCount(now, 'platform')

  if (platformWide || !courseId) return platformCount

  const { min, max } = getSimulatedOnlineRange(now)
  const ratio = 0.22 + (hashSeed(String(courseId)) % 48) / 100
  const scaled = Math.round(platformCount * ratio)
  const courseMin = Math.max(0, Math.floor(min * 0.35))
  const courseMax = Math.max(courseMin, Math.floor(max * 0.7))
  return clamp(scaled || courseMin, courseMin, courseMax)
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
