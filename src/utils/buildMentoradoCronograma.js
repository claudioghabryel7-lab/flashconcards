/**
 * Bot do Guia Mentorado — sem IA / sem Google Search.
 * Distribui TODOS os tópicos do edital até a reta final;
 * na incidência agenda 1 matéria por dia (revisão completa).
 */
import dayjs from 'dayjs'
import { formatTopicoAsModulo } from './editalVerticalizadoLoader'

const MAX_TOPICS_PER_DAY = 4
/** Últimos N dias = revisão de incidência (não estudo de tópico novo). */
export const INCIDENCIA_FINAL_DAYS = 5

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

/** Nomes únicos das disciplinas do edital (ordem do edital). */
export function listEditalDisciplinas(edital) {
  const names = []
  const seen = new Set()
  for (const disc of edital?.disciplinas || []) {
    const nome = String(disc?.nome || '').trim()
    if (!nome) continue
    const key = nome.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(nome)
  }
  return names
}

function buildDateKeys(today, planningEnd) {
  const keys = []
  let cursor = dayjs(today).startOf('day')
  const end = dayjs(planningEnd).startOf('day')
  if (end.isBefore(cursor)) {
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
    if (!placed) buckets[buckets.length - 1].push(topic)
  }

  return buckets
}

/**
 * 1 matéria por dia de incidência.
 * Se houver mais dias que disciplinas, cicla (2ª passagem de revisão).
 */
function distributeDisciplinasOnePerDay(disciplinas, dayCount) {
  const buckets = Array.from({ length: Math.max(1, dayCount) }, () => [])
  if (!disciplinas.length) return buckets
  for (let i = 0; i < buckets.length; i += 1) {
    buckets[i].push(disciplinas[i % disciplinas.length])
  }
  return buckets
}

/**
 * Monta o cronograma (bot determinístico).
 * - Estudo de tópicos até a janela de incidência
 * - Incidência: 1 matéria por dia (revisão completa)
 */
export function buildDeterministicMentoradoCronograma({
  edital,
  today = dayjs(),
  planningEnd,
  config = {},
}) {
  const start = dayjs(today).startOf('day')
  const end = dayjs(planningEnd).startOf('day')

  if (end.isBefore(start)) {
    const err = new Error('A data da prova já passou. Atualize a data da prova para gerar o guia.')
    err.code = 'prova_passada'
    throw err
  }

  const dateKeys = buildDateKeys(start, end)
  if (!dateKeys.length) {
    throw new Error('Janela de planejamento inválida para o cronograma.')
  }

  const topics = flattenEditalTopics(edital)
  if (!topics.length) {
    throw new Error('Edital sem tópicos para montar o cronograma. Gere o edital verticalizado primeiro.')
  }

  const disciplinas = listEditalDisciplinas(edital)
  const hasRedacao = Boolean(config.hasRedacao)
  const hasTAF = Boolean(config.hasTAF)
  const tafExercicios = Array.isArray(config.tafExercicios) ? config.tafExercicios.filter(Boolean) : []

  // Incidência: 1 matéria/dia — janela = max(5, nº de disciplinas), limitada à janela disponível
  const incidenciaCount = Math.min(
    Math.max(INCIDENCIA_FINAL_DAYS, disciplinas.length || 1),
    Math.max(0, dateKeys.length - 1),
  )
  const studyDateKeys = dateKeys.slice(0, Math.max(1, dateKeys.length - incidenciaCount))
  const incidenciaDateKeys = dateKeys.slice(studyDateKeys.length)

  const topicBuckets = distributeTopics(topics, studyDateKeys.length)
  const disciplinaBuckets = distributeDisciplinasOnePerDay(
    disciplinas,
    incidenciaDateKeys.length || 1,
  )
  const cronograma = []

  studyDateKeys.forEach((data, idx) => {
    const materias = (topicBuckets[idx] || []).map((t) => ({
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
      const discs = materias
        .map((m) => m.disciplina)
        .filter((v, i, a) => a.indexOf(v) === i)
      descParts.push(discs.length ? `Estudo: ${discs.join(', ')}` : 'Dia de estudo')
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

  incidenciaDateKeys.forEach((data, idx) => {
    const discs = disciplinaBuckets[idx] || []
    const materias = discs.map((disciplina) => ({
      disciplina,
      topico: 'Incidência / revisão da matéria',
      incidencia: true,
    }))

    cronograma.push({
      data,
      tipo: 'incidencia',
      fase: 'reta_final',
      materias,
      taf_exercicio: '',
      descricao: discs.length
        ? `Revisão por incidência: ${discs.join(', ')}`
        : 'Revisão por incidência',
      incidencia: true,
    })
  })

  return {
    cronograma,
    meta: {
      totalDays: cronograma.length,
      totalTopics: topics.length,
      totalDisciplinas: disciplinas.length,
      studyDays: studyDateKeys.length,
      incidenciaDays: incidenciaDateKeys.length,
      hasRedacao,
      hasTAF,
      dataProva: config.dataProva,
      source: 'bot_deterministic',
    },
  }
}
