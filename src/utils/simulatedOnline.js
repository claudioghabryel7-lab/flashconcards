/** Intervalos disponíveis para atualizar o contador simulado (minutos). */
export const ONLINE_DISPLAY_INTERVALS = [4, 9, 12]

export const SIMULATED_ONLINE_MIN = 14
export const SIMULATED_ONLINE_MAX = 35

export function normalizeOnlineDisplay(config) {
  if (!config || config.mode !== 'simulated') {
    return {
      mode: 'real',
      intervalMinutes: 9,
      minCount: SIMULATED_ONLINE_MIN,
      maxCount: SIMULATED_ONLINE_MAX,
    }
  }

  const interval = ONLINE_DISPLAY_INTERVALS.includes(Number(config.intervalMinutes))
    ? Number(config.intervalMinutes)
    : 9

  const minCount = Number(config.minCount) || SIMULATED_ONLINE_MIN
  const maxCount = Number(config.maxCount) || SIMULATED_ONLINE_MAX

  return {
    mode: 'simulated',
    intervalMinutes: interval,
    minCount: Math.min(minCount, maxCount),
    maxCount: Math.max(minCount, maxCount),
  }
}

function hashSeed(seed) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Contagem estável por intervalo — todos os usuários veem o mesmo número. */
export function getSimulatedOnlineCount(courseId, config, now = Date.now()) {
  const normalized = normalizeOnlineDisplay(config)
  const { minCount, maxCount, intervalMinutes } = normalized
  const slotMs = intervalMinutes * 60 * 1000
  const slot = Math.floor(now / slotMs)
  const seed = `${courseId}:${slot}`
  const rand = hashSeed(seed)
  const range = maxCount - minCount + 1
  return minCount + (rand % range)
}

export function buildOnlineDisplayPayload(mode, intervalMinutes = 9) {
  if (mode === 'simulated') {
    const interval = ONLINE_DISPLAY_INTERVALS.includes(Number(intervalMinutes))
      ? Number(intervalMinutes)
      : 9
    return {
      mode: 'simulated',
      intervalMinutes: interval,
      minCount: SIMULATED_ONLINE_MIN,
      maxCount: SIMULATED_ONLINE_MAX,
    }
  }
  return { mode: 'real' }
}

export function getOnlineDisplayLabel(config) {
  const normalized = normalizeOnlineDisplay(config)
  if (normalized.mode === 'simulated') {
    return `Simulado (${normalized.minCount}–${normalized.maxCount}, a cada ${normalized.intervalMinutes} min)`
  }
  return 'Tempo real'
}
