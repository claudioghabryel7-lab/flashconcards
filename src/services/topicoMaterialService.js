/**
 * Garante material do tópico antes de flashcards (mesmo ritual do mentorado).
 */
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { generateAiJson } from '../utils/geminiApi'
import { buildMentoradoConteudoPrompt } from '../utils/guiaMentoradoPrompts'
import { ensureMaterialContentComplete, normalizeMaterialStructure } from '../utils/contentDepthRules'
import { filterValidQuestoes } from '../utils/questoesQuality'
import {
  normalizeExamContext,
  toCourseAiContextShape,
} from '../utils/examFidelityContext'
import { normalizeTopicKeyForStorage } from '../utils/topicKeyFirestore'
import { CONTENT_STATUS } from '../utils/contentStatus'
import {
  loadMaterialDraft,
  prepareMaterialRun,
  saveMaterialCheckpoint,
} from './localGenerationCheckpoint'
import { isLikelyLegalDiscipline } from '../utils/contentVerification'

/**
 * Retorna material existente se completo; senão gera, salva e devolve.
 */
export async function ensureMaterialForTopico({
  courseId,
  disciplina = '',
  topicoNome = '',
  topicKey,
  editalText = '',
  courseName = '',
  forceFresh = false,
  onProgress = async () => {},
}) {
  const resolvedId = courseId || 'alego-default'
  const normalizedTopicKey = normalizeTopicKeyForStorage(topicKey)
  if (!normalizedTopicKey) {
    throw new Error('topicKey ausente para gerar o material.')
  }

  const prep = await prepareMaterialRun({
    courseId: resolvedId,
    topicKey: normalizedTopicKey,
    forceFresh: Boolean(forceFresh),
  })

  if (prep.alreadyComplete && prep.existingDraft && !forceFresh) {
    await onProgress(100, 'Material do tópico já existe — reutilizando')
    return normalizeMaterialStructure(prep.existingDraft)
  }

  // Fallback: draft parcial ainda útil como âncora
  if (!forceFresh) {
    const draft = await loadMaterialDraft(resolvedId, normalizedTopicKey)
    const hasUseful =
      draft &&
      ((Array.isArray(draft.revisaoTurbo) && draft.revisaoTurbo.length >= 4) ||
        draft.content ||
        draft.raioXProbabilidade?.padraoBanca)
    if (hasUseful && draft.generationComplete !== false) {
      await onProgress(100, 'Material do tópico encontrado — reutilizando')
      return normalizeMaterialStructure(draft)
    }
  }

  await onProgress(8, 'Material ausente — gerando material do tópico primeiro…')

  const courseDoc = await getDoc(doc(db, 'courses', resolvedId))
  const courseData = courseDoc.exists() ? courseDoc.data() : {}

  let resolvedEdital = String(editalText || '')
  if (!resolvedEdital.trim()) {
    const editalRef = doc(db, 'courses', resolvedId, 'prompts', 'edital')
    const editalDoc = await getDoc(editalRef)
    if (editalDoc.exists()) {
      const d = editalDoc.data()
      resolvedEdital = `${d.prompt || ''}\n\n${d.pdfText || ''}`
    }
  }
  if (!resolvedEdital.trim()) {
    throw new Error('Edital não encontrado. Gere o edital antes do material/flashcards.')
  }

  const examCtx = normalizeExamContext({
    ...courseData,
    courseName: courseName || courseData.name || courseData.competition || '',
    concursoName: courseData.competition || courseData.name || courseName || '',
    editalText: resolvedEdital,
  })

  const prompt = buildMentoradoConteudoPrompt({
    topicKey: normalizedTopicKey,
    topicoNome: topicoNome || normalizedTopicKey,
    disciplina,
    banca: examCtx.banca,
    cargo: examCtx.cargo,
    concursoName: examCtx.concursoName,
    courseName: examCtx.courseName,
    nivelCurso: examCtx.nivelCurso,
    editalText: resolvedEdital,
    tipoProva: examCtx.tipoProva,
  })

  const isLegal = isLikelyLegalDiscipline(disciplina)
  const courseContext = toCourseAiContextShape({
    ...examCtx,
    disciplina,
    topicoNome: topicoNome || normalizedTopicKey,
  })

  await onProgress(25, 'Gerando material de apoio do tópico…')
  let parsed = await generateAiJson(prompt, {
    courseId: resolvedId,
    trustedGeneration: true,
    useGoogleSearch: true,
    verifyContent: true,
    isLegalContent: isLegal,
    useRAG: false,
    thinkingLevel: 'low',
    maxContinues: 4,
    courseContext,
    generationConfig: { maxOutputTokens: 32000, temperature: 0.15 },
  })

  try {
    const pred = parsed?.questoesPreditivas
    if (Array.isArray(pred) && pred.length) {
      const { ok } = filterValidQuestoes(pred, {
        tipoProva: examCtx.tipoProva,
        banca: examCtx.banca,
        minKeep: 0,
      })
      parsed = { ...parsed, questoesPreditivas: ok }
    }
  } catch (err) {
    console.warn('[ensureMaterial] sanitizar questões:', err?.message || err)
  }

  await onProgress(70, 'Aprofundando material…')
  parsed = await ensureMaterialContentComplete(parsed, {
    generateAiJson,
    generateOptions: {
      courseId: resolvedId,
      trustedGeneration: true,
      useGoogleSearch: true,
      verifyContent: false,
      isLegalContent: isLegal,
      thinkingLevel: 'low',
      courseContext,
      generationConfig: { maxOutputTokens: 32000, temperature: 0.2 },
    },
    context: {
      topico: topicoNome || normalizedTopicKey,
      banca: examCtx.banca,
      cargo: examCtx.cargo,
      concurso: examCtx.concursoName,
    },
    maxRepairs: 2,
  })

  parsed = normalizeMaterialStructure({
    ...parsed,
    materia: parsed.materia || parsed.titulo || topicoNome || normalizedTopicKey,
    topicKey: normalizedTopicKey,
    banca: examCtx.banca,
    cargo: examCtx.cargo,
    concurso: examCtx.concursoName,
  })

  await onProgress(90, 'Salvando material do tópico…')
  await saveMaterialCheckpoint({
    courseId: resolvedId,
    topicKey: normalizedTopicKey,
    parsed,
    status: CONTENT_STATUS.UNAVAILABLE,
    extra: {
      disciplina,
      topicoNome: topicoNome || normalizedTopicKey,
    },
  })

  await onProgress(100, 'Material pronto')
  return parsed
}
