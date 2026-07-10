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
import { startBackgroundGeneration } from './aiGenerationRunner'
import { CONTENT_STATUS } from '../utils/contentStatus'

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

  return {
    courseName: courseData.name || courseData.competition || 'Curso preparatório',
    cargo: courseData.cargo || courseData.competition || '',
    banca: courseData.banca || '',
    concursoName: unifiedData.concursoName || courseData.competition || '',
    editalText,
  }
}

function buildTopicPayloads(topic, context, autoPublish) {
  const status = autoPublish ? CONTENT_STATUS.AVAILABLE : CONTENT_STATUS.UNAVAILABLE
  const tipoProva =
    context.banca?.toUpperCase().includes('CESPE') ||
    context.banca?.toUpperCase().includes('CEBRASPE')
      ? 'Certo/Errado'
      : 'ABCD'

  const flashcardMeta = buildMentoradoFlashcardMeta({
    courseId: context.courseId,
    courseName: context.courseName,
    disciplina: topic.disciplina,
    topicoNome: topic.topicoNome,
    topicoNumero: topic.topicoNumero,
    topicKey: topic.topicKey,
    modulo: topic.modulo,
    banca: context.banca,
    editalText: context.editalText,
  })

  const conteudoPrompt = buildMentoradoConteudoPrompt({
    topicKey: topic.topicKey,
    topicoNome: topic.topicoNome,
    disciplina: topic.disciplina,
    banca: context.banca,
    concursoName: context.concursoName,
    courseName: context.courseName,
    editalText: context.editalText,
  })

  const questoesPrompt = buildMentoradoQuestoesPrompt({
    topicKey: topic.topicKey,
    topicoNome: topic.topicoNome,
    disciplina: topic.disciplina,
    banca: context.banca,
    courseName: context.courseName,
    cargo: context.cargo,
    editalText: context.editalText,
    nivel: 1,
    tipoProva,
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
    publishStatus: status,
  }
}

/**
 * Inicia geração do cronograma na nuvem (admin pode fechar o site).
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
    },
    runOnServer: true,
    serverPayload: {
      courseId,
      config,
    },
  })

  return { jobId, promise }
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

  const monthKey = targetDate.slice(0, 7)
  const cronogramaSnap = await getDoc(doc(db, 'courses', courseId, 'cronograma', monthKey))
  const dayEntry = cronogramaSnap.exists() ? cronogramaSnap.data()?.days?.[targetDate] : null
  if (!dayEntry) {
    throw new Error(`Dia ${targetDate} não encontrado no cronograma.`)
  }

  const edital = editalVerticalizado || (await loadEditalVerticalizado(courseId))
  const topics = extractTopicsFromCronogramaDay(
    { data: targetDate, tipo: dayEntry.type || dayEntry.tipo, materias: dayEntry.materias || [] },
    edital,
  )
  if (!topics.length) {
    throw new Error('Nenhum tópico válido encontrado para este dia.')
  }

  const baseContext = await loadMentoradoAutomationContext(courseId)
  if (!baseContext.editalText?.trim()) {
    throw new Error('Edital não encontrado. Gere o edital verticalizado primeiro.')
  }

  const context = { ...baseContext, courseId }
  const topicPayloads = topics.map((topic) => buildTopicPayloads(topic, context, autoPublish))

  const { jobId, promise } = await startBackgroundGeneration({
    userId,
    courseId,
    jobType: 'guia_mentorado_automation',
    topicKey: null,
    metadata: {
      topicCount: topicPayloads.length,
      targetDate,
      autoPublish,
    },
    runOnServer: true,
    serverPayload: {
      courseId,
      autoPublish,
      targetDate,
      topics: topicPayloads,
    },
  })

  return { jobId, promise, topicCount: topicPayloads.length }
}

export { MENTORADO_DAILY_RELEASE_HOUR }
