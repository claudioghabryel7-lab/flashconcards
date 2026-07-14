/**
 * Próxima janela do cron do Guia Mentorado (America/Sao_Paulo).
 * Servidor: a cada 15 min; dispara a partir de HH:MM; 1× por dia.
 */

const TZ = 'America/Sao_Paulo'
export const CRON_STEP_MINUTES = 15

export function getSaoPauloParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  }).formatToParts(date)

  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  let hour = get('hour')
  if (hour === 24) hour = 0

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
    dateKey: `${get('year')}-${String(get('month')).padStart(2, '0')}-${String(get('day')).padStart(2, '0')}`,
  }
}

function spWallTimeToUtcMs({ year, month, day, hour, minute, second = 0 }) {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  const sp = getSaoPauloParts(new Date(asUtc))
  const spAsUtc = Date.UTC(sp.year, sp.month - 1, sp.day, sp.hour, sp.minute, sp.second)
  return asUtc - (spAsUtc - asUtc)
}

function addCalendarDays(parts, days) {
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0)
  const d = new Date(utc)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  }
}

function resolveCronSlot(releaseHour, releaseMinute) {
  let hour = Math.min(23, Math.max(0, Number(releaseHour) || 0))
  let minute = Math.min(59, Math.max(0, Number(releaseMinute) || 0))
  const step = CRON_STEP_MINUTES
  if (minute % step !== 0) minute = Math.ceil(minute / step) * step
  if (minute >= 60) {
    minute = 0
    hour += 1
  }
  if (hour >= 24) {
    hour = 0
    return { hour, minute, extraDay: 1 }
  }
  return { hour, minute, extraDay: 0 }
}

/** Próximo tick do cron (>= horário configurado). */
export function nextReleaseSlotMs(
  releaseHour,
  releaseMinute,
  fromDate = new Date(),
  { skipToday = false } = {},
) {
  const now = getSaoPauloParts(fromDate)
  const slot = resolveCronSlot(releaseHour, releaseMinute)
  const startDay = (skipToday ? 1 : 0) + slot.extraDay

  for (let d = startDay; d <= startDay + 3; d++) {
    const day = addCalendarDays(
      { year: now.year, month: now.month, day: now.day },
      d,
    )
    const ms = spWallTimeToUtcMs({
      ...day,
      hour: slot.hour,
      minute: slot.minute,
      second: 0,
    })
    if (ms > fromDate.getTime()) return ms
  }

  return fromDate.getTime() + 24 * 60 * 60 * 1000
}

export function formatCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'menos de 1 min'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`
  if (m > 0) return `${m}min ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

/**
 * Status da próxima automação diária do curso.
 */
export function getMentoradoNextRunInfo({
  enabled,
  onDailyCron,
  automationUserId,
  dailyReleaseHour = 0,
  dailyReleaseMinute = 0,
  lastDailyRunDayKey = null,
  now = new Date(),
} = {}) {
  const blockers = []
  if (!enabled) blockers.push('Automação desligada')
  if (!onDailyCron) blockers.push('Gatilho “Cron diário” desligado')
  if (!automationUserId) blockers.push('Sem usuário de automação (Ligar/Salvar)')

  const sp = getSaoPauloParts(now)
  const timeLabel = `${String(dailyReleaseHour).padStart(2, '0')}:${String(
    dailyReleaseMinute,
  ).padStart(2, '0')}`

  if (blockers.length) {
    return {
      status: !enabled ? 'off' : !onDailyCron ? 'cron_off' : 'no_user',
      label: blockers[0],
      countdown: null,
      nextAtLabel: null,
      remainingMs: null,
      ready: false,
      blockers,
    }
  }

  const alreadyToday = lastDailyRunDayKey === sp.dateKey
  const nextMs = nextReleaseSlotMs(dailyReleaseHour, dailyReleaseMinute, now, {
    skipToday: alreadyToday,
  })
  const remainingMs = Math.max(0, nextMs - now.getTime())
  const at = getSaoPauloParts(new Date(nextMs))
  const nextAtLabel = `${String(at.hour).padStart(2, '0')}:${String(at.minute).padStart(2, '0')}`

  if (alreadyToday) {
    return {
      status: 'done_today',
      label: `Já rodou hoje — próxima amanhã às ${nextAtLabel}`,
      countdown: formatCountdown(remainingMs),
      nextAtLabel,
      remainingMs,
      ready: true,
      blockers: [],
    }
  }

  const inWindow =
    sp.hour === Number(dailyReleaseHour) &&
    sp.minute >= Number(dailyReleaseMinute || 0)

  if (inWindow) {
    return {
      status: 'due',
      label: `Janela ativa (${timeLabel}) — o cron pode disparar a qualquer tick (até ${CRON_STEP_MINUTES} min)`,
      countdown: formatCountdown(remainingMs),
      nextAtLabel,
      remainingMs,
      ready: true,
      blockers: [],
    }
  }

  return {
    status: 'waiting',
    label: `Próxima automação em ${formatCountdown(remainingMs)}`,
    countdown: formatCountdown(remainingMs),
    nextAtLabel,
    remainingMs,
    ready: true,
    blockers: [],
  }
}
