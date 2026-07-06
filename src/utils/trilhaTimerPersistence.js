const KEY_PREFIX = 'trilha_liquid_timer'

export function timerStorageKey(userId) {
  return `${KEY_PREFIX}:${userId}`
}

export function loadTrilhaTimer(userId) {
  if (!userId || typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(timerStorageKey(userId))
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data?.active || data.userId !== userId) return null
    return data
  } catch {
    return null
  }
}

export function persistTrilhaTimer(userId, state) {
  if (!userId || typeof window === 'undefined') return
  try {
    if (!state?.active) {
      localStorage.removeItem(timerStorageKey(userId))
      return
    }
    localStorage.setItem(timerStorageKey(userId), JSON.stringify(state))
  } catch {
    /* quota */
  }
}

export function clearTrilhaTimer(userId) {
  if (!userId || typeof window === 'undefined') return
  try {
    localStorage.removeItem(timerStorageKey(userId))
  } catch {
    /* ignore */
  }
}

export function computeElapsedSeconds(state) {
  if (!state?.active || !state.startedAt) return 0
  let pausedMs = state.pausedTotalMs || 0
  if (state.paused && state.pauseStartedAt) {
    pausedMs += Date.now() - state.pauseStartedAt
  }
  return Math.max(0, Math.floor((Date.now() - state.startedAt - pausedMs) / 1000))
}

export function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

export function buildTimerState({
  userId,
  courseId,
  timerForm,
  alarmMinutes,
  alarmTriggered = false,
}) {
  return {
    active: true,
    paused: false,
    startedAt: Date.now(),
    pausedTotalMs: 0,
    pauseStartedAt: null,
    timerForm: { ...timerForm },
    alarmMinutes,
    alarmTriggered,
    userId,
    courseId: courseId ?? null,
  }
}

export function pauseTimerState(state) {
  if (!state?.active || state.paused) return state
  return { ...state, paused: true, pauseStartedAt: Date.now() }
}

export function resumeTimerState(state) {
  if (!state?.active || !state.paused) return state
  const extraPaused = state.pauseStartedAt ? Date.now() - state.pauseStartedAt : 0
  return {
    ...state,
    paused: false,
    pausedTotalMs: (state.pausedTotalMs || 0) + extraPaused,
    pauseStartedAt: null,
  }
}
