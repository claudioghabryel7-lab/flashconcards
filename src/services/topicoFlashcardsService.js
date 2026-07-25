/**
 * Gera e salva flashcards — sempre com material do tópico como base.
 * Se o material ainda não existir, gera o material primeiro (mesmo ritual do mentorado).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  normalizeFlashcard,
  cardMatchesModule,
  formatTopicoAsModulo,
} from '../utils/editalVerticalizadoLoader'
import { normalizeTopicKeyForStorage } from '../utils/topicKeyFirestore'
import { startBackgroundGeneration } from './aiGenerationRunner'
import { buildFlashcardsTopicoPayload } from '../utils/serverGenerationPayload'
import { CONTENT_STATUS } from '../utils/contentStatus'
import { fetchTopicoPublishStatus } from './topicoPublishService'
import {
  buildExamAwareFlashcardMeta,
  normalizeExamContext,
} from '../utils/examFidelityContext'
import { ensureMaterialForTopico } from './topicoMaterialService'

function topicKeyMatches(cardKey, targetKey) {
  if (!targetKey) return false
  const normalizedTarget = normalizeTopicKeyForStorage(targetKey)
  if (!normalizedTarget) return false
  if (!cardKey) return false
  return normalizeTopicKeyForStorage(cardKey) === normalizedTarget
}

/**
 * Busca flashcards já salvos para um tópico (compartilhados entre usuários do curso).
 */
export async function fetchFlashcardsForTopico(
  courseId,
  disciplina,
  modulo,
  topicKey,
  { includeUnpublished = false } = {},
) {
  const resolvedId = courseId || 'alego-default'
  const flashcardsRef = collection(db, 'courses', resolvedId, 'flashcards')
  const normalizedTopicKey = normalizeTopicKeyForStorage(topicKey)

  const filterClient = (docs) =>
    docs
      .map((d) => normalizeFlashcard({ id: d.id, ...d.data() }))
      .filter((card) => {
        if (normalizedTopicKey && topicKeyMatches(card.topicKey, normalizedTopicKey)) return true
        if (disciplina && modulo) return cardMatchesModule(card, disciplina, modulo)
        return false
      })
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  if (includeUnpublished) {
    const snapshot = await getDocs(flashcardsRef)
    return filterClient(snapshot.docs)
  }

  const published = CONTENT_STATUS.AVAILABLE
  let docs = []

  if (normalizedTopicKey) {
    const byTopic = await getDocs(
      query(flashcardsRef, where('status', '==', published), where('topicKey', '==', normalizedTopicKey)),
    )
    docs = byTopic.docs
  }

  if (docs.length === 0 && disciplina && modulo) {
    const byModule = await getDocs(
      query(
        flashcardsRef,
        where('status', '==', published),
        where('materia', '==', disciplina),
        where('modulo', '==', modulo),
      ),
    )
    docs = byModule.docs
  }

  return filterClient(docs)
}

/**
 * Gera e salva flashcards para um único tópico.
 * Ritual: material (gera se faltar) → flashcards ancorados no material.
 */
export async function generateAndSaveFlashcardsForTopico({
  courseId,
  disciplina,
  topicoNome,
  topicoNumero,
  topicKey,
  moduloLabel,
  courseName,
  editalText = '',
  userId = null,
  onProgress = async () => {},
}) {
  const resolvedId = courseId || 'alego-default'
  const courseDoc = await getDoc(doc(db, 'courses', resolvedId))
  const courseData = courseDoc.exists() ? courseDoc.data() : {}
  const examCtx = normalizeExamContext({
    ...courseData,
    courseName: courseName || courseData.name || courseData.competition || '',
    concursoName: courseData.competition || courseData.name || courseName || '',
    editalText,
  })

  const modulo = moduloLabel || formatTopicoAsModulo({ numero: topicoNumero, nome: topicoNome })
  const normalizedTopicKey = normalizeTopicKeyForStorage(topicKey)

  if (!userId) {
    throw new Error('Faça login como admin para gerar flashcards.')
  }

  await onProgress(5, 'Verificando material do tópico…')
  const materialParsed = await ensureMaterialForTopico({
    courseId: resolvedId,
    disciplina,
    topicoNome,
    topicKey: normalizedTopicKey,
    editalText,
    courseName: examCtx.courseName,
    onProgress: async (pct, msg) => {
      // Reserva 0–40% para material; flashcards ocupam o restante no job
      await onProgress(Math.min(40, Math.round((pct / 100) * 40)), msg)
    },
  })

  if (!materialParsed) {
    throw new Error('Não foi possível obter o material do tópico antes dos flashcards.')
  }

  const flashcardMeta = buildExamAwareFlashcardMeta(
    {
      courseId: resolvedId,
      disciplina,
      topicoNome,
      topicoNumero,
      topicKey: normalizedTopicKey,
      modulo,
      editalText,
    },
    examCtx,
  )

  const initialStatus = await fetchTopicoPublishStatus(resolvedId, normalizedTopicKey)
  await onProgress(45, 'Gerando flashcards com base no material…')

  const { promise } = await startBackgroundGeneration({
    userId,
    courseId: resolvedId,
    jobType: 'flashcards_topico',
    topicKey: normalizedTopicKey,
    runOnServer: false,
    serverPayload: buildFlashcardsTopicoPayload({
      courseId: resolvedId,
      status: initialStatus,
      // false = retoma checkpoint se pausou/parou no meio
      forceRegenerate: false,
      flashcardMeta,
      materialParsed,
    }),
  })

  await promise
  await onProgress(100, 'Flashcards prontos')
  return fetchFlashcardsForTopico(resolvedId, disciplina, modulo, normalizedTopicKey, {
    includeUnpublished: true,
  })
}
