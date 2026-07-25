/**
 * Limite de jobs caros de IA por hora (admin online / automações).
 * Evita rajadas quando várias abas ficam abertas.
 */

const STORAGE_KEY = 'fc_admin_ai_budget_v1'
const WINDOW_MS = 60 * 60 * 1000

/** Jobs caros (material/questões/flashcards/dia mentorado/automação) por hora */
export const MAX_EXPENSIVE_JOBS_PER_HOUR = 10

/** Tipos considerados caros (geração de conteúdo) */
const EXPENSIVE_TYPES = new Set([
  'conteudo_completo',
  'questoes_topico',
  'flashcards_topico',
  'conteudo_incidencia',
  'questoes_incidencia',
  'mentorado_day',
  'mentorado_cronograma',
  'revisao_diaria',
  'material_topico',
  'full_course',
  'vespera',
  'admin_materia_revisada',
  'admin_edital_verticalizado',
  'guia_mentorado_automation',
  'guia_mentorado_cronograma',
  'guia_mentorado_incidencia',
  'guia_mentorado_backfill',
])

function readStore() {
  if (typeof window === 'undefined') return { starts: [] }
  try {
    // localStorage: compartilha entre abas do mesmo browser (sessionStorage não)
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { starts: [] }
    const parsed = JSON.parse(raw)
    return { starts: Array.isArray(parsed.starts) ? parsed.starts : [] }
  } catch {
    return { starts: [] }
  }
}

function writeStore(store) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // ignore
  }
}

function prune(starts = []) {
  const cutoff = Date.now() - WINDOW_MS
  return starts.filter((t) => Number(t) > cutoff)
}

export function isExpensiveJobType(jobType = '') {
  const t = String(jobType || '').toLowerCase()
  if (EXPENSIVE_TYPES.has(t)) return true
  return /material|questoes|flashcard|mentorado|incidencia|revisao|edital|vespera|conteudo/.test(t)
}

/**
 * @returns {{ ok: true, used: number, limit: number } | { ok: false, used: number, limit: number, retryAfterSec: number }}
 */
export function checkAdminAiBudget(jobType = '', { limit = MAX_EXPENSIVE_JOBS_PER_HOUR } = {}) {
  if (!isExpensiveJobType(jobType)) {
    return { ok: true, used: 0, limit, skipped: true }
  }
  const store = readStore()
  const starts = prune(store.starts)
  writeStore({ starts })
  if (starts.length >= limit) {
    const oldest = Math.min(...starts)
    const retryAfterSec = Math.max(1, Math.ceil((oldest + WINDOW_MS - Date.now()) / 1000))
    return { ok: false, used: starts.length, limit, retryAfterSec }
  }
  return { ok: true, used: starts.length, limit }
}

export function recordAdminAiJobStart(jobType = '') {
  if (!isExpensiveJobType(jobType)) return
  const store = readStore()
  const starts = prune(store.starts)
  starts.push(Date.now())
  writeStore({ starts })
}

export function getAdminAiBudgetStatus() {
  const starts = prune(readStore().starts)
  return {
    used: starts.length,
    limit: MAX_EXPENSIVE_JOBS_PER_HOUR,
    remaining: Math.max(0, MAX_EXPENSIVE_JOBS_PER_HOUR - starts.length),
  }
}
