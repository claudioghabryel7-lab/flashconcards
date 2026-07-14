const DEFAULT_PLANNING_DAYS = 90
const MENTORADO_DAILY_RELEASE_HOUR = 0

function formatDateBR(date) {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${d}/${m}/${y}`
}

function parseDateKey(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function getTodayKeyInSaoPaulo() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function getSaoPauloClockParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date)
  let hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  if (hour === 24) hour = 0
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return { hour, minute }
}

function formatDailyStartLabel(hour = 0, minute = 0) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function resolvePlanningEndDate(config = {}) {
  const todayKey = getTodayKeyInSaoPaulo()
  const today = parseDateKey(todayKey)

  if (config.dataProva) {
    const prova = parseDateKey(config.dataProva)
    if (prova > today) return config.dataProva
  }

  const end = new Date(today)
  end.setDate(end.getDate() + DEFAULT_PLANNING_DAYS)
  const y = end.getFullYear()
  const m = String(end.getMonth() + 1).padStart(2, '0')
  const d = String(end.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isUsingDefaultPlanningWindow(config = {}) {
  if (!config.dataProva) return true
  const todayKey = getTodayKeyInSaoPaulo()
  const today = parseDateKey(todayKey)
  const prova = parseDateKey(config.dataProva)
  return prova <= today
}

async function collectDayKeysUpToToday(courseId, getDb) {
  const todayKey = getTodayKeyInSaoPaulo()
  const cronogramaSnap = await getDb().collection(`courses/${courseId}/cronograma`).get()
  const dayKeys = []

  for (const monthDoc of cronogramaSnap.docs) {
    const days = monthDoc.data().days || {}
    for (const [dateKey, entry] of Object.entries(days)) {
      if (dateKey > todayKey) continue
      const tipo = entry.type || entry.tipo || 'estudo'
      if (tipo === 'simulado' || tipo === 'descanso') continue
      dayKeys.push(dateKey)
    }
  }

  return [...new Set(dayKeys)].sort()
}

function buildMentoradoCronogramaPrompt({
  todayKey,
  planningEndKey,
  config = {},
  editalSummary = [],
  usingDefaultWindow = false,
}) {
  const today = parseDateKey(todayKey)
  const planningEnd = parseDateKey(planningEndKey)
  const msPerDay = 24 * 60 * 60 * 1000
  const daysUntilProva = Math.round((planningEnd - today) / msPerDay)

  return `DATA ATUAL: ${formatDateBR(today)}
DATA FINAL DO PLANEJAMENTO: ${formatDateBR(planningEnd)}
${config.dataProva && !usingDefaultWindow ? `DATA DA PROVA: ${formatDateBR(planningEnd)}` : `MODO SEM DATA DA PROVA: planeje exatamente ${DEFAULT_PLANNING_DAYS} dias de estudo a partir de hoje`}
DIAS DE PLANEJAMENTO: ${daysUntilProva}
TOTAL DE ENTRADAS OBRIGATÓRIAS NO ARRAY: ${daysUntilProva + 1} (uma por dia, do dia atual até a data final, inclusive)
TEM TAF: ${config.hasTAF ? 'Sim' : 'Não'}
TEM REDAÇÃO: ${config.hasRedacao ? 'Sim' : 'Não'}
EXERCÍCIOS TAF: ${config.tafExercicios?.join(', ') || 'Nenhum'}

EDITAL VERTICALIZADO COMPLETO:
${JSON.stringify(editalSummary, null, 2)}

ANÁLISE OBRIGATÓRIA DO EDITAL:
- Você DEVE ler TODAS as matérias listadas acima
- Você DEVE ler TODOS os tópicos de cada matéria
- Conte quantas matérias existem no total
- Conte quantos tópicos existem no total
- Calcule quantos tópicos precisa estudar por dia para cobrir TUDO até a prova
- NÃO pule nenhuma matéria ou tópico

INSTRUÇÕES:
Você é um MENTOR DE ESTUDOS especialista em concursos. Crie um cronograma estratégico do dia atual até o dia da prova.

REGRAS OBRIGATÓRIAS DO MENTOR:
1. TODAS as matérias do edital devem ser contempladas - NÃO PULE NENHUMA MATÉRIA OU TÓPICO
2. TODOS os tópicos de cada matéria devem ser estudados pelo menos uma vez
3. AGRUPE matérias AFINS no mesmo dia
4. NÃO misture matérias muito diferentes no mesmo dia
5. Use 3-4 matérias por dia se necessário
6. Dias de TAF devem ter estudo também
7. Sem dia de descanso (simulado serve como descanso)
8. Reta final: últimos 7 dias apenas revisão/simulado
9. Distribua as matérias de forma ESTRATÉGICA e equilibrada
10. OBJETIVO: Fechar TODO o edital 7 dias antes da prova

RETORNE APENAS ESTE JSON (sem texto adicional):
{
  "cronograma": [
    {
      "data": "YYYY-MM-DD",
      "tipo": "estudo",
      "fase": "fundamentacao",
      "materias": [{"disciplina": "nome", "topico": "nome"}],
      "taf_exercicio": "",
      "descricao": ""
    }
  ]
}

CRÍTICO - NÃO CORTAR O JSON:
- O JSON deve ser COMPLETO e VÁLIDO
- NÃO pare no meio do array cronograma
- O array cronograma DEVE ter EXATAMENTE ${daysUntilProva + 1} objetos — um para CADA dia do calendário
- NÃO pule datas: se falta um dia no meio, o cronograma fica inválido
- Use datas consecutivas no formato YYYY-MM-DD

IMPORTANTE:
- Comece em ${formatDateBR(today)}
- Termine em ${formatDateBR(planningEnd)}
- JSON deve ser válido e completo
- Use aspas duplas`
}

module.exports = {
  DEFAULT_PLANNING_DAYS,
  MENTORADO_DAILY_RELEASE_HOUR,
  getTodayKeyInSaoPaulo,
  getSaoPauloClockParts,
  formatDailyStartLabel,
  resolvePlanningEndDate,
  isUsingDefaultPlanningWindow,
  collectDayKeysUpToToday,
  buildMentoradoCronogramaPrompt,
  parseDateKey,
}
