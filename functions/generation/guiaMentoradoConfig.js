const { MENTORADO_DAILY_RELEASE_HOUR } = require('./guiaMentoradoShared')

/**
 * Normaliza config do Guia Mentorado (legado + namespace automation).
 * Leitura sempre passa por aqui para unificar toggles espalhados.
 */
function normalizeMentoradoAutomationConfig(raw = {}) {
  const nested = raw.automation && typeof raw.automation === 'object' ? raw.automation : {}
  const scheduleIn = nested.schedule && typeof nested.schedule === 'object' ? nested.schedule : {}
  const triggersIn = nested.triggers && typeof nested.triggers === 'object' ? nested.triggers : {}
  const vesperaIn = nested.vespera && typeof nested.vespera === 'object' ? nested.vespera : {}

  const enabled = Boolean(
    nested.enabled !== undefined ? nested.enabled : raw.autoGerarConteudo,
  )
  const automationUserId =
    nested.automationUserId || raw.automationUserId || null

  const dailyReleaseHour = clampInt(
    scheduleIn.dailyReleaseHour ?? MENTORADO_DAILY_RELEASE_HOUR,
    0,
    23,
    MENTORADO_DAILY_RELEASE_HOUR,
  )
  const dailyReleaseMinute = clampInt(scheduleIn.dailyReleaseMinute ?? 0, 0, 59, 0)

  return {
    enabled,
    automationUserId,
    schedule: {
      dailyReleaseHour,
      dailyReleaseMinute,
      timezone: 'America/Sao_Paulo',
    },
    triggers: {
      onCronogramaGenerated: triggersIn.onCronogramaGenerated !== false,
      onDailyCron: triggersIn.onDailyCron !== false,
      allowManualDay: triggersIn.allowManualDay !== false,
      allowBackfill: triggersIn.allowBackfill !== false,
    },
    vespera: {
      releaseOnDayComplete: vesperaIn.releaseOnDayComplete !== false,
    },
    lastDailyRunAt: nested.lastDailyRunAt || null,
    lastDailyRunDayKey: nested.lastDailyRunDayKey || null,
    lastError: nested.lastError || null,
    // planejamento (mesmo doc)
    dataProva: raw.dataProva || null,
    hasTAF: Boolean(raw.hasTAF),
    tafExercicios: Array.isArray(raw.tafExercicios) ? raw.tafExercicios : [],
    hasRedacao: Boolean(raw.hasRedacao),
    cronogramaGeradoEm: raw.cronogramaGeradoEm || null,
    // espelhos legados
    autoGerarConteudo: enabled,
  }
}

function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/**
 * Payload de escrita: atualiza namespace automation + espelhos legados.
 */
function buildMentoradoAutomationWrite(partial = {}, extras = {}) {
  const current = normalizeMentoradoAutomationConfig(partial._current || {})
  const nextEnabled =
    partial.enabled !== undefined ? Boolean(partial.enabled) : current.enabled
  const nextUserId =
    partial.automationUserId !== undefined
      ? partial.automationUserId
      : current.automationUserId

  const schedule = {
    dailyReleaseHour:
      partial.dailyReleaseHour !== undefined
        ? clampInt(partial.dailyReleaseHour, 0, 23, current.schedule.dailyReleaseHour)
        : current.schedule.dailyReleaseHour,
    dailyReleaseMinute:
      partial.dailyReleaseMinute !== undefined
        ? clampInt(partial.dailyReleaseMinute, 0, 59, current.schedule.dailyReleaseMinute)
        : current.schedule.dailyReleaseMinute,
    timezone: 'America/Sao_Paulo',
  }

  const triggers = {
    onCronogramaGenerated:
      partial.onCronogramaGenerated !== undefined
        ? Boolean(partial.onCronogramaGenerated)
        : current.triggers.onCronogramaGenerated,
    onDailyCron:
      partial.onDailyCron !== undefined
        ? Boolean(partial.onDailyCron)
        : current.triggers.onDailyCron,
    allowManualDay:
      partial.allowManualDay !== undefined
        ? Boolean(partial.allowManualDay)
        : current.triggers.allowManualDay,
    allowBackfill:
      partial.allowBackfill !== undefined
        ? Boolean(partial.allowBackfill)
        : current.triggers.allowBackfill,
  }

  const vespera = {
    releaseOnDayComplete:
      partial.releaseOnDayComplete !== undefined
        ? Boolean(partial.releaseOnDayComplete)
        : current.vespera.releaseOnDayComplete,
  }

  const automation = {
    enabled: nextEnabled,
    automationUserId: nextUserId,
    schedule,
    triggers,
    vespera,
    lastDailyRunAt:
      partial.lastDailyRunAt !== undefined
        ? partial.lastDailyRunAt
        : current.lastDailyRunAt,
    lastDailyRunDayKey:
      partial.lastDailyRunDayKey !== undefined
        ? partial.lastDailyRunDayKey
        : current.lastDailyRunDayKey,
    lastError:
      partial.lastError !== undefined ? partial.lastError : current.lastError,
  }

  const planning = {}
  if (partial.dataProva !== undefined) planning.dataProva = partial.dataProva
  if (partial.hasTAF !== undefined) planning.hasTAF = Boolean(partial.hasTAF)
  if (partial.tafExercicios !== undefined) planning.tafExercicios = partial.tafExercicios
  if (partial.hasRedacao !== undefined) planning.hasRedacao = Boolean(partial.hasRedacao)

  return {
    ...planning,
    automation,
    autoGerarConteudo: nextEnabled,
    automationUserId: nextUserId,
    ...extras,
  }
}

function isWithinDailyReleaseWindow(automation, clock) {
  const hour = Number(
    automation?.schedule?.dailyReleaseHour ?? MENTORADO_DAILY_RELEASE_HOUR,
  )
  const minute = Number(automation?.schedule?.dailyReleaseMinute ?? 0)
  const h = Number(clock?.hour)
  const m = Number(clock?.minute ?? 0)
  if (h !== hour) return false
  // Cron a cada 15 min: libera a partir do minuto configurado naquela hora
  return m >= minute
}

module.exports = {
  normalizeMentoradoAutomationConfig,
  buildMentoradoAutomationWrite,
  isWithinDailyReleaseWindow,
}
