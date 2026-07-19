const admin = require('firebase-admin')

function getDb() {
  return admin.firestore()
}

function makeTopicKey(topico) {
  if (!topico) return ''
  const numero = (topico.numero || '').toString().trim()
  const nome = (topico.nome || '').toString().trim()
  if (!numero && !nome) return ''
  if (!numero || !nome) return encodeURIComponent(numero || nome)
  return encodeURIComponent(`${numero} :: ${nome}`)
}

function formatTopicoAsModulo(topico) {
  if (!topico) return 'Tópico'
  const numero = (topico.numero || '').toString().trim()
  const nome = (topico.nome || '').toString().trim()
  if (numero && nome) return `${numero} - ${nome}`
  return nome || numero || 'Tópico'
}

function normalizeTopicKeyForStorage(topicKey = '') {
  if (!topicKey) return ''
  let key = String(topicKey).trim()
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(key)
      if (decoded === key) break
      key = decoded
    } catch {
      break
    }
  }
  return key.trim()
}

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

  return (
    topicos.find((t) => {
      const nome = normalizeLabel(t.nome)
      const ref = normalizeLabel(topicoRef)
      return nome && ref && (nome.includes(ref) || ref.includes(nome))
    }) || null
  )
}

function resolveCronogramaMateria(editalVerticalizado, materiaItem = {}) {
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

function buildEditalTextFromVerticalizado(edital) {
  if (!edital?.disciplinas?.length) return ''
  return edital.disciplinas
    .map((d) => {
      const topicos = (d.topicos || [])
        .map((t) => `${(t.numero || '').toString().trim()} ${(t.nome || '').toString().trim()}`.trim())
        .filter(Boolean)
        .join('; ')
      return `${d.nome}: ${topicos || '(sem tópicos)'}`
    })
    .join('\n')
    .slice(0, 15000)
}

function normalizeMateriaItem(materiaItem) {
  if (!materiaItem) return null
  if (typeof materiaItem === 'string') return { topico: materiaItem }
  if (typeof materiaItem === 'object') return materiaItem
  return null
}

function extractTopicsFromCronogramaDay(dayEntry = {}, editalVerticalizado) {
  const materias = dayEntry.materias || []
  const tipo = dayEntry.tipo || dayEntry.type || 'estudo'
  const dayKey = dayEntry.data || dayEntry.dayKey || null

  if (tipo === 'simulado' || tipo === 'descanso') return []

  const map = new Map()
  materias.forEach((rawItem) => {
    const materiaItem = normalizeMateriaItem(rawItem)
    if (!materiaItem) return
    const resolved = resolveCronogramaMateria(editalVerticalizado, materiaItem)
    if (!resolved?.topicKey || map.has(resolved.topicKey)) return
    map.set(resolved.topicKey, {
      ...resolved,
      firstStudyDate: dayKey,
      studyDates: dayKey ? [dayKey] : [],
    })
  })

  return Array.from(map.values())
}

async function loadEditalVerticalizado(courseId) {
  const resolvedId = courseId || 'alego-default'
  const db = getDb()
  const principalRef = db.doc(`courses/${resolvedId}/editalVerticalizado/principal`)
  const snapshot = await principalRef.get()
  if (!snapshot.exists) return null

  const data = snapshot.data()
  if (data.temPartes && data.totalPartes > 1) {
    const partesSnap = await principalRef.collection('partes').orderBy('parte').get()
    const todasDisciplinas = [...(data.disciplinas || [])]
    partesSnap.forEach((parteDoc) => {
      const parteData = parteDoc.data()
      if (Array.isArray(parteData.disciplinas)) {
        todasDisciplinas.push(...parteData.disciplinas)
      }
    })
    return { ...data, disciplinas: todasDisciplinas }
  }

  return data
}

async function loadMentoradoAutomationContext(courseId) {
  const resolvedId = courseId || 'alego-default'
  const db = getDb()

  const courseSnap = await db.doc(`courses/${resolvedId}`).get()
  const courseData = courseSnap.exists ? courseSnap.data() : {}

  const editalSnap = await db.doc(`courses/${resolvedId}/prompts/edital`).get()
  const editalData = editalSnap.exists ? editalSnap.data() : {}
  let editalText = (editalData.pdfText || editalData.prompt || '').toString()

  if (!editalText.trim()) {
    const verticalizado = await loadEditalVerticalizado(resolvedId)
    editalText = buildEditalTextFromVerticalizado(verticalizado)
  }

  const unifiedSnap = await db.doc(`courses/${resolvedId}/prompts/unified`).get()
  const unifiedData = unifiedSnap.exists ? unifiedSnap.data() : {}

  return {
    courseName: courseData.name || courseData.competition || 'Curso preparatório',
    cargo: courseData.cargo || courseData.competition || '',
    banca: courseData.banca || '',
    concursoName: unifiedData.concursoName || courseData.competition || '',
    editalText,
  }
}

const { buildConteudoCompletoServerPrompt } = require('./conteudoCompletoPrompt')
const { buildQuestoesPrompt } = require('./unifiedGenerationPrompts')

function buildTopicPayloads(topic, context) {
  const flashcardMeta = {
    courseId: context.courseId,
    courseName: context.courseName,
    concursoName: context.concursoName,
    disciplina: topic.disciplina,
    topicoNome: topic.topicoNome,
    topicoNumero: topic.topicoNumero,
    topicKey: topic.topicKey,
    modulo: topic.modulo,
    banca: context.banca,
    editalText: (context.editalText || '').slice(0, 12000),
  }

  const conteudoPrompt = buildConteudoCompletoServerPrompt({
    disciplina: topic.disciplina,
    topicoNome: topic.topicoNome,
    topicKey: topic.topicKey,
    banca: context.banca,
    concursoName: context.concursoName,
    courseName: context.courseName,
    editalText: context.editalText,
  })

  const questoesPrompt = buildQuestoesPrompt({
    disciplina: topic.disciplina,
    topicoNome: topic.topicoNome,
    topicKey: topic.topicKey,
    banca: context.banca,
    concursoName: context.concursoName,
    cargo: context.cargo,
    editalText: context.editalText,
    nivel: 1,
    maxNivel: 10,
    expectedCount: 50,
  })

  return {
    topicKey: topic.topicKey,
    disciplina: topic.disciplina,
    topicoNome: topic.topicoNome,
    topicoNumero: topic.topicoNumero,
    modulo: topic.modulo,
    firstStudyDate: topic.firstStudyDate || null,
    flashcardMeta,
    conteudoPrompt,
    questoesPrompt,
  }
}

function resolveTopicFromEdital(edital, topicKey = '') {
  const normalized = normalizeTopicKeyForStorage(topicKey)
  if (!normalized) return null

  for (const disciplina of edital?.disciplinas || []) {
    for (const topico of disciplina.topicos || []) {
      const key = normalizeTopicKeyForStorage(makeTopicKey(topico))
      if (key === normalized) {
        return {
          topicKey: key,
          topicoNome: topico.nome || key,
          disciplina: disciplina.nome,
          modulo: formatTopicoAsModulo(topico),
        }
      }
    }
  }

  return {
    topicKey: normalized,
    topicoNome: normalized,
    disciplina: '',
    modulo: normalized,
  }
}

module.exports = {
  loadEditalVerticalizado,
  loadMentoradoAutomationContext,
  extractTopicsFromCronogramaDay,
  buildTopicPayloads,
  resolveCronogramaMateria,
  resolveTopicFromEdital,
  buildEditalTextFromVerticalizado,
  makeTopicKey,
  formatTopicoAsModulo,
}
