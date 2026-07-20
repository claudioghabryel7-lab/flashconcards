/**
 * Cronograma determinístico do Guia Mentorado — sem IA / sem Google Search.
 * Cobre todos os tópicos do edital até a data da prova (+ redação, TAF, reta final).
 */
import dayjs from 'dayjs'
import { formatTopicoAsModulo } from './editalVerticalizadoLoader'

const MAX_TOPICS_PER_DAY = 4
const RETA_FINAL_DAYS = 7

/** Agrupa disciplinas “afins” pelo prefixo (ex.: Direito*). */
function affinityKey(disciplinaNome = '') {
  const n = String(disciplinaNome)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (/direito|constitucional|penal|administrativ|processual|tribut|legisla/.test(n)) {
    return 'direito'
  }
  if (/portugu|redacao|interpretacao|gramatic/.test(n)) return 'portugues'
  if (/matem|raciocin|quantitativ|estatist/.test(n)) return 'exatas'
  if (/inform|comput|ti\b|banco de dados|rede/.test(n)) return 'ti'
  if (/contab|administ|gestao|economia|financ/.test(n)) return 'gestao'
  return n.slice(0, 12) || 'geral'
}

/**
 * Lista plana de todos os tópicos do edital verticalizado.
 * @returns {{ disciplina: string, topico: string, numero: string }[]}
 */
export function flattenEditalTopics(edital) {
  const out = []
  for (const disc of edital?.disciplinas || []) {
    const disciplina = String(disc?.nome || '').trim()
    if (!disciplina) continue
    const topicos = Array.isArray(disc.topicos) ? disc.topicos : []
    if (!topicos.length) {
      out.push({ disciplina, topico: disciplina, numero: '' })
      continue
    }
    for (const t of topicos) {
      const nome = String(t?.nome || '').trim()
      if (!nome) continue
      out.push({
        disciplina,
        topico: formatTopicoAsModulo(t) || nome,
        numero: String(t?.numero || '').trim(),
      })
    }
  }
  return out
}

function buildDateKeys(today, planningEnd) {
  const keys = []
  let cursor = today.startOf('day')
  const end = planningEnd.startOf('day')
  if (!end.isAfter(cursor) && !end.isSame(cursor)) {
    return [cursor.format('YYYY-MM-DD')]
  }
  while (cursor.isBefore(end) || cursor.isSame(end)) {
    keys.push(cursor.format('YYYY-MM-DD'))
    cursor = cursor.add(1, 'day')
  }
  return keys
}

function phaseForProgress(idx, total) {
  const ratio = total <= 1 ? 0 : idx / (total - 1)
  if (ratio < 0.35) return 'fundamentacao'
  if (ratio < 0.75) return 'intermediario'
  return 'avancado'
}

/**
 * Distribui tópicos em N buckets, priorizando matérias afins no mesmo dia.
 */
function distributeTopics(topics, bucketCount) {
  if (bucketCount < 1) return []
  const buckets = Array.from({ length: bucketCount }, () => [])
  if (!topics.length) return buckets

  const byAffinity = new Map()
  for (const topic of topics) {
    const key = affinityKey(topic.disciplina)
    if (!byAffinity.has(key)) byAffinity.set(key, [])
    byAffinity.get(key).push(topic)
  }

  const queues = [...byAffinity.values()]
  let bucketIdx = 0
  let guard = 0
  const maxGuard = topics.length * 4 + bucketCount

  while (queues.some((q) => q.length) && guard < maxGuard) {
    guard += 1
    queues.sort((a, b) => b.length - a.length)
    const queue = queues.find((q) => q.length)
    if (!queue) break

    const room = MAX_TOPICS_PER_DAY - buckets[bucketIdx].length
    if (room <= 0) {
      bucketIdx = (bucketIdx + 1) % bucketCount
      continue
    }

    const sameAffinity = queue.splice(0, Math.min(room, 2))
    buckets[bucketIdx].push(...sameAffinity)

    if (buckets[bucketIdx].length >= MAX_TOPICS_PER_DAY) {
      bucketIdx = (bucketIdx + 1) % bucketCount
    } else if (sameAffinity.length < 2) {
      bucketIdx = (bucketIdx + 1) % bucketCount
    }
  }

  // Sobra (se algum dia ficou vazio no meio): empurra para o próximo com espaço
  const leftover = queues.flat()
  for (const topic of leftover) {
    let placed = false
    for (let i = 0; i < bucketCount; i += 1) {
      if (buckets[i].length < MAX_TOPICS_PER_DAY) {
        buckets[i].push(topic)
        placed = true
        break
      }
    }
    if (!placed) {
      buckets[buckets.length - 1].push(topic)
    }
  }

  return buckets
}

/**
 * Monta o array no formato esperado pelo processador (sem IA).
 */
export function buildDeterministicMentoradoCronograma({
  edital,
  today = dayjs(),
  planningEnd,
  config = {},
}) {
  const start = dayjs(today).startOf('day')
  const end = dayjs(planningEnd).startOf('day')
  const dateKeys = buildDateKeys(start, end)
  if (!dateKeys.length) {
    throw new Error('Janela de planejamento inválida para o cronograma.')
  }

  const topics = flattenEditalTopics(edital)
  if (!topics.length) {
    throw new Error('Edital sem tópicos para montar o cronograma.')
  }

  const hasRedacao = Boolean(config.hasRedacao)
  const hasTAF = Boolean(config.hasTAF)
  const tafExercicios = Array.isArray(config.tafExercicios) ? config.tafExercicios.filter(Boolean) : []

  const retaCount = Math.min(RETA_FINAL_DAYS, Math.max(0, dateKeys.length - 1))
  const studyDateKeys = dateKeys.slice(0, Math.max(1, dateKeys.length - retaCount))
  const retaDateKeys = dateKeys.slice(studyDateKeys.length)

  const buckets = distributeTopics(topics, studyDateKeys.length)
  const cronograma = []

  studyDateKeys.forEach((data, idx) => {
    const materias = (buckets[idx] || []).map((t) => ({
      disciplina: t.disciplina,
      topico: t.topico,
    }))

    const isRedacaoSlot = hasRedacao && idx > 0 && idx % 7 === 6
    const isTafSlot = hasTAF && idx > 0 && idx % 4 === 3
    let tipo = 'estudo'
    if (isRedacaoSlot) tipo = 'redacao'
    else if (isTafSlot) tipo = 'taf'

    const tafExercicio =
      tipo === 'taf' && tafExercicios.length
        ? tafExercicios[Math.floor(idx / 4) % tafExercicios.length]
        : ''

    const descParts = []
    if (tipo === 'redacao') descParts.push('Treino de redação da semana')
    if (tipo === 'taf') descParts.push(tafExercicio ? `TAF: ${tafExercicio}` : 'Dia de TAF + estudo')
    if (!descParts.length) {
      descParts.push(
        materias.length
          ? `Estudo: ${materias.map((m) => m.disciplina).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`
          : 'Dia de estudo',
      )
    }

    cronograma.push({
      data,
      tipo,
      fase: phaseForProgress(idx, studyDateKeys.length),
      materias,
      taf_exercicio: tafExercicio,
      descricao: descParts.join(' · '),
    })
  })

  retaDateKeys.forEach((data, idx) => {
    const isSimulado = idx % 2 === 1
    cronograma.push({
      data,
      tipo: isSimulado ? 'simulado' : 'reta_final',
      fase: 'reta_final',
      materias: [],
      taf_exercicio: '',
      descricao: isSimulado
        ? 'Simulado geral — revisão estratégica'
        : 'Reta final — revisão dos pontos críticos',
    })
  })

  return {
    cronograma,
    meta: {
      totalDays: cronograma.length,
      totalTopics: topics.length,
      studyDays: studyDateKeys.length,
      retaFinalDays: retaDateKeys.length,
      hasRedacao,
      hasTAF,
      source: 'deterministic',
    },
  }
}
