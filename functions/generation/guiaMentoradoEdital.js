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

function extractTopicsFromCronogramaDay(dayEntry = {}, editalVerticalizado) {
  const materias = dayEntry.materias || []
  const tipo = dayEntry.tipo || dayEntry.type || 'estudo'
  const dayKey = dayEntry.data || dayEntry.dayKey || null

  if (tipo === 'simulado' || tipo === 'descanso') return []

  const map = new Map()
  materias.forEach((materiaItem) => {
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
  const editalText = (editalData.pdfText || editalData.prompt || '').toString()

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

function buildTopicPayloads(topic, context, autoPublish) {
  const CONTENT_STATUS = { AVAILABLE: 'disponivel', UNAVAILABLE: 'indisponivel' }
  const status = autoPublish ? CONTENT_STATUS.AVAILABLE : CONTENT_STATUS.UNAVAILABLE
  const tipoProva =
    context.banca?.toUpperCase().includes('CESPE') ||
    context.banca?.toUpperCase().includes('CEBRASPE')
      ? 'Certo/Errado'
      : 'ABCD'

  const flashcardMeta = {
    courseId: context.courseId,
    courseName: context.courseName,
    disciplina: topic.disciplina,
    topicoNome: topic.topicoNome,
    topicoNumero: topic.topicoNumero,
    topicKey: topic.topicKey,
    modulo: topic.modulo,
    banca: context.banca,
    editalText: (context.editalText || '').slice(0, 12000),
  }

  const conteudoPrompt = `Gere material de apoio completo (Estudar) para o tópico:
DISCIPLINA: ${topic.disciplina}
TÓPICO: ${topic.topicoNome}
BANCA: ${context.banca || 'não definida'}
EDITAL: ${(context.editalText || '').slice(0, 10000)}
Retorne APENAS JSON válido com revisaoTurbo, pegadinhas, questoesPreditivas e content em HTML simples.`

  const altBlock =
    tipoProva === 'Certo/Errado'
      ? `"respostaCorreta": "C"`
      : `"alternativas": { "A": "", "B": "", "C": "", "D": "", "E": "" }, "respostaCorreta": "A"`

  const questoesPrompt = `Gere 50 questões preditivas nível 1 para:
DISCIPLINA: ${topic.disciplina}
TÓPICO: ${topic.topicoNome}
BANCA: ${context.banca || 'não definida'}
TIPO: ${tipoProva}
EDITAL: ${(context.editalText || '').slice(0, 10000)}
JSON: { "topico": "${topic.topicoNome}", "nivel": 1, "questoes": [{ "numero": 1, "enunciado": "", ${altBlock}, "explicacao": "" }] }
Retorne APENAS JSON válido.`

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
    publishStatus: status,
  }
}

module.exports = {
  loadEditalVerticalizado,
  loadMentoradoAutomationContext,
  extractTopicsFromCronogramaDay,
  buildTopicPayloads,
  resolveCronogramaMateria,
}
