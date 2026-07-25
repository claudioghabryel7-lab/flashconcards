import dayjs from 'dayjs'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { DEFAULT_PLANNING_DAYS, MENTORADO_DAILY_RELEASE_HOUR } from '../constants/guiaMentorado'
import { extractTopicsFromCronogramaDay } from '../utils/guiaMentoradoTopics'
import { buildEditalStructurePrompt, loadEditalVerticalizado } from '../utils/editalVerticalizadoLoader'
import {
  buildMentoradoConteudoPrompt,
  buildMentoradoFlashcardMeta,
  buildMentoradoQuestoesPrompt,
} from '../utils/guiaMentoradoPrompts'
import {
  normalizeExamContext,
  resolveTipoProvaFromBanca,
} from '../utils/examFidelityContext'
import { startBackgroundGeneration } from './aiGenerationRunner'
import { CONTENT_STATUS } from '../utils/contentStatus'
import { QUESTOES_TARGET } from './localGenerationCheckpoint'
import { sanitizeDisciplinaDocId } from '../utils/incidenciaGeneration'

function findDisciplinaInEdital(edital, disciplinaNome) {
  const nome = String(disciplinaNome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
  const list = edital?.disciplinas || []
  const idx = list.findIndex((d) => {
    const n = String(d?.nome || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
    return n === nome || n.includes(nome) || nome.includes(n)
  })
  if (idx < 0) return null
  return { disciplina: list[idx], disciplinaIdx: idx }
}

function buildIncidenciaDayItems(dayEntry, edital) {
  const seen = new Set()
  const items = []
  for (const raw of dayEntry?.materias || []) {
    const disciplinaNome = String(raw?.disciplina || raw?.materia || '').trim()
    if (!disciplinaNome) continue
    const key = disciplinaNome.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const found = findDisciplinaInEdital(edital, disciplinaNome)
    items.push({
      disciplinaNome: found?.disciplina?.nome || disciplinaNome,
      disciplinaIdx: found?.disciplinaIdx ?? -1,
      docId: sanitizeDisciplinaDocId(found?.disciplina?.nome || disciplinaNome),
      topicos: Array.isArray(found?.disciplina?.topicos) ? found.disciplina.topicos : [],
    })
  }
  return items
}

/** Data final do planejamento: data da prova ou hoje + 90 dias. */
export function resolvePlanningEndDate(config = {}) {
  const today = dayjs().startOf('day')
  if (config.dataProva) {
    const prova = dayjs(config.dataProva).startOf('day')
    if (prova.isAfter(today)) return prova
  }
  return today.add(DEFAULT_PLANNING_DAYS, 'day')
}

export function isUsingDefaultPlanningWindow(config = {}) {
  if (!config.dataProva) return true
  const today = dayjs().startOf('day')
  const prova = dayjs(config.dataProva).startOf('day')
  return !prova.isAfter(today)
}

export async function loadMentoradoAutomationContext(courseId) {
  const resolvedId = courseId || 'alego-default'

  const courseSnap = await getDoc(doc(db, 'courses', resolvedId))
  const courseData = courseSnap.exists() ? courseSnap.data() : {}

  const editalSnap = await getDoc(doc(db, 'courses', resolvedId, 'prompts', 'edital'))
  const editalData = editalSnap.exists() ? editalSnap.data() : {}
  let editalText = (editalData.pdfText || editalData.prompt || '').toString()

  if (!editalText.trim()) {
    const verticalizado = await loadEditalVerticalizado(resolvedId)
    editalText = buildEditalStructurePrompt(verticalizado, 50)
  }

  const unifiedSnap = await getDoc(doc(db, 'courses', resolvedId, 'prompts', 'unified'))
  const unifiedData = unifiedSnap.exists() ? unifiedSnap.data() : {}

  const exam = normalizeExamContext({
    courseId: resolvedId,
    banca: courseData.banca || unifiedData.banca || '',
    cargo: courseData.cargo || courseData.competition || '',
    concursoName: unifiedData.concursoName || courseData.competition || courseData.name || '',
    courseName: courseData.name || courseData.competition || 'Curso preparatório',
    name: courseData.name || '',
    competition: courseData.competition || '',
    nivel: courseData.nivel || courseData.escolaridade || courseData.nivelCargo || '',
    area: courseData.area || '',
    editalText,
  })

  return {
    ...exam,
    courseId: resolvedId,
    editalText,
  }
}

function buildTopicPayloads(topic, context, autoPublish) {
  const status = autoPublish ? CONTENT_STATUS.AVAILABLE : CONTENT_STATUS.UNAVAILABLE
  const exam = normalizeExamContext(context)
  const tipoProva = resolveTipoProvaFromBanca(exam.banca, exam.tipoProva)

  const shared = {
    banca: exam.banca,
    cargo: exam.cargo,
    concursoName: exam.concursoName,
    courseName: exam.courseName,
    nivelCurso: exam.nivelCurso,
    area: exam.area,
    tipoProva,
    dificuldade: exam.dificuldade,
    editalText: context.editalText,
  }

  const flashcardMeta = buildMentoradoFlashcardMeta({
    courseId: context.courseId,
    disciplina: topic.disciplina,
    topicoNome: topic.topicoNome,
    topicoNumero: topic.topicoNumero,
    topicKey: topic.topicKey,
    modulo: topic.modulo,
    ...shared,
  })

  const conteudoPrompt = buildMentoradoConteudoPrompt({
    topicKey: topic.topicKey,
    topicoNome: topic.topicoNome,
    disciplina: topic.disciplina,
    ...shared,
  })

  const questoesPrompt = buildMentoradoQuestoesPrompt({
    topicKey: topic.topicKey,
    topicoNome: topic.topicoNome,
    disciplina: topic.disciplina,
    nivel: 1,
    quantidadeQuestoes: QUESTOES_TARGET,
    ...shared,
  })

  return {
    topicKey: topic.topicKey,
    disciplina: topic.disciplina,
    topicoNome: topic.topicoNome,
    topicoNumero: topic.topicoNumero,
    modulo: topic.modulo,
    firstStudyDate: topic.firstStudyDate || null,
    examContext: exam,
    flashcardMeta,
    conteudoPrompt,
    questoesPrompt,
    publishStatus: status,
  }
}

/**
 * Inicia geração do cronograma na aba do admin (mantenha a aba aberta).
 */
export async function startGuiaMentoradoCronogramaGeneration({ userId, courseId, config }) {
  if (!userId) throw new Error('Usuário não autenticado.')
  if (!courseId) throw new Error('Curso não selecionado.')

  const { jobId, promise } = await startBackgroundGeneration({
    userId,
    courseId,
    jobType: 'guia_mentorado_cronograma',
    topicKey: null,
    metadata: {
      autoGerarConteudo: Boolean(config?.autoGerarConteudo),
      source: 'automation',
      automation: true,
    },
    runOnServer: false,
    serverPayload: {
      courseId,
      config,
    },
  })

  return { jobId, promise }
}

/**
 * Monta payloads dos tópicos de um dia (sem enfileirar job).
 * Usado por “conteúdos de hoje” e pelo backfill local.
 */
export async function prepareMentoradoDayAutomation({
  courseId,
  targetDate,
  editalVerticalizado = null,
  autoPublish = true,
}) {
  if (!courseId) return { ok: false, reason: 'missing_course' }
  if (!targetDate) return { ok: false, reason: 'missing_date' }

  const monthKey = targetDate.slice(0, 7)
  const cronogramaSnap = await getDoc(doc(db, 'courses', courseId, 'cronograma', monthKey))
  const dayEntry = cronogramaSnap.exists() ? cronogramaSnap.data()?.days?.[targetDate] : null
  if (!dayEntry) {
    return { ok: false, reason: 'day_missing', targetDate }
  }

  const tipo = dayEntry.type || dayEntry.tipo || 'estudo'
  if (tipo === 'simulado' || tipo === 'descanso') {
    return { ok: false, reason: 'skip_day_type', targetDate, tipo }
  }

  const edital = editalVerticalizado || (await loadEditalVerticalizado(courseId))

  // Dia de incidência: gera 1 matéria (revisão completa) por dia
  if (tipo === 'incidencia' || tipo === 'reta_final' || dayEntry.incidencia) {
    const items = buildIncidenciaDayItems(dayEntry, edital)
    if (!items.length) {
      return { ok: false, reason: 'no_topics', targetDate, tipo, kind: 'incidencia' }
    }
    const baseContext = await loadMentoradoAutomationContext(courseId)
    return {
      ok: true,
      kind: 'incidencia',
      targetDate,
      autoPublish,
      items,
      topicCount: items.length,
      courseMeta: {
        banca: baseContext.banca || '',
        cargo: baseContext.cargo || '',
        concursoName: baseContext.concursoName || baseContext.courseName || '',
        courseName: baseContext.courseName || '',
        nivelCurso: baseContext.nivelCurso || '',
        editalText: baseContext.editalText || '',
      },
    }
  }

  const topics = extractTopicsFromCronogramaDay(
    { data: targetDate, tipo, materias: dayEntry.materias || [] },
    edital,
  )
  if (!topics.length) {
    return { ok: false, reason: 'no_topics', targetDate }
  }

  const baseContext = await loadMentoradoAutomationContext(courseId)
  if (!baseContext.editalText?.trim()) {
    return { ok: false, reason: 'missing_edital', targetDate }
  }

  const context = { ...baseContext, courseId }
  const topicPayloads = topics.map((topic) => buildTopicPayloads(topic, context, autoPublish))
  return {
    ok: true,
    kind: 'estudo',
    targetDate,
    autoPublish,
    topics: topicPayloads,
    topicCount: topicPayloads.length,
  }
}

/**
 * Inicia geração automática apenas dos tópicos de um dia do cronograma.
 */
export async function startMentoradoDayContentAutomation({
  userId,
  courseId,
  targetDate,
  editalVerticalizado,
  autoPublish = true,
}) {
  if (!userId) throw new Error('Usuário não autenticado.')
  if (!courseId) throw new Error('Curso não selecionado.')
  if (!targetDate) throw new Error('Data do dia não informada.')

  const prepared = await prepareMentoradoDayAutomation({
    courseId,
    targetDate,
    editalVerticalizado,
    autoPublish,
  })
  if (!prepared.ok) {
    const messages = {
      day_missing: `Dia ${targetDate} não encontrado no cronograma.`,
      no_topics: 'Nenhum tópico válido encontrado para este dia.',
      missing_edital: 'Edital não encontrado. Gere o edital verticalizado primeiro.',
      skip_day_type: `Dia ${targetDate} é ${prepared.tipo} — sem geração de conteúdo.`,
    }
    throw new Error(messages[prepared.reason] || `Não foi possível preparar o dia ${targetDate}.`)
  }

  if (prepared.kind === 'incidencia') {
    const { jobId, promise, duplicate } = await startBackgroundGeneration({
      userId,
      courseId,
      jobType: 'guia_mentorado_incidencia',
      topicKey: null,
      metadata: {
        kind: 'incidencia',
        topicCount: prepared.topicCount,
        targetDate,
        autoPublish,
        disciplinas: prepared.items.map((i) => i.disciplinaNome),
        source: 'automation',
        automation: true,
      },
      runOnServer: false,
      serverPayload: {
        courseId,
        autoPublish,
        targetDate,
        items: prepared.items,
        courseMeta: prepared.courseMeta,
      },
    })
    return {
      jobId,
      promise,
      topicCount: prepared.topicCount,
      duplicate: Boolean(duplicate),
      kind: 'incidencia',
    }
  }

  const { jobId, promise, duplicate } = await startBackgroundGeneration({
    userId,
    courseId,
    jobType: 'guia_mentorado_automation',
    topicKey: null,
    metadata: {
      topicCount: prepared.topicCount,
      targetDate,
      autoPublish,
      source: 'automation',
      automation: true,
    },
    runOnServer: false,
    serverPayload: {
      courseId,
      autoPublish,
      targetDate,
      topics: prepared.topics,
    },
  })

  return { jobId, promise, topicCount: prepared.topicCount, duplicate: Boolean(duplicate), kind: 'estudo' }
}

/**
 * Backfill: gera conteúdos dos dias (na aba do admin — mantenha aberta).
 */
export async function startMentoradoBackfillJob({ userId, courseId, dayKeys = null }) {
  if (!userId) throw new Error('Usuário não autenticado.')
  if (!courseId) throw new Error('Curso não selecionado.')

  const { jobId, promise } = await startBackgroundGeneration({
    userId,
    courseId,
    jobType: 'guia_mentorado_backfill',
    topicKey: null,
    metadata: {
      source: 'backfill',
      automation: true,
      dayCount: Array.isArray(dayKeys) ? dayKeys.length : null,
    },
    runOnServer: false,
    serverPayload: {
      courseId,
      autoPublish: true,
      ...(Array.isArray(dayKeys) && dayKeys.length ? { dayKeys } : {}),
      resumeFromDayIndex: 0,
      resumeFromTopicIndex: 0,
    },
  })

  return { jobId, promise }
}

export { MENTORADO_DAILY_RELEASE_HOUR }
