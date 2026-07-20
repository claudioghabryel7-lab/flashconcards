/** Semana de redação (segunda → domingo, horário de Brasília). */

const SP_TZ = 'America/Sao_Paulo'

export const MAX_REDACOES_POR_SEMANA = 2

export function getSaoPauloDateParts(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SP_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(new Date(now))

  const get = (type) => parts.find((p) => p.type === type)?.value
  const year = Number(get('year'))
  const month = Number(get('month'))
  const day = Number(get('day'))
  const weekday = get('weekday') // Mon, Tue, ...
  return { year, month, day, weekday }
}

/** Retorna YYYY-MM-DD da segunda-feira da semana atual (Brasília). */
export function getRedacaoWeekKey(now = Date.now()) {
  const { year, month, day, weekday } = getSaoPauloDateParts(now)
  const weekdayMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  const offset = weekdayMap[weekday] ?? 0
  // Usa meio-dia UTC aproximado para evitar DST edge (SP não tem DST)
  const utc = Date.UTC(year, month - 1, day, 15, 0, 0)
  const monday = new Date(utc - offset * 24 * 60 * 60 * 1000)
  const y = monday.getUTCFullYear()
  const m = String(monday.getUTCMonth() + 1).padStart(2, '0')
  const d = String(monday.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isNotaMil(nota) {
  return Number(nota) >= 1000
}
