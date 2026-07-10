import dayjs from 'dayjs'
import { makeTopicKey, formatTopicoAsModulo } from './editalVerticalizadoLoader'
import { normalizeTopicKeyForStorage } from './topicKeyFirestore'

function normalizeLabel(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function labelsMatch(a, b) {
  const na = normalizeLabel(a)
  const nb = normalizeLabel(b)
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

function findDisciplina(edital, disciplinaNome) {
  const disciplinas = edital?.disciplinas || []
  return (
    disciplinas.find((d) => labelsMatch(d.nome, disciplinaNome)) ||
    disciplinas.find((d) => normalizeLabel(d.nome).includes(normalizeLabel(disciplinaNome))) ||
    null
  )
}

function findTopicoInDisciplina(disciplina, topicoRef) {
  const topicos = disciplina?.topicos || []
  if (!topicos.length) return null

  const direct = topicos.find(
    (t) =>
      labelsMatch(t.nome, topicoRef) ||
      labelsMatch(formatTopicoAsModulo(t), topicoRef) ||
      labelsMatch(`${t.numero} - ${t.nome}`, topicoRef) ||
      labelsMatch(`${t.numero} :: ${t.nome}`, topicoRef),
  )
  if (direct) return direct

  const partial = topicos.find((t) => {
    const nome = normalizeLabel(t.nome)
    const ref = normalizeLabel(topicoRef)
    return nome && ref && (nome.includes(ref) || ref.includes(nome))
  })
  return partial || null
}

/**
 * Resolve item do cronograma { disciplina, topico } para metadados do edital.
 */
export function resolveCronogramaMateria(editalVerticalizado, materiaItem = {}) {
  const disciplinaNome = materiaItem.disciplina || materiaItem.materia || ''
  const topicoRef = materiaItem.topico || materiaItem.assunto || ''

  if (!disciplinaNome && !topicoRef) return null

  const disciplina = findDisciplina(editalVerticalizado, disciplinaNome)
  if (!disciplina) {
    const fallbackKey = normalizeTopicKeyForStorage(
      makeTopicKey({ numero: '', nome: topicoRef || disciplinaNome }),
    )
    if (!fallbackKey) return null
    return {
      disciplina: disciplinaNome || 'Disciplina',
      topicoNome: topicoRef || disciplinaNome,
      topicoNumero: '',
      topicKey: fallbackKey,
      modulo: topicoRef || disciplinaNome,
    }
  }

  const topico = findTopicoInDisciplina(disciplina, topicoRef)
  if (!topico) {
    const fallbackKey = normalizeTopicKeyForStorage(
      makeTopicKey({ numero: '', nome: topicoRef || disciplina.nome }),
    )
    if (!fallbackKey) return null
    return {
      disciplina: disciplina.nome,
      topicoNome: topicoRef || disciplina.nome,
      topicoNumero: '',
      topicKey: fallbackKey,
      modulo: topicoRef || disciplina.nome,
    }
  }

  const topicKey = normalizeTopicKeyForStorage(makeTopicKey(topico))
  return {
    disciplina: disciplina.nome,
    topicoNome: topico.nome || topicoRef,
    topicoNumero: (topico.numero || '').toString(),
    topicKey,
    modulo: formatTopicoAsModulo(topico),
  }
}

/**
 * Extrai tópicos únicos de todos os dias do cronograma.
 */
export function extractUniqueTopicsFromCronograma(cronogramaEntries = [], editalVerticalizado) {
  const map = new Map()

  cronogramaEntries.forEach((entry) => {
    const dayKey = entry.data || entry.dayKey
    const materias = entry.materias || []
    const tipo = entry.tipo || entry.type || 'estudo'

    if (tipo === 'simulado' || tipo === 'descanso') return

    materias.forEach((materiaItem) => {
      const resolved = resolveCronogramaMateria(editalVerticalizado, materiaItem)
      if (!resolved?.topicKey) return

      const existing = map.get(resolved.topicKey)
      if (!existing) {
        map.set(resolved.topicKey, {
          ...resolved,
          firstStudyDate: dayKey || null,
          studyDates: dayKey ? [dayKey] : [],
        })
        return
      }

      if (dayKey && !existing.studyDates.includes(dayKey)) {
        existing.studyDates.push(dayKey)
      }
      if (dayKey && existing.firstStudyDate && dayjs(dayKey).isBefore(dayjs(existing.firstStudyDate))) {
        existing.firstStudyDate = dayKey
      } else if (dayKey && !existing.firstStudyDate) {
        existing.firstStudyDate = dayKey
      }
    })
  })

  return Array.from(map.values()).sort((a, b) => {
    if (!a.firstStudyDate) return 1
    if (!b.firstStudyDate) return -1
    return dayjs(a.firstStudyDate).valueOf() - dayjs(b.firstStudyDate).valueOf()
  })
}
