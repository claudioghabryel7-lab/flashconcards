import dayjs from 'dayjs'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { DEFAULT_PLANNING_DAYS } from '../constants/guiaMentorado'
import { extractUniqueTopicsFromCronograma } from '../utils/guiaMentoradoTopics'
import {
  buildMentoradoConteudoPrompt,
  buildMentoradoFlashcardMeta,
  buildMentoradoQuestoesPrompt,
} from '../utils/guiaMentoradoPrompts'
import { startBackgroundGeneration } from './aiGenerationRunner'
import { CONTENT_STATUS } from '../utils/contentStatus'

/** Data final do planejamento: data da prova ou hoje + 60 dias. */
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
  const editalText = (editalData.pdfText || editalData.prompt || '').toString()

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
 * Inicia geração automática de flashcards + material + questões para todos os tópicos do cronograma.
 */
export async function startMentoradoContentAutomation({
  userId,
  courseId,
  cronogramaEntries,
  editalVerticalizado,
  autoPublish = true,
}) {
  if (!userId) throw new Error('Usuário não autenticado.')
  if (!courseId) throw new Error('Curso não selecionado.')

  const topics = extractUniqueTopicsFromCronograma(cronogramaEntries, editalVerticalizado)
  if (!topics.length) {
    throw new Error('Nenhum tópico válido encontrado no cronograma para automação.')
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
      autoPublish,
    },
    runOnServer: true,
    serverPayload: {
      courseId,
      autoPublish,
      topics: topicPayloads,
    },
  })

  return { jobId, promise, topicCount: topicPayloads.length }
}
