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
    nested.enabled !== undefined
      ? nested.enabled
      : raw.enabled !== undefined
        ? raw.enabled
        : raw.autoGerarConteudo,
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

/**
 * Cron a cada 15 min (:00/:15/:30/:45).
 * Dispara se o tick atual já passou do horário configurado (mesmo dia),
 * arredondando o minuto alvo para o próximo slot de 15 min (ex.: 08:50 → 09:00).
 */
function isWithinDailyReleaseWindow(automation, clock) {
  const hour = Number(
    automation?.schedule?.dailyReleaseHour ?? MENTORADO_DAILY_RELEASE_HOUR,
  )
  const minute = Number(automation?.schedule?.dailyReleaseMinute ?? 0)
  let h = Number(clock?.hour)
  let m = Number(clock?.minute ?? 0)
  if (h === 24) h = 0

  const STEP = 15
  let targetHour = Math.min(23, Math.max(0, Number(hour) || 0))
  let targetMinute = Math.min(59, Math.max(0, Number(minute) || 0))
  if (targetMinute % STEP !== 0) {
    targetMinute = Math.ceil(targetMinute / STEP) * STEP
  }
  if (targetMinute >= 60) {
    targetMinute = 0
    targetHour += 1
  }
  // Cron só tem slots até 23:45. 23:46–23:59 NÃO podem virar 00:00
  // (senão nowMins >= 0 libera o dia inteiro desde a madrugada).
  if (targetHour >= 24) {
    targetHour = 23
    targetMinute = 45
  }

  const nowMins = h * 60 + m
  const releaseMins = targetHour * 60 + targetMinute
  // Na mesma "volta" do dia: a partir do slot efetivo até o fim do dia
  // (1× por dia via lastDailyRunDayKey).
  return nowMins >= releaseMins
}

module.exports = {
  normalizeMentoradoAutomationConfig,
  buildMentoradoAutomationWrite,
  isWithinDailyReleaseWindow,
}
