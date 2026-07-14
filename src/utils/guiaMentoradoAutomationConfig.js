import { MENTORADO_DAILY_RELEASE_HOUR } from '../constants/guiaMentorado'

function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/**
 * Normaliza config do Guia Mentorado (legado + namespace automation).
 */
export function normalizeMentoradoAutomationConfig(raw = {}) {
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
  const automationUserId = nested.automationUserId || raw.automationUserId || null

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
    dataProva: raw.dataProva || null,
    hasTAF: Boolean(raw.hasTAF),
    tafExercicios: Array.isArray(raw.tafExercicios) ? raw.tafExercicios : [],
    hasRedacao: Boolean(raw.hasRedacao),
    cronogramaGeradoEm: raw.cronogramaGeradoEm || null,
    autoGerarConteudo: enabled,
  }
}

export function formatDailyReleaseLabel(automation) {
  const hour = automation?.schedule?.dailyReleaseHour ?? MENTORADO_DAILY_RELEASE_HOUR
  const minute = automation?.schedule?.dailyReleaseMinute ?? 0
  const label = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  if (hour === 0 && minute === 0) return `${label} (meia-noite)`
  return label
}

/**
 * Payload de merge para Firestore (automation + espelhos legados + planejamento).
 */
export function buildMentoradoConfigWrite(
  form,
  { userId, existing, preserveAutomationUserId = false } = {},
) {
  const current = normalizeMentoradoAutomationConfig(existing || {})
  const enabled = form.enabled !== undefined ? Boolean(form.enabled) : current.enabled
  const automationUserId = preserveAutomationUserId
    ? current.automationUserId || userId || form.automationUserId || null
    : userId || form.automationUserId || current.automationUserId || null

  const schedule = {
    dailyReleaseHour: clampInt(
      form.dailyReleaseHour ?? current.schedule.dailyReleaseHour,
      0,
      23,
      MENTORADO_DAILY_RELEASE_HOUR,
    ),
    dailyReleaseMinute: clampInt(
      form.dailyReleaseMinute ?? current.schedule.dailyReleaseMinute,
      0,
      59,
      0,
    ),
    timezone: 'America/Sao_Paulo',
  }

  const triggers = {
    onCronogramaGenerated:
      form.onCronogramaGenerated !== undefined
        ? Boolean(form.onCronogramaGenerated)
        : current.triggers.onCronogramaGenerated,
    onDailyCron:
      form.onDailyCron !== undefined
        ? Boolean(form.onDailyCron)
        : current.triggers.onDailyCron,
    allowManualDay:
      form.allowManualDay !== undefined
        ? Boolean(form.allowManualDay)
        : current.triggers.allowManualDay,
    allowBackfill:
      form.allowBackfill !== undefined
        ? Boolean(form.allowBackfill)
        : current.triggers.allowBackfill,
  }

  const vespera = {
    releaseOnDayComplete:
      form.releaseOnDayComplete !== undefined
        ? Boolean(form.releaseOnDayComplete)
        : current.vespera.releaseOnDayComplete,
  }

  return {
    dataProva: form.dataProva !== undefined ? form.dataProva || null : current.dataProva,
    hasTAF: form.hasTAF !== undefined ? Boolean(form.hasTAF) : current.hasTAF,
    tafExercicios:
      form.tafExercicios !== undefined ? form.tafExercicios || [] : current.tafExercicios,
    hasRedacao:
      form.hasRedacao !== undefined ? Boolean(form.hasRedacao) : current.hasRedacao,
    automation: {
      enabled,
      automationUserId,
      schedule,
      triggers,
      vespera,
      lastDailyRunAt: current.lastDailyRunAt,
      lastDailyRunDayKey: current.lastDailyRunDayKey,
      lastError: current.lastError,
    },
    autoGerarConteudo: enabled,
    automationUserId,
  }
}
